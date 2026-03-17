import esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(pluginRoot, "dist");
const uiTemplatePath = path.join(pluginRoot, "ui", "index.html");

await fs.mkdir(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(pluginRoot, "src", "code.ts")],
  bundle: true,
  outfile: path.join(distDir, "code.js"),
  format: "iife",
  platform: "browser",
  // Figma's runtime chokes on newer syntax such as object spread in bundled deps.
  target: ["es2017"]
});

await esbuild.build({
  entryPoints: [path.join(pluginRoot, "ui", "main.ts")],
  bundle: true,
  outfile: path.join(distDir, "ui.js"),
  format: "iife",
  platform: "browser",
  target: ["es2017"]
});

await fs.copyFile(uiTemplatePath, path.join(distDir, "ui.html"));
