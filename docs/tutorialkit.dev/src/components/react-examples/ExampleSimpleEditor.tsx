import type { EditorDocument, EditorUpdate, ScrollPosition } from '@tutorialkit/react/core';
import CodeMirrorEditor from '@tutorialkit/react/core/CodeMirrorEditor';
import FileTree from '@tutorialkit/react/core/FileTree';
import type { Terminal as XTerm } from '@xterm/xterm';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useLessonRuntime } from './hooks/useLessonRuntime';
import { useTheme } from './hooks/useTheme';

const Terminal = lazy(() => import('@tutorialkit/react/core/Terminal'));

export default function ExampleSimpleEditor() {
  const [domLoaded, setDomLoaded] = useState(false);

  const theme = useTheme();
  const { setTerminal, previewSrc, document, files, onChange, onScroll, selectedFile, setSelectedFile } =
    useSimpleEditor();

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  return (
    <div className="mt-4 h-120 flex flex-col not-content react-example border border-[var(--ec-brdCol)] border-solid rounded overflow-hidden">
      <div className="flex h-1/2">
        <FileTree
          className="w-1/4 flex-shrink-0 text-sm"
          files={files}
          hideRoot
          selectedFile={selectedFile}
          onFileSelect={setSelectedFile}
        />
        <div className="w-px flex-shrink-0 h-full bg-[var(--ec-brdCol)]" />
        <div className="flex-grow h-full max-w-[calc(75%-1px)] relative bg-[var(--cm-backgroundColor)]">
          <CodeMirrorEditor
            theme={theme}
            doc={document}
            onChange={onChange}
            onScroll={onScroll}
            className="h-full text-[13px]"
          />
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-[var(--cm-backgroundColor)]" />
        </div>
      </div>
      <div className="h-px bg-[var(--ec-brdCol)]" />
      <div className="flex p-0 m-0 h-1/2">
        <div className="w-1/2 h-full">
          {domLoaded && (
            <Suspense>
              <Terminal className="h-full" readonly={false} theme={theme} onTerminalReady={setTerminal} />
            </Suspense>
          )}
        </div>
        <div className="w-px flex-shrink-0 h-full bg-[var(--ec-brdCol)]" />
        <div className="w-1/2 h-full">
          <iframe className="bg-white border-none w-full h-full" src={previewSrc} />
        </div>
      </div>
    </div>
  );
}

function useSimpleEditor() {
  const runtime = useLessonRuntime();
  const [terminal, setTerminal] = useState<XTerm | null>(null);
  const [selectedFile, setSelectedFile] = useState('/src/index.js');
  const [documents, setDocuments] = useState<Record<string, EditorDocument>>(FILES);
  const [previewSrc, setPreviewSrc] = useState<string>('');

  const document = documents[selectedFile];

  async function onChange({ content }: EditorUpdate) {
    setDocuments((prevDocuments) => ({
      ...prevDocuments,
      [selectedFile]: {
        ...prevDocuments[selectedFile],
        value: content,
      },
    }));

    await runtime.writeFile(selectedFile, content);
  }

  function onScroll(scroll: ScrollPosition) {
    setDocuments((prevDocuments) => ({
      ...prevDocuments,
      [selectedFile]: {
        ...prevDocuments[selectedFile],
        scroll,
      },
    }));
  }

  useEffect(() => {
    (async () => {
      runtime.onServer(({ port }) => {
        void runtime.previewUrl(port).then(setPreviewSrc);
      });

      await runtime.mount(Object.fromEntries(Object.entries(FILES).map(([path, file]) => [path, file.value])));
    })();
  }, []);

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

      void process.write('npm install && npm start\n');
    }
  }, [terminal]);

  return {
    setTerminal,
    previewSrc,
    selectedFile,
    setSelectedFile,
    onChange,
    onScroll,
    document,
    files: FILE_PATHS,
  };
}

const FILES: Record<string, EditorDocument> = {
  '/src/index.js': {
    filePath: '/src/index.js',
    loading: false,
    value: stripIndent(`
      document.body.innerHTML = '<h1>Hello, world!</h1>';
    `),
  },
  '/src/index.html': {
    filePath: '/src/index.html',
    loading: false,
    value: stripIndent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hello, world!</title>
      </head>
      <body>
        <script src="./index.js"></script>
      </body>
      </html>
    `),
  },
  '/src/assets/logo.svg': {
    filePath: '/src/assets/logo.svg',
    loading: false,
    value: stripIndent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <rect width="24" height="24" rx="15" />
      </svg>
    `),
  },
  '/package.json': {
    filePath: '/package.json',
    loading: false,
    value: stripIndent(`
      {
        "name": "hello-world",
        "version": "1.0.0",
        "description": "Hello, world!",
        "main": "index.js",
        "scripts": {
          "start": "servor src/ --reload"
        },
        "dependencies": {
          "servor": "4.0.2"
        }
      }
    `),
  },
};

const FILE_PATHS = Object.keys(FILES).map((path) => ({ path, type: 'file' }) as const);

function stripIndent(string: string) {
  const indent = minIndent(string.slice(1));

  if (indent === 0) {
    return string;
  }

  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm');

  return string.replace(regex, '').trim();
}

function minIndent(string: string) {
  const match = string.match(/^[ \t]*(?=\S)/gm);

  if (!match) {
    return 0;
  }

  return match.reduce((acc, curr) => Math.min(acc, curr.length), Infinity);
}
