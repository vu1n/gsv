import { describe, expect, it } from "vitest";
import { normalizeUserProfileName } from "./user-profiles";

describe("normalizeUserProfileName", () => {
  it("rejects system profile ids and aliases", () => {
    for (const profile of ["init", "task", "review", "cron", "mcp", "app", "personal"]) {
      expect(normalizeUserProfileName(profile)).toBeNull();
    }
  });

  it("accepts custom user profile names", () => {
    expect(normalizeUserProfileName("codex-dev")).toBe("codex-dev");
    expect(normalizeUserProfileName("my.helper:2")).toBe("my.helper:2");
  });
});
