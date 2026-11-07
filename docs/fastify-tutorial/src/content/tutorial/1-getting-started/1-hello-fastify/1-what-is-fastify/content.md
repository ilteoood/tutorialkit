---
type: lesson
title: What is Fastify?
focus: '/src/server.js'
---

# What is Fastify?

Welcome! In this tutorial you will write a web server with **Fastify**, a web framework for Node.js.

By the end of it you will have a small **Tasks API** — a program that answers HTTP requests with JSON.

## What is a web server?

A **web server** is a program that waits for requests and answers them.

When your browser opens a web page, it sends an HTTP request:

```http
GET /articles HTTP/1.1
Host: example.com
```

The server answers with a response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{ "articles": [] }
```

Node.js can do this on its own, but you would have to write a lot of repetitive code by hand: parse the URL, read the request body, decide which function should handle the request, send the answer, deal with errors.

A **web framework** is a toolbox that takes care of that repetitive part for you.

## What Fastify gives you

- **Routing** — map URLs to the functions that answer them.
- **Body parsing** — turn incoming JSON into a plain JavaScript object.
- **Validation** — describe the shape of the data you expect with a schema, and Fastify rejects bad requests for you.
- **Serialization** — turn your objects back into JSON, and automatically hide the fields you did not mean to expose.
- **Plugins** — split a big app into small, reusable pieces.
- **Logging** — a logger that already understands requests.
- **Speed** — Fastify is one of the fastest Node.js frameworks out there.

:::tip
You do not have to learn Fastify all at once. Every lesson adds exactly one small piece to an app that already runs. Read the code, change it, break it, fix it — that is how it sticks.
:::

## What we are going to build

A **Tasks API** — a to-do list you can use over HTTP:

| Method | URL          | What it does   |
| ------ | ------------ | -------------- |
| GET    | `/tasks`     | List all tasks |
| POST   | `/tasks`     | Create a task  |
| GET    | `/tasks/:id` | Read one task  |
| PATCH  | `/tasks/:id` | Update a task  |
| DELETE | `/tasks/:id` | Delete a task  |

Later in the tutorial every route will live under `/api`, so the URL of this list will be `/api/tasks`. The `/api` part is a **prefix**: a piece of text added to the front of every route of a plugin.

The tasks live in memory (in a JavaScript `Map`), so they disappear when the server stops. That keeps the focus on Fastify — swapping in a real database later is just one more plugin.

## The files in front of you

On the left you can see the project we are working on:

- `package.json` — the dependencies of the project and the scripts you can run.
- `src/server.js` — the whole application, for now.

The server is already running. Look at the **Output** panel at the bottom to see its logs, and the preview on the right to see its answer.

:::info
Each lesson gives you the code for that exact step. You are free to change anything in the editor — when you move to the next lesson the files are replaced with the new version, so experiment as much as you like.
:::

Next up: a very short tour of the Node.js features we are going to use.
