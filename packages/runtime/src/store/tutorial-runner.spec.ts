import { resetProcessFactory, setProcessFactory, type MockedPod } from '@tutorialkit/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { withResolvers } from '../utils/promises.js';
import { StepsController } from '../webcontainer/steps.js';
import { EditorStore } from './editor.js';
import { TerminalStore } from './terminal.js';
import { TutorialRunner } from './tutorial-runner.js';

beforeEach(() => {
  resetProcessFactory();
});

describe('TutorialRunner', () => {
  test('prepareFiles writes template + lesson files to the pod', async () => {
    const pod = await bootPod();
    const runner = createRunner(pod);

    await runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("Hello, world!")',
        '/src/index.html': '<h1>Hello, world!</h1>',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    expect(pod.fs.writeFile).toHaveBeenCalledWith('/src/index.js', 'console.log("Hello, world!")');
    expect(pod.fs.writeFile).toHaveBeenCalledWith('/src/index.html', '<h1>Hello, world!</h1>');
    expect(pod.fs.writeFile).toHaveBeenCalledWith('/package.json', '{ "name": "my-project" }');
  });

  test('runCommands executes commands only after load has completed', async () => {
    const pod = await bootPod();
    const { promise: runCommandPromise, resolve } = withResolvers<MockedPod['fs']>();

    const processFactory = vi.fn(() => {
      resolve(pod.fs);

      return {
        completion: new Promise<{ exitCode: number }>(() => {
          // noop
        }),
      };
    });

    setProcessFactory(processFactory);

    const runner = createRunner(pod);

    runner.setCommands({
      mainCommand: 'some command',
    });

    runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("Hello, world!")',
        '/src/index.html': '<h1>Hello, world!</h1>',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    runner.runCommands();

    const fs = await runCommandPromise;

    expect(processFactory).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalled();

    expect(pod._fakeProcesses).toMatchInlineSnapshot(`
      [
        {
          "args": [
            "command",
          ],
          "command": "some",
          "options": {
            "cwd": "/home/project",
          },
        },
      ]
    `);
  });
});

async function bootPod() {
  /**
   * SAFETY: `Nodepod` matches the upstream package's named export; the lint naming rule
   * is intentionally bypassed for call sites that must use that exact identifier.
   */
  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  const { Nodepod } = await import('@r1ck404/nodepod');
  const pod = (await Nodepod.boot()) as MockedPod;

  return pod;
}

function createRunner(pod: MockedPod) {
  return new TutorialRunner(
    Promise.resolve(pod),
    new TerminalStore(Promise.resolve(pod)),
    new EditorStore(),
    new StepsController(),
  );
}
