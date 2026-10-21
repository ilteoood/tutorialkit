import type { TerminalPanelType, TerminalSchema } from '@tutorialkit/types';
import type { Nodepod } from '@r1ck404/nodepod';
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

/**
 * Process handle exposed to a terminal panel. Nodepod's `NodepodProcess`
 * has kill + write but no resize; resize is best-effort and silently
 * ignored when the process doesn't accept it.
 */
export interface RuntimeProcess {
  kill(): void;
  resize(size: { cols: number; rows: number }): void;
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
 * A panel that renders a process's output. Holds the process and pipes its
 * I/O through to a terminal when one is attached.
 */
export class TerminalPanel implements ITerminal, RuntimeProcessHost {
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
  private _process?: RuntimeProcess;
  private _data: { data: string; type: 'input' | 'echo' }[] = [];
  private _onData?: (data: string) => void;
  // Kept for back-compat -- the jsh helper used to consume this.
  // Nodepod doesn't honour allowRedirects / allowCommands; we drop them.
  readonly _: { [k: string]: never } = {};

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

  // Kept as-is so callers that read processOptions don't have to change.
  get processOptions() {
    return undefined;
  }

  // #region ITerminal methods
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
  // #endregion

  attachProcess(process: RuntimeProcess) {
    this._process = process;

    if (this.cols != null && this.rows != null) {
      this._process.resize({ cols: this.cols, rows: this.rows });
    }
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
      this._process?.resize({ cols: this.cols, rows: this.rows });
    }
  }

  resize(size: { cols: number; rows: number }) {
    this._process?.resize(size);
  }

  kill() {
    this._process?.kill();
  }
}

interface RuntimeProcessHost {}

/**
 * Wrap a Nodepod process so the terminal panel can `resize` it without
 * crashing when the underlying worker doesn't honour TTY size.
 */
export function asRuntimeProcess(nodepodProcess: { kill(): void }): RuntimeProcess {
  return {
    kill: () => nodepodProcess.kill(),
    resize: () => {
      // NodepodProcess does not expose a TTY resize; we accept it silently.
    },
  };
}

/**
 * Public type re-export so the runtime package's consumers can name the
 * shared `Nodepod` instance without importing it directly.
 */
export type { Nodepod };

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
