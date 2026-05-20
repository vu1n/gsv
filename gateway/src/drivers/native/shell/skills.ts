import { defineCommand } from "just-bash";
import type { ExecResult } from "just-bash";
import { GsvFs } from "../../../fs/gsv-fs";
import type { KernelContext } from "../../../kernel/context";
import {
  collectFilesystemSkillDocuments,
  listSkillFiles,
  resolveSkillDocument,
  type SkillDocument,
} from "../../../kernel/skills";
import type { ProcessIdentity } from "@gsv/protocol/syscalls/system";

export function buildSkillsCommand(fs: GsvFs, ctx: KernelContext, identity: ProcessIdentity) {
  return defineCommand("skills", async (args): Promise<ExecResult> => {
    try {
      return await runSkillsCommand(args, fs, ctx, identity);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        stdout: "",
        stderr: `skills: ${message}\n`,
        exitCode: 1,
      };
    }
  });
}

async function runSkillsCommand(
  args: string[],
  fs: GsvFs,
  ctx: KernelContext,
  identity: ProcessIdentity,
): Promise<ExecResult> {
  const [subcommand = "list", ...rest] = args;

  switch (subcommand) {
    case "help":
    case "--help":
    case "-h":
      return { stdout: skillsUsage(), stderr: "", exitCode: 0 };
    case "list":
    case "ls": {
      const docs = await collectFilesystemSkillDocuments(fs, ctx, identity);
      return { stdout: formatSkillsList(docs), stderr: "", exitCode: 0 };
    }
    case "search": {
      const query = rest.join(" ").trim();
      if (!query) {
        throw new Error("Usage: skills search <query>");
      }
      const docs = await collectFilesystemSkillDocuments(fs, ctx, identity);
      return { stdout: formatSkillsList(searchSkills(docs, query)), stderr: "", exitCode: 0 };
    }
    case "show": {
      const docs = await collectFilesystemSkillDocuments(fs, ctx, identity);
      const resolved = resolveSkillDocument(docs, rest[0]);
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }
      return { stdout: formatSkillDocument(resolved.doc), stderr: "", exitCode: 0 };
    }
    case "files": {
      const docs = await collectFilesystemSkillDocuments(fs, ctx, identity);
      const resolved = resolveSkillDocument(docs, rest[0]);
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }
      const files = await listSkillFiles(fs, resolved.doc);
      return { stdout: formatSkillFiles(resolved.doc, files), stderr: "", exitCode: 0 };
    }
    case "read": {
      const docs = await collectFilesystemSkillDocuments(fs, ctx, identity);
      const resolved = resolveSkillDocument(docs, rest[0]);
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }
      const filePath = String(rest[1] ?? "").trim();
      if (!filePath) {
        throw new Error("Usage: skills read <skill> <file>");
      }
      if (filePath.startsWith("/") || filePath.split("/").includes("..")) {
        throw new Error("supporting file path must be relative and must not contain '..'");
      }
      const root = skillDirectoryPath(resolved.doc);
      if (!root) {
        throw new Error(`skill '${resolved.doc.id}' does not have supporting files`);
      }
      const content = await fs.readFile(`${root}/${filePath}`);
      return { stdout: content.endsWith("\n") ? content : `${content}\n`, stderr: "", exitCode: 0 };
    }
    default:
      throw new Error(`Unknown skills subcommand: ${subcommand}`);
  }
}

function formatSkillsList(docs: SkillDocument[]): string {
  if (docs.length === 0) {
    return "No skills available.\n";
  }
  const lines = ["NAME\tSOURCE\tWRITABLE\tDESCRIPTION"];
  for (const doc of docs) {
    lines.push(`${doc.id}\t${doc.source.label}\t${doc.source.writable ? "yes" : "no"}\t${doc.description}`);
  }
  return `${lines.join("\n")}\n`;
}

function searchSkills(docs: SkillDocument[], query: string): SkillDocument[] {
  const needle = query.toLowerCase();
  return docs.filter((doc) =>
    doc.id.toLowerCase().includes(needle)
    || doc.name.toLowerCase().includes(needle)
    || doc.description.toLowerCase().includes(needle)
    || doc.content.toLowerCase().includes(needle)
  );
}

function formatSkillDocument(doc: SkillDocument): string {
  return [
    `path: ${doc.path}`,
    `writable: ${doc.source.writable ? "yes" : "no"}`,
    "",
    doc.content,
    "",
  ].join("\n");
}

function formatSkillFiles(doc: SkillDocument, files: string[]): string {
  if (files.length === 0) {
    return `No supporting files for ${doc.id}.\n`;
  }
  return `${files.map((file) => `${doc.id}\t${file}`).join("\n")}\n`;
}

function skillDirectoryPath(doc: SkillDocument): string | null {
  if (doc.path.endsWith("/SKILL.md")) {
    return doc.path.slice(0, -"/SKILL.md".length);
  }
  return null;
}

function skillsUsage(): string {
  return [
    "Usage: skills <subcommand> [args]",
    "",
    "  skills list",
    "  skills search <query>",
    "  skills show <skill>",
    "  skills files <skill>",
    "  skills read <skill> <file>",
    "",
    "Skill names come from layered skills.d directories. Use `skills show`",
    "to load the full SKILL.md and see the backing source path.",
    "",
  ].join("\n");
}
