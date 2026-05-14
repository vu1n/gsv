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
          <button type="button" onClick={props.onEditCurrentPage}>Edit current page</button>
          <button type="button" onClick={props.onBuildFromDirectory}>Build from directory</button>
          <button type="button" onClick={props.onStageSource}>Stage source</button>
          <button type="button" onClick={props.onReviewInbox}>Review inbox</button>
        </div>
      </section>
    </aside>
  );
}
