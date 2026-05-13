export function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function formatTimestamp(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString();
}
