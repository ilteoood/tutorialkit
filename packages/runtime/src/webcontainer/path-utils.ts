/**
 * Path translation between TutorialKit's editor-facing paths
 * (always rooted at `/`, e.g. `/package.json`) and Nodepod's workdir
 * (e.g. `/home/tutorial/package.json`).
 *
 * TutorialKit has always booted with `workdirName: 'tutorial'`, so we keep
 * that compatibility promise by mounting the same prefix inside Nodepod.
 */
export const WORKDIR = '/home/tutorial';

export function toRuntimePath(editorPath: string): string {
  if (editorPath.startsWith(WORKDIR)) {
    return editorPath;
  }

  if (editorPath === '/' || editorPath === '') {
    return WORKDIR;
  }

  if (editorPath.startsWith('/')) {
    return `${WORKDIR}${editorPath}`;
  }

  return `${WORKDIR}/${editorPath}`;
}

export function fromRuntimePath(runtimePath: string): string {
  if (runtimePath === WORKDIR || runtimePath === `${WORKDIR}/`) {
    return '/';
  }

  if (runtimePath.startsWith(WORKDIR)) {
    const rest = runtimePath.slice(WORKDIR.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }

  return runtimePath;
}
