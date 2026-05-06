import crypto from "node:crypto";

/**
 * Hash-chain helpers used by the audit log so the recorded sequence becomes
 * tamper-evident. Each event stores the previous chain hash plus its own
 * computed hash so admins can detect deletes or edits by re-deriving the chain.
 */

export const GENESIS_PREVIOUS_HASH = "0".repeat(64);

export type AuditChainInput = {
  actor: string;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  previousHash: string;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

export function computeAuditEventHash(input: AuditChainInput): string {
  const payload = stableStringify({
    previousHash: input.previousHash,
    actor: input.actor,
    actorRole: input.actorRole,
    actorName: input.actorName,
    action: input.action,
    entityId: input.entityId,
    details: input.details,
    createdAt: input.createdAt,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export type AuditChainEvent = AuditChainInput & {
  hash: string;
};

export type AuditChainVerificationIssue = {
  index: number;
  reason: "previous_hash_mismatch" | "hash_mismatch";
};

export function verifyAuditChain(events: AuditChainEvent[]): {
  ok: boolean;
  issues: AuditChainVerificationIssue[];
} {
  const issues: AuditChainVerificationIssue[] = [];
  let expectedPrevious = GENESIS_PREVIOUS_HASH;

  events.forEach((event, index) => {
    if (event.previousHash !== expectedPrevious) {
      issues.push({ index, reason: "previous_hash_mismatch" });
    }

    const recomputed = computeAuditEventHash({
      previousHash: event.previousHash,
      actor: event.actor,
      actorRole: event.actorRole,
      actorName: event.actorName,
      action: event.action,
      entityId: event.entityId,
      details: event.details,
      createdAt: event.createdAt,
    });

    if (recomputed !== event.hash) {
      issues.push({ index, reason: "hash_mismatch" });
    }

    expectedPrevious = event.hash;
  });

  return { ok: issues.length === 0, issues };
}
