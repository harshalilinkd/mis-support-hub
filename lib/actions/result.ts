/**
 * Standard return shape for every Server Action (CLAUDE.md §9).
 * Actions never throw for expected failures — they return a discriminated union.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({
  ok: false,
  error,
});
