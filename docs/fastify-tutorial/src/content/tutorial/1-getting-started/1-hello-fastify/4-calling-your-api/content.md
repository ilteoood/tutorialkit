---
type: lesson
title: Calling your API
focus: '/src/server.js'
---

# Calling your API

A server that nobody talks to is not very useful. Let us send it a request.

## The preview

The easiest way is the **preview panel** on the right. It is a browser window showing what your server answers to a GET request for `/`:

```json
{ "hello": "world" }
```

Every route you add later will show up here.

## curl

The **Terminal** panel at the bottom gives you a shell inside the project. `curl` is a small command-line tool that sends HTTP requests. It is the tool of choice for talking to APIs.

```bash
curl http://127.0.0.1:3000
```

The answer arrives as a single line. Add `-i` to also see the status code and the headers:

```bash
curl -i http://127.0.0.1:3000
```

```http
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 17

{"hello":"world"}
```

## The status code

`200 OK` is the **status code** of the response. It tells the client what happened:

| Code | Meaning                                  |
| ---- | ---------------------------------------- |
| 200  | Everything is fine                        |
| 201  | Something was created                     |
| 400  | The request was wrong (bad data)          |
| 404  | Nothing is found at that URL              |
| 500  | The server broke while handling the request |

You do not have to set `200` yourself — Fastify uses it when you return a value. You will set the others by hand when we need them.

## Sending data

A GET request asks for something. A POST request **sends** something, usually JSON in the request body:

```bash
curl -X POST http://127.0.0.1:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Learn Fastify"}'
```

- `-X POST` — use the POST method.
- `-H 'Content-Type: application/json'` — tell the server the body is JSON.
- `-d '{...}'` — the body itself.

We do not have a `/tasks` route yet, so this answers with `404`. We will add it in a moment.

:::tip
Two ways to send a request body: `curl -d` and the `-H` header are both needed. Without the `Content-Type` header Fastify does not know how to read the body.
:::

Now that you know how to talk to a server, let us add some real routes.
