import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface ParsedMultipart {
  fields: Record<string, string>;
  file?: { buffer: Buffer; mimetype: string; filename: string };
}

/** Читает multipart целиком: текстовые поля + один файл-изображение (≤10 МБ, image/*). */
export async function readMultipart(
  req: FastifyRequest,
  fileField = 'photo',
): Promise<ParsedMultipart> {
  if (!req.isMultipart())
    throw new AppError(415, 'MULTIPART_REQUIRED', 'Нужен multipart/form-data');
  const out: ParsedMultipart = { fields: {} };
  for await (const part of req.parts({
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 20 },
  })) {
    if (part.type === 'file') {
      if (part.fieldname !== fileField) {
        await part.toBuffer();
        continue;
      }
      if (!part.mimetype.startsWith('image/')) {
        await part.toBuffer();
        throw new AppError(415, 'IMAGE_ONLY', 'Разрешены только изображения');
      }
      out.file = {
        buffer: await part.toBuffer(),
        mimetype: part.mimetype,
        filename: part.filename,
      };
    } else {
      out.fields[part.fieldname] = String(part.value);
    }
  }
  return out;
}

export function requireFile(mp: ParsedMultipart) {
  if (!mp.file) throw new AppError(400, 'PHOTO_REQUIRED', 'Прикрепите фото (поле photo)');
  return mp.file;
}
