export type AdapterKind = "whatsapp" | "discord";

export type AdapterAccount = {
  accountId: string;
  connected: boolean;
  authenticated: boolean;
  mode?: string;
  lastActivity?: number;
  error?: string;
  extra?: Record<string, unknown>;
};

export type AdapterConnectChallenge = {
  type: string;
  message?: string;
  data?: string;
  expiresAt?: number;
  extra?: Record<string, unknown>;
};

export type AdaptersState = {
  statusByAdapter: Record<AdapterKind, AdapterAccount[]>;
};

export type AdapterMutationResult = {
  ok: boolean;
  adapter: AdapterKind;
  accountId: string;
  connected?: boolean;
  authenticated?: boolean;
  statusText: string;
  error?: string;
  challenge?: AdapterConnectChallenge;
};

export type ConnectAdapterArgs = {
  adapter: AdapterKind;
  accountId: string;
  config?: Record<string, unknown>;
};

export type DisconnectAdapterArgs = {
  adapter: AdapterKind;
  accountId: string;
};

export type IntegrationKind = "message-adapters" | "mcp-servers";
