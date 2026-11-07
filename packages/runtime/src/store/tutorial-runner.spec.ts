import { createFakeRuntime, resetProcessFactory, setProcessFactory } from '@tutorialkit/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { withResolvers } from '../utils/promises.js';
import type { LessonRuntime } from '../vessel/lesson-runtime.js';
import { StepsController } from '../vessel/steps.js';
import { EditorStore } from './editor.js';
import { TerminalStore } from './terminal.js';
import { TutorialRunner } from './tutorial-runner.js';

beforeEach(() => {
  resetProcessFactory();
});

function createRunner() {
  const runtime = createFakeRuntime();
  const lessonRuntime = runtime as unknown as LessonRuntime;

  return {
    runtime,
    runner: new TutorialRunner(
      lessonRuntime,
      new TerminalStore(lessonRuntime),
      new EditorStore(),
      new StepsController(),
    ),
  };
}

describe('TutorialRunner', () => {
  test('prepareFiles should mount the lesson files in the lesson root', async () => {
    const { runtime, runner } = createRunner();

    await runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("Hello, world!")',
        '/src/index.html': '<h1>Hello, world!</h1>',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    expect(runtime.files).toStrictEqual({
      '/home/user/app/package.json': '{ "name": "my-project" }',
      '/home/user/app/src/index.js': 'console.log("Hello, world!")',
      '/home/user/app/src/index.html': '<h1>Hello, world!</h1>',
    });
  });

  test('runCommands should execute commands only after load has completed', async () => {
    const { runtime, runner } = createRunner();
    const { promise: runCommandPromise, resolve } = withResolvers<string>();

    const processFactory = vi.fn(() => {
      resolve(JSON.stringify(runtime.files, undefined, 2));

      return {
        exit: new Promise<number>(() => {
          // the process never exits
        }),
      };
    });

    setProcessFactory(processFactory);

    runner.setCommands({
      mainCommand: 'some command',
    });

    void runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("Hello, world!")',
        '/src/index.html': '<h1>Hello, world!</h1>',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    runner.runCommands();

    const files = await runCommandPromise;

    expect(processFactory).toHaveBeenCalledTimes(1);
    expect(JSON.parse(files)).toStrictEqual({
      '/home/user/app/package.json': '{ "name": "my-project" }',
      '/home/user/app/src/index.js': 'console.log("Hello, world!")',
      '/home/user/app/src/index.html': '<h1>Hello, world!</h1>',
    });

    expect(runtime.processes).toStrictEqual([
      {
        command: 'some',
        args: ['command'],
        options: {
          terminal: undefined,
        },
      },
    ]);
  });
});
