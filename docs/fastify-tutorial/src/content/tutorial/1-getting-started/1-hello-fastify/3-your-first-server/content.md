---
type: lesson
title: Your first Fastify server
focus: '/src/server.js'
---

# Your first Fastify server

Let us look at the whole application we are starting from. It is only a few lines:

```file:/src/server.js
```

There are four parts to it.

## 1. Create the server

```js
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });
```

The first line imports the Fastify library. The second line **creates a server instance** and puts it in the `fastify` variable.

`Fastify()` takes an options object. We pass one option:

- `logger: true` — turn on the built-in logger. Fastify will then print one line per request, which is exactly what you want while developing.

:::info
Creating the server does not start it. Nothing is listening on a port yet. We will do that in a moment.
:::

## 2. Add a route

```js
fastify.get('/', async () => {
  return { hello: 'world' };
});
```

This is a **route**: "when someone asks for `/` with a GET request, run this function".

The function is called the **handler**. It is `async`, because a real handler will usually have to wait for something (a database, another service, a file). Here it does not, but we keep the same shape from the start.

The handler **returns** an object. Fastify turns that object into JSON for you:

```json
{ "hello": "world" }
```

## 3. Start listening

```js
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
```

`fastify.listen()` does two things: it starts the HTTP server and it **waits** until the server is really up and running. Because it waits, we `await` it.

We wrap it in `try` / `catch` because starting a server can fail — for example when port 3000 is already taken by another program. If it fails we log the error and stop the process with a non-zero exit code, so whoever started it knows something went wrong.

`port: 3000` means "listen on port 3000". You can change it to any free port.

:::tip
The `start` function is a common pattern in Fastify applications. We keep the code that starts the server separate from the code that defines the app, because that makes the app easy to test — we will see that in the testing chapter.
:::

## 4. Look at the logs

The **Output** panel at the bottom shows what the server is doing. When the server starts you will see something like:

```text
{"level":30,"time":"...","msg":"Server listening at http://127.0.0.1:3000"}
```

`127.0.0.1` is your own computer — also known as `localhost`.

:::info
The server listens on `localhost` by default, which means it only accepts connections from your own machine. That is the safe default. To accept connections from other machines you would pass `host: '0.0.0.0'`.
:::

Now let's actually talk to the server.
