---
type: lesson
title: Path parameters
focus: '/src/server.js'
---

# Path parameters

`/tasks/42` and `/tasks/43` are the same route with a different value. Fastify lets you capture that value with a **parameter**: a name between two slashes, prefixed with a colon.

```js
fastify.get('/tasks/:id', async (request) => {
  return { id: request.params.id };
});
```

Calling `GET /tasks/42` gives you `request.params.id === '42'`.

## The code

```file:/src/server.js```

## The rules

- A parameter is written `:name` and always matches exactly one path segment.
- Parameters are always strings in `request.params`: `'42'`, never the number `42`. You will convert them yourself, or let a schema do it for you.
- The order in the URL matters: `/tasks/:id` and `/tasks/:id/notes/:noteId` are two different routes.

## Wildcards

`:name` matches a single segment. To capture many segments, use `*`:

```js
fastify.get('/files/*', async (request) => {
  return { path: request.params['*'] };
});
```

`GET /files/docs/guide.md` gives you `request.params['*'] === 'docs/guide.md'`.

:::warn
The wildcard parameter is named `*`, so you read it with `request.params['*']` and not `request.params.*`.
:::

## Static routes win

Fastify checks the routes that have no parameters first, so `/tasks/stats` will never be swallowed by `/tasks/:id`.

## Try it

```bash
curl -i http://127.0.0.1:3000/tasks/42
curl -i http://127.0.0.1:3000/tasks/42/notes/7
curl -i http://127.0.0.1:3000/files/docs/guide.md
```
