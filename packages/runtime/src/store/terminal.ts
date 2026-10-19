import type { Nodepod, NodepodTerminal, TerminalOptions as NodepodTerminalOptions } from '@r1ck404/nodepod';
import type { TerminalSchema } from '@tutorialkit/types';
import { atom } from 'nanostores';
import { tick } from '../utils/promises.js';
import { isPodSupported } from '../utils/support.js';
import { escapeCodes, type ITerminal } from '../utils/terminal.js';
import { TerminalConfig, TerminalPanel } from '../webcontainer/terminal-config.js';

interface TerminalWiringOptions {
  Terminal: NodepodTerminalOptions['Terminal'];
  FitAddon?: NodepodTerminalOptions['FitAddon'];
  WebglAddon?: NodepodTerminalOptions['WebglAddon'];
  SerializeAddon?: NodepodTerminalOptions['SerializeAddon'];
  theme: NonNullable<NodepodTerminalOptions['theme']>;
  fontFamily?: string;
  fontSize?: number;
}

export class TerminalStore {
  terminalConfig = atom<TerminalConfig>(new TerminalConfig());

  private _output: ITerminal | undefined = undefined;
  private _podReady = false;
  private _terminals = new Map<string, { terminal: NodepodTerminal; element: HTMLElement }>();
  private _bootElements = new Map<string, HTMLElement>();

  constructor(private _pod: Promise<Nodepod>) {
    this._pod.then(
      () => {
        this._podReady = true;
      },
      () => {
        this._podReady = true;
      },
    );
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

    const panelMap = new Map<string, TerminalPanel>(oldTerminalConfig.panels.map((panel) => [panel.id, panel]));

    for (const panel of newTerminalConfig.panels) {
      const oldPanel = panelMap.get(panel.id);

      panelMap.delete(panel.id);

      if (oldPanel?.nodeTerminal) {
        panel.attachNodeTerminal(oldPanel.nodeTerminal);
      }

      if (panel.type === 'output') {
        this._output = panel;
      }
    }

    for (const panel of panelMap.values()) {
      const held = this._terminals.get(panel.id);

      if (held) {
        held.terminal.detach();
        this._terminals.delete(panel.id);
      }

      this._bootElements.delete(panel.id);
      panel.process?.kill();
    }

    this.terminalConfig.set(newTerminalConfig);
  }

  /**
   * Wire a Nodepod-driven interactive terminal panel to a host-managed DOM
   * element. Boot status is rendered as plain text into the same element,
   * and replaced once the NodepodTerminal owns it.
   */
  async attachTerminal(id: string, element: HTMLElement, options: TerminalWiringOptions) {
    const panel = this.terminalConfig.get().panels.find((panel) => panel.id === id);

    if (!panel || panel.type !== 'terminal') {
      return;
    }

    if (!isPodSupported()) {
      this._renderBootstrapMessage(element, browserSupportMessage);
      return;
    }

    this._bootElements.set(id, element);

    if (!this._podReady) {
      this._renderBootstrapMessage(element, 'Booting runtime...');
    }

    try {
      const pod = await this._pod;

      const existing = this._terminals.get(id);
      const bootElement = this._bootElements.get(id);

      if (!bootElement) {
        return;
      }

      if (!existing) {
        const nodeTerminal = pod.createTerminal({
          Terminal: options.Terminal,
          FitAddon: options.FitAddon,
          WebglAddon: options.WebglAddon,
          SerializeAddon: options.SerializeAddon,
          theme: options.theme,
          fontFamily: options.fontFamily,
          fontSize: options.fontSize,
          shell:
            panel.processOptions?.allowRedirects || panel.processOptions?.allowCommands
              ? {
                  allowRedirects: !!panel.processOptions?.allowRedirects,
                  allowCommands: panel.processOptions?.allowCommands,
                }
              : undefined,
        });

        nodeTerminal.attach(bootElement);
        nodeTerminal.fit();

        panel.attachNodeTerminal(nodeTerminal);

        this._terminals.set(id, { terminal: nodeTerminal, element: bootElement });
      } else {
        existing.terminal.detach();
        existing.terminal.attach(bootElement);
        panel.attachNodeTerminal(existing.terminal);

        this._terminals.set(id, { terminal: existing.terminal, element: bootElement });
      }

      this._bootElements.delete(id);
    } catch {
      this._renderBootstrapMessage(
        element,
        [
          escapeCodes.red(`Looks like your browser's configuration is blocking the runtime.`),
          '',
          `Let's troubleshoot this!`,
          '',
          'See https://r1ck404.github.io/Nodepod/docs/concepts/compatibility/ for browser requirements.',
          '',
        ].join('\n'),
      );

      await tick();
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { terminal } of this._terminals.values()) {
      terminal.fit();
    }

    for (const panel of this.terminalConfig.get().panels) {
      panel.process?.resize(cols, rows);
    }
  }

  private _renderBootstrapMessage(element: HTMLElement, message: string) {
    element.replaceChildren();

    const pre = document.createElement('pre');

    pre.style.margin = '0';
    pre.style.padding = '0.5rem';
    pre.style.fontFamily = 'Menlo, courier-new, courier, monospace';
    pre.style.fontSize = '13px';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.color = 'inherit';
    pre.textContent = message;

    element.appendChild(pre);
  }
}

const browserSupportMessage = [
  escapeCodes.red('Incompatible Web Browser'),
  '',
  `Nodepod requires a cross-origin isolated browser with SharedArrayBuffer. See https://r1ck404.github.io/Nodepod/docs/concepts/compatibility/ for the current list of supported browsers.`,
  '',
].join('\n');
