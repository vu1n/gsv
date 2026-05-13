export function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function shortHash(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : "unknown";
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "unknown";
  return new Date(timestamp).toLocaleString();
}

export function formatDateTimeAttribute(timestamp: number | null | undefined): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

export function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "unknown";
  const deltaMs = timestamp - Date.now();
  const absMs = Math.abs(deltaMs);
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of divisions) {
    if (absMs >= size) {
      return formatter.format(Math.round(deltaMs / size), unit);
    }
  }
  return "just now";
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function firstLine(text: string): string {
  return text.split("\n")[0] || "No commit message";
}
