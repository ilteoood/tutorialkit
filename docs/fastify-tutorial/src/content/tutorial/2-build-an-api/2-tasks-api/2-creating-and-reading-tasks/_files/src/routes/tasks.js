export default async function taskRoutes(fastify) {
  fastify.get('/tasks', async () => {
    return { tasks: fastify.tasks.list() };
  });

  fastify.post(
    '/tasks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1 },
            done: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request, reply) => {
      const task = fastify.tasks.create(request.body);

      return reply.code(201).send({ task });
    },
  );

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
      },
    },
    async (request, reply) => {
      const task = fastify.tasks.find(request.params.id);

      if (task === undefined) {
        return reply.code(404).send({ error: 'Task not found' });
      }

      return { task };
    },
  );
}
