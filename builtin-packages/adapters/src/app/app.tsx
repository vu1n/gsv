import { AdaptersDetail } from "./components/detail/AdaptersDetail";
import { AccountsPane } from "./components/navigation/AccountsPane";
import { AdaptersPane } from "./components/navigation/AdaptersPane";
import { useAdaptersRuntime } from "./hooks/useAdaptersRuntime";
import type { AdapterKind, AdaptersBackend } from "./types";

export function App({ backend }: { backend: AdaptersBackend }) {
  const runtime = useAdaptersRuntime(backend);

  function selectAdapter(adapter: AdapterKind): void {
    runtime.setSelectedAdapter(adapter);
    runtime.clearMessages();
  }

  return (
    <div class="adapters-shell">
      <AdaptersPane
        state={runtime.state}
        selectedAdapter={runtime.selectedAdapter}
        onSelect={selectAdapter}
      />
      <AccountsPane
        adapterMeta={runtime.adapterMeta}
        accounts={runtime.accounts}
        loading={runtime.loading}
        error={runtime.error}
        selectedAccount={runtime.selectedAccount}
        onSelect={runtime.setSelectedAccount}
      />
      <AdaptersDetail runtime={runtime} />
    </div>
  );
}
