export default async function taskRoutes(fastify) {
  fastify.get('/tasks', async () => {
    return { tasks: [] };
  });

  fastify.post('/tasks', async (request, reply) => {
    return reply.code(201).send({ title: request.body?.title });
  });
}
