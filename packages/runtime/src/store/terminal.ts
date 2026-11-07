import type { TerminalSchema } from '@tutorialkit/types';
import { atom } from 'nanostores';
import { tick } from '../utils/promises.js';
import { browserSupportIssue } from '../utils/support.js';
import { clearTerminal, escapeCodes, type ITerminal } from '../utils/terminal.js';
import type { LessonRuntime } from '../vessel/lesson-runtime.js';
import { newShellProcess } from '../vessel/shell.js';
import { TerminalConfig, TerminalPanel } from '../vessel/terminal-config.js';

export class TerminalStore {
  terminalConfig = atom<TerminalConfig>(new TerminalConfig());

  private _output: ITerminal | undefined = undefined;

  constructor(private _runtime: LessonRuntime) {}

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
        // if we found a previous panel with the same id, attach that terminal to the new panel
        panel.attachTerminal(oldPanel.terminal);
      }

      if (panel.type === 'output') {
        this._output = panel;
      }

      if (panel.type === 'terminal' && !oldPanel) {
        // if the panel is a terminal panel, and this panel didn't exist before, spawn a new shell
        this._bootRuntime(panel)
          .then(async () => panel.attachProcess(await newShellProcess(this._runtime, panel)))
          .catch(() => {
            // do nothing
          });
      }
    }

    // kill all old processes which we couldn't re-use
    for (const panel of panelMap.values()) {
      void panel.process?.kill();
    }

    this.terminalConfig.set(newTerminalConfig);
  }

  /**
   * Attaches the provided terminal with the panel matching the provided ID.
   *
   * @param id The ID of the panel to attach the terminal with.
   * @param terminal The terminal to hook up to the shell.
   */
  async attachTerminal(id: string, terminal: ITerminal) {
    const panel = this.terminalConfig.get().panels.find((panel) => panel.id === id);

    if (!panel) {
      // if we don't have a panel with the provided id, just exit
      return;
    }

    panel.attachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    // iterate over all terminal panels and resize all processes
    for (const panel of this.terminalConfig.get().panels) {
      void panel.process?.resize(cols, rows);
    }
  }

  private async _bootRuntime(terminal: ITerminal) {
    const issue = browserSupportIssue();

    if (issue) {
      terminal.write([escapeCodes.red('Incompatible Web Browser'), '', issue, ''].join('\n'));

      throw new Error(issue);
    }

    const isBooted = this._runtime.bootStatus.get() === 'booted';

    if (!isBooted) {
      terminal.write('Booting the runtime...');
    }

    try {
      await this._runtime.ready;

      if (!isBooted) {
        clearTerminal(terminal);
      }
    } catch (error) {
      clearTerminal(terminal);

      await tick();

      terminal.write(
        [
          escapeCodes.red(`Looks like your browser's configuration is blocking the runtime.`),
          '',
          `Let's troubleshoot this!`,
          '',
          'Read more at:',
          'https://github.com/kobesoft-labs/openvessel#readme',
          '',
        ].join('\n'),
      );

      throw error;
    }
  }
}
