import type { Nodepod } from '@r1ck404/nodepod';
import type { Files } from '@tutorialkit/types';

export function areFilesEqual(a: Files, b: Files) {
  const aFilePaths = Object.keys(a);
  const bFilePaths = Object.keys(b);

  if (aFilePaths.length !== bFilePaths.length) {
    return false;
  }

  aFilePaths.sort();
  bFilePaths.sort();

  for (let i = 0; i < aFilePaths.length; ++i) {
    const filePath = aFilePaths[i];

    if (bFilePaths[i] !== filePath) {
      return false;
    }

    if (a[filePath] !== b[filePath]) {
      return false;
    }
  }

  return true;
}

interface FilesDiff {
  addedOrModified: Files;
  removed: string[];
}

export function diffFiles(before: Files, after: Files): FilesDiff {
  const addedOrModified: Files = {};
  const removed: string[] = [];

  for (const filePath in before) {
    const beforeFile = before[filePath];
    const afterFile = after[filePath];

    if (typeof afterFile == 'undefined') {
      removed.push(filePath);
    } else if (beforeFile !== afterFile) {
      addedOrModified[filePath] = afterFile;
    }
  }

  for (const filePath in after) {
    if (!(filePath in before)) {
      addedOrModified[filePath] = after[filePath];
    }
  }

  return {
    addedOrModified,
    removed,
  };
}

export async function writeFilesToPod(pod: Nodepod, files: Files): Promise<void> {
  const directories = new Set<string>();

  for (const filePath of Object.keys(files)) {
    const segments = filePath.split('/').filter(Boolean);
    let parent = '';

    for (let i = 0; i < segments.length - 1; i++) {
      parent += `/${segments[i]}`;
      directories.add(parent);
    }
  }

  await Promise.all([...directories].map((dir) => pod.fs.mkdir(dir, { recursive: true })));

  await Promise.all(Object.entries(files).map(([filePath, content]) => pod.fs.writeFile(filePath, content)));
}
