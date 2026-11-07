---
type: lesson
title: Error handling
focus: '/src/server.js'
---

# Error handling

Two things can go wrong: a route that does not exist, and a handler that throws.

Fastify handles both for you, and lets you replace what it sends.

## The code

```file:/src/server.js
```

## The error handler

```js
fastify.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'the request failed');

  const statusCode = error.statusCode ?? 500;

  reply.code(statusCode).send({
    error: statusCode >= 500 ? 'Internal Server Error' : error.message,
    statusCode,
  });
});
```

- `error.statusCode` is set by Fastify for the errors it knows about: a validation error is `400`, a missing route is `404`.
- A plain `new Error('...')` has no status code, so it becomes `500`.
- `request.log` writes the real error to the logs, while the client only gets a safe message. Never send the message of a `500` to the client: it can contain details about your internals.

## The not found handler

```js
fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: `Route ${request.method} ${request.url} not found`,
  });
});
```

## Throwing from a handler

You do not have to build the response by hand. Throwing is enough:

```js
fastify.get('/boom', async () => {
  throw new Error('Something went wrong');
});
```

Fastify catches it, calls the error handler and answers `500`.

:::tip
If you want a specific status code, throw an error that carries one: `throw Object.assign(new Error('Task not found'), { statusCode: 404 })`.
:::

## Try it

```bash
curl -i http://127.0.0.1:3000/boom
curl -i http://127.0.0.1:3000/does-not-exist
```

Look at the **Output** panel: the real error is logged there, with its stack trace.
