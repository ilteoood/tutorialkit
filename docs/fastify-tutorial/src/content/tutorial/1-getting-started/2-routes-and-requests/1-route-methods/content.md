---
type: lesson
title: Route methods
focus: '/src/server.js'
---

# Route methods

So far our server only answers `GET /`. A real API needs more: reading a list, creating an item, changing an item, removing it.

Fastify gives you one function per HTTP method:

| Method | What it means | Typical URL |
|---|---|---|
| `GET` | Read something | `GET /tasks` |
| `POST` | Create something | `POST /tasks` |
| `PUT` | Replace something entirely | `PUT /tasks/1` |
| `PATCH` | Change part of something | `PATCH /tasks/1` |
| `DELETE` | Remove something | `DELETE /tasks/1` |

## The code

```file:/src/server.js
```

## How a route is built

Every route has three parts:

1. The method: `fastify.get`, `fastify.post`, `fastify.patch`, `fastify.delete`.
2. The path: the URL the client has to call, like `'/tasks'`.
3. The handler: an `async` function that receives the request and produces the answer.

The handler has two arguments:

```js
fastify.get('/tasks', async (request, reply) => {
  return reply.code(200).send({ tasks: [] });
});
```

- `request` is everything the client sent: the path, the query string, the headers, the body.
- `reply` is the response you are building: its status code, its headers, its body.

## Try it

Open the **Terminal** panel and run:

```bash
curl -i http://127.0.0.1:3000/tasks
curl -i -X POST http://127.0.0.1:3000/tasks -H 'Content-Type: application/json' -d '{"title":"Learn Fastify"}'
curl -i -X DELETE http://127.0.0.1:3000/tasks/1
```

:::tip
The `curl -i` flag prints the response headers too, so you can see the status code (`200 OK`, `201 Created`) above the body.
:::

## The long form

`fastify.get(...)` is a shortcut. The complete version is `fastify.route(...)`:

```js
fastify.route({
  method: 'GET',
  url: '/tasks',
  handler: async (request, reply) => {
    return { tasks: [] };
  },
});
```

Both do the same thing. Use the shortcut while you are learning, and `fastify.route` when you need the extra options you will meet in the next chapters.

:::warn
Never send the response twice. Either `return { ... }` **or** `reply.send({ ... })`, never both. When you call `reply.send()` inside an `async` handler, also `return reply` (or `await reply`), otherwise Fastify tries to send the returned value as well and logs a warning: `Reply was already sent, did you forget to "return reply"?`
:::
