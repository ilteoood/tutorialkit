import { describe, it, expect } from 'vitest';
import { PreviewInfo } from './preview-info.js';

describe('PreviewInfo', () => {
  it('should accept a number for port', () => {
    const previewInfo = PreviewInfo.parse(3000);

    expect(previewInfo.port).toBe(3000);
    expect(previewInfo.title).toBe(undefined);
    expect(previewInfo.pathname).toBe(undefined);
  });

  it('should accept a string for port and pathname', () => {
    const previewInfo = PreviewInfo.parse('3000/some/nested/path');

    expect(previewInfo.port).toBe(3000);
    expect(previewInfo.pathname).toBe('some/nested/path');
    expect(previewInfo.title).toBe(undefined);
  });

  it('should accept a tuple of [port, title]', () => {
    const previewInfo = PreviewInfo.parse([3000, 'Local server']);

    expect(previewInfo.port).toBe(3000);
    expect(previewInfo.title).toBe('Local server');
    expect(previewInfo.pathname).toBe(undefined);
  });

  it('should accept a tuple of [port, title, pathname]', () => {
    const previewInfo = PreviewInfo.parse([3000, 'Local server', '/docs']);

    expect(previewInfo.port).toBe(3000);
    expect(previewInfo.title).toBe('Local server');
    expect(previewInfo.pathname).toBe('/docs');
  });

  it('should accept an object with { port, title }', () => {
    const previewInfo = PreviewInfo.parse({ port: 3000, title: 'Local server' });

    expect(previewInfo.port).toBe(3000);
    expect(previewInfo.title).toBe('Local server');
    expect(previewInfo.pathname).toBe(undefined);
  });

  it('should accept an object with { port, title, pathname }', () => {
    const previewInfo = PreviewInfo.parse({ port: 3000, title: 'Local server', pathname: '/docs' });

    expect(previewInfo.port).toBe(3000);
    expect(previewInfo.title).toBe('Local server');
    expect(previewInfo.pathname).toBe('/docs');
  });

  it('should not be ready until its server is up', () => {
    const previewInfo = new PreviewInfo({ port: 3000 });

    expect(previewInfo.ready).toBe(false);
    expect(previewInfo.url).toBe(undefined);
  });

  it('should be ready once a url is set', () => {
    const previewInfo = new PreviewInfo({ port: 3000 });
    previewInfo.url = 'https://example.com';

    expect(previewInfo.ready).toBe(true);
    expect(previewInfo.url).toBe('https://example.com');
  });

  it('should keep the pathname from the parsed schema', () => {
    const previewInfo = new PreviewInfo(PreviewInfo.parse('3000/foo'));

    expect(previewInfo.pathname).toBe('foo');
  });

  it('should be equal to another preview info with the same port and title', () => {
    const a = new PreviewInfo({ port: 3000 });
    const b = new PreviewInfo({ port: 3000 });

    expect(PreviewInfo.equals(a, b)).toBe(true);
  });

  it('should not be equal to another preview info with a different port', () => {
    const a = new PreviewInfo({ port: 3000 });
    const b = new PreviewInfo({ port: 4000 });

    expect(PreviewInfo.equals(a, b)).toBe(false);
  });

  it('should not be equal to another preview info with a different title', () => {
    const a = new PreviewInfo(PreviewInfo.parse([3000, 'Local server']));
    const b = new PreviewInfo(PreviewInfo.parse([3000, 'Remote server']));

    expect(PreviewInfo.equals(a, b)).toBe(false);
  });

  it('should not be equal to another preview info with a different pathname', () => {
    const a = new PreviewInfo(PreviewInfo.parse(3000));
    const b = new PreviewInfo(PreviewInfo.parse('3000/b'));
    const c = new PreviewInfo(PreviewInfo.parse('3000/c'));

    expect(PreviewInfo.equals(a, b)).toBe(false);
    expect(PreviewInfo.equals(b, c)).toBe(false);
  });
});
