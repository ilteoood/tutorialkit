import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get(
  '/tasks/:id',
  {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            done: { type: 'boolean' },
          },
        },
      },
    },
  },
  async (request) => {
    return {
      id: request.params.id,
      title: 'Learn Fastify',
      done: false,
      secret: 'the response schema removes this field',
    };
  },
);

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
