import type { WikiMode } from "../../types";

const WIKI_MODES: WikiMode[] = ["browse", "edit", "build", "ingest", "inbox"];

type Props = {
  mode: WikiMode;
  onChangeMode(mode: WikiMode): void;
};

export function WikiHeader({ mode, onChangeMode }: Props) {
  return (
    <header class="wiki-header">
      <div class="wiki-header-copy">
        <h1>Wiki</h1>
        <p>Browse knowledge, edit canonical pages, build from source directories, and review inbox material.</p>
      </div>
      <div class="wiki-mode-tabs">
        {WIKI_MODES.map((tab) => (
          <button key={tab} type="button" class={`wiki-mode-tab${mode === tab ? " is-active" : ""}`} onClick={() => onChangeMode(tab)}>
            {labelForMode(tab)}
          </button>
        ))}
      </div>
    </header>
  );
}

function labelForMode(mode: WikiMode): string {
  if (mode === "browse") return "Browse";
  if (mode === "edit") return "Edit";
  if (mode === "build") return "Build";
  if (mode === "ingest") return "Ingest";
  return "Inbox";
}
