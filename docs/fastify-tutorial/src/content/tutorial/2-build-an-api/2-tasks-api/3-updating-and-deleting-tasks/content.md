---
type: lesson
title: Updating and deleting tasks
focus: '/src/routes/tasks.js'
---

# Updating and deleting tasks

Two routes are left. Both of them work on a single task, so both of them have to answer `404` when the task is not there.

## The files

```file:/src/routes/tasks.js```

```file:/src/server.js```

## Updating

```js
fastify.patch('/tasks/:id', {
  schema: {
    params: { /* ... */ },
    body: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1 },
        done: { type: 'boolean' },
      },
    },
  },
}, async (request, reply) => {
  const task = fastify.tasks.update(request.params.id, request.body);

  if (task === undefined) {
    return reply.code(404).send({ error: 'Task not found' });
  }

  return { task };
});
```

Notice that the body schema has no `required`. A `PATCH` may change the title, the `done` flag, or both, but it must be a valid object.

## Deleting

```js
fastify.delete('/tasks/:id', {
  schema: { /* ... */ },
}, async (request, reply) => {
  const removed = fastify.tasks.remove(request.params.id);

  if (!removed) {
    return reply.code(404).send({ error: 'Task not found' });
  }

  return reply.code(204).send();
});
```

`204 No Content` is the right answer for a successful delete: there is nothing left to send, so the body is empty.

## `PUT` and `PATCH`

| Method | Meaning |
|---|---|
| `PUT` | Replace the whole task, so send every field |
| `PATCH` | Change some of the fields |

Our API uses `PATCH`, because a client that only wants to tick the done box should not have to send the title back.

## Try it

```bash
curl -i -X POST http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' -d '{"title":"Learn Fastify"}'
curl -i -X PATCH http://127.0.0.1:3000/api/tasks/1 -H 'Content-Type: application/json' -d '{"done":true}'
curl -i -X DELETE http://127.0.0.1:3000/api/tasks/1
curl -i http://127.0.0.1:3000/api/tasks
```

:::warn
The ids only work as long as the server keeps running. Every restart starts again from task `1`.
:::
