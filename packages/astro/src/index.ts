import { fileURLToPath } from 'node:url';
import type { AstroConfig, AstroIntegration } from 'astro';
import type { ExpressiveCodePlugin, ThemeObjectOrShikiThemeName } from 'astro-expressive-code';
import { extraIntegrations } from './integrations.js';
import { updateMarkdownConfig } from './remark/index.js';
import { tutorialkitCore } from './vite-plugins/core.js';
import { userlandCSS, watchUserlandCSS } from './vite-plugins/css.js';
import { overrideComponents, type OverrideComponentsOptions } from './vite-plugins/override-components.js';
import { tutorialkitStore } from './vite-plugins/store.js';
import { WebContainerFiles } from './webcontainer-files/index.js';

export interface Options {
  /**
   * Whether or not default routes are injected.
   *
   * Set this to false to customize the pages.
   *
   * Use 'tutorial-only' to only inject the tutorial routes. This is useful
   * if you want to have a different landing page.
   *
   * @default true
   */
  defaultRoutes?: boolean | 'tutorial-only';

  /**
   * Override components of TutorialKit.
   */
  components?: OverrideComponentsOptions;

  /**
   * The value of the Cross-Origin-Embedder-Policy header for the dev server.
   * This is required for Nodepod's service worker and SharedArrayBuffer.
   *
   * Using credentialless lets you embed images from third party more easily.
   * However only Firefox and Chrome supports credentialless.
   *
   * @see https://r1ck404.github.io/Nodepod/docs/concepts/security/
   *
   * @default 'require-corp'
   */
  isolation?: 'require-corp' | 'credentialless';

  /**
   * Expressive code plugins.
   *
   * @default []
   */
  expressiveCodePlugins?: ExpressiveCodePlugin[];

  /**
   * Themes for expressive code.
   * Make sure to provide a light and a dark theme if you want support for both light and dark modes.
   * Default values are ['light-plus', 'dark-plus']
   *
   * @default ['light-plus', 'dark-plus']
   */
  expressiveCodeThemes?: [ThemeObjectOrShikiThemeName, ThemeObjectOrShikiThemeName];
}

export default function createPlugin({
  defaultRoutes = true,
  components,
  isolation,
  expressiveCodePlugins = [],
  expressiveCodeThemes,
}: Options = {}): AstroIntegration {
  const webcontainerFiles = new WebContainerFiles();

  let _config: AstroConfig;

  return {
    name: '@tutorialkit/astro',
    hooks: {
      async 'astro:config:setup'(options) {
        const { injectRoute, updateConfig, config } = options;

        updateConfig({
          server: {
            headers: {
              'Cross-Origin-Embedder-Policy': isolation ?? 'require-corp',
              'Cross-Origin-Opener-Policy': 'same-origin',
            },
          },
          vite: {
            optimizeDeps: {
              entries: ['!**/src/(content|templates)/**'],
              include: process.env.TUTORIALKIT_DEV
                ? []
                : [
                    '@tutorialkit/react',

// Nothing else needs pre-bundling now; picomatch is a
// runtime-only dep and gets resolved lazily, while
// everything heavier (nodepod, jszip) is hoisted.
                  ],
            },
            ssr: {
              noExternal: ['@tutorialkit/astro', '@tutorialkit/react'],
            },
            plugins: [
              userlandCSS,
              tutorialkitStore,
              tutorialkitCore,
              overrideComponents({ components, defaultRoutes: !!defaultRoutes }),
              process.env.TUTORIALKIT_VITE_INSPECT ? (await import('vite-plugin-inspect')).default() : null,
            ],
          },
        });

        updateMarkdownConfig(options);

        if (defaultRoutes) {
          if (defaultRoutes !== 'tutorial-only') {
            injectRoute({
              pattern: '/',
              entrypoint: '@tutorialkit/astro/default/pages/index.astro',
              prerender: true,
            });
          }

          injectRoute({
            pattern: '[...slug]',
            entrypoint: '@tutorialkit/astro/default/pages/[...slug].astro',
            prerender: true,
          });
        }

        // inject the additional integrations right after ours
        const selfIndex = config.integrations.findIndex((integration) => integration.name === '@tutorialkit/astro');
        config.integrations.splice(
          selfIndex + 1,
          0,
          ...extraIntegrations({ root: fileURLToPath(config.root), expressiveCodePlugins, expressiveCodeThemes }),
        );
      },
      'astro:config:done'({ config }) {
        _config = config;
      },
      async 'astro:server:setup'(options) {
        if (!_config) {
          return;
        }

        const { server, logger } = options;
        const projectRoot = fileURLToPath(_config.root);

        await webcontainerFiles.serverSetup(projectRoot, options);

        watchUserlandCSS(server, logger);
      },
      async 'astro:server:done'() {
        await webcontainerFiles.serverDone();
      },
      async 'astro:build:done'(astroBuildDoneOptions) {
        const projectRoot = fileURLToPath(_config.root);

        await webcontainerFiles.buildAssets(projectRoot, astroBuildDoneOptions);
      },
    },
  };
}
