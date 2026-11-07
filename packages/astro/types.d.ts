/* eslint-disable @blitz/lines-around-comment */

declare module 'tutorialkit:store' {
  const tutorialStore: import('@tutorialkit/runtime').TutorialStore;

  export default tutorialStore;
}

declare module 'tutorialkit:core' {
  /** The lesson runtime of the current page. */
  export const runtime: import('@tutorialkit/runtime').LessonRuntime;
}
