import { getAccountStatus, getAccountTone } from "../../domain/adapters";
import type { AdapterMeta } from "../../domain/adapters";
import type { AdapterAccount } from "../../types";

export function AccountsPane(props: {
  adapterMeta: AdapterMeta;
  accounts: AdapterAccount[];
  loading: boolean;
  error: string | null;
  selectedAccount: string;
  onSelect(accountId: string): void;
}) {
  const { adapterMeta, accounts, loading, error, selectedAccount, onSelect } = props;
  return (
    <aside class="adapters-pane adapters-pane--secondary">
      <header class="adapters-pane-head adapters-pane-head--tight">
        <div>
          <h2>{adapterMeta.name}</h2>
          <p>{adapterMeta.detail}</p>
        </div>
        <button
          type="button"
          class={`adapters-icon-button${selectedAccount === "new" ? " is-active" : ""}`}
          onClick={() => onSelect("new")}
          title="New connection"
          aria-label="New connection"
        >
          +
        </button>
      </header>
      <div class="account-list">
        <button
          type="button"
          class={`account-row${selectedAccount === "new" ? " is-active" : ""}`}
          onClick={() => onSelect("new")}
        >
          <span class="account-row-icon">+</span>
          <span class="account-row-copy">
            <strong>New connection</strong>
            <span>{adapterMeta.detail}</span>
          </span>
        </button>
        {loading ? (
          <div class="account-list-status">Loading accounts...</div>
        ) : accounts.length === 0 ? (
          <div class="account-list-status">{error ? "Status unavailable." : "No accounts connected yet."}</div>
        ) : (
          accounts.map((account) => {
            const status = getAccountStatus(account);
            return (
              <button
                key={account.accountId}
                type="button"
                class={`account-row${selectedAccount === account.accountId ? " is-active" : ""}`}
                onClick={() => onSelect(account.accountId)}
                title={`${account.accountId} - ${status}`}
              >
                <span class="account-row-icon">{adapterMeta.icon}</span>
                <span class="account-row-copy">
                  <strong>{account.accountId}</strong>
                  <span>{status}</span>
                </span>
                <span class={`adapter-dot ${getAccountTone(account)}`}></span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
