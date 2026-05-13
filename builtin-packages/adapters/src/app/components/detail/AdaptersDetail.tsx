import type { AdaptersRuntime } from "../../hooks/useAdaptersRuntime";
import { AccountOverview } from "./AccountOverview";
import { ConnectForm } from "./ConnectForm";

export function AdaptersDetail(props: { runtime: AdaptersRuntime }) {
  const { runtime } = props;
  const {
    adapterMeta,
    busy,
    currentAccount,
    discordName,
    discordToken,
    error,
    loading,
    notice,
    selectedAdapter,
    visibleChallenge,
    whatsappForce,
    whatsappName,
  } = runtime;
  return (
    <main class="adapters-detail">
      <header class="adapters-detail-head">
        <div>
          <span class="adapters-kicker">{adapterMeta.name}</span>
          <h2>{currentAccount ? currentAccount.accountId : "New connection"}</h2>
        </div>
        <div class="adapters-actions">
          <button type="button" class="adapters-icon-button" onClick={() => void runtime.refresh()} disabled={loading || busy} title="Refresh status" aria-label="Refresh status">
            R
          </button>
          {currentAccount ? (
            <button type="button" class="adapters-icon-button" onClick={() => void runtime.disconnectCurrentAccount()} disabled={busy} title="Disconnect" aria-label="Disconnect">
              X
            </button>
          ) : null}
        </div>
      </header>

      <div class="adapters-detail-body">
        {loading ? <div class="adapters-empty-state">Loading adapter status...</div> : null}
        {!loading && error ? <div class="adapters-inline-status is-error">{error}</div> : null}
        {!loading && !error && notice ? <div class="adapters-inline-status is-info">{notice}</div> : null}

        {!loading ? (
          currentAccount ? (
            <AccountOverview
              adapterMeta={adapterMeta}
              account={currentAccount}
              challenge={visibleChallenge}
            />
          ) : (
            <ConnectForm
              adapterMeta={adapterMeta}
              selectedAdapter={selectedAdapter}
              whatsappName={whatsappName}
              whatsappForce={whatsappForce}
              discordName={discordName}
              discordToken={discordToken}
              busy={busy}
              challenge={visibleChallenge}
              onWhatsappName={runtime.setWhatsappName}
              onWhatsappForce={runtime.setWhatsappForce}
              onDiscordName={runtime.setDiscordName}
              onDiscordToken={runtime.setDiscordToken}
              onSubmit={(event) => void runtime.submitConnect(event)}
            />
          )
        ) : null}
      </div>
    </main>
  );
}
