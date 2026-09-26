/** Ожидаемая ошибка с HTTP-статусом и машинным кодом — отдаётся клиенту как есть. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message?: string,
    /** Доп. поля в ответе (например, описание ИИ для 422 NOT_POLLUTION) */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const notFound = (what = 'Report') => new AppError(404, 'NOT_FOUND', `${what} not found`);
