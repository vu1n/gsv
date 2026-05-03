import { describe, expect, it } from "vitest";
import type { ProcessIdentity } from "@gsv/protocol/syscalls/system";
import type { InstalledPackageRecord } from "./packages";
import type { KernelContext } from "./context";
import { collectFilesystemSkillDocuments } from "./skills";

const IDENTITY: ProcessIdentity = {
  uid: 1000,
  gid: 1000,
  gids: [1000],
  username: "sam",
  home: "/home/sam",
  cwd: "/home/sam",
  workspaceId: null,
};

describe("collectFilesystemSkillDocuments", () => {
  it("marks package skills writable only when source repo is owned by the identity", async () => {
    const foreign = makePackage("pkg-foreign", "foreign-tools", "alice/tools");
    const owned = makePackage("pkg-owned", "owned-tools", "sam/tools");
    const ctx = {
      packages: {
        list: () => [foreign, owned],
      },
    } as unknown as KernelContext;
    const fs = makeSkillFs({
      "/src/packages/foreign-tools/skills.d": ["guide.md"],
      "/src/packages/foreign-tools/skills.d/guide.md": [
        "---",
        "name: foreign-guide",
        "description: Foreign package guide.",
        "---",
        "",
        "# Foreign",
        "",
      ].join("\n"),
      "/src/packages/owned-tools/skills.d": ["guide.md"],
      "/src/packages/owned-tools/skills.d/guide.md": [
        "---",
        "name: owned-guide",
        "description: Owned package guide.",
        "---",
        "",
        "# Owned",
        "",
      ].join("\n"),
    });

    const docs = await collectFilesystemSkillDocuments(fs, ctx, IDENTITY);

    expect(docs.find((doc) => doc.name === "foreign-guide")?.source).toMatchObject({
      kind: "package",
      label: "pkg:foreign-tools",
      writable: false,
    });
    expect(docs.find((doc) => doc.name === "owned-guide")?.source).toMatchObject({
      kind: "package",
      label: "pkg:owned-tools",
      writable: true,
    });
  });
});

function makePackage(packageId: string, name: string, repo: string): InstalledPackageRecord {
  return {
    packageId,
    scope: { kind: "user", uid: IDENTITY.uid },
    manifest: {
      name,
      description: name,
      version: "0.1.0",
      runtime: "web-ui",
      source: {
        repo,
        ref: "main",
        subdir: ".",
        resolvedCommit: "base123",
      },
      entrypoints: [],
    },
    artifact: { hash: "hash", mainModule: "main.js", modulePaths: ["main.js"] },
    enabled: true,
    reviewRequired: false,
    reviewedAt: 1,
    installedAt: 1,
    updatedAt: 1,
  } as InstalledPackageRecord;
}

function makeSkillFs(entries: Record<string, string[] | string>) {
  return {
    async readdir(path: string): Promise<string[]> {
      const entry = entries[path];
      if (!Array.isArray(entry)) {
        throw new Error(`ENOENT: ${path}`);
      }
      return entry;
    },
    async stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean }> {
      const entry = entries[path];
      if (entry === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return {
        isFile: typeof entry === "string",
        isDirectory: Array.isArray(entry),
      };
    },
    async readFile(path: string): Promise<string> {
      const entry = entries[path];
      if (typeof entry !== "string") {
        throw new Error(`ENOENT: ${path}`);
      }
      return entry;
    },
  };
}
