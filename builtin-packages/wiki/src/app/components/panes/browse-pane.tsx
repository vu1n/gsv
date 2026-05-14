import { ArticleView } from "../../article-view";
import { displayTitleFromPath } from "../../domain/wiki-model";
import type { WikiPreviewRequest, WikiWorkspaceState } from "../../types";

type Props = {
  state: WikiWorkspaceState;
  currentTitle: string;
  selectedDb: string;
  onOpenPage(path: string): void;
  onPreviewOpen(anchor: HTMLElement, request: WikiPreviewRequest, pin: boolean): void;
  onPreviewHide(force: boolean): void;
};

export function BrowsePane(props: Props) {
  return (
    <section class="wiki-pane">
      <div class="wiki-pane-head">
        <div>
          <h2>{props.currentTitle || "Browse"}</h2>
          <p title={props.state.selectedPath || undefined}>{props.state.selectedPath || "Choose a page from navigation."}</p>
        </div>
      </div>
      {props.state.queryResult ? (
        <div class="wiki-query-result">
          <h3>Answer</h3>
          <p>{props.state.queryResult.brief || "No synthesized answer was available."}</p>
          {props.state.queryResult.refs.length > 0 ? (
            <div class="wiki-ref-list">
              {props.state.queryResult.refs.map((ref) => (
                <button key={ref.path} type="button" class="wiki-ref-row" onClick={() => props.onOpenPage(ref.path)}>
                  <strong title={ref.title || displayTitleFromPath(ref.path)}>{ref.title || displayTitleFromPath(ref.path)}</strong>
                  <span title={ref.path}>{ref.path}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <ArticleView
        markdown={props.state.selectedNote?.markdown || ""}
        articleTitle={props.currentTitle || "Untitled"}
        routeBase="/apps/wiki"
        selectedDb={props.selectedDb}
        selectedPath={props.state.selectedPath}
        onNavigate={props.onOpenPage}
        onPreviewOpen={props.onPreviewOpen}
        onPreviewHide={props.onPreviewHide}
      />
    </section>
  );
}
