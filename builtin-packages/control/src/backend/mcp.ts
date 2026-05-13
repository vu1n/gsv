import type { KernelClientLike } from "@gsv/package/backend";
import type {
  SysMcpAddResult,
  SysMcpListResult,
  SysMcpRefreshResult,
  SysMcpServerSummary,
  SysMcpToolSummary,
  SysMcpTransportType,
} from "@gsv/protocol/syscalls/system";
import type {
  AddMcpServerArgs,
  ControlMcpServer,
  ControlMcpTool,
  ControlMcpTransportType,
  RefreshMcpServerArgs,
  RemoveMcpServerArgs,
} from "../app/types";
import { normalizeOptional, normalizeRequired } from "./args";

export type ControlMcpState = {
  mcpServers: ControlMcpServer[];
};

export async function loadMcpState(kernel: KernelClientLike): Promise<ControlMcpState> {
  const result = await kernel.request("sys.mcp.list", {} as Record<string, never>) as SysMcpListResult;
  return {
    mcpServers: normalizeMcpServers(result.servers),
  };
}

export async function addMcpServer(
  kernel: KernelClientLike,
  args: AddMcpServerArgs,
): Promise<ControlMcpServer> {
  const transport = normalizeMcpTransport(args.transport);
  const result = await kernel.request("sys.mcp.add", {
    name: normalizeRequired(args.name, "name"),
    url: normalizeRequired(args.url, "url"),
    callbackHost: normalizeOptional(args.callbackHost),
    transport: { type: transport },
  }) as SysMcpAddResult;

  return normalizeMcpServer(result.server);
}

export async function refreshMcpServer(
  kernel: KernelClientLike,
  args: RefreshMcpServerArgs,
): Promise<ControlMcpServer | null> {
  const result = await kernel.request("sys.mcp.refresh", {
    serverId: normalizeRequired(args.serverId, "serverId"),
  }) as SysMcpRefreshResult;

  return result.server ? normalizeMcpServer(result.server) : null;
}

export async function removeMcpServer(
  kernel: KernelClientLike,
  args: RemoveMcpServerArgs,
): Promise<void> {
  await kernel.request("sys.mcp.remove", {
    serverId: normalizeRequired(args.serverId, "serverId"),
  });
}

function normalizeMcpServers(servers: SysMcpServerSummary[]): ControlMcpServer[] {
  return servers
    .map(normalizeMcpServer)
    .sort((left, right) => {
      const stateRank = mcpStateRank(left.state) - mcpStateRank(right.state);
      return stateRank === 0 ? right.updatedAt - left.updatedAt : stateRank;
    });
}

function normalizeMcpServer(server: SysMcpServerSummary): ControlMcpServer {
  return {
    serverId: server.serverId,
    uid: server.uid,
    name: server.name,
    url: server.url,
    transport: server.transport,
    state: server.state,
    authUrl: server.authUrl,
    error: server.error,
    instructions: server.instructions,
    tools: server.tools.map(normalizeMcpTool),
    resourceCount: server.resourceCount,
    promptCount: server.promptCount,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

function normalizeMcpTool(tool: SysMcpToolSummary): ControlMcpTool {
  return {
    name: tool.name,
    description: tool.description,
    inputFields: schemaFields(tool.inputSchema),
    requiredInputFields: schemaRequiredFields(tool.inputSchema),
    outputFields: schemaFields(tool.outputSchema),
    hasInputSchema: tool.inputSchema !== null,
    hasOutputSchema: tool.outputSchema !== null,
  };
}

function normalizeMcpTransport(input: ControlMcpTransportType): SysMcpTransportType {
  return input === "streamable-http" || input === "sse" ? input : "auto";
}

function mcpStateRank(state: ControlMcpServer["state"]): number {
  switch (state) {
    case "authenticating":
      return 0;
    case "failed":
      return 1;
    case "connecting":
    case "connected":
    case "discovering":
      return 2;
    case "ready":
      return 3;
    default:
      return 4;
  }
}

function schemaFields(schema: Record<string, unknown> | null): string[] {
  const properties = schema?.properties;
  if (!isRecord(properties)) {
    return [];
  }
  return Object.keys(properties).sort((left, right) => left.localeCompare(right));
}

function schemaRequiredFields(schema: Record<string, unknown> | null): string[] {
  return Array.isArray(schema?.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
