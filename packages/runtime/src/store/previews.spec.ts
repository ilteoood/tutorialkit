import { assert, expect, test, vi } from 'vitest';
import { PreviewsStore } from './previews.js';

const POLL_INTERVAL_MS = 25;

async function getStore(pollIntervalMs = POLL_INTERVAL_MS) {
  const urlForPort = vi.fn<(port: number) => string | null>().mockImplementation(() => null);

  const nodepod = {
    port: (port: number) => urlForPort(port),
    teardown: async () => {
      return undefined;
    },
  };

  const promise = Promise.resolve(nodepod);
  const store = new PreviewsStore(promise, { pollIntervalMs });

  await promise;

  // give the poller one tick to land
  await new Promise((resolve) => setTimeout(resolve, pollIntervalMs * 2));

  return { store, urlForPort };
}

test('preview is not ready before any port resolves', async () => {
  const { store } = await getStore();

  store.setPreviews([3000]);

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(false);

  store.dispose();
});

test('preview flips to ready when the polled port resolves', async () => {
  const { store, urlForPort } = await getStore();
  store.setPreviews([3000]);

  urlForPort.mockImplementation(() => 'https://localhost-3000.example/');

  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 4));

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(true);
  expect(store.previews.value[0].baseUrl).toBe('https://localhost-3000.example/');

  store.dispose();
});

test('preview does not flip ready when a different port resolves', async () => {
  const { store, urlForPort } = await getStore();
  store.setPreviews([3000]);

  urlForPort.mockImplementation((port) => (port === 3001 ? 'https://localhost-3001.example/' : null));

  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 4));

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(false);

  store.dispose();
});
