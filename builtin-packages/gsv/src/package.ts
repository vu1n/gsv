import { definePackage } from "@gsv/package/manifest";

export default definePackage({
  meta: {
    displayName: "GSV",
    description: "System console for operating and configuring GSV.",
    window: {
      width: 1220,
      height: 820,
      minWidth: 360,
      minHeight: 520,
    },
    capabilities: {
      kernel: [
        "proc.list",
        "proc.kill",
        "sys.device.list",
        "sys.device.get",
        "sys.device.update",
        "sys.token.create",
        "sys.token.list",
        "sys.token.revoke",
        "adapter.connect",
        "adapter.disconnect",
        "adapter.status",
        "sys.mcp.add",
        "sys.mcp.list",
        "sys.mcp.refresh",
        "sys.mcp.remove",
      ],
    },
  },
  browser: {
    entry: "./src/main.tsx",
    assets: [
      "./src/styles.css",
      "./src/styles/base.css",
      "./src/styles/shell.css",
      "./src/styles/sections.css",
      "./src/styles/runtime.css",
      "./src/styles/devices.css",
      "./src/styles/integrations.css",
      "./src/styles/responsive.css",
    ],
  },
  backend: {
    entry: "./src/backend.ts",
  },
});
