---
type: lesson
title: Hooks
focus: '/src/server.js'
---

# Hooks

A **hook** is a function Fastify runs at a specific moment of a request's life. Use them for the work that has to happen around every route: logging, authentication, measuring time, adding headers.

```js
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('x-tutorial', 'fastify');
});
```

## The lifecycle of a request

| Hook | When it runs |
|---|---|
| `onRequest` | As soon as the request arrives, before anything is read |
| `preParsing` | Before the body is parsed |
| `preValidation` | After the body is parsed, before the schema is checked |
| `preHandler` | After the validation, right before your handler |
| `preSerialization` | Before the response is turned into JSON |
| `onSend` | Right before the response is sent |
| `onResponse` | After the response has been sent |
| `onError` | When something goes wrong |

## The code

```file:/src/server.js
```

## Reading the code

- `onRequest` measures the time and adds a header to the response. You can change the reply from a hook.
- `preHandler` only reads, so it returns nothing.
- `onSend` receives the payload and must return it. If you forget to return it, the response is empty. It can still change the reply, here we add the duration of the request as a header.

## Hooks and encapsulation

A hook registered on the server applies to every route, including the ones of your plugins, because plugins are children of the server.

:::tip
A hook that throws an error stops the request: Fastify calls the error handler and never reaches your handler. That is how you write authentication.
:::

## Try it

```bash
curl -i http://127.0.0.1:3000/
```

The `x-duration-ms` header holds how long the request took, in milliseconds.

Look at the **Output** panel: the two `info` lines come from `preHandler` and `onSend`, and the `durationMs` value tells you how long the request took.
