import type { AdapterMeta } from "../../domain/adapters";
import type { AdapterConnectChallenge, AdapterKind } from "../../types";
import { ChallengeSection } from "./ChallengeSection";

export function ConnectForm(props: {
  adapterMeta: AdapterMeta;
  selectedAdapter: AdapterKind;
  whatsappName: string;
  whatsappForce: boolean;
  discordName: string;
  discordToken: string;
  busy: boolean;
  challenge: AdapterConnectChallenge | null;
  onWhatsappName(value: string): void;
  onWhatsappForce(value: boolean): void;
  onDiscordName(value: string): void;
  onDiscordToken(value: string): void;
  onSubmit(event: Event): void;
}) {
  const {
    adapterMeta,
    selectedAdapter,
    whatsappName,
    whatsappForce,
    discordName,
    discordToken,
    busy,
    challenge,
    onWhatsappName,
    onWhatsappForce,
    onDiscordName,
    onDiscordToken,
    onSubmit,
  } = props;
  return (
    <>
      <section class="adapters-section">
        <header>
          <h3>Connect {adapterMeta.name}</h3>
          <p>{adapterMeta.detail}</p>
        </header>
        <form class="adapters-form" onSubmit={onSubmit}>
          <label>
            <span>Name</span>
            {selectedAdapter === "whatsapp" ? (
              <input type="text" value={whatsappName} onInput={(event) => onWhatsappName((event.currentTarget as HTMLInputElement).value)} placeholder={adapterMeta.accountPlaceholder} required />
            ) : (
              <input type="text" value={discordName} onInput={(event) => onDiscordName((event.currentTarget as HTMLInputElement).value)} placeholder={adapterMeta.accountPlaceholder} required />
            )}
          </label>

          {selectedAdapter === "whatsapp" ? (
            <label class="adapters-toggle-row">
              <input type="checkbox" checked={whatsappForce} onChange={(event) => onWhatsappForce((event.currentTarget as HTMLInputElement).checked)} />
              <span>Force a fresh QR session</span>
            </label>
          ) : (
            <label>
              <span>Bot token</span>
              <input type="password" value={discordToken} onInput={(event) => onDiscordToken((event.currentTarget as HTMLInputElement).value)} placeholder="Leave blank to use the deployment default" />
            </label>
          )}

          <div class="adapters-form-actions">
            <button type="submit" class="adapters-primary-button" disabled={busy}>
              {selectedAdapter === "whatsapp" ? "Open pairing flow" : "Connect bot"}
            </button>
          </div>
        </form>
      </section>

      {challenge ? <ChallengeSection adapter={adapterMeta.id} challenge={challenge} /> : null}
    </>
  );
}
