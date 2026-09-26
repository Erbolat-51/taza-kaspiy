import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Классификатор отвечает «чистый пляж» — без модели и сети
vi.mock('../src/ai/classify.js', () => ({
  classifyPhoto: vi.fn(async () => ({
    isPollution: false,
    category: 'OTHER',
    severity: 1,
    confidence: 0.91,
    summaryKk: 'Фотода ластану көрінбейді',
    summaryRu: 'На фото загрязнение не видно',
    provider: 'clip',
    raw: {},
  })),
}));

// БД не должна тронуться: любые записи — провал теста
const create = vi.fn();
vi.mock('../src/db.js', () => ({
  prisma: {
    report: { create, findMany: vi.fn(async () => []) },
    zone: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(),
  },
}));

const { buildApp } = await import('../src/app.js');
const { loadEnv } = await import('../src/env.js');

let app: Awaited<ReturnType<typeof buildApp>>;
let uploads: string;

beforeAll(async () => {
  uploads = await mkdtemp(join(tmpdir(), 'taza-uploads-'));
  app = await buildApp(
    loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: 'test-secret-123',
      UPLOADS_DIR: uploads,
      WEB_DIST: join(uploads, 'no-dist'),
    }),
  );
});
afterAll(() => app.close());

async function multipart(fields: Record<string, string | Blob>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const res = new Response(fd);
  return {
    payload: Buffer.from(await res.arrayBuffer()),
    headers: { 'content-type': res.headers.get('content-type')! },
  };
}

describe('POST /api/reports — фото без загрязнения', () => {
  it('возвращает 422 NOT_POLLUTION с описанием и ничего не сохраняет', async () => {
    const jpeg = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#3f97b3' },
    })
      .jpeg()
      .toBuffer();
    const body = await multipart({
      photo: new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }),
      lat: '43.65',
      lng: '51.15',
    });

    const res = await app.inject({ method: 'POST', url: '/api/reports', ...body });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: 'NOT_POLLUTION',
      summaryKk: 'Фотода ластану көрінбейді',
      summaryRu: 'На фото загрязнение не видно',
      aiProvider: 'clip',
    });
    expect(create).not.toHaveBeenCalled();
    expect(await readdir(uploads)).toEqual([]); // фото не записано на диск
  });
});
