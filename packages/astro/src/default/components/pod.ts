import { safeBoot, TutorialStore, type Nodepod } from '@tutorialkit/runtime';
import { joinPaths } from '../utils/url.js';

export let pod: Promise<Nodepod> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  pod = safeBoot({ workdir: 'tutorial' });

  pod.then(() => {
    podContext.loaded = true;
  });
}

export const tutorialStore = new TutorialStore({
  pod,
  basePathname: joinPaths(import.meta.env.BASE_URL, '/'),
});

interface PodContext {
  loaded: boolean;
}

export const podContext: PodContext = {
  loaded: false,
};
