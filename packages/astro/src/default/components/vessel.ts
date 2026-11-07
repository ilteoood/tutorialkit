import { LessonRuntime, TutorialStore } from '@tutorialkit/runtime';
import { joinPaths } from '../utils/url.js';

const pageUrl = new URL(import.meta.env.BASE_URL, import.meta.env.SSR ? 'http://localhost' : document.baseURI);

export const runtime = new LessonRuntime({
  runtimeUrl: new URL('ov/runtime/', pageUrl).href,
  previewUrl: new URL('ov/preview/', pageUrl).href,
  network: __TK_NETWORK,
});

export const tutorialStore = new TutorialStore({
  runtime,
  basePathname: joinPaths(import.meta.env.BASE_URL, '/'),
});
