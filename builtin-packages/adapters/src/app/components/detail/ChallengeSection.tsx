import qrcode from "qrcode-generator";
import { useMemo } from "preact/hooks";
import type { AdapterConnectChallenge, AdapterKind } from "../../types";
import { formatTimestamp } from "../../utils/format";

export function ChallengeSection(props: { adapter: AdapterKind; challenge: AdapterConnectChallenge }) {
  const { adapter, challenge } = props;
  return (
    <section class="adapters-section">
      <header>
        <h3>{challenge.type === "qr" ? "Pair device" : "Next step"}</h3>
        <p>{challenge.message || `Complete the ${adapter} authentication flow, then refresh status.`}</p>
      </header>
      {challenge.type === "qr" && challenge.data ? (
        <div class="adapters-challenge-layout">
          <QrChallengeGraphic value={challenge.data} />
          <div class="adapters-challenge-copy">
            <strong>Pairing instructions</strong>
            <ol>
              <li>Open the app on your phone.</li>
              <li>Open linked devices.</li>
              <li>Scan the QR code shown here.</li>
            </ol>
          </div>
        </div>
      ) : null}
      {challenge.type !== "qr" && challenge.data ? <pre class="adapters-challenge-code">{challenge.data}</pre> : null}
      {challenge.expiresAt ? <p class="adapters-hint">Expires {formatTimestamp(challenge.expiresAt)}</p> : null}
    </section>
  );
}

function QrChallengeGraphic(props: { value: string }) {
  const graphic = useMemo(() => createQrChallengeGraphic(props.value), [props.value]);
  if (graphic.kind === "image") {
    return (
      <div class="adapters-challenge-graphic" aria-label="QR code">
        <img src={graphic.src} alt="QR code" />
      </div>
    );
  }
  if (graphic.kind === "svg") {
    return (
      <div
        class="adapters-challenge-graphic"
        aria-label="QR code"
        dangerouslySetInnerHTML={{ __html: graphic.markup }}
      />
    );
  }
  return <pre class="adapters-challenge-code">{props.value}</pre>;
}

function createQrChallengeGraphic(value: string):
  | { kind: "image"; src: string }
  | { kind: "svg"; markup: string }
  | { kind: "raw" } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: "raw" };
  }
  if (/^data:image\//i.test(trimmed)) {
    return { kind: "image", src: trimmed };
  }
  try {
    const code = qrcode(0, "M");
    code.addData(trimmed);
    code.make();
    return {
      kind: "svg",
      markup: code.createSvgTag({
        cellSize: 6,
        margin: 0,
        scalable: true,
      }),
    };
  } catch {
    return { kind: "raw" };
  }
}
