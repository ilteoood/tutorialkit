import tutorialStore from 'tutorialkit:store';
import { runtime } from 'tutorialkit:core';

interface Props {
  filePath: string;
  newContent: string;

  // default to 'store'
  access?: 'store' | 'runtime';
  testId?: string;
}

export function ButtonWriteToFile({ filePath, newContent, access = 'store', testId = 'write-to-file' }: Props) {
  async function writeFile() {
    switch (access) {
      case 'runtime': {
        const folderPath = filePath.split('/').slice(0, -1).join('/');

        if (folderPath) {
          await runtime.mkdir(folderPath, { recursive: true });
        }

        await runtime.writeFile(filePath, newContent);

        return;
      }
      case 'store': {
        tutorialStore.updateFile(filePath, newContent);
        return;
      }
    }
  }

  return (
    <button data-testid={testId} onClick={writeFile}>
      Write to File
    </button>
  );
}
