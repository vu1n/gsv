import { buildWikiHref, type WikiRoute } from "../../domain/route";
import { displayTitleFromPath } from "../../domain/wiki-model";
import { buildEntryHref } from "../../markdown";
import type { WikiDb, WikiEntry, WikiMode, WikiWorkspaceState } from "../../types";
import { WikiIcon, type WikiIconName } from "../ui/wiki-icon";

type Props = {
  mode: WikiMode;
  onChangeMode(mode: WikiMode): void;
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

const MODES: Array<{ id: WikiMode; label: string; icon: WikiIconName; description: string }> = [
  { id: "browse", label: "Browse", icon: "book", description: "Read pages" },
  { id: "edit", label: "Edit", icon: "edit", description: "Write pages" },
  { id: "build", label: "Build", icon: "build", description: "Draft from folders" },
  { id: "ingest", label: "Stage", icon: "folder", description: "Capture source" },
  { id: "inbox", label: "Inbox", icon: "inbox", description: "Review staged notes" },
];

export function WikiRail(props: Props) {
  return (
    <aside class="wiki-rail" aria-label="Wiki navigation">
      <section class="wiki-nav-block wiki-nav-block--modes">
        <div class="wiki-nav-heading">
          <span>Work</span>
        </div>
        <nav class="wiki-mode-list" aria-label="Wiki work modes">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              class={`wiki-mode-row${props.mode === item.id ? " is-active" : ""}`}
              onClick={() => props.onChangeMode(item.id)}
              title={item.description}
              aria-current={props.mode === item.id ? "page" : undefined}
            >
              <WikiIcon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "inbox" && props.state.inbox.length > 0 ? <em>{props.state.inbox.length}</em> : null}
            </button>
          ))}
        </nav>
      </section>

      <section class="wiki-nav-block">
        <label class="wiki-sidebar-field">
          <span>Database</span>
          <select
            value={props.selectedDb}
            onChange={(event) => props.onOpenDb((event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Select database</option>
            {props.state.dbs.map((db) => <option key={db.id} value={db.id}>{db.title || db.id}</option>)}
          </select>
        </label>
        {props.selectedDb ? (
          <a
            class="wiki-current-context"
            href={buildWikiHref(props.mode, { ...props.route, db: props.selectedDb, path: props.state.selectedPath || `${props.selectedDb}/index.md` })}
            onClick={(event) => event.preventDefault()}
          >
            <span>{props.activeDb?.title || props.selectedDb}</span>
            <code title={props.state.selectedPath || props.selectedDb}>{props.state.selectedPath || props.selectedDb}</code>
          </a>
        ) : (
          <div class="wiki-empty wiki-empty--compact">Create or select a database to begin.</div>
        )}
      </section>

      {(props.mode === "browse" || props.mode === "edit") ? (
        <section class="wiki-nav-block">
          <div class="wiki-nav-heading">
            <span>Find</span>
          </div>
          <form class="wiki-sidebar-search" onSubmit={props.onApplySearch}>
            <input value={props.searchDraft} onInput={(event) => props.onSearchDraftChange((event.currentTarget as HTMLInputElement).value)} placeholder="Search pages" type="search" />
            <button type="submit" title="Search pages" aria-label="Search pages"><WikiIcon name="search" /></button>
          </form>
          <form class="wiki-sidebar-search" onSubmit={props.onApplyAsk}>
            <input value={props.askDraft} onInput={(event) => props.onAskDraftChange((event.currentTarget as HTMLInputElement).value)} placeholder="Ask the wiki" />
            <button type="submit" title="Ask the wiki" aria-label="Ask the wiki"><WikiIcon name="spark" /></button>
          </form>
        </section>
      ) : null}

      {(props.mode === "browse" || props.mode === "edit") ? (
        <section class="wiki-nav-block wiki-nav-block--list">
          <div class="wiki-nav-heading">
            <span>{props.state.searchMatches ? "Matches" : "Pages"}</span>
            <button type="button" class="wiki-inline-icon-button" onClick={props.onNewPage} title="Create a new page" aria-label="Create a new page">
              <WikiIcon name="edit" />
            </button>
          </div>
          <PageList
            entries={props.visiblePages}
            selectedPath={props.state.selectedPath}
            selectedDb={props.selectedDb}
            onOpenPage={props.onOpenPage}
            emptyText={props.state.searchMatches ? "No matches." : "No pages yet."}
          />
        </section>
      ) : null}

      {props.mode === "inbox" ? (
        <section class="wiki-nav-block wiki-nav-block--list">
          <div class="wiki-nav-heading">
            <span>Inbox</span>
            <button
              type="button"
              class="wiki-inline-icon-button"
              onClick={() => void props.onCompileSelectedInbox()}
              disabled={props.mutating || !props.selectedInboxPath}
              title="Compile inbox note into a page"
              aria-label="Compile inbox note into a page"
            >
              <WikiIcon name="build" />
            </button>
          </div>
          <PageList
            entries={props.state.inbox}
            selectedPath={props.selectedInboxPath}
            selectedDb={props.selectedDb}
            onOpenPage={props.onOpenInboxNote}
            emptyText="Inbox is empty."
          />
        </section>
      ) : null}
    </aside>
  );
}

function PageList({
  entries,
  selectedPath,
  selectedDb,
  onOpenPage,
  emptyText,
}: {
  entries: WikiEntry[];
  selectedPath: string;
  selectedDb: string;
  onOpenPage(path: string): void;
  emptyText: string;
}) {
  if (entries.length === 0) {
    return <div class="wiki-empty wiki-empty--compact">{emptyText}</div>;
  }

  return (
    <div class="wiki-entry-list">
      {entries.map((entry) => (
        <a
          key={entry.path}
          href={buildEntryHref("/apps/wiki", selectedDb, entry.path)}
          class={`wiki-entry-row${selectedPath === entry.path ? " is-active" : ""}`}
          onClick={(event) => {
            event.preventDefault();
            onOpenPage(entry.path);
          }}
        >
          <WikiIcon name={entry.path.includes("/inbox/") ? "inbox" : "file"} />
          <span>
            <strong title={entry.title || displayTitleFromPath(entry.path)}>{entry.title || displayTitleFromPath(entry.path)}</strong>
            <small title={entry.path}>{entry.path}</small>
          </span>
        </a>
      ))}
    </div>
  );
}
