import type { TerminalSchema } from '@tutorialkit/types';
import type { Nodepod } from '@r1ck404/nodepod';
import { atom } from 'nanostores';
import { tick } from '../utils/promises.js';
import { isWebContainerSupported } from '../utils/support.js';
import { clearTerminal, escapeCodes, type ITerminal } from '../utils/terminal.js';
import { newJSHProcess } from '../webcontainer/shell.js';
import {
  TerminalConfig,
  TerminalPanel,
  type RuntimeProcess,
  asRuntimeProcess,
} from '../webcontainer/terminal-config.js';

// Re-export so neighbouring store modules (e.g. tutorial-runner) can name
// the runtime process type without reaching into the webcontainer folder.
export type { RuntimeProcess };

export class TerminalStore {
  terminalConfig = atom<TerminalConfig>(new TerminalConfig());

  private _output: ITerminal | undefined = undefined;

  constructor(private _nodepod: Promise<Nodepod>) {
    this._nodepod.then(() => undefined);
  }

  getOutputPanel(): ITerminal | undefined {
    return this._output;
  }

  hasTerminalPanel() {
    return this.terminalConfig.get().panels.length > 0;
  }

  setTerminalConfiguration(config?: TerminalSchema) {
    const oldTerminalConfig = this.terminalConfig.get();
    const newTerminalConfig = new TerminalConfig(config);

    // iterate over the old terminal config and make a list of all terminal panels
    const panelMap = new Map<string, TerminalPanel>(oldTerminalConfig.panels.map((panel) => [panel.id, panel]));

    // iterate over the new terminal panels and try to re-use the old terminal with the new panel
    for (const panel of newTerminalConfig.panels) {
      const oldPanel = panelMap.get(panel.id);

      panelMap.delete(panel.id);

      if (oldPanel?.terminal) {
        // re-use the previous terminal handle (the same xterm.js instance)
        panel.attachTerminal(oldPanel.terminal);
      }

      if (panel.type === 'output') {
        this._output = panel;
      }

      if (panel.type === 'terminal' && !oldPanel) {
        // first-time terminal panel: spawn an interactive shell
        this._bootNodepod(panel)
          .then(async (nodepod) => {
            const process = await newJSHProcess(nodepod, panel);
            panel.attachProcess(asRuntimeProcess(process));
          })
          .catch(() => {
            // The boot screen will surface the underlying error to the user;
            // we just need to make sure this promise is observed.
          });
      }
    }

    // kill all old processes which we couldn't re-use
    for (const panel of panelMap.values()) {
      panel.process?.kill();
    }

    this.terminalConfig.set(newTerminalConfig);
  }

  /**
   * Attaches the provided terminal with the panel matching the provided ID.
   */
  async attachTerminal(id: string, terminal: ITerminal) {
    const panel = this.terminalConfig.get().panels.find((panel) => panel.id === id);

    if (!panel) {
      return;
    }

    panel.attachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    // Nodepod processes don't expose a TTY resize through the public API.
    // Each terminal panel forwards this to its own process in its `resize()`.
    for (const panel of this.terminalConfig.get().panels) {
      panel.resize({ cols, rows });
    }
  }

  private async _bootNodepod(terminal: ITerminal) {
    validateWebContainerSupported(terminal);

    terminal.write('Booting Nodepod...');

    try {
      const nodepod = await this._nodepod;

      clearTerminal(terminal);

      return nodepod;
    } catch (error) {
      clearTerminal(terminal);

      await tick();

      terminal.write(
        [
          escapeCodes.red(`Looks like your browser's configuration is blocking Nodepod's worker runtime.`),
          '',
          `Nodepod needs cross-origin isolation (COOP/COEP) and a WebAssembly-capable browser.`,
          '',
          'Read more at:',
          'https://r1ck404.github.io/Nodepod/docs/troubleshooting/',
          '',
        ].join('\n'),
      );

      throw error;
    }
  }
}

function validateWebContainerSupported(terminal: ITerminal) {
  if (!isWebContainerSupported()) {
    terminal.write(
      [
        escapeCodes.red('Incompatible Web Browser'),
        '',
        `Nodepod currently works in Chromium-based browsers, Firefox, and Safari 16.4+. We're hoping to add support for more browsers as they implement the necessary Web Platform features.`,
        '',
        'Read more about browser support:',
        'https://r1ck404.github.io/Nodepod/docs/troubleshooting/',
        '',
      ].join('\n'),
    );

    throw new Error('Incompatible Web Browser');
  }
}
