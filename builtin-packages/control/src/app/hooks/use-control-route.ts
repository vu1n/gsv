import { useCallback, useEffect, useState } from "preact/hooks";
import type { ControlConfigSectionId, ControlTabId } from "../types";

export function useControlRoute() {
  const [activeTab, setActiveTab] = useState<ControlTabId>(readTabFromLocation());
  const [activeConfigSection, setActiveConfigSection] = useState<ControlConfigSectionId>(readSectionFromLocation());

  const updateRoute = useCallback((nextTab: ControlTabId, nextSection: ControlConfigSectionId = activeConfigSection) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.searchParams.set("section", nextSection);
    window.history.pushState({}, "", url);
    setActiveTab(nextTab);
    setActiveConfigSection(nextSection);
  }, [activeConfigSection]);

  const updateConfigSection = useCallback((nextSection: ControlConfigSectionId) => {
    updateRoute("config", nextSection);
  }, [updateRoute]);

  useEffect(() => {
    const onPopState = () => {
      setActiveTab(readTabFromLocation());
      setActiveConfigSection(readSectionFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    activeTab,
    activeConfigSection,
    updateRoute,
    updateConfigSection,
  };
}

function readTabFromLocation(): ControlTabId {
  const value = new URL(window.location.href).searchParams.get("tab");
  return value === "access" || value === "mcp" || value === "advanced" ? value : "config";
}

function readSectionFromLocation(): ControlConfigSectionId {
  const value = new URL(window.location.href).searchParams.get("section");
  return value === "profiles" || value === "shell" || value === "server" || value === "processes" || value === "automation"
    ? value
    : "ai";
}
