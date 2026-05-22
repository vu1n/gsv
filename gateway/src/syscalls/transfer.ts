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
  streamId?: number;
};

export type FsTransferReadResult =
  | {
      ok: true;
      path: string;
      offset: number;
      bytesRead: number;
      eof: boolean;
    }
  | { ok: false; error: string };

export type FsTransferWriteArgs = {
  path: string;
  offset?: number;
  expectedSize: number;
  contentType?: string;
  done?: boolean;
  streamId?: number;
};

export type FsTransferWriteResult =
  | {
      ok: true;
      path: string;
      offset: number;
      bytesWritten: number;
      done: boolean;
      contentType?: string;
    }
  | { ok: false; error: string };
