import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonRuntime } from './lesson-runtime.js';

const boot = vi.hoisted(() => vi.fn());

vi.mock('openvessel', () => ({ OpenVessel: { boot } }));

describe('LessonRuntime', () => {
  beforeEach(() => {
    boot.mockReset();
    boot.mockResolvedValue({ mount: vi.fn(), fs: {}, onServer: vi.fn() });
  });

  it('should boot with the TutorialKit network default when the caller sets none', async () => {
    await new LessonRuntime({ runtimeUrl: 'http://localhost/ov/runtime/' }).ready;

    expect(boot).toHaveBeenCalledWith(
      expect.objectContaining({
        network: { mode: 'allowlist', presets: ['npm', 'fonts', 'icons', 'cdn'], allow: [], deny: [] },
      }),
    );
  });

  it('should let the caller override a single field of the network policy', async () => {
    await new LessonRuntime({
      runtimeUrl: 'http://localhost/ov/runtime/',
      network: { mode: 'allow-all' },
    }).ready;

    expect(boot).toHaveBeenCalledWith(
      expect.objectContaining({
        network: { mode: 'allow-all', presets: ['npm', 'fonts', 'icons', 'cdn'], allow: [], deny: [] },
      }),
    );
  });
});
