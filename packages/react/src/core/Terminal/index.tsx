import type { TutorialStore } from '@tutorialkit/runtime';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentProps } from 'react';
import { getTerminalTheme } from './theme.js';

export interface TerminalRef {
  reloadStyles: () => void;
}

export interface TerminalProps extends ComponentProps<'div'> {
  panelId: string;
  tutorialStore: TutorialStore;
  theme: 'dark' | 'light';
  readonly?: boolean;
}

export const Terminal = forwardRef<TerminalRef, TerminalProps>(
  ({ panelId, tutorialStore, theme, readonly = true, ...props }, ref) => {
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const element = divRef.current;

      if (!element) {
        return;
      }

      let cancelled = false;

      void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/addon-web-links')]).then(
        ([{ Terminal: xtermClass }, { FitAddon: fitAddonClass }, { WebLinksAddon: webLinksAddonClass }]) => {
          if (cancelled) {
            return;
          }

          tutorialStore.attachTerminal(panelId, element, {
            Terminal: xtermClass,
            FitAddon: fitAddonClass,
            WebglAddon: webLinksAddonClass,
            theme: getTerminalTheme(readonly ? { cursor: '#00000000' } : {}),
            fontSize: 13,
            fontFamily: 'Menlo, courier-new, courier, monospace',
          });
        },
      );

      return () => {
        cancelled = true;
      };
    }, [panelId, tutorialStore, theme, readonly]);

    useImperativeHandle(
      ref,
      () => ({
        reloadStyles: () => undefined,
      }),
      [],
    );

    return <div {...props} ref={divRef} />;
  },
);

Terminal.displayName = 'Terminal';
export default Terminal;
