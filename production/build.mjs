import { build } from "esbuild";
import { build as viteBuild } from "vite";
import path from "node:path";
await build({
  entryPoints: ["production/api.ts"],
  outfile: "dist/api.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  alias: {
    "cloudflare:workers": path.resolve("production/context.ts"),
    "@/app/chatgpt-auth": path.resolve("production/context.ts"),
    "@": path.resolve("."),
  },
  packages: "external",
});
await viteBuild({ configFile: "production/vite.config.mjs" });
