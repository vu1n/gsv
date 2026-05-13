export function formatTimestampMs(value: unknown): string {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }
  return date.toLocaleString();
}

export function errorToText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
