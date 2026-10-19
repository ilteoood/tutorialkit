import type { TerminalPanelType, TerminalSchema } from '@tutorialkit/types';
import type { ITerminal } from '../utils/terminal.js';

interface NormalizedTerminalConfig {
  panels: TerminalPanel[];
  activePanel: number;
  defaultOpen: boolean;
}

interface TerminalPanelOptions {
  id?: string;
  title?: string;
  allowRedirects?: boolean;
  allowCommands?: string[];
}

export class TerminalConfig {
  private _config: NormalizedTerminalConfig;

  constructor(config?: TerminalSchema) {
    const normalized = normalizeTerminalConfig(config);

    this._config = normalized;
  }

  get panels() {
    return this._config.panels;
  }

  get activePanel() {
    return this._config.activePanel;
  }

  get defaultOpen() {
    return this._config.defaultOpen;
  }
}

const TERMINAL_PANEL_TITLES: Record<TerminalPanelType, string> = {
  output: 'Output',
  terminal: 'Terminal',
};

let globalId = 0;

/**
 * Per-tab state for a terminal panel. Mixed concerns:
 *   - output panels: holds a NodepodProcess whose stdout/stderr are written
 *     to a host-supplied terminal interface.
 *   - terminal panels: holds a NodepodTerminal that owns its xterm instance;
 *     the host panel just keeps a reference for resize/kill on remount.
 */
export class TerminalPanel implements ITerminal {
  static panelCount: Record<TerminalPanelType, number> = {
    output: 0,
    terminal: 0,
  };

  static resetCount() {
    this.panelCount = {
      output: 0,
      terminal: 0,
    };
  }

  readonly id: string;
  readonly title: string;

  private _terminal?: ITerminal;
  private _data: { data: string; type: 'input' | 'echo' }[] = [];
  private _onData?: (data: string) => void;

  /**
   * Two distinct process holders: output panels keep a NodepodProcess whose
   * streams are piped to `terminal`; terminal panels keep a NodepodTerminal
   * that owns its own xterm and call sites use whichever is set.
   */
  private _process?: { kill(): void; resize(cols: number, rows: number): void };
  private _nodeTerminal?: {
    detach(): void;
    fit(): void;
    input(text: string): void;
  };

  constructor(
    readonly type: TerminalPanelType,
    private readonly _options?: TerminalPanelOptions,
  ) {
    let title = _options?.title;

    if (!title) {
      title = TERMINAL_PANEL_TITLES[type];

      const count = TerminalPanel.panelCount[type];

      if (count > 0) {
        title += ` ${count}`;
      }

      TerminalPanel.panelCount[type]++;
    }

    this.title = title;
    this.id = _options?.id ?? (type === 'output' ? 'output' : `${type}-${globalId++}`);
  }

  get terminal() {
    return this._terminal;
  }

  get process() {
    return this._process;
  }

  get nodeTerminal() {
    return this._nodeTerminal;
  }

  get processOptions() {
    if (this.type === 'output') {
      return undefined;
    }

    return {
      allowRedirects: this._options?.allowRedirects ?? false,
      allowCommands: this._options?.allowCommands,
    };
  }

  get cols() {
    return this._terminal?.cols;
  }

  get rows() {
    return this._terminal?.rows;
  }

  reset() {
    if (this._terminal) {
      this._terminal.reset();
    } else {
      this._data = [];
    }
  }

  /** @internal*/
  write(data: string) {
    if (this._terminal) {
      this._terminal.write(data);
    } else {
      this._data.push({ data, type: 'echo' });
    }
  }

  input(data: string) {
    if (this.type !== 'terminal') {
      throw new Error('Cannot write data to output-only terminal');
    }

    if (this._terminal) {
      this._terminal.input(data);
    } else {
      this._data.push({ data, type: 'input' });
    }
  }

  onData(callback: (data: string) => void) {
    if (this._terminal) {
      this._terminal.onData(callback);
    } else {
      this._onData = callback;
    }
  }

  attachProcess(process: NonNullable<TerminalPanel['process']>) {
    this._process = process;

    if (this.cols != null && this.rows != null) {
      this._process.resize(this.cols, this.rows);
    }
  }

  attachNodeTerminal(nodeTerminal: NonNullable<TerminalPanel['nodeTerminal']>) {
    this._nodeTerminal = nodeTerminal;

    for (const { type, data } of this._data) {
      if (type === 'echo') {
        if (this._terminal) {
          this._terminal.write(data);
        } else {
          /**
           * Re-queued if no terminal has been attached yet; covered by
           * attachTerminal later in this same lifecycle.
           */
        }
      } else if (this._terminal) {
        this._terminal.input(data);
      }
    }

    this._data = [];
  }

  attachTerminal(terminal: ITerminal) {
    for (const { type, data } of this._data) {
      if (type === 'echo') {
        terminal.write(data);
      } else {
        terminal.input(data);
      }
    }

    this._data = [];
    this._terminal = terminal;

    if (this._onData) {
      terminal.onData(this._onData);
    }

    if (this.cols != null && this.rows != null) {
      this._process?.resize(this.cols, this.rows);
      this._nodeTerminal?.fit();
    }
  }
}

/**
 * Normalize the provided configuration to a configuration which is easier to parse.
 */
function normalizeTerminalConfig(config?: TerminalSchema): NormalizedTerminalConfig {
  let activePanel = 0;

  if (config === false) {
    return {
      panels: [],
      activePanel,
      defaultOpen: false,
    };
  }

  TerminalPanel.resetCount();

  if (config === undefined || config === true) {
    return {
      panels: [new TerminalPanel('output')],
      activePanel,
      defaultOpen: false,
    };
  }

  const panels: TerminalPanel[] = [];

  const options = {
    allowRedirects: config.allowRedirects,
    allowCommands: config.allowCommands,
  };

  if (config.panels) {
    if (config.panels === 'output') {
      panels.push(new TerminalPanel('output'));
    } else if (config.panels === 'terminal') {
      panels.push(new TerminalPanel('terminal', options));
    } else if (Array.isArray(config.panels)) {
      for (const panel of config.panels) {
        let terminalPanel: TerminalPanel;

        if (typeof panel === 'string') {
          terminalPanel = new TerminalPanel(panel, options);
        } else if (Array.isArray(panel)) {
          terminalPanel = new TerminalPanel(panel[0], {
            title: panel[1],
            ...options,
          });
        } else {
          terminalPanel = new TerminalPanel(panel.type, {
            id: panel.id,
            title: panel.title,
            allowRedirects: panel.allowRedirects ?? config.allowRedirects,
            allowCommands: panel.allowCommands ?? config.allowCommands,
          });
        }

        panels.push(terminalPanel);
      }
    }
  }

  if (typeof config.activePanel === 'number') {
    activePanel = config.activePanel;

    if (activePanel >= panels.length) {
      activePanel = 0;
    }
  }

  return {
    activePanel,
    panels,
    defaultOpen: config.open || false,
  };
}
