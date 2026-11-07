# @tutorialkit/runtime

A wrapper around the **[OpenVessel runtime][openvessel]** focused on providing the right abstractions to let you focus on building highly interactive tutorials.

The runtime exposes the following:

- `LessonRuntime`: The lesson runtime, mounted from your own origin, with the filesystem, process and preview APIs a lesson needs.
- `TutorialStore`: A store to manage your tutorial content in the lesson runtime and in your components.

Only a single instance of `TutorialStore` should be created in your application and its lifetime is bound by the lifetime of the `LessonRuntime`.

## Browser support

The lesson runtime needs a browser that exposes `SharedArrayBuffer` inside a cross-origin isolated page: current Chromium and Firefox. Safari is not supported, and the terminal says so instead of staying blank.

## License

MIT

Copyright (c) 2024–present [StackBlitz][stackblitz]

[stackblitz]: https://stackblitz.com/
[openvessel]: https://github.com/kobesoft-labs/openvessel
