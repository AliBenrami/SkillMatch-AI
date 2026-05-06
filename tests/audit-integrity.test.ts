import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GENESIS_PREVIOUS_HASH,
  computeAuditEventHash,
  verifyAuditChain,
  type AuditChainEvent,
} from "@/lib/audit-integrity";
import {
  appendAuditEvent,
  listAuditEvents,
  resetAuditEventsForTests,
  verifyAuditIntegrity,
} from "@/lib/db";

beforeEach(() => {
  resetAuditEventsForTests();
});

afterEach(() => {
  resetAuditEventsForTests();
});

describe("audit hash chain", () => {
  it("computes a deterministic hash for the same payload", () => {
    const inputA = {
      previousHash: GENESIS_PREVIOUS_HASH,
      actor: "user@example.com",
      actorRole: "system_admin",
      actorName: "Admin",
      action: "login",
      entityId: null,
      details: { foo: "bar" },
      createdAt: "2026-05-04T00:00:00.000Z",
    };
    const inputB = { ...inputA, details: { foo: "bar" } };
    expect(computeAuditEventHash(inputA)).toBe(computeAuditEventHash(inputB));
  });

  it("produces different hashes when previous hash differs", () => {
    const base = {
      actor: "user@example.com",
      actorRole: null,
      actorName: null,
      action: "login",
      entityId: null,
      details: {},
      createdAt: "2026-05-04T00:00:00.000Z",
    } as const;
    const hashA = computeAuditEventHash({ ...base, previousHash: GENESIS_PREVIOUS_HASH });
    const hashB = computeAuditEventHash({ ...base, previousHash: "deadbeef".repeat(8) });
    expect(hashA).not.toBe(hashB);
  });

  it("verifies a clean chain", () => {
    const events: AuditChainEvent[] = [];
    let previousHash = GENESIS_PREVIOUS_HASH;
    for (let i = 0; i < 3; i++) {
      const event = {
        previousHash,
        actor: `user${i}@example.com`,
        actorRole: "system_admin",
        actorName: `User ${i}`,
        action: "login",
        entityId: null,
        details: { i },
        createdAt: `2026-05-0${i + 1}T00:00:00.000Z`,
      };
      const hash = computeAuditEventHash(event);
      events.push({ ...event, hash });
      previousHash = hash;
    }
    expect(verifyAuditChain(events).ok).toBe(true);
  });

  it("flags hash mismatches when an event is tampered", () => {
    let previousHash = GENESIS_PREVIOUS_HASH;
    const events: AuditChainEvent[] = [];
    for (let i = 0; i < 2; i++) {
      const event = {
        previousHash,
        actor: "user@example.com",
        actorRole: null,
        actorName: null,
        action: "login",
        entityId: null,
        details: { i },
        createdAt: `2026-05-0${i + 1}T00:00:00.000Z`,
      };
      const hash = computeAuditEventHash(event);
      events.push({ ...event, hash });
      previousHash = hash;
    }
    events[0] = { ...events[0], details: { tampered: true } };
    const result = verifyAuditChain(events);
    expect(result.ok).toBe(false);
    expect(result.issues[0].reason).toBe("hash_mismatch");
  });

  it("flags previous-hash mismatches when an event is removed", () => {
    let previousHash = GENESIS_PREVIOUS_HASH;
    const events: AuditChainEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const event = {
        previousHash,
        actor: "user@example.com",
        actorRole: null,
        actorName: null,
        action: "login",
        entityId: null,
        details: { i },
        createdAt: `2026-05-0${i + 1}T00:00:00.000Z`,
      };
      const hash = computeAuditEventHash(event);
      events.push({ ...event, hash });
      previousHash = hash;
    }
    const truncated = [events[0], events[2]];
    const result = verifyAuditChain(truncated);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.reason === "previous_hash_mismatch")).toBe(true);
  });
});

describe("appendAuditEvent + verifyAuditIntegrity (memory mode)", () => {
  it("links each appended event to the previous hash", async () => {
    const first = await appendAuditEvent({
      actor: "admin@skillmatch.demo",
      actorRole: "system_admin",
      actorName: "Yash Admin",
      action: "login",
      details: {},
    });
    const second = await appendAuditEvent({
      actor: "admin@skillmatch.demo",
      actorRole: "system_admin",
      actorName: "Yash Admin",
      action: "logout",
      details: {},
    });

    expect(first.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(second.previousHash).toBe(first.hash);
    const integrity = await verifyAuditIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it("filters audit events by action, actor, and entity id", async () => {
    await appendAuditEvent({
      actor: "admin@example.com",
      action: "login",
      details: {},
    });
    await appendAuditEvent({
      actor: "lina@example.com",
      action: "learning_modules_assigned",
      entityId: "candidate-1",
      details: {},
    });
    await appendAuditEvent({
      actor: "admin@example.com",
      action: "alert_resolved",
      entityId: "alert-7",
      details: {},
    });

    const byAction = await listAuditEvents({ action: "login" });
    expect(byAction).toHaveLength(1);
    expect(byAction[0].action).toBe("login");

    const byActor = await listAuditEvents({ actor: "lina" });
    expect(byActor).toHaveLength(1);
    expect(byActor[0].actor).toBe("lina@example.com");

    const byEntity = await listAuditEvents({ entityId: "alert-7" });
    expect(byEntity).toHaveLength(1);
    expect(byEntity[0].entityId).toBe("alert-7");
  });

  it("filters audit events by date range", async () => {
    await appendAuditEvent({
      actor: "admin@example.com",
      action: "login",
      details: {},
    });
    const before = new Date(Date.now() + 1).toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await appendAuditEvent({
      actor: "admin@example.com",
      action: "logout",
      details: {},
    });

    const recent = await listAuditEvents({ startDate: before });
    expect(recent.length).toBe(1);
    expect(recent[0].action).toBe("logout");
  });
});
