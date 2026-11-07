---
type: lesson
title: Node.js in five minutes
focus: '/src/server.js'
---

# Node.js in five minutes

You do not need to be an expert in Node.js to follow this tutorial. But it helps to know five things.

## 1. Node.js runs your JavaScript

Node.js is a runtime for JavaScript. You write a `.js` file, run it with `node`, and it keeps running until you stop it.

```bash
node src/server.js
```

That is exactly what the `start` script in `package.json` does:

```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

So `npm start` is just a shortcut for `node src/server.js`.

## 2. Files are modules

Node.js uses **ES modules** with the `import` / `export` keywords:

```js
// math.js
export function add(a, b) {
  return a + b;
}
```

```js
// server.js
import { add } from './math.js';

console.log(add(1, 2));
```

A file that exports something is a module. A file that imports something is also a module. `package.json` tells Node that this project uses ES modules:

```json
{
  "type": "module"
}
```

:::info
Without `"type": "module"` you would have to use the older `require()` / `module.exports` style instead.
:::

## 3. `import` and `export`

| What you write | What it means                                                  |
| -------------- | -------------------------------------------------------------- |
| `import x from './a.js'` | Take the **default export** of `./a.js`.              |
| `import { x } from './a.js'` | Take the **named export** called `x`.                |
| `export default x` | Make `x` the default export of this file.               |
| `export function x() {}` | Make `x` a named export of this file.                |

Node.js needs the file extension in the path: `'./a.js'`, not `'./a'`.

## 4. `async` / `await`

Reading from the network or a database takes time, so those operations are **asynchronous**: the code asks for something and continues while it waits.

An asynchronous function is declared with `async`, and `await` is used to wait for a result:

```js
async function main() {
  const answer = await someAsyncThing();

  console.log(answer);
}
```

Almost every function you write in Fastify will be `async`. We will see why in a moment.

## 5. `npm` and `package.json`

**npm** is the package manager that comes with Node.js. It installs libraries and runs scripts.

`package.json` is the manifest of your project:

```json
{
  "name": "fastify-tasks-api",
  "type": "module",
  "scripts": {
    "start": "node src/server.js"
  },
  "dependencies": {
    "fastify": "^5.12.8"
  }
}
```

- `scripts` — shortcuts you run with `npm run <name>`.
- `dependencies` — the libraries your project needs. `npm install` downloads them into `node_modules`.

The `^` in `^5.12.8` means "any version from 5.12.8 up to, but not including, 6.0.0".

:::tip
That is everything you need for now. Every time we meet a new Node.js feature, we will stop and explain it.
:::
