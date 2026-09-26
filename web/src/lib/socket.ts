import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Одно соединение на вкладку: карта и админка подписываются на одни и те же события. */
export function getSocket(): Socket {
  socket ??= io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  return socket;
}
