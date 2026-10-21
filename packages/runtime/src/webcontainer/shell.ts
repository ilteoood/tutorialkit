/**
 * Spawns a persistent shell wired to a TutorialKit terminal panel.
 *
 * Replaces WebContainer's `jsh` binary with `sh -i` from Nodepod's worker
 * environment. We don't try to recreate JSH's command allowlist or output
 * redirect -- Nodepod's shell-builtins and `createTerminal` already give us
 * interactive behaviour, and lesson authors compose their own commands.
 */
import type { Nodepod } from '@r1ck404/nodepod';
import { withResolvers } from '../utils/promises.js';
import type { ITerminal } from '../utils/terminal.js';

export async function newJSHProcess(nodepod: Nodepod, terminal: ITerminal) {
  const nodepodProcess = await nodepod.spawn('/bin/sh', ['-i'], {
    env: { TERM: 'xterm-256color' },
  });

  nodepodProcess.on('output', (data: string) => {
    terminal.write(data);
  });

  nodepodProcess.on('error', (data: string) => {
    terminal.write(data);
  });

  const ready = withResolvers<void>();

  // sh -i prints its prompt pretty quickly; we just give it a frame to settle.
  queueMicrotask(() => ready.resolve());

  terminal.onData((data: string) => {
    nodepodProcess.write(data);
  });

  await ready.promise;

  return nodepodProcess;
}
