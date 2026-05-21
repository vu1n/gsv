import { definePackage } from "@gsv/package/manifest";

export default definePackage({
  meta: {
    displayName: "Viewer",
    description: "Read-only artifact viewer for files, generated HTML, and media previews.",
    icon: "icon.svg",
    window: {
      width: 980,
      height: 720,
      minWidth: 420,
      minHeight: 320,
    },
    capabilities: {
      kernel: ["fs.read"],
    },
  },
  browser: {
    entry: "./src/main.tsx",
    assets: ["./src/styles.css"],
  },
  backend: {
    entry: "./src/backend.ts",
  },
});
