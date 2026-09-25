import type { Assessment } from "../../src/types.js";

interface GuardResult {
  ok: boolean;
  reason?: string;
}

// FR7.3/FR7.7 — named authorization guards, the only place role/scope/SoD
// logic may ever live. Allow-any at MVP; a V2 SoD rule becomes a one-line
// edit inside canApprove, no call-site changes (mirrors the prototype's
// src/store/useStore.ts guards verbatim).
export function canSubmit(_assessment: Assessment, _actor: string): GuardResult {
  return { ok: true };
}
export function canApprove(_assessment: Assessment, _actor: string): GuardResult {
  return { ok: true };
}
export function canReturn(_assessment: Assessment, _actor: string): GuardResult {
  return { ok: true };
}

export const POLICY_VERSION = "mvp-allow-all-v1";
