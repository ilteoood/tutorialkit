# TutorialKit

TutorialKit turns a tutorial into a live lesson: the reader edits files in the browser, runs them in a Node runtime, and watches the result in a preview.

## Language

**Vessel**:
One OpenVessel instance — the sandboxed Node runtime of a single lesson.
_Avoid_: sandbox, container

**Lesson runtime**:
The TutorialKit-owned API a lesson author uses to drive the vessel, and what `tutorialkit:core` exports.
_Avoid_: webcontainer, raw vessel

**Runtime**:
The TutorialKit runtime (`@tutorialkit/runtime`), the framework package that owns the browser-side Node runtime.
_Avoid_: lesson runtime

**Runtime bundle**:
OpenVessel's served assets (`dist/runtime/`), the payload the runtime origin serves.
_Avoid_: runtime assets

**Lesson root**:
The root of a lesson's filesystem: author-written paths resolve against it, mounted files land in it, and spawned processes run in it.
_Avoid_: workdir, cwd, app directory
