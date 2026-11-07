import Fastify from 'fastify';
import taskRoutes from './routes/tasks.js';
import { createTaskStore } from './store/tasks.js';

const fastify = Fastify({ logger: true });

fastify.decorate('tasks', createTaskStore());

fastify.register(taskRoutes, { prefix: '/api' });

fastify.get('/', async () => {
  return {
    name: 'Tasks API',
    endpoints: ['GET /api/tasks', 'POST /api/tasks', 'GET /api/tasks/:id'],
  };
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
