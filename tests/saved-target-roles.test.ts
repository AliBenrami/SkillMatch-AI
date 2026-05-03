import { beforeEach, describe, expect, it } from "vitest";
import { deleteSavedTargetRole, listSavedTargetRoles, resetSavedTargetRolesForTests, saveTargetRole } from "@/lib/db";

describe("saved target role progress tracking", () => {
  beforeEach(() => {
    resetSavedTargetRolesForTests();
  });

  it("saves employee target roles with progress toward the target score", async () => {
    const saved = await saveTargetRole({
      employeeEmail: "alex@example.com",
      roleId: "sde-ii",
      roleTitle: "Software Development Engineer II",
      targetScore: 80,
      currentScore: 60,
      matchedSkills: ["java", "aws"],
      missingSkills: ["system design"]
    });

    expect(saved.progressPercent).toBe(75);
    expect(saved.matchedSkills).toEqual(["java", "aws"]);
    expect(await listSavedTargetRoles("alex@example.com")).toHaveLength(1);
    expect(await listSavedTargetRoles("other@example.com")).toEqual([]);
  });

  it("updates an existing saved role for the same employee and role", async () => {
    const first = await saveTargetRole({
      employeeEmail: "alex@example.com",
      roleId: "data-analyst",
      roleTitle: "Data Analyst",
      currentScore: 20
    });
    const updated = await saveTargetRole({
      employeeEmail: "alex@example.com",
      roleId: "data-analyst",
      roleTitle: "Data Analyst",
      targetScore: 50,
      currentScore: 55,
      matchedSkills: ["sql"]
    });

    const roles = await listSavedTargetRoles("alex@example.com");
    expect(roles).toHaveLength(1);
    expect(updated.id).toBe(first.id);
    expect(roles[0].progressPercent).toBe(100);
    expect(roles[0].matchedSkills).toEqual(["sql"]);
  });

  it("deletes only the requesting employee's saved role", async () => {
    const saved = await saveTargetRole({
      employeeEmail: "alex@example.com",
      roleId: "cloud-support",
      roleTitle: "Cloud Support Associate"
    });
    await saveTargetRole({
      employeeEmail: "jamie@example.com",
      roleId: "cloud-support",
      roleTitle: "Cloud Support Associate"
    });

    expect(await deleteSavedTargetRole({ employeeEmail: "jamie@example.com", id: saved.id })).toBe(false);
    expect(await deleteSavedTargetRole({ employeeEmail: "alex@example.com", id: saved.id })).toBe(true);
    expect(await listSavedTargetRoles("alex@example.com")).toEqual([]);
    expect(await listSavedTargetRoles("jamie@example.com")).toHaveLength(1);
  });
});
