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

export type FsTransferSendArgs = {
  path: string;
  streamId?: number;
  chunkSize?: number;
};

export type FsTransferSendResult =
  | {
      ok: true;
      path: string;
      size: number;
      bytesSent: number;
      contentType?: string;
    }
  | { ok: false; error: string };

export type FsTransferReceiveArgs = {
  path: string;
  expectedSize: number;
  contentType?: string;
  streamId?: number;
};

export type FsTransferReceiveResult =
  | {
      ok: true;
      path: string;
      bytesWritten: number;
      contentType?: string;
    }
  | { ok: false; error: string };
