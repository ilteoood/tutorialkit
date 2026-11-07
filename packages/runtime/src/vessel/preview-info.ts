import type { PreviewSchema } from '@tutorialkit/types';

export class PreviewInfo {
  title?: string;
  pathname?: string;

  /**
   * The URL the preview is served from. Only set once its server is up.
   */
  url?: string;

  constructor(preview: Preview) {
    this.title = preview.title;
    this.pathname = preview.pathname;
    this.port = preview.port;
  }

  readonly port: number;

  get ready() {
    return this.url !== undefined;
  }

  static parse(preview: Exclude<PreviewSchema, boolean>[0]): Preview {
    if (typeof preview === 'number') {
      return {
        port: preview,
      };
    } else if (typeof preview === 'string') {
      const [port, ...rest] = preview.split('/');
      return {
        port: parseInt(port),
        pathname: rest.join('/'),
      };
    } else if (Array.isArray(preview)) {
      return {
        port: preview[0],
        title: preview[1],
        pathname: preview[2],
      };
    } else {
      return preview;
    }
  }

  static equals(a: PreviewInfo, b: PreviewInfo) {
    return a.port === b.port && a.pathname === b.pathname && a.title === b.title;
  }
}

interface Preview {
  port: number;
  pathname?: string;
  title?: string;
}
