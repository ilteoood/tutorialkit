import { LessonRuntime } from '@tutorialkit/runtime';

const pageUrl = import.meta.env.SSR ? 'http://localhost/' : location.href;

export const lessonRuntime = new LessonRuntime({
  runtimeUrl: new URL('/ov/runtime/', pageUrl).href,
  previewUrl: new URL('/ov/preview/', pageUrl).href,
});
