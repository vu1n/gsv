import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KernelContext } from "../context";
import type { McpServerRecord } from "../mcp-store";
import {
  handleSysMcpAdd,
  handleSysMcpCall,
  handleSysMcpList,
  handleSysMcpRemove,
} from "./mcp";

type FakeMcpServers = {
  records: Map<string, McpServerRecord>;
  upsert: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  findByUidUrl: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeContext(uid: number, mcpServers: FakeMcpServers): KernelContext {
  return {
    identity: {
      role: "user",
      process: {
        uid,
        gid: uid,
        gids: [uid],
        username: uid === 0 ? "root" : `user${uid}`,
        home: uid === 0 ? "/root" : `/home/user${uid}`,
        cwd: uid === 0 ? "/root" : `/home/user${uid}`,
        workspaceId: null,
      },
      capabilities: ["*"],
    },
    mcpServers,
    mcp: {
      mcpConnections: {},
      listServers: vi.fn(() => []),
      listTools: vi.fn(() => []),
      listResources: vi.fn(() => []),
      listPrompts: vi.fn(() => []),
    },
    addMcpServerConnection: vi.fn(async () => ({
      id: "server-1",
      state: "ready",
    })),
    removeMcpServerConnection: vi.fn(async () => undefined),
    callMcpTool: vi.fn(async () => ({
      content: [{ type: "text", text: "ok" }],
    })),
  } as unknown as KernelContext;
}

function createFakeMcpServers(): FakeMcpServers {
  const fake: FakeMcpServers = {
    records: new Map(),
    upsert: vi.fn((input) => {
      const existing = fake.records.get(input.serverId);
      const now = input.now ?? 1_700_000_000_000;
      const record: McpServerRecord = {
        serverId: input.serverId,
        uid: input.uid,
        name: input.name,
        url: input.url,
        transport: input.transport,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      fake.records.set(record.serverId, record);
      return record;
    }),
    get: vi.fn((serverId) => fake.records.get(serverId) ?? null),
    findByUidUrl: vi.fn((uid, url) =>
      [...fake.records.values()].find((record) => record.uid === uid && record.url === url) ?? null
    ),
    list: vi.fn((uid) =>
      [...fake.records.values()].filter((record) => uid === undefined || record.uid === uid)
    ),
    delete: vi.fn((serverId, uid) => {
      const record = fake.records.get(serverId);
      if (!record || (uid !== undefined && record.uid !== uid)) return false;
      return fake.records.delete(serverId);
    }),
  };
  return fake;
}

describe("sys.mcp handlers", () => {
  let mcpServers: FakeMcpServers;

  beforeEach(() => {
    mcpServers = createFakeMcpServers();
  });

  it("adds a user-scoped MCP server through the connection manager", async () => {
    const ctx = makeContext(1000, mcpServers);

    const result = await handleSysMcpAdd({
      name: "GitHub",
      url: "https://mcp.example.com/mcp",
      callbackHost: "https://gsv.example.com",
      transport: { type: "streamable-http" },
    }, ctx);

    expect(ctx.addMcpServerConnection).toHaveBeenCalledWith(expect.objectContaining({
      uid: 1000,
      name: "GitHub",
      url: "https://mcp.example.com/mcp",
      callbackHost: "https://gsv.example.com",
      transport: { type: "streamable-http" },
    }));
    expect(result.server).toMatchObject({
      serverId: "server-1",
      uid: 1000,
      name: "GitHub",
    });
  });

  it("rejects non-root MCP add for another uid", async () => {
    const ctx = makeContext(1000, mcpServers);

    await expect(handleSysMcpAdd({
      uid: 1001,
      name: "GitHub",
      url: "https://mcp.example.com/mcp",
    }, ctx)).rejects.toThrow("Permission denied: cannot add MCP servers for another user");
    expect(ctx.addMcpServerConnection).not.toHaveBeenCalled();
  });

  it("rejects non-local plain HTTP MCP servers", async () => {
    const ctx = makeContext(1000, mcpServers);

    await expect(handleSysMcpAdd({
      name: "Insecure",
      url: "http://mcp.example.com/mcp",
    }, ctx)).rejects.toThrow("url must use https");
    expect(ctx.addMcpServerConnection).not.toHaveBeenCalled();
  });

  it("lists and removes only caller-owned MCP servers", async () => {
    const ctx = makeContext(1000, mcpServers);
    mcpServers.upsert({
      serverId: "server-1",
      uid: 1000,
      name: "Owned",
      url: "https://owned.example.com/mcp",
      transport: "auto",
    });
    mcpServers.upsert({
      serverId: "server-2",
      uid: 1001,
      name: "Other",
      url: "https://other.example.com/mcp",
      transport: "auto",
    });

    expect(handleSysMcpList({}, ctx).servers.map((server) => server.serverId)).toEqual(["server-1"]);
    expect(await handleSysMcpRemove({ serverId: "server-2" }, ctx)).toEqual({ removed: false });
    expect(await handleSysMcpRemove({ serverId: "server-1" }, ctx)).toEqual({ removed: true });
    expect(ctx.removeMcpServerConnection).toHaveBeenCalledWith("server-1");
  });

  it("calls only caller-owned MCP tools", async () => {
    const ctx = makeContext(1000, mcpServers);
    mcpServers.upsert({
      serverId: "server-1",
      uid: 1000,
      name: "Owned",
      url: "https://owned.example.com/mcp",
      transport: "auto",
    });

    const result = await handleSysMcpCall({
      serverId: "server-1",
      name: "lookup",
      arguments: { query: "test" },
    }, ctx);

    expect(ctx.callMcpTool).toHaveBeenCalledWith("server-1", "lookup", { query: "test" });
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
    await expect(handleSysMcpCall({
      serverId: "missing",
      name: "lookup",
    }, ctx)).rejects.toThrow("MCP server not found");
  });
});
