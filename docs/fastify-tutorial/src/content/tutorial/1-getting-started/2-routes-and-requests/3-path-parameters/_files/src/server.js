import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/', async () => {
  return { hello: 'world' };
});

fastify.get('/tasks/:id', async (request) => {
  return { id: request.params.id };
});

fastify.get('/tasks/:id/notes/:noteId', async (request) => {
  return { params: request.params };
});

fastify.get('/files/*', async (request) => {
  return { path: request.params['*'] };
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
