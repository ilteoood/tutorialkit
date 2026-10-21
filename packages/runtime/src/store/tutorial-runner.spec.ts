// must be imported first
import { mockNodepod, resetProcessFactory, setProcessFactory } from '@tutorialkit/test-utils';
import type { MockedNodepod } from '@tutorialkit/test-utils';
import { vi } from 'vitest';
vi.mock('@r1ck404/nodepod', () => mockNodepod());

import { Nodepod } from '@r1ck404/nodepod';
import { beforeEach, describe, expect, test } from 'vitest';
import { withResolvers } from '../utils/promises.js';
import { StepsController } from '../webcontainer/steps.js';
import { EditorStore } from './editor.js';
import { TerminalStore } from './terminal.js';
import { TutorialRunner } from './tutorial-runner.js';
beforeEach(() => {
  resetProcessFactory();
});

describe('TutorialRunner', () => {
  test('prepareFiles should write files into Nodepod', async () => {
    const nodepod = Nodepod.boot();
    const mock = (await nodepod) as MockedNodepod;
    const runner = new TutorialRunner(
      nodepod,
      new TerminalStore(nodepod),
      new EditorStore(),
      new StepsController(),
    );

    await runner.prepareFiles({
      files: {
        '/src/index.js': 'console.log("Hello, world!")',
        '/src/index.html': '<h1>Hello, world!</h1>',
      },
      template: {
        '/package.json': '{ "name": "my-project" }',
      },
    });

    const fs = JSON.stringify(mock._fakeFs, undefined, 2);
    expect(fs).toMatchInlineSnapshot(`
      "{
        "home": {
          "directory": {
            "tutorial": {
              "directory": {
                "package.json": {
                  "file": {
                    "contents": "{ \\"name\\": \\"my-project\\" }"
                  }
                },
                "src": {
                  "directory": {
                    "index.js": {
                      "file": {
                        "contents": "console.log(\\"Hello, world!\\")"
                      }
                    },
                    "index.html": {
                      "file": {
                        "contents": "<h1>Hello, world!</h1>"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }"
    `);
  });

  test('runCommands should execute commands only after load has completed', async () => {
    const nodepod = Nodepod.boot();
    const mock = (await nodepod) as MockedNodepod;

    const { promise: runCommandPromise, resolve } = withResolvers();

    const processFactory = vi.fn(() => {
      resolve(JSON.stringify(mock._fakeFs, undefined, 2));

      return {
        exit: new Promise<number>(() => {
          // noop
        }),
      };
    });

    setProcessFactory(processFactory);

    const runner = new TutorialRunner(
      nodepod,
      new TerminalStore(nodepod),
      new EditorStore(),
      new StepsController(),
    );

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
    expect(fs).toMatchInlineSnapshot(`
      "{
        "home": {
          "directory": {
            "tutorial": {
              "directory": {
                "package.json": {
                  "file": {
                    "contents": "{ \\"name\\": \\"my-project\\" }"
                  }
                },
                "src": {
                  "directory": {
                    "index.js": {
                      "file": {
                        "contents": "console.log(\\"Hello, world!\\")"
                      }
                    },
                    "index.html": {
                      "file": {
                        "contents": "<h1>Hello, world!</h1>"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }"
    `);

    expect(mock._fakeProcesses).toMatchInlineSnapshot(`
      [
        {
          "args": [
            "command",
          ],
          "command": "some",
        },
      ]
    `);
  });
});
