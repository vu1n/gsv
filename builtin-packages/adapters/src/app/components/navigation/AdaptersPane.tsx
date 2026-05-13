import { ADAPTERS, getAdapterTone } from "../../domain/adapters";
import type { AdapterKind, AdaptersState } from "../../types";

export function AdaptersPane(props: {
  state: AdaptersState;
  selectedAdapter: AdapterKind;
  onSelect(adapter: AdapterKind): void;
}) {
  const { state, selectedAdapter, onSelect } = props;
  return (
    <aside class="adapters-pane adapters-pane--primary">
      <header class="adapters-pane-head">
        <div>
          <h1>Adapters</h1>
          <p>Connect message surfaces that can route conversations into GSV.</p>
        </div>
      </header>
      <nav class="adapters-list" aria-label="Adapters">
        {ADAPTERS.map((adapter) => {
          const adapterAccounts = state.statusByAdapter[adapter.id] ?? [];
          const tone = getAdapterTone(adapterAccounts);
          return (
            <button
              key={adapter.id}
              type="button"
              class={`adapter-row${selectedAdapter === adapter.id ? " is-active" : ""}`}
              onClick={() => onSelect(adapter.id)}
            >
              <span class="adapter-row-icon">{adapter.icon}</span>
              <span class="adapter-row-copy">
                <strong>{adapter.name}</strong>
                <span>{adapter.summary}</span>
              </span>
              <span class={`adapter-dot ${tone}`}></span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
