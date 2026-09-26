import { join } from 'node:path';
import sharp from 'sharp';
import { InputFile, type Api } from 'grammy';
import { getUploadsRoot } from '../services/photos.js';

/** Скачивает файл из Telegram. URL содержит токен — никогда не логируем его. */
export async function downloadTelegramFile(
  api: Api,
  token: string,
  fileId: string,
): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) throw new Error('Telegram getFile: no file_path');
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Telegram file download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * На диске фото хранятся в webp, а Telegram показывает webp как стикер/документ
 * и ломает media group — поэтому конвертируем в JPEG на лету.
 */
export async function photoAsJpeg(publicPath: string): Promise<InputFile> {
  const rel = publicPath.replace(/^\/uploads\//, '');
  const buf = await sharp(join(getUploadsRoot(), rel)).jpeg({ quality: 85 }).toBuffer();
  return new InputFile(buf, 'photo.jpg');
}
