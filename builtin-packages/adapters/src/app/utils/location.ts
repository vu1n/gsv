import type { AdapterKind } from "../types";

export function readAdapterFromLocation(): AdapterKind {
  const value = new URL(window.location.href).searchParams.get("adapter");
  return value === "discord" ? "discord" : "whatsapp";
}

export function readAccountFromLocation(): string {
  const value = new URL(window.location.href).searchParams.get("account");
  return value && value.trim() ? value.trim() : "";
}

export function writeLocation(adapter: AdapterKind, account: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("adapter", adapter);
  if (account && account !== "new") {
    url.searchParams.set("account", account);
  } else {
    url.searchParams.delete("account");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}
