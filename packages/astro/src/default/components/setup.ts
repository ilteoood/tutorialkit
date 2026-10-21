/**
 * Historically this wired WebContainer's enterprise auth flow. Nodepod has
 * no equivalent, so the file is now a thin compatibility shim that exports
 * `useAuth = false` for callers that still read it.
 */

export const useAuth = false;
