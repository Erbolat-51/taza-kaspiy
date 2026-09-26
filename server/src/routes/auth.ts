import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { email, password } = LoginBody.parse(req.body);
      const user = await prisma.adminUser.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply
          .code(401)
          .send({ error: 'BAD_CREDENTIALS', message: 'Неверный email или пароль' });
      }
      const payload = { sub: user.id, email: user.email, name: user.name, role: user.role };
      return { token: app.jwt.sign(payload), user: payload };
    },
  );

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => req.user);
}
