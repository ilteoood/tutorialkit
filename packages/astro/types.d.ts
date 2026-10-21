/* eslint-disable @blitz/lines-around-comment */

declare module 'tutorialkit:store' {
  const tutorialStore: import('@tutorialkit/runtime').TutorialStore;

  export default tutorialStore;
}

declare module 'tutorialkit:core' {
  type Nodepod = Awaited<ReturnType<typeof import('@tutorialkit/runtime').safeBoot>>;

  /**
   * Promise that resolves to the runtime container that's running in the
   * current lesson. The symbol is still named `webcontainer` for backwards
   * compatibility with tutorials written against the old API.
   */
  export const webcontainer: Promise<Nodepod>;
}
