export type FsTransferStatArgs = {
  path: string;
};

export type FsTransferStatResult =
  | {
      ok: true;
      path: string;
      size: number;
      isFile: boolean;
      isDirectory: boolean;
      contentType?: string;
    }
  | { ok: false; error: string };

export type FsTransferReadArgs = {
  path: string;
  offset?: number;
  length?: number;
};

export type FsTransferReadResult =
  | {
      ok: true;
      path: string;
      offset: number;
      bytesRead: number;
      data: string;
      eof: boolean;
    }
  | { ok: false; error: string };
