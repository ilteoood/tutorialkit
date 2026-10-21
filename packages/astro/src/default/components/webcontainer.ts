import { safeBoot, TutorialStore } from '@tutorialkit/runtime';
import { joinPaths } from '../utils/url.js';

type Nodepod = Awaited<ReturnType<typeof safeBoot>>;

interface RuntimeContext {
  readonly useAuth: boolean;
  loggedIn: () => Promise<void>;
  loaded: boolean;
}

/**
 * The promise resolves to a booted Nodepod instance. The historical name
 * `webcontainer` is kept so existing tutorials that import
 * `tutorialkit:core` continue to compile.
 */
export let webcontainer: Promise<Nodepod> = new Promise(() => {
  // noop for ssr
});

const noopContext: RuntimeContext = {
  useAuth: false,
  async loggedIn() {
    return Promise.resolve();
  },
  loaded: false,
};

interface RuntimeStorePair {
  readonly tutorialStore: TutorialStore;
  readonly webcontainerContext: RuntimeContext;
}

function createRuntime(): RuntimeStorePair {
  let store: TutorialStore | undefined;
  let context: RuntimeContext | undefined;

  return {
    get tutorialStore() {
      if (!store) {
        store = new TutorialStore({
          // SAFETY: runtime's StoreOptions key is `nodepod`. We aliased the
          // symbol name to `webcontainer` for back-compat with tutorialkit:core.
          nodepod: webcontainer,
          basePathname: joinPaths(import.meta.env.BASE_URL, '/'),
        });
      }
      return store;
    },
    get webcontainerContext() {
      if (!context) {
        context = { ...noopContext };
      }
      return context;
    },
  };
}

const created = createRuntime();

export const tutorialStore = created.tutorialStore;
export const webcontainerContext: RuntimeContext = created.webcontainerContext;

/**
 * Auth was tied to StackBlitz's enterprise WebContainer offering. Nodepod
 * does not have an auth flow, so this is now a no-op kept for API stability.
 */
export async function login() {
  return Promise.resolve();
}

/**
 * Auth was tied to StackBlitz's enterprise WebContainer offering. Nodepod
 * does not have an auth flow, so this is now a no-op kept for API stability.
 */
export function logout() {
  // intentional no-op
}

if (!import.meta.env.SSR) {
  webcontainer = Promise.resolve(null).then(() => safeBoot({ workdirName: 'tutorial' }));

  webcontainer.then(() => {
    webcontainerContext.loaded = true;
  });
}
