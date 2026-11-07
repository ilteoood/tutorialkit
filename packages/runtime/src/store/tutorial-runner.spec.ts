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

interface SpawnedCommand {
  command: string;
  args: string[];
  killed: boolean;
}

/**
 * Creates a runner on top of a fake runtime that keeps track of every spawned process.
 *
 * The processes created by the fake runtime never exit on their own, they only exit
 * when they are killed. Processes for which `keepAlive` returns false exit immediately.
 */
function createRunner(options: { keepAlive?: (args: string[]) => boolean } = {}) {
  const runtime = createFakeRuntime();
  const lessonRuntime = runtime as unknown as LessonRuntime;
  const spawned: SpawnedCommand[] = [];
  const originalSpawn = runtime.spawn.bind(runtime);
  const steps = new StepsController();

  vi.spyOn(runtime, 'spawn').mockImplementation(async (command, args = [], spawnOptions) => {
    const process = await originalSpawn(command, args, spawnOptions);

    let resolveExit!: (code: number) => void;

    process.exit = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });

    const tracked: SpawnedCommand = { command, args, killed: false };
    spawned.push(tracked);

    process.kill = async () => {
      tracked.killed = true;
      resolveExit(143);
    };

    if (!options.keepAlive?.(args)) {
      resolveExit(0);
    }

    return process;
  });

  return {
    runtime,
    spawned,
    steps,
    runner: new TutorialRunner(lessonRuntime, new TerminalStore(lessonRuntime), new EditorStore(), steps),
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

  test('runCommands should restart the main command when the lesson files change', async () => {
    const { runtime, runner, spawned, steps } = createRunner({ keepAlive: (args) => args[0] === 'start' });

    runner.setCommands({
      prepareCommands: ['npm install'],
      mainCommand: 'npm start',
    });

    void runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("first lesson")',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    runner.runCommands();

    await vi.waitFor(() => expect(spawned).toHaveLength(2));

    void runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("second lesson")',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    runner.runCommands();

    await vi.waitFor(() => expect(spawned).toHaveLength(3));

    expect(spawned[1].killed).toBe(true);
    expect(spawned[2].killed).toBe(false);
    expect(steps.steps.get()).toStrictEqual([
      { title: 'npm install', status: 'completed' },
      { title: 'npm start', status: 'running' },
    ]);
    expect(runtime.processes).toStrictEqual([
      {
        command: 'npm',
        args: ['install'],
        options: {
          terminal: undefined,
        },
      },
      {
        command: 'npm',
        args: ['start'],
        options: {
          terminal: undefined,
        },
      },
      {
        command: 'npm',
        args: ['start'],
        options: {
          terminal: undefined,
        },
      },
    ]);
  });

  test('runCommands should not restart the main command when a file is edited', async () => {
    const { runtime, runner, spawned } = createRunner({ keepAlive: (args) => args[0] === 'start' });

    runner.setCommands({
      mainCommand: 'npm start',
    });

    void runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("first lesson")',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    runner.runCommands();

    await vi.waitFor(() => expect(spawned).toHaveLength(1));

    runner.updateFile('/src/index.js', 'console.log("edited")');

    await vi.waitFor(() => expect(runtime.files['/src/index.js']).toBe('console.log("edited")'));

    expect(spawned).toHaveLength(1);
  });

  test('runCommands should run all commands again when the package.json changes', async () => {
    const { runner, spawned } = createRunner({ keepAlive: (args) => args[0] === 'start' });

    runner.setCommands({
      prepareCommands: ['npm install'],
      mainCommand: 'npm start',
    });

    void runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("first lesson")',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    runner.runCommands();

    await vi.waitFor(() => expect(spawned).toHaveLength(2));

    void runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("first lesson")',
      },
      template: {
        '/package.json': '{ "name": "my-project", "version": "2.0.0" }',
      },
    });

    runner.runCommands();

    await vi.waitFor(() => expect(spawned).toHaveLength(4));

    expect(spawned.map((process) => process.args)).toStrictEqual([['install'], ['start'], ['install'], ['start']]);
  });
});
