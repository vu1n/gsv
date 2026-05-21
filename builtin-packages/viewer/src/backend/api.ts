import type {
  ViewerArtifact,
  ViewerKind,
  ViewerRoute,
} from "../app/types";

type KernelClient = {
  request(call: string, args: Record<string, unknown>): Promise<any>;
};

type FsImageContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type TransferStatResult =
  | {
      ok: true;
      path: string;
      size: number;
      isFile: boolean;
      isDirectory: boolean;
      contentType?: string;
    }
  | { ok: false; error: string };

type TransferReadResult =
  | {
      ok: true;
      path: string;
      offset: number;
      bytesRead: number;
      data: string;
      eof: boolean;
    }
  | { ok: false; error: string };

const TRANSFER_CHUNK_SIZE = 1024 * 1024;

function normalizeTarget(target: string | undefined): string {
  const normalized = String(target ?? "").trim();
  return normalized || "gsv";
}

function normalizePath(path: string | undefined): string {
  const raw = String(path ?? "").trim();
  if (!raw) {
    return "";
  }
  const withRoot = raw.startsWith("/") ? raw : `/${raw}`;
  const parts: string[] = [];
  for (const part of withRoot.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return `/${parts.join("/")}`;
}

function withTarget(target: string, args: Record<string, unknown>): Record<string, unknown> {
  return target === "gsv" ? args : { ...args, target };
}

function decodeNumberedText(content: string): string {
  return String(content ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\t/, ""))
    .join("\n");
}

function normalizeKind(value: string | undefined): ViewerKind | null {
  const kind = String(value ?? "").trim().toLowerCase();
  if (kind === "text" || kind === "html" || kind === "image") {
    return kind;
  }
  return null;
}

function inferContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "application/javascript";
  if (lower.endsWith(".ts")) return "application/typescript";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "text/plain";
}

function isPublicMedia(contentType: string): boolean {
  return contentType.startsWith("audio/")
    || contentType.startsWith("video/")
    || contentType === "application/pdf";
}

function publicUrlForPath(target: string, path: string, contentType: string, title: string | undefined): ViewerArtifact | null {
  if (target !== "gsv" || !path.startsWith("/public/") || !isPublicMedia(contentType)) {
    return null;
  }
  return {
    ok: true,
    kind: "public",
    target,
    path,
    title,
    contentType,
    url: path,
  };
}

function inferKind(path: string, typeHint: ViewerKind | null): ViewerKind {
  if (typeHint) {
    return typeHint;
  }
  const contentType = inferContentType(path);
  if (contentType === "text/html") {
    return "html";
  }
  if (contentType.startsWith("image/")) {
    return "image";
  }
  return "text";
}

function findImageContent(content: unknown): Extract<FsImageContent, { type: "image" }> | null {
  if (!Array.isArray(content)) {
    return null;
  }
  return (content as FsImageContent[]).find((item) => {
    return item?.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string";
  }) as Extract<FsImageContent, { type: "image" }> | undefined ?? null;
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function readPathWithFallback(kernel: KernelClient, target: string, path: string) {
  const result = await kernel.request("fs.read", withTarget(target, { path }));
  if (!result?.ok && target !== "gsv") {
    const fallbackPath = path.startsWith("/") ? path.replace(/^\/+/, "") || "." : `/${path}`;
    if (fallbackPath !== path) {
      const fallback = await kernel.request("fs.read", withTarget(target, { path: fallbackPath }));
      if (fallback?.ok) {
        return { path: fallbackPath, result: fallback };
      }
    }
  }
  return { path, result };
}

async function readBinaryArtifact(
  kernel: KernelClient,
  target: string,
  path: string,
  title: string | undefined,
): Promise<ViewerArtifact> {
  const stat = await kernel.request("fs.transfer.stat", withTarget(target, { path })) as TransferStatResult;
  if (!stat?.ok) {
    return {
      ok: false,
      target,
      path,
      title,
      contentType: inferContentType(path),
      error: stat?.error || `Unable to stat ${path}`,
    };
  }

  if (!stat.isFile) {
    return {
      ok: false,
      target,
      path: stat.path || path,
      title,
      contentType: stat.contentType || inferContentType(path),
      error: stat.isDirectory ? "Cannot open a directory as binary." : "Artifact is not a regular file.",
    };
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < stat.size) {
    const result = await kernel.request("fs.transfer.read", withTarget(target, {
      path: stat.path || path,
      offset,
      length: Math.min(TRANSFER_CHUNK_SIZE, stat.size - offset),
    })) as TransferReadResult;
    if (!result?.ok) {
      return {
        ok: false,
        target,
        path: stat.path || path,
        title,
        contentType: stat.contentType || inferContentType(path),
        error: result?.error || `Unable to read ${stat.path || path}`,
      };
    }
    if (result.bytesRead <= 0 && !result.eof) {
      return {
        ok: false,
        target,
        path: stat.path || path,
        title,
        contentType: stat.contentType || inferContentType(path),
        error: `Read zero bytes before EOF from ${stat.path || path}`,
      };
    }
    if (result.bytesRead > 0) {
      chunks.push(result.data);
      offset += result.bytesRead;
    }
    if (result.eof) {
      break;
    }
  }

  return {
    ok: true,
    kind: "blob",
    target,
    path: stat.path || path,
    title,
    contentType: stat.contentType || inferContentType(path),
    size: stat.size,
    chunks,
    encoding: "base64",
  };
}

export async function loadArtifact(kernel: KernelClient, input: ViewerRoute): Promise<ViewerArtifact> {
  const target = normalizeTarget(input.target);
  const requestedPath = normalizePath(input.path);
  const title = String(input.title ?? "").trim() || undefined;
  const typeHint = normalizeKind(input.type);

  if (!requestedPath) {
    return {
      ok: false,
      target,
      path: "",
      title,
      error: "Viewer requires a file path.",
    };
  }

  try {
    const { path, result } = await readPathWithFallback(kernel, target, requestedPath);
    const contentType = inferContentType(path);
    if (!result?.ok) {
      const publicMedia = publicUrlForPath(target, path, contentType, title);
      if (publicMedia) {
        return publicMedia;
      }
      return readBinaryArtifact(kernel, target, path, title);
    }

    if (Array.isArray(result.files) && Array.isArray(result.directories)) {
      return {
        ok: true,
        kind: "directory",
        target,
        path: result.path ?? path,
        title,
        files: result.files,
        directories: result.directories,
      };
    }

    const image = findImageContent(result.content);
    if (image) {
      return {
        ok: true,
        kind: "image",
        target,
        path: result.path ?? path,
        title,
        contentType: image.mimeType || contentType,
        size: typeof result.size === "number" ? result.size : undefined,
        data: image.data,
        mimeType: image.mimeType || contentType,
      };
    }

    if (typeof result.content !== "string") {
      return readBinaryArtifact(kernel, target, result.path ?? path, title);
    }

    const text = decodeNumberedText(result.content);
    const kind = inferKind(path, typeHint);
    if (kind === "image" && contentType === "image/svg+xml") {
      return {
        ok: true,
        kind: "image",
        target,
        path: result.path ?? path,
        title,
        contentType,
        size: typeof result.size === "number" ? result.size : undefined,
        data: encodeUtf8Base64(text),
        mimeType: contentType,
      };
    }

    return {
      ok: true,
      kind: kind === "image" ? "text" : kind,
      target,
      path: result.path ?? path,
      title,
      contentType,
      size: typeof result.size === "number" ? result.size : undefined,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      target,
      path: requestedPath,
      title,
      contentType: inferContentType(requestedPath),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
