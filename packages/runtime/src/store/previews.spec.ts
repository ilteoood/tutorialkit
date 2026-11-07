import { assert, expect, test } from 'vitest';
import type { ServerEvent } from '../vessel/lesson-runtime.js';
import type { LessonRuntime } from '../vessel/lesson-runtime.js';
import { PreviewsStore } from './previews.js';

test('preview is set ready when its server opens', async () => {
  const { store, emit } = getStore();
  store.setPreviews([3000]);
  await settle();

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(false);

  emit(3000, 'open');
  await settle();

  expect(store.previews.value![0].ready).toBe(true);
});

test('preview is not set ready when a different server opens', async () => {
  const { store, emit } = getStore();
  store.setPreviews([3000]);
  await settle();

  assert(store.previews.value);
  expect(store.previews.value[0].ready).toBe(false);

  emit(3001, 'open');
  await settle();

  expect(store.previews.value[0].ready).toBe(false);
});

test('marks multiple preview infos ready', async () => {
  const { store, emit } = getStore();
  store.setPreviews([
    { port: 3000, title: 'Dev' },
    { port: 3000, title: 'Docs', pathname: '/docs' },
  ]);
  await settle();

  assert(store.previews.value);
  expect(store.previews.value).toHaveLength(2);

  expect(store.previews.value[0].ready).toBe(false);
  expect(store.previews.value[0].pathname).toBe(undefined);

  expect(store.previews.value[1].ready).toBe(false);
  expect(store.previews.value[1].pathname).toBe('/docs');

  emit(3000, 'open');
  await settle();

  expect(store.previews.value[0].ready).toBe(true);
  expect(store.previews.value[1].ready).toBe(true);
  expect(store.previews.value[1].url).toBe('https://localhost:3000/docs');
});

test('falls back to the first server that opened when no preview is configured', async () => {
  const { store, emit } = getStore();
  store.setPreviews(true);
  await settle();

  expect(store.previews.value).toStrictEqual([]);

  emit(3000, 'open');
  await settle();

  assert(store.previews.value);
  expect(store.previews.value).toHaveLength(1);
  expect(store.previews.value[0].port).toBe(3000);
});

function getStore() {
  let listener: ((event: ServerEvent) => void) | undefined;

  const runtime = {
    onServer: (callback: (event: ServerEvent) => void) => {
      listener = callback;

      return () => {
        listener = undefined;
      };
    },
    previewUrl: async (port: number, pathname?: string) =>
      `https://localhost:${port}/${(pathname ?? '').replace(/^\//, '')}`,
  } as unknown as LessonRuntime;

  return {
    store: new PreviewsStore(runtime),
    emit: (port: number, type: ServerEvent['type']) => {
      assert(listener, 'The previews store did not subscribe to the runtime');

      listener({ port, type });
    },
  };
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
