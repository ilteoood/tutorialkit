import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.decorate('tasks', new Map());

fastify.decorate('clock', () => new Date().toISOString());

fastify.decorateRequest('taskId', null);

fastify.get('/', async () => {
  return { hello: 'world', now: fastify.clock() };
});

fastify.get('/tasks/:id', async (request) => {
  request.taskId = request.params.id;

  return { id: request.taskId };
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
