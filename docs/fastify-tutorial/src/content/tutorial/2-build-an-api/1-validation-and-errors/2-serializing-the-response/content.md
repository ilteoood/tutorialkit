---
type: lesson
title: Serializing the response
focus: '/src/server.js'
---

# Serializing the response

The response schema works like the request schema, but in the other direction: it decides which fields leave your server.

```js
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
```

Fastify builds a serializer from this schema and uses it to write the JSON. Fields that are not in the schema are not sent.

## The code

```file:/src/server.js```

## Why bother?

Three good reasons:

1. You do not leak fields by accident. A password or an internal note in the object never reaches the client.
2. The client gets exactly what you promised. If you rename a field, the schema changes with it.
3. The response is smaller, because the JSON you send only contains the fields you listed.

## One schema per status code

The keys of `response` are status codes:

```js
response: {
  200: { /* the happy path */ },
  404: { /* when the task does not exist */ },
}
```

## The parameters are typed now

Notice that the params schema says `id` is an `integer`. Fastify converts `request.params.id` from the string `'42'` into the number `42` for you, before your handler runs.

## Try it

```bash
curl -i http://127.0.0.1:3000/tasks/42
```

The answer contains `id`, `title` and `done`, and no `secret` field, even though the handler returned one.

:::tip
Fastify builds the serializer once, at startup, and not on every request. That is one of the reasons Fastify is fast.
:::
