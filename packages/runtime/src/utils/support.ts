export function isPodSupported() {
  try {
    const hasSharedArrayBuffer = 'SharedArrayBuffer' in globalThis;
    const hasCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

    if (!hasSharedArrayBuffer || !hasCrossOriginIsolated) {
      // allow overriding the support check with localStorage.webcontainer_any_ua = 1
      return Boolean(localStorage.getItem('webcontainer_any_ua'));
    }

    const looksLikeChrome = navigator.userAgent.includes('Chrome');
    const looksLikeFirefox = navigator.userAgent.includes('Firefox');
    const looksLikeSafari = navigator.userAgent.includes('Safari');

    if (looksLikeChrome || looksLikeFirefox) {
      return true;
    }

    if (looksLikeSafari) {
      // cross-origin isolation in Safari shipped in 16.4
      const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+) (?:Mobile\/.*?)?Safari/);
      const majorVersion = match ? Number(match?.[1]) : 0;
      const minorVersion = match ? Number(match?.[2]) : 0;

      return majorVersion > 16 || (majorVersion === 16 && minorVersion >= 4);
    }

    return Boolean(localStorage.getItem('webcontainer_any_ua'));
  } catch {
    return false;
  }
}
