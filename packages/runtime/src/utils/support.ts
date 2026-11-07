const SUPPORTED_BROWSERS = 'OpenVessel needs a Chromium-based browser or Firefox.';

/**
 * Explains why the runtime cannot run here, or `undefined` when nothing stands in its way.
 */
export function browserSupportIssue(): string | undefined {
  try {
    if (!('SharedArrayBuffer' in globalThis)) {
      return `${SUPPORTED_BROWSERS} This browser does not expose SharedArrayBuffer.`;
    }

    if (isSafari()) {
      return `${SUPPORTED_BROWSERS} Safari is not supported.`;
    }

    return undefined;
  } catch {
    return `${SUPPORTED_BROWSERS} This browser could not be inspected.`;
  }
}

function isSafari() {
  const { userAgent } = navigator;

  return userAgent.includes('Safari') && !userAgent.includes('Chrome') && !userAgent.includes('Firefox');
}
