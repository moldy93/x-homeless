import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(rootDirectory, "dist");

await rm(distDirectory, { force: true, recursive: true });
await mkdir(distDirectory, { recursive: true });

await build({
  bundle: true,
  entryPoints: [resolve(rootDirectory, "src/content/index.ts")],
  format: "iife",
  legalComments: "none",
  outfile: resolve(distDirectory, "content.js"),
  platform: "browser",
  target: ["chrome120"],
  tsconfig: resolve(rootDirectory, "tsconfig.json")
});

await copyFile(
  resolve(rootDirectory, "manifest.json"),
  resolve(distDirectory, "manifest.json")
);

