export type ViewerKind = "text" | "html" | "image";

export type ViewerRoute = {
  target?: string;
  path?: string;
  title?: string;
  type?: string;
};

export type ViewerArtifact =
  | {
      ok: true;
      kind: "text" | "html";
      target: string;
      path: string;
      title?: string;
      contentType?: string;
      size?: number;
      text: string;
    }
  | {
      ok: true;
      kind: "image";
      target: string;
      path: string;
      title?: string;
      contentType?: string;
      size?: number;
      data: string;
      mimeType: string;
    }
  | {
      ok: true;
      kind: "directory";
      target: string;
      path: string;
      title?: string;
      files: string[];
      directories: string[];
    }
  | {
      ok: true;
      kind: "public";
      target: string;
      path: string;
      title?: string;
      contentType: string;
      url: string;
    }
  | {
      ok: false;
      target: string;
      path: string;
      title?: string;
      contentType?: string;
      error: string;
    };

export type ViewerBackend = {
  loadArtifact(args: ViewerRoute): Promise<ViewerArtifact>;
};
