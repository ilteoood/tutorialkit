import type { PreviewSchema } from '@tutorialkit/types';
import { atom } from 'nanostores';
import type { LessonRuntime } from '../vessel/lesson-runtime.js';
import { PreviewInfo } from '../vessel/preview-info.js';

export class PreviewsStore {
  /**
   * Atom representing the current previews. If it's an empty array or none of
   * the previews are ready, then no preview can be shown.
   */
  previews = atom<PreviewInfo[]>([]);

  private _enabled = true;
  private _layout: PreviewInfo[] = [];
  private _readyPorts = new Set<number>();

  constructor(private _runtime: LessonRuntime) {
    this._runtime.onServer((event) => {
      if (event.type === 'open') {
        this._readyPorts.add(event.port);
      } else {
        this._readyPorts.delete(event.port);
      }

      void this._publish();
    });
  }

  /**
   * Set the expected port for the preview to show. If this is not set,
   * the port of the first server that is ready will be used.
   */
  setPreviews(config: PreviewSchema) {
    this._enabled = config !== false;
    this._layout =
      config === false || config === true || config == null
        ? []
        : config.map((preview) => new PreviewInfo(PreviewInfo.parse(preview)));

    void this._publish();
  }

  private async _publish() {
    if (!this._enabled) {
      this.previews.set([]);

      return;
    }

    const layout =
      this._layout.length > 0
        ? this._layout
        : [...this._readyPorts].slice(0, 1).map((port) => new PreviewInfo({ port }));

    this.previews.set(
      await Promise.all(
        layout.map(async (preview) => {
          const info = new PreviewInfo(preview);

          if (this._readyPorts.has(preview.port)) {
            info.url = await this._runtime.previewUrl(preview.port, preview.pathname);
          }

          return info;
        }),
      ),
    );
  }
}
