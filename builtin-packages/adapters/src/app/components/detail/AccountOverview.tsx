import { describeAccount } from "../../domain/adapters";
import type { AdapterMeta } from "../../domain/adapters";
import type { AdapterAccount, AdapterConnectChallenge } from "../../types";
import { formatTimestamp } from "../../utils/format";
import { ChallengeSection } from "./ChallengeSection";

export function AccountOverview(props: {
  adapterMeta: AdapterMeta;
  account: AdapterAccount;
  challenge: AdapterConnectChallenge | null;
}) {
  const { adapterMeta, account, challenge } = props;
  return (
    <>
      <section class="adapters-section">
        <header>
          <h3>Overview</h3>
          <p>Connection health and the last known account state.</p>
        </header>
        <div class="adapters-info-grid">
          <article>
            <span>Connection</span>
            <strong>{account.connected ? "Connected" : "Offline"}</strong>
          </article>
          <article>
            <span>Authentication</span>
            <strong>{account.authenticated ? "Authenticated" : "Needs attention"}</strong>
          </article>
          <article>
            <span>Mode</span>
            <strong>{account.mode || "Unknown"}</strong>
          </article>
          <article>
            <span>Last activity</span>
            <strong>{formatTimestamp(account.lastActivity)}</strong>
          </article>
        </div>
        {account.error ? <p class="adapters-inline-status is-error">{account.error}</p> : null}
      </section>

      <section class="adapters-section">
        <header>
          <h3>Identity</h3>
          <p>Account details GSV currently knows about this adapter session.</p>
        </header>
        <dl class="adapters-property-list">
          {describeAccount(adapterMeta.id, account).map(([label, value]) => (
            <div class="adapters-property-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {challenge ? (
        <ChallengeSection adapter={adapterMeta.id} challenge={challenge} />
      ) : null}
    </>
  );
}
