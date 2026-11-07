---
type: lesson
title: Creating and reading tasks
focus: '/src/routes/tasks.js'
---

# Creating and reading tasks

Now the routes have something real to talk about.

## The files

```file:/src/routes/tasks.js
```

```file:/src/server.js
```

## Reading the routes

Listing the tasks:

```js
fastify.get('/tasks', async () => {
  return { tasks: fastify.tasks.list() };
});
```

Creating a task:

```js
fastify.post('/tasks', {
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
}, async (request, reply) => {
  const task = fastify.tasks.create(request.body);

  return reply.code(201).send({ task });
});
```

- The schema rejects a body without a title with `400`, before the handler runs.
- `reply.code(201)` says "I created something". `201 Created` is the correct answer for a `POST` that creates a resource.

Reading one task:

```js
fastify.get('/tasks/:id', {
  schema: {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer' },
      },
    },
  },
}, async (request, reply) => {
  const task = fastify.tasks.find(request.params.id);

  if (task === undefined) {
    return reply.code(404).send({ error: 'Task not found' });
  }

  return { task };
});
```

## Try it

```bash
curl -i -X POST http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' -d '{"title":"Learn Fastify"}'
curl -i http://127.0.0.1:3000/api/tasks
curl -i http://127.0.0.1:3000/api/tasks/1
curl -i http://127.0.0.1:3000/api/tasks/99
```

The last call answers `404`: the id is in the URL, but not in the store.

:::info
The tasks live in memory. Restart the server and they are gone. That is fine for a tutorial, and it is also why the tests in the next chapter can start from a clean slate.
:::
