import { useEffect, useMemo, useState } from "preact/hooks";
import { EMPTY_STATE, getAdapterMeta } from "../domain/adapters";
import type {
  AdapterAccount,
  AdapterConnectChallenge,
  AdapterKind,
  AdaptersBackend,
  AdaptersState,
} from "../types";
import { formatError } from "../utils/format";
import { readAccountFromLocation, readAdapterFromLocation, writeLocation } from "../utils/location";

export type AdapterChallengeState = {
  adapter: AdapterKind;
  accountId: string;
  value: AdapterConnectChallenge;
};

export type AdaptersRuntime = {
  state: AdaptersState;
  loading: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  selectedAdapter: AdapterKind;
  selectedAccount: string;
  adapterMeta: ReturnType<typeof getAdapterMeta>;
  accounts: AdapterAccount[];
  currentAccount: AdapterAccount | null;
  visibleChallenge: AdapterConnectChallenge | null;
  whatsappName: string;
  whatsappForce: boolean;
  discordName: string;
  discordToken: string;
  setSelectedAdapter(adapter: AdapterKind): void;
  setSelectedAccount(accountId: string): void;
  setWhatsappName(value: string): void;
  setWhatsappForce(value: boolean): void;
  setDiscordName(value: string): void;
  setDiscordToken(value: string): void;
  clearMessages(): void;
  refresh(): Promise<void>;
  submitConnect(event: Event): Promise<void>;
  disconnectCurrentAccount(): Promise<void>;
};

export function useAdaptersRuntime(backend: AdaptersBackend): AdaptersRuntime {
  const [state, setState] = useState<AdaptersState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterKind>(readAdapterFromLocation());
  const [selectedAccount, setSelectedAccount] = useState<string>(readAccountFromLocation());
  const [challenge, setChallenge] = useState<AdapterChallengeState | null>(null);
  const [whatsappName, setWhatsappName] = useState("");
  const [whatsappForce, setWhatsappForce] = useState(false);
  const [discordName, setDiscordName] = useState("");
  const [discordToken, setDiscordToken] = useState("");

  const adapterMeta = useMemo(() => getAdapterMeta(selectedAdapter), [selectedAdapter]);
  const accounts = state.statusByAdapter[selectedAdapter] ?? [];
  const currentAccount = selectedAccount === "new"
    ? null
    : accounts.find((account) => account.accountId === selectedAccount) ?? null;
  const visibleChallenge = challenge
    && challenge.adapter === selectedAdapter
    && challenge.accountId === (currentAccount?.accountId ?? selectedAccount)
    ? challenge.value
    : null;

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const preferred = selectedAccount.trim();
    if (preferred && preferred !== "new" && accounts.some((account) => account.accountId === preferred)) {
      return;
    }
    if (preferred === "new") {
      return;
    }
    setSelectedAccount(accounts[0]?.accountId ?? "new");
  }, [selectedAdapter, accounts]);

  useEffect(() => {
    writeLocation(selectedAdapter, selectedAccount);
  }, [selectedAdapter, selectedAccount]);

  useEffect(() => {
    if (!whatsappName) {
      setWhatsappName("primary");
    }
    if (!discordName) {
      setDiscordName("main");
    }
  }, []);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const next = await backend.loadState();
      setState(next);
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setLoading(false);
    }
  }

  async function runMutation(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitConnect(event: Event): Promise<void> {
    event.preventDefault();
    await runMutation(async () => {
      const accountId = selectedAdapter === "whatsapp" ? whatsappName.trim() : discordName.trim();
      const config = selectedAdapter === "whatsapp"
        ? { force: whatsappForce }
        : discordToken.trim()
          ? { botToken: discordToken.trim() }
          : undefined;
      const result = await backend.connectAccount({
        adapter: selectedAdapter,
        accountId,
        config,
      });
      setNotice(result.statusText);
      if (result.challenge) {
        setChallenge({ adapter: selectedAdapter, accountId, value: result.challenge });
      } else {
        setChallenge(null);
      }
      if (!result.ok) {
        setError(result.error || result.statusText);
        return;
      }
      if (selectedAdapter === "discord") {
        setDiscordToken("");
      }
      await refresh();
      setSelectedAccount(accountId);
    });
  }

  async function disconnectCurrentAccount(): Promise<void> {
    if (!currentAccount) return;
    await runMutation(async () => {
      const result = await backend.disconnectAccount({
        adapter: selectedAdapter,
        accountId: currentAccount.accountId,
      });
      setNotice(result.statusText);
      if (!result.ok) {
        setError(result.error || result.statusText);
        return;
      }
      setChallenge(null);
      await refresh();
      setSelectedAccount("new");
    });
  }

  function clearMessages(): void {
    setNotice(null);
    setError(null);
  }

  return {
    state,
    loading,
    busy,
    error,
    notice,
    selectedAdapter,
    selectedAccount,
    adapterMeta,
    accounts,
    currentAccount,
    visibleChallenge,
    whatsappName,
    whatsappForce,
    discordName,
    discordToken,
    setSelectedAdapter,
    setSelectedAccount,
    setWhatsappName,
    setWhatsappForce,
    setDiscordName,
    setDiscordToken,
    clearMessages,
    refresh,
    submitConnect,
    disconnectCurrentAccount,
  };
}
