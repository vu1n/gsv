type WikiHeading = {
  level: number;
  text: string;
  id: string;
};

type Props = {
  pageHeadings: WikiHeading[];
  onEditCurrentPage(): void;
  onBuildFromDirectory(): void;
  onStageSource(): void;
  onReviewInbox(): void;
};

export function WikiInspector(props: Props) {
  return (
    <aside class="wiki-inspector">
      {props.pageHeadings.length > 0 ? (
        <section class="wiki-inspector-section">
          <h2>Outline</h2>
          <div class="wiki-outline-list">
            {props.pageHeadings.map((heading) => (
              <a key={heading.id} href={`#${heading.id}`} class={`wiki-outline-row level-${heading.level}`}>{heading.text}</a>
            ))}
          </div>
        </section>
      ) : null}
      <section class="wiki-inspector-section">
        <h2>Quick actions</h2>
        <div class="wiki-action-stack">
          <button type="button" onClick={props.onEditCurrentPage} title="Edit current page" aria-label="Edit current page">Edit</button>
          <button type="button" onClick={props.onBuildFromDirectory} title="Build from directory" aria-label="Build from directory">Build</button>
          <button type="button" onClick={props.onStageSource} title="Stage source" aria-label="Stage source">Stage</button>
          <button type="button" onClick={props.onReviewInbox} title="Review inbox" aria-label="Review inbox">Inbox</button>
        </div>
      </section>
    </aside>
  );
}

export function WikiCompactTools(props: Props) {
  return (
    <div class="wiki-compact-tools" role="toolbar" aria-label="Wiki quick tools">
      <div class="wiki-compact-action-row">
        <button type="button" onClick={props.onEditCurrentPage} title="Edit current page" aria-label="Edit current page">Edit</button>
        <button type="button" onClick={props.onBuildFromDirectory} title="Build from directory" aria-label="Build from directory">Build</button>
        <button type="button" onClick={props.onStageSource} title="Stage source" aria-label="Stage source">Stage</button>
        <button type="button" onClick={props.onReviewInbox} title="Review inbox" aria-label="Review inbox">Inbox</button>
      </div>
      {props.pageHeadings.length > 0 ? (
        <details class="wiki-compact-outline">
          <summary>Outline</summary>
          <div class="wiki-outline-list">
            {props.pageHeadings.map((heading) => (
              <a key={heading.id} href={`#${heading.id}`} class={`wiki-outline-row level-${heading.level}`}>{heading.text}</a>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
