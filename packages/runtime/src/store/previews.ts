import type { Nodepod } from '@r1ck404/nodepod';
import type { PreviewSchema } from '@tutorialkit/types';
import { atom } from 'nanostores';
import { PortInfo } from '../webcontainer/port-info.js';
import { PreviewInfo } from '../webcontainer/preview-info.js';

type ServerReadyListener = (port: number, url: string) => void;

export class PreviewsStore {
  private _availablePreviews = new Map<number, PortInfo>();
  private _previewsLayout: PreviewInfo[] = [];

  previews = atom<PreviewInfo[]>([]);

  constructor(podPromise: Promise<Nodepod>) {
    this._subscribe(podPromise);
  }

  private async _subscribe(podPromise: Promise<Nodepod>) {
    const pod = await podPromise;

    const listener: ServerReadyListener = (port, url) => {
      let portInfo = this._availablePreviews.get(port);

      if (!portInfo) {
        portInfo = new PortInfo(port, url, true);

        this._availablePreviews.set(port, portInfo);
      }

      portInfo.ready = true;
      portInfo.origin = url;

      if (this._previewsLayout.length === 0) {
        const previewInfo = new PreviewInfo({}, portInfo);

        this._previewsLayout = [previewInfo];
        this.previews.set(this._previewsLayout);

        return;
      }

      this._previewsLayout = this._previewsLayout.map((preview) => {
        if (preview.port !== port) {
          return preview;
        }

        return new PreviewInfo({ title: preview.title, pathname: preview.pathname }, portInfo!);
      });
      this.previews.set(this._previewsLayout);
    };

    pod.proxy.on('server-ready', listener);
  }

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

    if (previews.length === 0) {
      const firstPreview = this._availablePreviews.values().next().value as PreviewInfo | undefined;

      this.previews.set(firstPreview ? [firstPreview] : []);
    } else {
      this.previews.set(this._previewsLayout);
    }
  }
}
