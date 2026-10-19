/* eslint-disable @blitz/lines-around-comment */

declare module 'tutorialkit:store' {
  const tutorialStore: import('@tutorialkit/runtime').TutorialStore;

  export default tutorialStore;
}

declare module 'tutorialkit:core' {
  /** Promise that resolves to the runtime pod exposed in the current lesson. */
  export const pod: Promise<import('@tutorialkit/runtime').Nodepod>;
}

declare module 'tutorialkit:override-components' {
  const topBar: typeof import('./src/default/components/TopBar.astro').default;
  const headTags: typeof import('./src/default/components/HeadTags.astro').default;
  const dialog: typeof import('@tutorialkit/react/dialog').default;

  export { topBar as TopBar, dialog as Dialog, headTags as HeadTags };
}
