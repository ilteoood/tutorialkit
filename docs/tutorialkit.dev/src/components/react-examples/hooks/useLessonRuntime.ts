import { LessonRuntime } from '@tutorialkit/runtime';

let lessonRuntime: LessonRuntime | undefined;

export function useLessonRuntime(): LessonRuntime {
  lessonRuntime ??= new LessonRuntime({
    runtimeUrl: new URL('/ov/runtime/', location.href).href,
    previewUrl: new URL('/ov/preview/', location.href).href,
    network: { mode: 'allowlist', presets: ['npm', 'fonts', 'icons', 'cdn'] },
  });

  return lessonRuntime;
}
