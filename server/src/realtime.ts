import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { bus } from './lib/bus.js';
import { toPublic } from './services/reportShape.js';
import { indexColor } from './domain/cleanIndex.js';

/**
 * Socket.IO: транслирует доменные события всем клиентам (публичная карта и админки).
 * События: report:new, report:updated, zone:updated.
 */
export function attachRealtime(server: HttpServer, corsOrigins: string[]) {
  const io = new Server(server, { cors: { origin: corsOrigins }, path: '/socket.io' });

  bus.on('report:created', ({ report, duplicateOf }) => {
    io.emit('report:new', { report: toPublic(report), duplicateOf });
  });
  bus.on('report:updated', ({ report, change }) => {
    io.emit('report:updated', { report: toPublic(report), change });
  });
  bus.on('cleanup:created', ({ cleanupId }) => io.emit('cleanup:updated', { cleanupId }));
  bus.on('cleanup:updated', ({ cleanupId }) => io.emit('cleanup:updated', { cleanupId }));
  bus.on('executor:linked', ({ executorId }) => io.emit('executor:updated', { executorId }));
  bus.on('zone:index', ({ zoneId, cleanIndex }) => {
    io.emit('zone:updated', { zoneId, cleanIndex, color: indexColor(cleanIndex) });
  });

  return io;
}
