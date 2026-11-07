import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.addHook('onRequest', async (request, reply) => {
  request.startedAt = Date.now();
  reply.header('x-tutorial', 'fastify');
});

fastify.addHook('preHandler', async (request) => {
  request.log.info({ url: request.url }, 'about to handle the request');
});

fastify.addHook('onSend', async (request, reply, payload) => {
  const durationMs = Date.now() - request.startedAt;

  request.log.info({ durationMs }, 'response sent');
  reply.header('x-duration-ms', String(durationMs));

  return payload;
});

fastify.get('/', async () => {
  return { hello: 'world' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
