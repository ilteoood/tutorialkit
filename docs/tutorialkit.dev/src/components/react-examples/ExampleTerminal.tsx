import type { Terminal as XTerm } from '@xterm/xterm';
import { Suspense, lazy, useEffect, useState } from 'react';
import { lessonRuntime } from './hooks/useLessonRuntime';
import { useTheme } from './hooks/useTheme';

const Terminal = lazy(() => import('@tutorialkit/react/core/Terminal'));

export default function ExampleTerminal() {
  // only needed in astro because of SSR
  const [domLoaded, setDomLoaded] = useState(false);

  const theme = useTheme();
  const { setTerminal } = useTerminal();

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  return (
    domLoaded && (
      <Suspense>
        <Terminal className="h-32" readonly={false} theme={theme} onTerminalReady={setTerminal} />
      </Suspense>
    )
  );
}

function useTerminal() {
  const runtime = lessonRuntime;
  const [terminal, setTerminal] = useState<XTerm | null>(null);

  useEffect(() => {
    if (!terminal) {
      return;
    }

    run(terminal);

    async function run(terminal: XTerm) {
      const process = await runtime.spawn('/bin/sh', [], {
        terminal: {
          cols: terminal.cols,
          rows: terminal.rows,
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
        void process.write(data);
      });
    }
  }, [terminal]);

  return {
    setTerminal,
  };
}
