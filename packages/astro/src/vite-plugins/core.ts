/**
 * A plugin that lets users write components that can access the internals
 * of TutorialKit.
 *
 * The virtual module can be imported as:
 *
 * ```ts
 * import { pod } from 'tutorialkit:core';
 *
 * export const MyComponent = () => {
 *   useEffect(() => {
 *     (async () => {
 *       const podInstance = await pod;
 *       await podInstance.fs.writeFile('foo.js', 'console.log("hello world")');
 *     })();
 *   }, []);
 *
 *   return null;
 * };
 * ```
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VitePlugin } from '../types.js';
import { normalizeImportPath } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const virtualModuleId = 'tutorialkit:core';
const resolvedVirtualModuleId = `${virtualModuleId}`;

export const tutorialkitCore: VitePlugin = {
  name: 'tutorialkit-core-virtual-mod-plugin',
  resolveId(id) {
    if (id === virtualModuleId) {
      return resolvedVirtualModuleId;
    }

    return undefined;
  },
  async load(id) {
    if (id === resolvedVirtualModuleId) {
      const pathToInit = normalizeImportPath(path.join(__dirname, 'default/components/pod.ts'));

      return `
        export { pod } from '${pathToInit}';
      `;
    }

    return undefined;
  },
};
