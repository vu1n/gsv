import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessIdentity } from "@gsv/protocol/syscalls/system";
import type { ResponseFrame } from "../protocol/frames";
import type { ProcIpcSendResult } from "../syscalls/proc";
import type { KernelContext } from "./context";

vi.mock("../shared/utils", () => ({
  sendFrameToProcess: vi.fn(),
}));

import { sendFrameToProcess } from "../shared/utils";
import { handleProcIpcCall, handleProcSpawn } from "./proc-handlers";

const IDENTITY: ProcessIdentity = {
  uid: 1000,
  gid: 1000,
  gids: [1000],
  username: "sam",
  home: "/home/sam",
  cwd: "/home/sam",
  workspaceId: null,
};

const sendFrameToProcessMock = vi.mocked(sendFrameToProcess);

describe("proc handlers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("cleans up pending IPC call when delivery returns an error response", async () => {
    sendFrameToProcessMock.mockResolvedValue({
      type: "res",
      id: "deliver",
      ok: false,
      error: { code: 500, message: "target rejected delivery" },
    } satisfies ResponseFrame);

    const { ctx, ipcCalls } = makeIpcCallContext();
    const result = await handleProcIpcCall({
      pid: "target-process",
      message: "bounded work",
    }, ctx);

    expect(result).toEqual({ ok: false, error: "target rejected delivery" });
    const callId = ipcCalls.create.mock.calls[0]?.[0]?.callId;
    expect(callId).toBeTruthy();
    expect(ipcCalls.remove).toHaveBeenCalledWith(callId);
    expect(ipcCalls.attachRun).not.toHaveBeenCalled();
    expect(ctx.scheduleIpcCallTimeout).not.toHaveBeenCalled();
  });

  it("cleans up pending IPC call when delivery reports failure", async () => {
    sendFrameToProcessMock.mockResolvedValue({
      type: "res",
      id: "deliver",
      ok: true,
      data: { ok: false, error: "target unavailable" } satisfies ProcIpcSendResult,
    } satisfies ResponseFrame);

    const { ctx, ipcCalls } = makeIpcCallContext();
    const result = await handleProcIpcCall({
      pid: "target-process",
      message: "bounded work",
    }, ctx);

    expect(result).toEqual({ ok: false, error: "target unavailable" });
    const callId = ipcCalls.create.mock.calls[0]?.[0]?.callId;
    expect(callId).toBeTruthy();
    expect(ipcCalls.remove).toHaveBeenCalledWith(callId);
    expect(ipcCalls.attachRun).not.toHaveBeenCalled();
    expect(ctx.scheduleIpcCallTimeout).not.toHaveBeenCalled();
  });

  it("uses disambiguated package source mount paths", async () => {
    const pkgA = makePackage("pkg-a", "Demo Tool", "sam/demo-a");
    const pkgB = makePackage("pkg-b", "demo-tool", "sam/demo-b");
    const ctx = {
      env: {},
      identity: {
        process: IDENTITY,
        capabilities: ["*"],
      },
      procs: {
        get: vi.fn(() => null),
        spawn: vi.fn(),
      },
      workspaces: {
        get: vi.fn(),
        touch: vi.fn(),
      },
      packages: {
        resolve: vi.fn((packageId: string) => {
          if (packageId === "pkg-a") return pkgA;
          if (packageId === "pkg-b") return pkgB;
          return null;
        }),
        list: vi.fn(() => [pkgA, pkgB]),
      },
    } as unknown as KernelContext;

    const result = await handleProcSpawn({
      profile: "task",
      mounts: [
        { kind: "package-source", packageId: "pkg-a" },
        { kind: "package-source", packageId: "pkg-b" },
      ],
    }, ctx);

    expect(result).toMatchObject({
      ok: true,
      cwd: "/src/packages/demo-tool--sam-demo-a",
    });
    expect(ctx.procs.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cwd: "/src/packages/demo-tool--sam-demo-a" }),
      expect.objectContaining({
        mounts: [
          expect.objectContaining({
            packageId: "pkg-a",
            mountPath: "/src/packages/demo-tool--sam-demo-a",
          }),
          expect.objectContaining({
            packageId: "pkg-b",
            mountPath: "/src/packages/demo-tool--sam-demo-b",
          }),
        ],
      }),
    );
    expect(sendFrameToProcessMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      call: "proc.setidentity",
    }));
  });
});

function makeIpcCallContext() {
  const ipcCalls = {
    create: vi.fn(),
    remove: vi.fn(),
    attachRun: vi.fn(),
  };
  const ctx = {
    processId: "source-process",
    identity: { process: IDENTITY },
    procs: {
      get: vi.fn((pid: string) => {
        if (pid === "source-process") return { uid: IDENTITY.uid, workspaceId: null };
        if (pid === "target-process") return { uid: IDENTITY.uid, workspaceId: null };
        return undefined;
      }),
    },
    workspaces: {
      touch: vi.fn(),
    },
    ipcCalls,
    scheduleIpcCallTimeout: vi.fn(async () => "timeout-schedule"),
  } as unknown as KernelContext;

  return { ctx, ipcCalls };
}

function makePackage(packageId: string, name: string, repo: string) {
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
  };
}
