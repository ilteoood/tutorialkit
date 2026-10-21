import type { PreviewSchema } from '@tutorialkit/types';
import type { Nodepod } from '@r1ck404/nodepod';
import { atom } from 'nanostores';
import { PortInfo } from '../webcontainer/port-info.js';
import { PreviewInfo } from '../webcontainer/preview-info.js';

const PREVIEW_POLL_INTERVAL_MS = 750;

export class PreviewsStore {
  private _availablePreviews = new Map<number, PortInfo>();
  private _previewsLayout: PreviewInfo[] = [];
  private _pollHandle: ReturnType<typeof setInterval> | undefined;
  private _pollIntervalMs: number = PREVIEW_POLL_INTERVAL_MS;

  /**
   * Atom representing the current previews. If it's an empty array or none of
   * the previews are ready, then no preview can be shown.
   */
  previews = atom<PreviewInfo[]>([]);

  constructor(nodepod: Promise<Nodepod>, options: { pollIntervalMs?: number } = {}) {
    this._pollIntervalMs = options.pollIntervalMs ?? PREVIEW_POLL_INTERVAL_MS;
    this._init(nodepod);
  }

  /**
   * Nodepod doesn't expose a "port ready" event the way `@webcontainer/api`
   * did, so we poll `nodepod.port(p)` for every configured port and reflect
   * whatever we find back into the previews atom.
   */
  private async _init(nodepodPromise: Promise<Nodepod>) {
    const nodepod = await nodepodPromise;

    this._pollHandle = setInterval(() => {
      this._refreshPreviews(nodepod);
    }, this._pollIntervalMs);
  }

  private _refreshPreviews(nodepod: Nodepod) {
    if (this._availablePreviews.size === 0) {
      return;
    }

    let didChange = false;

    for (const [port, portInfo] of this._availablePreviews) {
      const url = nodepod.port(port) ?? undefined;
      const wasReady = portInfo.ready;

      portInfo.origin = url;
      portInfo.ready = typeof url === 'string';

      if (wasReady !== portInfo.ready) {
        didChange = true;
      }
    }

    if (!didChange) {
      return;
    }

    if (this._previewsLayout.length === 0) {
      const first = this._availablePreviews.values().next().value as PortInfo | undefined;
      this.previews.set(first ? [new PreviewInfo({}, first)] : []);
      return;
    }

    this._previewsLayout = [...this._previewsLayout];
    this.previews.set(this._previewsLayout);
  }

  dispose() {
    if (this._pollHandle) {
      clearInterval(this._pollHandle);
      this._pollHandle = undefined;
    }
  }

  /**
   * Set the expected port for the preview to show. If this is not set,
   * the port of the first server that is ready will be used.
   */
  setPreviews(config: PreviewSchema) {
    if (config === false) {
      this.previews.set([]);

      return;
    }

    const previews = config === true ? [] : (config ?? []);

    const previewInfos = previews.map((previewConfig) => {
      const preview = PreviewInfo.parse(previewConfig);
      let portInfo = this._availablePreviews.get(preview.port);

      if (!portInfo) {
        portInfo = new PortInfo(preview.port);
        this._availablePreviews.set(preview.port, portInfo);
      }

      return new PreviewInfo(preview, portInfo);
    });

    let areDifferent = previewInfos.length != this._previewsLayout.length;

    if (!areDifferent) {
      for (let i = 0; i < previewInfos.length; i++) {
        areDifferent = !PreviewInfo.equals(previewInfos[i], this._previewsLayout[i]);

        if (areDifferent) {
          break;
        }
      }
    }

    if (!areDifferent) {
      return;
    }

    this._previewsLayout = previewInfos;

    /**
     * If a port is provided and the preview is already ready we update the previewUrl.
     * If no port is provided we default to the first preview ever to ready if there are any.
     */
    if (previews.length === 0) {
      const firstPreview = this._availablePreviews.values().next().value as PreviewInfo | undefined;

      this.previews.set(firstPreview ? [firstPreview] : []);
    } else {
      this.previews.set(this._previewsLayout);
    }
  }
}
