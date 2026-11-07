---
type: lesson
title: Validating the request
focus: '/src/server.js'
---

# Validating the request

Until now the server trusts whatever the client sends. If a client posts `{"title": 42}`, your code has to work out on its own whether that is acceptable.

Fastify validates for you. You describe the shape of the data you expect with a **JSON Schema**, and Fastify checks every request against it before your handler runs.

## The code

```file:/src/server.js
```

## Where a schema goes

A route can validate four different things:

| Key | Validates |
|---|---|
| `body` | The body of the request |
| `querystring` | The query string |
| `params` | The path parameters |
| `headers` | The request headers |

## Reading the schema

```js
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
```

- `type: 'object'` means the body must be a JSON object.
- `required: ['title']` means `title` must be there.
- `type: 'string'` means it must be a string.
- `minLength: 1` means it cannot be empty.
- `default: false` means that, if `done` is missing, Fastify adds it.

When the data does not match, Fastify answers `400 Bad Request` and never calls your handler.

## Try it

```bash
curl -i -X POST http://127.0.0.1:3000/tasks -H 'Content-Type: application/json' -d '{"title":"Learn Fastify"}'
curl -i -X POST http://127.0.0.1:3000/tasks -H 'Content-Type: application/json' -d '{}'
curl -i -X POST http://127.0.0.1:3000/tasks -H 'Content-Type: application/json' -d '{"title":""}'
```

The first request creates a task. The second one is answered with `400 Bad Request`, because `title` is required. The third one is rejected too, because `minLength: 1` forbids an empty string.

## Fastify fixes simple mistakes for you

Fastify does not only reject bad data, it also repairs it. When the schema says `title` is a string and the client sends the number `42`, Fastify turns it into the string `"42"` and lets the request through. The same happens with `"done": "true"`, which becomes the boolean `true`.

This is called **coercion**, and it is enabled by default. It is convenient, but it also means that `type: 'string'` does not really prove the client sent a string.

Any property that is not in the schema is removed, so a client cannot sneak extra fields into your handler.

:::info
Coercion comes from the Ajv configuration Fastify ships with. Its baseline is `coerceTypes: 'array'`, `useDefaults: true` and `removeAdditional: true`.
:::

## When you want to be strict

Sometimes a repaired value is worse than a rejected one. If you want `"42"` to be an error instead of the string `"42"`, turn coercion off when you create the server:

```js
const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      coerceTypes: false,
    },
  },
});
```

Now the request with `{"title": 42}` is answered with `400 Bad Request`.

:::warn
Never trust `request.body` without a schema. That data comes from the internet.
:::
