import type { MockedPod } from '@tutorialkit/test-utils';
import { assert, expect, test } from 'vitest';
import { PreviewsStore } from './previews.js';

test("preview is set ready on runtime's server-ready event", async () => {
  const { store, emit } = await getStore();
  store.setPreviews([3000]);

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(false);

  emit(3000, 'https://localhost');

  expect(store.previews.value![0].ready).toBe(true);
});

test('preview is not set ready when different port is ready', async () => {
  const { store, emit } = await getStore();
  store.setPreviews([3000]);

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(false);

  emit(3001, 'https://localhost');

  expect(store.previews.value[0].ready).toBe(false);
});

test('marks multiple preview infos ready', async () => {
  const { store, emit } = await getStore();
  store.setPreviews([
    { port: 3000, title: 'Dev' },
    { port: 3000, title: 'Docs', pathname: '/docs' },
  ]);

  assert(store.previews.value);
  expect(store.previews.value).toHaveLength(2);

  expect(store.previews.value[0].ready).toBe(false);
  expect(store.previews.value[0].pathname).toBe(undefined);

  expect(store.previews.value[1].ready).toBe(false);
  expect(store.previews.value[1].pathname).toBe('/docs');

  emit(3000, 'https://localhost');

  expect(store.previews.value[0].ready).toBe(true);
  expect(store.previews.value[1].ready).toBe(true);
});

type ServerReadyListener = (port: number, url: string) => void;

async function getStore() {
  const listeners: ServerReadyListener[] = [];

  const pod = {
    _fakeFiles: new Map<string, string>(),
    _fakeDirs: new Set<string>(['/']),
    _fakeProcesses: [],
    fs: {} as MockedPod['fs'],
    proxy: {
      on: (_event: string, listener: ServerReadyListener) => {
        listeners.push(listener);
      },
    },
    createTerminal: undefined as unknown,
    teardown: undefined as unknown,
    cwd: '/home/project',
    spawn: undefined as unknown,
  } as unknown as MockedPod;

  const promise = Promise.resolve(pod);

  await promise;

  return {
    store: new PreviewsStore(promise),
    emit: (port: number, url: string) => {
      assert(listeners.length > 0, 'Port listeners were not captured');

      listeners.forEach((cb) => cb(port, url));
    },
  };
}
