import { OpenVessel, type Process as VesselProcess } from 'openvessel';
import type { Runtime, RuntimeBootOptions, RuntimeProcess, RuntimeProvider } from './runtime.js';

class OpenVesselProcess implements RuntimeProcess {
  constructor(private readonly _vesselProcess: VesselProcess) {}

  get output(): ReadableStream<string> {
    return this._vesselProcess.output;
  }

  get exit(): Promise<number> {
    return this._vesselProcess.exit;
  }

  write(data: string): Promise<unknown> {
    return this._vesselProcess.write(data);
  }

  end(): Promise<unknown> {
    return this._vesselProcess.end();
  }

  resize(cols: number, rows: number): Promise<unknown> {
    return this._vesselProcess.resize(cols, rows);
  }

  kill(signal?: string): Promise<unknown> {
    return this._vesselProcess.kill(signal);
  }
}

export const openVesselProvider: RuntimeProvider = {
  name: 'openvessel',

  async boot(options: RuntimeBootOptions): Promise<Runtime> {
    const vessel = await OpenVessel.boot({
      runtimeUrl: options.runtimeUrl,
      previewUrl: options.previewUrl,
      network: options.network,
    });

    return {
      mount: (files, mountOptions) => vessel.mount(files, mountOptions),
      spawn: async (command, args, spawnOptions) =>
        new OpenVesselProcess(await vessel.spawn(command, args, spawnOptions)),
      exec: (commandLine, execOptions) => vessel.exec(commandLine, execOptions),
      onServerReady: (handler) => vessel.on('server-ready', handler),
      createPreview: (port, previewOptions) => vessel.createPreview(port, previewOptions),
      teardown: () => vessel.teardown(),
    };
  },
};
