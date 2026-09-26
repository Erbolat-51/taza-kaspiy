import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminRole } from '@prisma/client';

export interface AdminJwt {
  sub: number;
  email: string;
  name: string;
  role: AdminRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AdminJwt;
    user: AdminJwt;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** JWT для админки: preHandler `app.authenticate` на защищённых роутах. */
export default fp<{ secret: string }>(async (app, opts) => {
  await app.register(jwt, { secret: opts.secret, sign: { expiresIn: '12h' } });
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Требуется вход' });
    }
  });
});

export const adminActor = (req: FastifyRequest) => `admin:${req.user.email}`;
