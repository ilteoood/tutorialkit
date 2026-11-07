import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/', async () => {
  return { hello: 'world' };
});

fastify.get('/echo', async (request) => {
  return {
    method: request.method,
    url: request.url,
    query: request.query,
    headers: request.headers,
  };
});

fastify.post('/echo', async (request, reply) => {
  return reply.code(201).send({
    received: request.body,
    contentType: request.headers['content-type'] ?? null,
  });
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
