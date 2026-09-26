import { fork, type ChildProcess } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';
import { scoresToClassification, type ClassScore } from './clipMapping.js';
import type { ClassifyResult } from './types.js';

/**
 * Локальный ИИ: CLIP (OpenAI, 2021) в ONNX на CPU — без ключей и интернета
 * (модель скачивается один раз в ./models). Zero-shot: сравнивает фото с текстовыми описаниями классов.
 *
 * Модель живёт в дочернем процессе (clipWorker): падение нативного onnxruntime не роняет сервер,
 * а классификатор просто переходит на mock и пробует перезапуск через 5 минут.
 */
export const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
const DTYPE = process.env.CLIP_DTYPE ?? 'q8';
const RETRY_AFTER_MS = 5 * 60 * 1000;
const LOAD_TIMEOUT_MS = 180_000; // первое скачивание модели (~150 МБ)
const CLASSIFY_TIMEOUT_MS = 10_000;

type Pending = { resolve: (v: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
interface Reply {
  id: number;
  ok: boolean;
  classes?: ClassScore[];
  error?: string;
}

let child: ChildProcess | null = null;
let ready = false;
let failedAt = 0;
let nextId = 1;
const pending = new Map<number, Pending>();

export const clipStatus = () =>
  ready ? 'ready' : child ? 'loading' : failedAt ? 'failed' : 'idle';

/** Может ли CLIP сейчас ответить или загрузиться (для текста «ЖИ талдап жатыр…»). */
export const clipAvailable = () => ready || !failedAt || Date.now() - failedAt > RETRY_AFTER_MS;

function markFailed(reason: string) {
  ready = false;
  failedAt = Date.now();
  child = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    pending.delete(id);
  }
}

function spawn(): ChildProcess {
  if (child) return child;
  // В dev работаем из .ts через tsx (execArgv наследуется), в проде — из собранного .js
  const ext = extname(fileURLToPath(import.meta.url));
  const workerPath = fileURLToPath(new URL(`./clipWorker${ext}`, import.meta.url));
  const proc = fork(workerPath, [], {
    execArgv: process.execArgv,
    serialization: 'advanced', // Buffer передаётся без base64
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  proc.on('message', (msg: Reply) => {
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    p.resolve(msg);
  });
  proc.on('exit', (code, signal) => {
    if (child !== proc) return;
    logger.error({ code, signal }, 'clip: worker exited — falling back to mock');
    markFailed(`clip worker exited (code ${code ?? signal})`);
  });
  child = proc;
  return proc;
}

function request(msg: { type: 'warmup' | 'classify'; image?: Buffer }, timeoutMs: number) {
  const proc = spawn();
  const id = nextId++;
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`clip ${msg.type} timeout`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    proc.send({ id, ...msg });
  });
}

let warming: Promise<void> | null = null;

/** Загрузка модели + один прогон, чтобы первый житель не ждал. Лог времени загрузки. */
export function warmupClip(): Promise<void> {
  if (ready) return Promise.resolve();
  if (warming) return warming;
  const started = performance.now();
  logger.info({ model: CLIP_MODEL, dtype: DTYPE }, 'clip: loading model');
  warming = request({ type: 'warmup' }, LOAD_TIMEOUT_MS)
    .then((r) => {
      if (!r.ok) throw new Error(r.error);
      ready = true;
      failedAt = 0;
      logger.info(
        { model: CLIP_MODEL, ms: Math.round(performance.now() - started) },
        'clip: model ready',
      );
    })
    .catch((err: Error) => {
      logger.error({ err: err.message }, 'clip: model failed to load');
      child?.kill();
      markFailed(err.message);
      throw err;
    })
    .finally(() => {
      warming = null;
    });
  return warming;
}

export async function classifyWithClip(image: Buffer): Promise<ClassifyResult> {
  if (!ready) {
    if (!clipAvailable()) throw new Error('clip unavailable (recent failure)');
    await warmupClip();
  }
  const reply = await request({ type: 'classify', image }, CLASSIFY_TIMEOUT_MS);
  if (!reply.ok || !reply.classes) throw new Error(reply.error ?? 'clip: empty reply');
  return {
    ...scoresToClassification(reply.classes),
    provider: 'clip',
    raw: { model: CLIP_MODEL, dtype: DTYPE, top3: reply.classes.slice(0, 3) },
  };
}

export function stopClip() {
  child?.kill();
  child = null;
}
