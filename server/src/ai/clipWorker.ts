/**
 * Дочерний процесс CLIP. Нативный onnxruntime может упасть с segfault (например, старый
 * VC++ runtime на Windows) — в отдельном процессе это не роняет API, бот и карту.
 * Протокол IPC: { id, type: 'warmup' | 'classify', image? } → { id, ok, classes?, error? }
 */
import { resolve } from 'node:path';
import sharp from 'sharp';
import {
  RawImage,
  pipeline,
  type ZeroShotImageClassificationPipeline,
} from '@huggingface/transformers';
import { PROMPT_LIST, groupScores } from './clipMapping.js';

export const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
const DTYPE = (process.env.CLIP_DTYPE ?? 'q8') as 'q8' | 'fp32';

let clf: Promise<ZeroShotImageClassificationPipeline> | null = null;
const load = () =>
  (clf ??= pipeline('zero-shot-image-classification', CLIP_MODEL, {
    dtype: DTYPE,
    cache_dir: resolve(process.env.MODELS_DIR ?? './models'),
  }) as Promise<ZeroShotImageClassificationPipeline>);

async function classify(image: Uint8Array) {
  const model = await load();
  // Декодируем сами через sharp (webp/heic/png) — модель сама приведёт к 224×224
  const { data, info } = await sharp(image)
    .rotate()
    .resize({ width: 448, height: 448, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
  const output = (await model(
    raw,
    PROMPT_LIST.map((p) => p.prompt),
    { hypothesis_template: '{}' },
  )) as { label: string; score: number }[];
  return groupScores(output);
}

interface Request {
  id: number;
  type: 'warmup' | 'classify';
  image?: Uint8Array;
}

process.on('message', async (msg: Request) => {
  try {
    if (msg.type === 'warmup') {
      const model = await load();
      const blank = new RawImage(new Uint8ClampedArray(224 * 224 * 3).fill(200), 224, 224, 3);
      await model(blank, [PROMPT_LIST[0]!.prompt]);
      process.send!({ id: msg.id, ok: true });
    } else {
      process.send!({ id: msg.id, ok: true, classes: await classify(msg.image!) });
    }
  } catch (err) {
    process.send!({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Родитель умер — выходим, чтобы не оставлять сирот
process.on('disconnect', () => process.exit(0));
process.send!({ id: 0, ok: true, ready: true });
