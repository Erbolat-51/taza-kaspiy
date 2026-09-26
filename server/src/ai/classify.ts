import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import sharp from 'sharp';
import { logger } from '../lib/logger.js';
import { mockClassify } from './mock.js';
import { ClassificationSchema, type ClassifyResult } from './types.js';

export interface ClassifyInput {
  image: Buffer;
  comment?: string | null;
}

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
/** Длинная сторона фото для ИИ: меньше токенов и быстрее, деталей для классификации хватает. */
const AI_IMAGE_EDGE = 1024;

const SYSTEM_PROMPT = `Ты — эколог-аналитик сервиса «Таза Каспий». Жители Мангистауской области (Казахстан)
присылают фото побережья Каспийского моря: городские пляжи Актау, дикий берег, порт, посёлки
(Акшукур, Форт-Шевченко, Баутино, Курык, Кендерли). Определи, есть ли на фото загрязнение берега или воды.

isPollution:
- true — на фото виден мусор, нефть/мазут, мёртвое животное, сточные воды, строительные отходы и т.п.
- false — чистый пляж/берег, пейзаж, селфи, скриншот, документ, фото не по теме или слишком размытое,
  чтобы что-то понять. Тогда category = "OTHER", severity = 1.

category (одна, главная):
- TRASH — бытовой смешанный мусор, пищевые отходы, бумага, стекло
- PLASTIC — преимущественно пластик: бутылки, пакеты, сети, пенопласт
- OIL — нефтяные пятна, мазут, битумные комки, радужная плёнка на воде, почерневший песок
- DEAD_ANIMAL — мёртвые животные: каспийский тюлень (итбалық), рыба, птицы
- SEWAGE — сброс сточных вод, канализация, пена, мутная вонючая вода из трубы
- CONSTRUCTION — строительный мусор: бетон, кирпич, арматура, грунт
- OTHER — загрязнение, не подходящее под категории выше

severity 1–5:
1 — единичный мелкий мусор (несколько предметов)
2 — небольшое скопление мусора на участке пляжа
3 — заметное загрязнение, много мусора или крупные предметы
4 — масштабная свалка, сток канализации, одно мёртвое крупное животное
5 — нефтяное пятно/разлив мазута или массовая гибель животных

confidence 0–1 — насколько ты уверен в категории.
summaryKk и summaryRu — одно короткое предложение (до 120 символов) о том, что на фото, на казахском
и русском. Пиши нейтрально, без оценок и без советов.
Комментарий жителя может помочь, но опирайся прежде всего на фото.`;

let client: Anthropic | null = null;
const getClient = () => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || key.toLowerCase() === 'none') return null;
  client ??= new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return client;
};

const model = () => process.env.AI_MODEL || 'claude-sonnet-5';

async function classifyWithClaude(
  claude: Anthropic,
  input: ClassifyInput,
): Promise<ClassifyResult | null> {
  const jpeg = await sharp(input.image)
    .resize({
      width: AI_IMAGE_EDGE,
      height: AI_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const comment = input.comment?.trim();
  const response = await claude.messages.parse({
    model: model(),
    max_tokens: 1024,
    // Классификация — простая задача: низкий effort даёт ответ за секунды
    output_config: { effort: 'low', format: zodOutputFormat(ClassificationSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') },
          },
          {
            type: 'text',
            text: comment ? `Комментарий жителя: «${comment.slice(0, 500)}»` : 'Комментария нет.',
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    logger.warn(
      { stopReason: response.stop_reason, stopDetails: response.stop_details },
      'ai: no parsed output',
    );
    return null;
  }
  return {
    ...response.parsed_output,
    provider: 'claude',
    raw: { model: response.model, usage: response.usage, stopReason: response.stop_reason },
  };
}

/**
 * Классификация фото: Claude vision (таймаут 15 с, 1 повтор), при любой ошибке — mock.
 * Никогда не бросает исключений: демо не должно падать.
 */
export async function classifyPhoto(input: ClassifyInput): Promise<ClassifyResult> {
  const started = performance.now();
  const claude = getClient();
  let result: ClassifyResult | null = null;
  let fallbackReason: string | null = claude ? null : 'no_api_key';

  if (claude) {
    try {
      result = await classifyWithClaude(claude, input);
      if (!result) fallbackReason = 'unparsed';
    } catch (err) {
      fallbackReason =
        err instanceof Anthropic.APIConnectionTimeoutError
          ? 'timeout'
          : err instanceof Anthropic.RateLimitError
            ? 'rate_limit'
            : err instanceof Anthropic.AuthenticationError
              ? 'auth'
              : err instanceof Anthropic.APIError
                ? `api_${err.status ?? 'error'}`
                : 'error';
      logger.error(
        err instanceof Anthropic.APIError
          ? { status: err.status, requestId: err.requestID, message: err.message.slice(0, 200) }
          : { err },
        `ai: claude request failed (${fallbackReason})`,
      );
    }
  }

  if (!result) {
    result = mockClassify(input.comment);
    result.raw = { ...(result.raw as object), fallbackReason };
  }

  const ms = Math.round(performance.now() - started);
  logger.info(
    {
      provider: result.provider,
      model: result.provider === 'claude' ? model() : undefined,
      ms,
      isPollution: result.isPollution,
      category: result.category,
      severity: result.severity,
      confidence: result.confidence,
      ...(fallbackReason && { fallbackReason }),
    },
    `ai: classified in ${ms} ms via ${result.provider}`,
  );
  (result.raw as Record<string, unknown>).ms = ms;
  return result;
}
