import { describe, it, expect } from 'vitest';
import { areFilesEqual, diffFiles, fromRuntimePath, readFileText, readdir, remove, toRuntimePath, writeFiles } from './files.js';

describe('areFilesEqual', () => {
  it('should return true if files are equal', () => {
    const a = { 'a.txt': 'content' };
    const b = { 'a.txt': 'content' };

    expect(areFilesEqual(a, b)).toBe(true);
  });

  it('should return false if files are not equal', () => {
    const a = { 'a.txt': 'content' };
    const b = { 'a.txt': 'different content' };

    expect(areFilesEqual(a, b)).toBe(false);
  });

  it('should return false if files have different keys', () => {
    const a = { 'a.txt': 'content' };
    const b = { 'b.txt': 'content' };

    expect(areFilesEqual(a, b)).toBe(false);
  });

  it('should return false if files have different number of keys', () => {
    const a = { 'a.txt': 'content' };
    const b = { 'a.txt': 'content', 'b.txt': 'content' };

    expect(areFilesEqual(a, b)).toBe(false);
  });
});

describe('diffFiles', () => {
  it('should return added files', () => {
    const before = { 'a.txt': 'content' };
    const after = { 'a.txt': 'content', 'b.txt': 'content' };

    const diff = diffFiles(before, after);

    expect(diff.addedOrModified).toEqual({ 'b.txt': 'content' });
  });

  it('should return modified files', () => {
    const before = { 'a.txt': 'content' };
    const after = { 'a.txt': 'different content' };

    const diff = diffFiles(before, after);

    expect(diff.addedOrModified).toEqual({ 'a.txt': 'different content' });
  });

  it('should return removed files', () => {
    const before = { 'a.txt': 'content' };
    const after = {};

    const diff = diffFiles(before, after);

    expect(diff.removed).toEqual(['a.txt']);
  });

  it('should return added, modified and removed files', () => {
    const before = { 'a.txt': 'content', 'b.txt': 'content' };
    const after = { 'a.txt': 'different content', 'c.txt': 'content' };

    const diff = diffFiles(before, after);

    expect(diff.addedOrModified).toEqual({ 'a.txt': 'different content', 'c.txt': 'content' });
    expect(diff.removed).toEqual(['b.txt']);
  });
});

describe('path translation', () => {
  it('prefixes editor paths with the workdir', () => {
    expect(toRuntimePath('/a.js')).toBe('/home/tutorial/a.js');
    expect(toRuntimePath('/src/index.js')).toBe('/home/tutorial/src/index.js');
  });

  it('passes through paths that are already inside the workdir', () => {
    expect(toRuntimePath('/home/tutorial/a.js')).toBe('/home/tutorial/a.js');
  });

  it('strips the workdir prefix on the way back out', () => {
    expect(fromRuntimePath('/home/tutorial/a.js')).toBe('/a.js');
    expect(fromRuntimePath('/home/tutorial/src/index.js')).toBe('/src/index.js');
  });

  it('collapses to root when given the workdir itself', () => {
    expect(fromRuntimePath('/home/tutorial')).toBe('/');
    expect(fromRuntimePath('/home/tutorial/')).toBe('/');
  });
});

describe('writeFiles', () => {
  it('writes each file through the supplied fs with the workdir prefix', async () => {
    const calls: Array<{ path: string; contents: string }> = [];
    const fakeFs = {
      async writeFile(path: string, contents: string) {
        calls.push({ path, contents });
      },
    };

    await writeFiles(fakeFs as never, {
      '/a.js': 'a content',
      '/src/index.js': 'index content',
    });

    expect(calls).toEqual([
      { path: '/home/tutorial/a.js', contents: 'a content' },
      { path: '/home/tutorial/src/index.js', contents: 'index content' },
    ]);
  });
});

describe('readFileText', () => {
  it('reads a file with the workdir prefix', async () => {
    const fakeFs = {
      async readFile(path: string, _encoding: 'utf-8') {
        return `hello:${path}`;
      },
    };

    const content = await readFileText(fakeFs as never, '/src/x.js');

    expect(content).toBe('hello:/home/tutorial/src/x.js');
  });
});

describe('readdir', () => {
  it('lists the workdir-prefixed path', async () => {
    const fakeFs = {
      async readdir(path: string) {
        return [path];
      },
    };

    const result = await readdir(fakeFs as never, '/src');

    expect(result).toEqual(['/home/tutorial/src']);
  });
});

describe('remove', () => {
  it('removes the workdir-prefixed path with force', async () => {
    const seen: Array<{ path: string; opts: { force: true } }> = [];
    const fakeFs = {
      async rm(path: string, opts: { force: true }) {
        seen.push({ path, opts });
      },
    };

    await remove(fakeFs as never, '/old.js');

    expect(seen).toEqual([{ path: '/home/tutorial/old.js', opts: { force: true } }]);
  });
});
