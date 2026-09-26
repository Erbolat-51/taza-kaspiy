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

/** Общий бюджет на весь вызов, включая повтор: бот не должен ждать дольше. */
const BUDGET_MS = 15_000;
/** Повторяем, только если на вторую попытку осталось хотя бы столько. */
const MIN_RETRY_MS = 3_000;
const RETRY_DELAY_MS = 500;
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
  // Повторы SDK отключены — ими управляет classifyPhoto в рамках общего бюджета
  client ??= new Anthropic({ apiKey: key, timeout: BUDGET_MS, maxRetries: 0 });
  return client;
};

const model = () => process.env.AI_MODEL || 'claude-sonnet-5';

async function classifyWithClaude(
  claude: Anthropic,
  jpeg: Buffer,
  comment: string | undefined,
  timeoutMs: number,
): Promise<ClassifyResult | null> {
  const response = await claude.messages.parse(
    {
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
    },
    { timeout: timeoutMs },
  );

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

function failureReason(err: unknown): string {
  // Порядок важен: TimeoutError — подкласс ConnectionError
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (err instanceof Anthropic.APIConnectionError) return 'network';
  if (err instanceof Anthropic.RateLimitError) return 'rate_limit';
  if (err instanceof Anthropic.AuthenticationError) return 'auth';
  if (err instanceof Anthropic.APIError) return `api_${err.status ?? 'error'}`;
  return 'error';
}

/** Повтор имеет смысл только для временных сбоев: 429, 5xx, сеть. Таймаут не повторяем. */
function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return false;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Классификация фото: Claude vision с общим бюджетом 15 с и максимум одним повтором
 * (только на 429/5xx/сеть), при любой неудаче — mock. Никогда не бросает исключений.
 */
export async function classifyPhoto(input: ClassifyInput): Promise<ClassifyResult> {
  const started = performance.now();
  const elapsed = () => performance.now() - started;
  const claude = getClient();
  let result: ClassifyResult | null = null;
  let fallbackReason: string | null = claude ? null : 'no_api_key';
  let attempts = 0;

  if (claude) {
    try {
      const jpeg = await sharp(input.image)
        .resize({
          width: AI_IMAGE_EDGE,
          height: AI_IMAGE_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      const comment = input.comment?.trim() || undefined;

      while (attempts < 2) {
        attempts++;
        try {
          result = await classifyWithClaude(
            claude,
            jpeg,
            comment,
            Math.floor(BUDGET_MS - elapsed()),
          );
          fallbackReason = result ? null : 'unparsed';
          break;
        } catch (err) {
          fallbackReason = failureReason(err);
          const canRetry =
            attempts < 2 &&
            isRetryable(err) &&
            BUDGET_MS - elapsed() - RETRY_DELAY_MS >= MIN_RETRY_MS;
          logger.warn(
            {
              attempt: attempts,
              reason: fallbackReason,
              willRetry: canRetry,
              ...(err instanceof Anthropic.APIError
                ? { status: err.status, requestId: err.requestID }
                : {}),
              message: err instanceof Error ? err.message.slice(0, 200) : String(err),
            },
            `ai: claude attempt ${attempts} failed (${fallbackReason})`,
          );
          if (!canRetry) break;
          await sleep(RETRY_DELAY_MS);
        }
      }
    } catch (err) {
      fallbackReason = 'bad_image';
      logger.warn({ err }, 'ai: could not prepare image');
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
      ...(attempts > 1 && { attempts }),
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
