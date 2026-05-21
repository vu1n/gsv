import { connectHost, openApp } from "@gsv/package/host";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { ViewerArtifact, ViewerBackend, ViewerRoute } from "./types";

type AppProps = {
  backend: ViewerBackend;
};

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; artifact: ViewerArtifact }
  | { status: "failed"; error: string };

export function App({ backend }: AppProps) {
  const route = useMemo(readRouteFromUrl, []);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let disposed = false;
    setState({ status: "loading" });
    void backend.loadArtifact(route)
      .then((artifact) => {
        if (!disposed) {
          setState({ status: "loaded", artifact });
        }
      })
      .catch((error) => {
        if (!disposed) {
          setState({ status: "failed", error: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      disposed = true;
    };
  }, [backend, route.path, route.target, route.title, route.type]);

  const windowTitle = useMemo(() => {
    if (state.status === "loaded") {
      return state.artifact.title || basename(state.artifact.path) || "Viewer";
    }
    return route.title || basename(route.path ?? "") || "Viewer";
  }, [route.path, route.title, state]);

  useEffect(() => {
    let disposed = false;
    void connectHost()
      .then(async (host) => {
        if (!disposed) {
          await host.setTitle(windowTitle);
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [windowTitle]);

  const artifact = state.status === "loaded" ? state.artifact : null;

  return (
    <main class="viewer-app">
      <header class="viewer-toolbar">
        <div class="viewer-title-block">
          <strong>{windowTitle}</strong>
          <span>{artifact ? formatLocation(artifact.target, artifact.path) : formatLocation(route.target || "gsv", route.path || "")}</span>
        </div>
        {artifact?.ok ? (
          <button type="button" class="viewer-secondary-action" onClick={() => openInFiles(artifact)}>
            Files
          </button>
        ) : null}
      </header>
      <section class="viewer-stage">
        {state.status === "loading" ? <StatusText text="Loading artifact..." /> : null}
        {state.status === "failed" ? <ErrorView title="Viewer failed" message={state.error} /> : null}
        {state.status === "loaded" ? <ArtifactView artifact={state.artifact} /> : null}
      </section>
    </main>
  );
}

function ArtifactView({ artifact }: { artifact: ViewerArtifact }) {
  if (!artifact.ok) {
    return <ErrorView title="Unable to open artifact" message={artifact.error} detail={artifact.contentType} />;
  }

  if (artifact.kind === "html") {
    return (
      <iframe
        class="viewer-html-frame"
        title={artifact.title || basename(artifact.path) || "HTML artifact"}
        sandbox="allow-forms allow-popups allow-scripts"
        srcdoc={artifact.text}
      />
    );
  }

  if (artifact.kind === "image") {
    return (
      <div class="viewer-image-wrap">
        <img src={`data:${artifact.mimeType};base64,${artifact.data}`} alt={artifact.title || artifact.path} />
      </div>
    );
  }

  if (artifact.kind === "directory") {
    return (
      <div class="viewer-directory">
        <p class="viewer-muted">Directory preview</p>
        <div class="viewer-directory-list">
          {artifact.directories.map((name) => <span key={`d:${name}`}>/{name}</span>)}
          {artifact.files.map((name) => <span key={`f:${name}`}>{name}</span>)}
        </div>
      </div>
    );
  }

  if (artifact.kind === "public") {
    if (artifact.contentType === "application/pdf") {
      return <iframe class="viewer-html-frame" title={artifact.title || basename(artifact.path) || "PDF"} src={artifact.url} />;
    }
    if (artifact.contentType.startsWith("video/")) {
      return (
        <div class="viewer-media-wrap">
          <video controls src={artifact.url} />
        </div>
      );
    }
    if (artifact.contentType.startsWith("audio/")) {
      return (
        <div class="viewer-audio-wrap">
          <audio controls src={artifact.url} />
        </div>
      );
    }
    return <ErrorView title="Unsupported public artifact" message="No preview available for this content type." detail={artifact.contentType} />;
  }

  if (artifact.kind === "blob") {
    return <BlobArtifactView artifact={artifact} />;
  }

  return <pre class="viewer-text">{artifact.text}</pre>;
}

function BlobArtifactView({ artifact }: { artifact: Extract<ViewerArtifact, { kind: "blob" }> }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; url: string }
    | { status: "failed"; error: string }
  >({ status: "loading" });

  useEffect(() => {
    let objectUrl = "";
    try {
      const parts = artifact.chunks.map(decodeBase64Chunk);
      const blob = new Blob(parts, { type: artifact.contentType || "application/octet-stream" });
      objectUrl = URL.createObjectURL(blob);
      setState({ status: "ready", url: objectUrl });
    } catch (error) {
      setState({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [artifact.chunks, artifact.contentType]);

  if (state.status === "loading") {
    return <StatusText text="Preparing preview..." />;
  }
  if (state.status === "failed") {
    return <ErrorView title="Unable to prepare preview" message={state.error} detail={artifact.contentType} />;
  }

  if (artifact.contentType === "application/pdf") {
    return <iframe class="viewer-html-frame" title={artifact.title || basename(artifact.path) || "PDF"} src={state.url} />;
  }
  if (artifact.contentType.startsWith("image/")) {
    return (
      <div class="viewer-image-wrap">
        <img src={state.url} alt={artifact.title || artifact.path} />
      </div>
    );
  }
  if (artifact.contentType.startsWith("video/")) {
    return (
      <div class="viewer-media-wrap">
        <video controls src={state.url} />
      </div>
    );
  }
  if (artifact.contentType.startsWith("audio/")) {
    return (
      <div class="viewer-audio-wrap">
        <audio controls src={state.url} />
      </div>
    );
  }

  return (
    <div class="viewer-binary-fallback">
      <strong>No preview available</strong>
      <span>{formatBytes(artifact.size)} binary file</span>
      <code>{artifact.contentType}</code>
    </div>
  );
}

function decodeBase64Chunk(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function StatusText({ text }: { text: string }) {
  return <p class="viewer-status">{text}</p>;
}

function ErrorView({ title, message, detail }: { title: string; message: string; detail?: string }) {
  return (
    <div class="viewer-error">
      <strong>{title}</strong>
      <span>{message}</span>
      {detail ? <code>{detail}</code> : null}
    </div>
  );
}

function readRouteFromUrl(): ViewerRoute {
  const params = new URL(window.location.href).searchParams;
  return {
    target: params.get("target") || undefined,
    path: params.get("path") || undefined,
    title: params.get("title") || undefined,
    type: params.get("type") || undefined,
  };
}

function openInFiles(artifact: Extract<ViewerArtifact, { ok: true }>): void {
  openApp({
    target: "files",
    payload: {
      target: artifact.target,
      path: parentPath(artifact.path),
      open: artifact.kind === "directory" ? undefined : artifact.path,
    },
  });
}

function formatLocation(target: string, path: string): string {
  return `${target || "gsv"}:${path || "/"}`;
}

function basename(path: string): string {
  const clean = String(path ?? "").replace(/\/+$/, "");
  const index = clean.lastIndexOf("/");
  return index >= 0 ? clean.slice(index + 1) : clean;
}

function parentPath(path: string): string {
  const clean = String(path ?? "").replace(/\/+$/, "");
  const index = clean.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return clean.slice(0, index);
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "";
  }
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = size;
  let unit = units[0];
  for (let index = 0; index < units.length - 1 && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index + 1];
  }
  const digits = value >= 10 || unit === "B" ? 0 : 1;
  return `${value.toFixed(digits)} ${unit}`;
}
