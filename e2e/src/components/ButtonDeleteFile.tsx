import { runtime } from 'tutorialkit:core';

interface Props {
  filePath: string;
  newContent: string;

  // default to 'runtime'
  access?: 'store' | 'runtime';
  testId?: string;
}

export function ButtonDeleteFile({ filePath, access = 'runtime', testId = 'delete-file' }: Props) {
  async function deleteFile() {
    switch (access) {
      case 'runtime': {
        await runtime.rm(filePath);

        return;
      }
      case 'store': {
        throw new Error('Delete from store not implemented');
        return;
      }
    }
  }

  return (
    <button data-testid={testId} onClick={deleteFile}>
      Delete File
    </button>
  );
}
