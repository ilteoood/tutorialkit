import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { areFilesEqual, diffFiles, writeFilesToPod } from './files.js';

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

describe('writeFilesToPod', () => {
  it('creates directories recursively then writes all files', async () => {
    const mkdir = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);

    await writeFilesToPod({ fs: { mkdir, writeFile } } as never, {
      '/a.js': 'a content',
      '/b.md': 'b content',
      '/dir/c.js': 'c content',
      '/dir/sub/d.js': 'd content',
    });

    expect(mkdir).toHaveBeenCalledWith('/dir', { recursive: true });
    expect(mkdir).toHaveBeenCalledWith(path.join('/dir', 'sub'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('/a.js', 'a content');
    expect(writeFile).toHaveBeenCalledWith('/b.md', 'b content');
    expect(writeFile).toHaveBeenCalledWith('/dir/c.js', 'c content');
    expect(writeFile).toHaveBeenCalledWith('/dir/sub/d.js', 'd content');
  });

  it('skips directory creation when no nested files exist', async () => {
    const mkdir = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);

    await writeFilesToPod({ fs: { mkdir, writeFile } } as never, { '/a.js': 'a content' });

    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith('/a.js', 'a content');
  });
});
