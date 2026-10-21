import type { Files } from '@tutorialkit/types';
import { fromRuntimePath, toRuntimePath } from '../path-utils.js';

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

/**
 * Write the supplied files into the Nodepod VFS, prefixing every path with
 * the pod's workdir.
 *
 * Replaces WebContainer's `mount(FileSystemTree)` call -- Nodepod doesn't
 * expose a tree-mount, so we walk the editor's flat `Files` map and write
 * each entry through `fs.writeFile`.
 */
export async function writeFiles(
  fs: { writeFile(path: string, contents: string | Uint8Array): Promise<void> },
  files: Files,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(([editorPath, contents]) => fs.writeFile(toRuntimePath(editorPath), contents as string)),
  );
}

export async function readFileText(
  fs: { readFile(path: string, encoding: 'utf-8'): Promise<string> },
  editorPath: string,
): Promise<string> {
  return fs.readFile(toRuntimePath(editorPath), 'utf-8');
}

export async function readdir(
  fs: { readdir(path: string): Promise<string[]> },
  editorPath: string,
): Promise<string[]> {
  return fs.readdir(toRuntimePath(editorPath));
}

export async function remove(
  fs: { rm(path: string, opts: { force: true }): Promise<void> },
  editorPath: string,
): Promise<void> {
  await fs.rm(toRuntimePath(editorPath), { force: true });
}

export { fromRuntimePath, toRuntimePath };
