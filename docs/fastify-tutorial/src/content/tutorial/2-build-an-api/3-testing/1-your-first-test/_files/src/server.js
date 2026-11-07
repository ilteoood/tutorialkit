import { buildApp } from './app.js';

const start = async () => {
  const fastify = await buildApp({ logger: true });

  try {
    await fastify.listen({ port: 3000 });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
