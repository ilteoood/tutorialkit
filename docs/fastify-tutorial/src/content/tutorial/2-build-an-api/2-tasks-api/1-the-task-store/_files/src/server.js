import Fastify from 'fastify';
import { createTaskStore } from './store/tasks.js';

const fastify = Fastify({ logger: true });

fastify.decorate('tasks', createTaskStore());

fastify.get('/', async () => {
  return { hello: 'world', tasks: fastify.tasks.list().length };
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
