import type { Process } from 'openvessel';
import type { ITerminal } from '../utils/terminal.js';
import type { LessonRuntime } from './lesson-runtime.js';

/**
 * Starts a shell attached to a terminal.
 */
export async function newShellProcess(runtime: LessonRuntime, terminal: ITerminal): Promise<Process> {
  // the fallback size covers a shell attached before its terminal is visible
  const process = await runtime.spawn('/bin/sh', [], {
    terminal: {
      cols: terminal.cols ?? 80,
      rows: terminal.rows ?? 15,
    },
  });

  void process.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal.write(data);
      },
    }),
  );

  terminal.onData((data) => {
    process.write(data);
  });

  return process;
}
