import type { ProcessIdentity } from "@gsv/protocol/syscalls/system";
import {
  createHomeKnowledgeBackend,
  GsvFs,
  normalizePath,
} from "../fs";
import {
  isUserAiContextProfile,
  type ContextFile,
} from "../syscalls/ai";
import type { KernelContext } from "./context";

const USER_PROFILE_ROOT = "profiles.d";
const RESERVED_USER_PROFILE_NAMES = new Set(["personal"]);

export type UserAiProfile = {
  id: string;
  displayName: string;
  description?: string;
  icon?: string;
  interactive: boolean;
  startable: boolean;
  background: boolean;
  contextFiles: ContextFile[];
  approvalPolicy: string | null;
};

type UserProfileMetadata = {
  displayName?: string;
  description?: string;
  icon?: string;
  interactive?: boolean;
  startable?: boolean;
  background?: boolean;
};

export async function resolveUserAiProfile(
  ctx: KernelContext,
  profile: string,
): Promise<UserAiProfile | null> {
  const normalizedProfile = normalizeUserProfileName(profile);
  if (!normalizedProfile || normalizedProfile !== profile) {
    return null;
  }

  const fs = createProfileFs(ctx);
  if (!fs) {
    return null;
  }

  const root = userProfilePath(ctx.identity!.process, normalizedProfile);
  if (!(await isDirectory(fs, root))) {
    return null;
  }

  const metadata = await readMetadata(fs, root);
  const description = metadata.description ?? await readDescription(fs, root);

  return {
    id: normalizedProfile,
    displayName: metadata.displayName ?? titleFromProfileId(normalizedProfile),
    ...(description ? { description } : {}),
    ...(metadata.icon ? { icon: metadata.icon } : {}),
    interactive: metadata.interactive ?? true,
    startable: metadata.startable ?? true,
    background: metadata.background ?? false,
    contextFiles: await readContextFiles(fs, root),
    approvalPolicy: await readApprovalPolicy(fs, root),
  };
}

export async function listUserAiProfiles(ctx: KernelContext): Promise<UserAiProfile[]> {
  const fs = createProfileFs(ctx);
  if (!fs) {
    return [];
  }

  const root = normalizePath(`${ctx.identity!.process.home}/${USER_PROFILE_ROOT}`);
  const names = await fs.readdir(root).catch(() => [] as string[]);
  const profiles: UserAiProfile[] = [];
  for (const name of names) {
    const normalized = normalizeUserProfileName(name);
    if (!normalized || normalized !== name) {
      continue;
    }
    const profile = await resolveUserAiProfile(ctx, normalized).catch((error) => {
      console.warn(
        `[profiles.d] failed to read ${normalized}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    if (profile) {
      profiles.push(profile);
    }
  }
  return profiles.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function normalizeUserProfileName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (RESERVED_USER_PROFILE_NAMES.has(trimmed)) {
    return null;
  }
  return isUserAiContextProfile(trimmed) ? trimmed : null;
}

function createProfileFs(ctx: KernelContext): GsvFs | null {
  const identity = ctx.identity?.process;
  const storage = ctx.env.STORAGE;
  if (!identity || !storage) {
    return null;
  }

  return new GsvFs(
    storage,
    identity,
    undefined,
    undefined,
    undefined,
    createHomeKnowledgeBackend(storage, ctx.env.RIPGIT, identity),
  );
}

function userProfilePath(identity: ProcessIdentity, profile: string): string {
  return normalizePath(`${identity.home}/${USER_PROFILE_ROOT}/${profile}`);
}

async function isDirectory(fs: GsvFs, path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

async function readMetadata(fs: GsvFs, root: string): Promise<UserProfileMetadata> {
  const text = await readOptionalFile(fs, `${root}/profile.json`);
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as Partial<UserProfileMetadata>;
    return {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName.trim() : undefined,
      description: typeof parsed.description === "string" ? parsed.description.trim() : undefined,
      icon: typeof parsed.icon === "string" ? parsed.icon.trim() : undefined,
      interactive: typeof parsed.interactive === "boolean" ? parsed.interactive : undefined,
      startable: typeof parsed.startable === "boolean" ? parsed.startable : undefined,
      background: typeof parsed.background === "boolean" ? parsed.background : undefined,
    };
  } catch {
    return {};
  }
}

async function readDescription(fs: GsvFs, root: string): Promise<string | undefined> {
  const text = await readOptionalFile(fs, `${root}/description.md`);
  return text?.trim().split("\n").map((line) => line.trim()).filter(Boolean)[0];
}

async function readContextFiles(fs: GsvFs, root: string): Promise<ContextFile[]> {
  const contextRoot = `${root}/context.d`;
  const names = await fs.readdir(contextRoot).catch(() => [] as string[]);
  const files: ContextFile[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".md")).sort()) {
    const text = await readOptionalFile(fs, `${contextRoot}/${name}`);
    if (text?.trim()) {
      files.push({ name, text });
    }
  }
  return files;
}

async function readApprovalPolicy(fs: GsvFs, root: string): Promise<string | null> {
  return (await readOptionalFile(fs, `${root}/tools/approval`))
    ?? (await readOptionalFile(fs, `${root}/approval.json`));
}

async function readOptionalFile(fs: GsvFs, path: string): Promise<string | null> {
  try {
    const text = await fs.readFile(path);
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

function titleFromProfileId(profile: string): string {
  return profile
    .split(/[-_.:]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || profile;
}
