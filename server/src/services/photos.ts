import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../lib/errors.js';

let uploadsRoot = resolve('./uploads');

export function configureUploads(dir: string) {
  uploadsRoot = resolve(dir);
  return uploadsRoot;
}

export const getUploadsRoot = () => uploadsRoot;

export interface ProcessedPhoto {
  full: Buffer;
  thumb: Buffer;
}

/** Ресайз: основное фото ≤1600px и превью 400px, оба webp. EXIF-поворот учитывается. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  try {
    const base = sharp(input, { failOn: 'error' }).rotate();
    const [full, thumb] = await Promise.all([
      base
        .clone()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
      base
        .clone()
        .resize({ width: 400, height: 400, fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer(),
    ]);
    return { full, thumb };
  } catch {
    throw new AppError(400, 'BAD_IMAGE', 'Файл не является корректным изображением');
  }
}

/** Сохраняет на диск, возвращает публичные пути вида /uploads/r/<uuid>.webp */
export async function storePhoto(p: ProcessedPhoto): Promise<{ photo: string; thumb: string }> {
  const dir = join(uploadsRoot, 'r');
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  await Promise.all([
    writeFile(join(dir, `${id}.webp`), p.full),
    writeFile(join(dir, `${id}_t.webp`), p.thumb),
  ]);
  return { photo: `/uploads/r/${id}.webp`, thumb: `/uploads/r/${id}_t.webp` };
}
