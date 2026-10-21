import { atom } from 'nanostores';

/**
 * Nodepod has no auth flow, so this store is permanently at `no-auth`.
 * Kept exported so existing tutorials that `import { authStore }` still
 * compile.
 */
export const authStore = atom<{ status: 'no-auth' }>({ status: 'no-auth' });
