---
type: lesson
title: Running in production
focus: '/src/server.js'
---

# Running in production

The server you have been building listens on `localhost`, which means only your own computer can reach it. Its settings are also hard-coded. Let us fix both.

## The code

```file:/src/server.js
```

## The three changes

The port comes from the environment:

```js
const port = Number(process.env?.PORT ?? 3000);
```

`process.env` holds the environment variables of the process. `??` means "use this if the left side is missing or `null`".

The host is configurable:

```js
const host = process.env?.HOST ?? '127.0.0.1';
```

In production you want `0.0.0.0`, which listens on every network interface and not only on the loopback one.

The log level is configurable:

```js
const fastify = Fastify({
  logger: {
    level: process.env?.LOG_LEVEL ?? 'info',
  },
});
```

`fatal`, `error`, `warn`, `info`, `debug` and `trace` are the levels, from the quietest to the noisiest. `debug` is very useful while you develop.

## Try it

In the **Terminal** panel:

```bash
PORT=4000 npm start
```

The server now listens on port 4000.

## What you still need for a real deployment

- A process manager. A server that crashes stays crashed. Use systemd, Docker, or a platform that restarts it for you.
- A real database. The `Map` in this tutorial forgets everything.
- Secrets in the environment. Never write a password in the code.
- A reverse proxy. Put nginx or Caddy in front of it to handle TLS.
- Health checks. A `GET /health` route that answers when everything is fine.

:::danger
Never bind to `0.0.0.0` on a machine that is directly exposed to the internet without a firewall and a reverse proxy in front of it.
:::
