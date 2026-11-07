---
type: lesson
title: Where to go from here
focus: '/src/server.js'
---

# Where to go from here

You now have a working Fastify API: routes, plugins, decorators, hooks, validation, serialization, error handling and tests. Here is where to go next.

## The documentation

The [Fastify documentation](https://fastify.dev/docs/latest/) is the reference for every option in this tutorial. The pages worth reading next are:

| Page | What you will find |
|---|---|
| [Guides](https://fastify.dev/docs/latest/Guides/) | Database access, writing plugins, serverless, recommendations |
| [Reference](https://fastify.dev/docs/latest/Reference/) | Every option of the server, the routes and the hooks |
| [Ecosystem](https://fastify.dev/docs/latest/Guides/Ecosystem/) | The official plugins, from CORS to static files |

## The plugins you will need next

- [`@fastify/cors`](https://github.com/fastify/fastify-cors) allows a browser on another domain to call your API.
- [`@fastify/static`](https://github.com/fastify/fastify-static) serves files from a folder.
- [`@fastify/helmet`](https://github.com/fastify/fastify-helmet) sets the security headers.
- [`@fastify/jwt`](https://github.com/fastify/fastify-jwt) signs and verifies tokens.
- [`@fastify/websocket`](https://github.com/fastify/fastify-websocket) handles real-time connections.

They all work the same way:

```js
import cors from '@fastify/cors';

await fastify.register(cors);
```

## Making it real

The next steps of this API, in order:

1. Replace the `Map` with a database. The [Database guide](https://fastify.dev/docs/latest/Guides/Database/) shows how to keep the decorators as your data access layer.
2. Add authentication with a plugin and a `preHandler` hook.
3. Add pagination to `GET /api/tasks`. The `limit` schema of the validation chapter is a good start.
4. Write the OpenAPI documentation with [`@fastify/swagger`](https://github.com/fastify/fastify-swagger).

## Keep practicing

The best way to learn Fastify is to build something you actually need. Take the API you have here and add one feature at a time, with a test for each one.

:::tip
When you get stuck, the [Fastify discussions](https://github.com/fastify/fastify/discussions) and the [Fastify Discord](https://github.com/fastify/fastify#getting-help) are full of people who have been exactly where you are.
:::
