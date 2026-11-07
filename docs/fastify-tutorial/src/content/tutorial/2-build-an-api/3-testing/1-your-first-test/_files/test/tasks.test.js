import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from '../src/app.js';

let fastify;

before(async () => {
  fastify = await buildApp();
  await fastify.ready();
});

after(async () => {
  await fastify.close();
});

test('GET / returns the API index', async () => {
  const response = await fastify.inject({
    method: 'GET',
    url: '/',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().name, 'Tasks API');
});

test('POST /api/tasks creates a task', async () => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/tasks',
    payload: { title: 'Learn Fastify' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().task.title, 'Learn Fastify');
});

test('POST /api/tasks rejects a body without a title', async () => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/tasks',
    payload: {},
  });

  assert.equal(response.statusCode, 400);
});
