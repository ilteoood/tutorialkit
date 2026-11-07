import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'the request failed');

  const statusCode = error.statusCode ?? 500;

  reply.code(statusCode).send({
    error: statusCode >= 500 ? 'Internal Server Error' : error.message,
    statusCode,
  });
});

fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: `Route ${request.method} ${request.url} not found`,
  });
});

fastify.get('/boom', async () => {
  throw new Error('Something went wrong');
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
