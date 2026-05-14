import { buildWikiHref, type WikiRoute } from "../../domain/route";
import { displayTitleFromPath } from "../../domain/wiki-model";
import { buildEntryHref } from "../../markdown";
import type { WikiDb, WikiEntry, WikiMode, WikiWorkspaceState } from "../../types";

type Props = {
  mode: WikiMode;
  state: WikiWorkspaceState;
  route: WikiRoute;
  selectedDb: string;
  activeDb: WikiDb | undefined;
  visiblePages: WikiEntry[];
  selectedInboxPath: string;
  mutating: boolean;
  searchDraft: string;
  askDraft: string;
  onOpenDb(db: string): void;
  onOpenPage(path: string): void;
  onOpenInboxNote(path: string): void;
  onCompileSelectedInbox(): Promise<void> | void;
  onNewPage(): void;
  onSearchDraftChange(value: string): void;
  onAskDraftChange(value: string): void;
  onApplySearch(event: Event): void;
  onApplyAsk(event: Event): void;
};

export function WikiRail(props: Props) {
  return (
    <aside class="wiki-rail">
      <section class="wiki-rail-section">
        <h2>Databases</h2>
        <div class="wiki-db-list">
          {props.state.dbs.map((db) => (
            <a
              key={db.id}
              href={buildWikiHref(props.mode, { ...props.route, db: db.id, path: db.id ? `${db.id}/index.md` : undefined })}
              class={`wiki-db-row${props.selectedDb === db.id ? " is-active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                props.onOpenDb(db.id);
              }}
            >
              <strong title={db.title || db.id}>{db.title || db.id}</strong>
              <span title={db.id}>{db.id}</span>
            </a>
          ))}
          {props.state.dbs.length === 0 ? <div class="wiki-empty wiki-empty--compact">No databases yet.</div> : null}
        </div>
        {props.selectedDb ? (
          <div class="wiki-current-context">
            <span>Active source</span>
            <strong title={props.activeDb?.title || props.selectedDb}>{props.activeDb?.title || props.selectedDb}</strong>
            <code title={props.state.selectedPath || props.selectedDb}>{props.state.selectedPath || props.selectedDb}</code>
          </div>
        ) : null}
      </section>

      {(props.mode === "browse" || props.mode === "edit") ? (
        <>
          <section class="wiki-rail-section">
            <h2>Search</h2>
            <form class="wiki-inline-form" onSubmit={props.onApplySearch}>
              <input value={props.searchDraft} onInput={(event) => props.onSearchDraftChange((event.currentTarget as HTMLInputElement).value)} placeholder="Search pages" />
              <button type="submit">Search</button>
            </form>
            <form class="wiki-inline-form" onSubmit={props.onApplyAsk}>
              <input value={props.askDraft} onInput={(event) => props.onAskDraftChange((event.currentTarget as HTMLInputElement).value)} placeholder="Ask the wiki" />
              <button type="submit">Ask</button>
            </form>
          </section>
          <section class="wiki-rail-section wiki-rail-section--fill">
            <div class="wiki-section-head">
              <h2>{props.state.searchMatches ? "Matches" : "Pages"}</h2>
              <button type="button" class="wiki-link-button" onClick={props.onNewPage}>New page</button>
            </div>
            <div class="wiki-entry-list">
              {props.visiblePages.map((entry) => (
                <a
                  key={entry.path}
                  href={buildEntryHref("/apps/wiki", props.selectedDb, entry.path)}
                  class={`wiki-entry-row${props.state.selectedPath === entry.path ? " is-active" : ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    props.onOpenPage(entry.path);
                  }}
                >
                  <strong title={entry.title || displayTitleFromPath(entry.path)}>{entry.title || displayTitleFromPath(entry.path)}</strong>
                  <span title={entry.path}>{entry.path}</span>
                </a>
              ))}
              {props.visiblePages.length === 0 ? (
                <div class="wiki-empty wiki-empty--compact">{props.state.searchMatches ? "No pages matched this search." : "No pages in this database yet."}</div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {props.mode === "inbox" ? (
        <section class="wiki-rail-section wiki-rail-section--fill">
          <div class="wiki-section-head">
            <h2>Inbox</h2>
            <button type="button" class="wiki-link-button" onClick={() => void props.onCompileSelectedInbox()} disabled={props.mutating || !props.selectedInboxPath}>Compile</button>
          </div>
          <div class="wiki-entry-list">
            {props.state.inbox.map((entry) => (
              <a
                key={entry.path}
                href={buildEntryHref("/apps/wiki", props.selectedDb, entry.path)}
                class={`wiki-entry-row${props.selectedInboxPath === entry.path ? " is-active" : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  props.onOpenInboxNote(entry.path);
                }}
              >
                <strong title={entry.title || displayTitleFromPath(entry.path)}>{entry.title || displayTitleFromPath(entry.path)}</strong>
                <span title={entry.path}>{entry.path}</span>
              </a>
            ))}
            {props.state.inbox.length === 0 ? <div class="wiki-empty wiki-empty--compact">Inbox is empty.</div> : null}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
