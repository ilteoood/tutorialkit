import { describe, it, expect } from 'vitest';
import { areFilesEqual, diffFiles } from './files.js';

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
