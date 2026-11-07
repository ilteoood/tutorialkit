---
type: lesson
title: Your first test
focus: '/test/tasks.test.js'
---

# Your first test

A test is a piece of code that calls your API and checks the answer. Fastify makes this easy with `inject`: you send a request without opening a socket, and you get a real response back.

```js
const response = await fastify.inject({
  method: 'GET',
  url: '/api/tasks',
});
```

`response.statusCode`, `response.json()` and `response.body` are all yours.

## Splitting the app from the server

To test the app, we need to be able to build it without starting it. So we split it in two:

- `src/app.js` builds and returns the Fastify instance.
- `src/server.js` builds it and listens on the port.

```file:/src/app.js
```

```file:/src/server.js
```

```file:/src/routes/tasks.js
```

```file:/src/store/tasks.js
```

## The test file

```file:/test/tasks.test.js
```

Node.js has a test runner built in, so there is nothing to install. The `test` script in `package.json` runs your test file:

```bash
npm test
```

## Reading the test

- `before` builds the app once and `after` closes it. Node.js calls them around the tests.
- `await fastify.ready()` waits until every plugin has been loaded.
- `assert.equal(response.statusCode, 201)` checks the status code.
- `assert.equal(response.json().task.title, 'Learn Fastify')` checks the body.

## Try it

Open the **Terminal** panel and run:

```bash
npm test
```

You should see three green tests.

:::tip
`node:test` is part of Node.js, so there is no extra dependency. On your own machine you can also run `node --test`, which finds and runs every `*.test.js` file of the project.
:::
