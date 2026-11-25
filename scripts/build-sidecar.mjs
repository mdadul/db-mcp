import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { resolveNpmInvocation } from "./npm-cli.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "desktop", "src-tauri");
const serverDir = join(tauriDir, "resources", "server");
const binaryDir = join(tauriDir, "binaries");
const cacheDir = join(root, "desktop", ".cache");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const NODE_MAJOR = 26;
const targets = {
  "aarch64-apple-darwin": {
    distName: "darwin-arm64",
    archiveExt: "tar.xz",
    executableExt: "",
    npmPlatform: "darwin",
    npmArch: "arm64",
  },
  "x86_64-apple-darwin": {
    distName: "darwin-x64",
    archiveExt: "tar.xz",
    executableExt: "",
    npmPlatform: "darwin",
    npmArch: "x64",
  },
  "x86_64-pc-windows-msvc": {
    distName: "win-x64",
    archiveExt: "zip",
    executableExt: ".exe",
    npmPlatform: "win32",
    npmArch: "x64",
  },
  "x86_64-unknown-linux-gnu": {
    distName: "linux-x64",
    archiveExt: "tar.xz",
    executableExt: "",
    npmPlatform: "linux",
    npmArch: "x64",
  },
  "aarch64-unknown-linux-gnu": {
    distName: "linux-arm64",
    archiveExt: "tar.xz",
    executableExt: "",
    npmPlatform: "linux",
    npmArch: "arm64",
  },
};

await mkdir(serverDir, { recursive: true });
await mkdir(binaryDir, { recursive: true });
await mkdir(cacheDir, { recursive: true });

const optionalExternal = [
  "better-sqlite3",
  "kerberos",
  "@mongodb-js/zstd",
  "@aws-sdk/credential-providers",
  "gcp-metadata",
  "snappy",
  "socks",
  "aws4",
  "mongodb-client-encryption",
];
const target = parseArgument("--target") ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? rustHostTriple();
const targetInfo = targets[target];
if (!targetInfo) throw new Error(`Unsupported Node ${NODE_MAJOR} sidecar target: ${target}`);

await build({
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(serverDir, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: `node${NODE_MAJOR}`,
  // No source map: it is shipped inside the app (7 MB) and the unminified bundle is already readable.
  sourcemap: false,
  external: optionalExternal,
  banner: {
    js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
});

await rm(join(serverDir, "migrations"), { recursive: true, force: true });
await rm(join(serverDir, "index.mjs.map"), { force: true });
await mkdir(join(serverDir, "migrations"), { recursive: true });
await copyTree(join(root, "src", "db", "migrations"), join(serverDir, "migrations"));

const runtimeManifest = {
  private: true,
  type: "module",
  allowScripts: { "better-sqlite3": true },
  dependencies: { "better-sqlite3": manifest.dependencies["better-sqlite3"] },
};
await writeFile(join(serverDir, "package.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`);

const release = await latestNodeRelease();
const npmEnv = { ...process.env };
npmEnv.npm_config_arch = targetInfo.npmArch;
npmEnv.NPM_CONFIG_ARCH = targetInfo.npmArch;
npmEnv.npm_config_target_arch = targetInfo.npmArch;
npmEnv.NPM_CONFIG_TARGET_ARCH = targetInfo.npmArch;
npmEnv.npm_config_platform = targetInfo.npmPlatform;
npmEnv.NPM_CONFIG_PLATFORM = targetInfo.npmPlatform;
npmEnv.npm_config_target = release.slice(1);
npmEnv.NPM_CONFIG_TARGET = release.slice(1);
await rm(join(serverDir, "node_modules"), { recursive: true, force: true });
await rm(join(serverDir, "package-lock.json"), { force: true });
const npmInvocation = await resolveNpmInvocation();
run(
  npmInvocation.command,
  [...npmInvocation.argsPrefix, "install", "--omit=dev", "--no-audit", "--no-fund"],
  { cwd: serverDir, env: npmEnv },
);
// better-sqlite3 ships its C sources (deps/, src/) for building from source. The runtime only
// loads lib/ and build/Release/better_sqlite3.node, so drop the sources from the app bundle.
for (const directory of ["deps", "src"]) {
  await rm(join(serverDir, "node_modules", "better-sqlite3", directory), {
    recursive: true,
    force: true,
  });
}

const nodeBinary = await fetchNodeBinary(target, release);
const nodeStat = await stat(nodeBinary);
const bundleStat = await stat(join(serverDir, "index.mjs"));
const nativeAddon = await findFile(
  join(serverDir, "node_modules", "better-sqlite3"),
  "better_sqlite3.node",
);
if (!nativeAddon) throw new Error("better-sqlite3 native addon was not installed");
const nativeSize = (await stat(nativeAddon)).size;
await verifyNativeAddonArchitecture(nativeAddon, targetInfo);
console.log(`Sidecar build complete for ${target}`);
console.log(`  Node ${NODE_MAJOR} binary: ${nodeBinary} (${formatBytes(nodeStat.size)})`);
console.log(`  Server bundle:   ${join(serverDir, "index.mjs")} (${formatBytes(bundleStat.size)})`);
console.log(
  `  SQLite addon:    ${nativeAddon ?? "not found"}${nativeAddon ? ` (${formatBytes(nativeSize)})` : ""}`,
);
console.log(`  Migrations:      ${join(serverDir, "migrations")}`);

async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else await copyFile(from, to);
  }
}

function parseArgument(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const value = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}

function rustHostTriple() {
  const result = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not detect Rust host triple: ${result.stderr}`);
  const host = result.stdout.match(/^host: (.+)$/m)?.[1];
  if (!host) throw new Error("Could not find host triple in rustc -vV output");
  return host;
}

async function latestNodeRelease() {
  const indexResponse = await fetch("https://nodejs.org/dist/index.json");
  if (!indexResponse.ok)
    throw new Error(`Could not fetch official Node release index: ${indexResponse.status}`);
  const versions = await indexResponse.json();
  const latest = versions.find((entry) => entry.version.startsWith(`v${NODE_MAJOR}.`));
  if (!latest) throw new Error(`No Node ${NODE_MAJOR} release found in the official release index`);
  return latest.version;
}

async function fetchNodeBinary(triple, release) {
  const targetInfo = targets[triple];
  const archiveName = `node-${release}-${targetInfo.distName}.${targetInfo.archiveExt}`;
  const archiveRoot = `node-${release}-${targetInfo.distName}`;
  const releaseDir = join(cacheDir, release);
  const archivePath = join(releaseDir, archiveName);
  const sumsPath = join(releaseDir, "SHASUMS256.txt");
  await mkdir(releaseDir, { recursive: true });
  await download(`https://nodejs.org/dist/${release}/${archiveName}`, archivePath);
  await download(`https://nodejs.org/dist/${release}/SHASUMS256.txt`, sumsPath);

  const sums = await readFile(sumsPath, "utf8");
  const expected = sums
    .split("\n")
    .find((line) => line.trim().endsWith(` ${archiveName}`))
    ?.split(/\s+/)[0];
  if (!expected) throw new Error(`Official SHA256 not found for ${archiveName}`);
  const actual = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  if (actual !== expected) throw new Error(`SHA256 verification failed for ${archiveName}`);

  const outputName = `node-${triple}${targetInfo.executableExt}`;
  const outputPath = join(binaryDir, outputName);
  const extractedPath = join(cacheDir, `${release}-${triple}-extracted`);
  await rm(extractedPath, { recursive: true, force: true });
  await mkdir(extractedPath, { recursive: true });

  if (targetInfo.archiveExt === "zip") {
    const archiveMember = join(archiveRoot, "node.exe").replaceAll("\\", "/");
    run("tar", ["-xf", archivePath, "-C", extractedPath, archiveMember]);
    await copyFile(join(extractedPath, archiveRoot, "node.exe"), outputPath);
  } else {
    run("tar", ["-xf", archivePath, "-C", extractedPath, `${archiveRoot}/bin/node`]);
    await copyFile(join(extractedPath, archiveRoot, "bin", "node"), outputPath);
  }

  if (targetInfo.executableExt !== ".exe") await chmod(outputPath, 0o755);
  await maybeStripNodeBinary(outputPath, targetInfo, extractedPath);
  return outputPath;
}

async function maybeStripNodeBinary(binaryPath, targetInfo, scratchDir) {
  if (
    process.platform !== "darwin" ||
    targetInfo.npmPlatform !== "darwin" ||
    targetInfo.npmArch !== process.arch
  ) {
    return;
  }

  const originalSize = (await stat(binaryPath)).size;
  const backupPath = join(scratchDir, "node-before-strip");
  await copyFile(binaryPath, backupPath);
  const result = spawnSync("strip", ["-x", binaryPath], { encoding: "utf8" });
  // strip invalidates the code signature and macOS kills the unsigned arm64 binary, so re-sign ad hoc.
  const resign =
    result.status === 0
      ? spawnSync("codesign", ["--force", "--sign", "-", binaryPath], { encoding: "utf8" })
      : null;
  const stripped = result.status === 0 && resign?.status === 0;
  const strippedSize = stripped ? (await stat(binaryPath)).size : originalSize;
  const versionCheck = stripped ? spawnSync(binaryPath, ["--version"], { encoding: "utf8" }) : null;

  if (stripped && strippedSize < originalSize && versionCheck?.status === 0) {
    console.log(`  Node strip:      ${formatBytes(originalSize)} -> ${formatBytes(strippedSize)}`);
    return;
  }

  await copyFile(backupPath, binaryPath);
  if (result.error) {
    console.log(`  Node strip:      skipped (${result.error.message})`);
  } else if (result.status !== 0) {
    console.log(`  Node strip:      skipped (strip exited with status ${result.status})`);
  } else if (!stripped) {
    console.log(`  Node strip:      skipped (ad-hoc re-sign failed: ${resign?.stderr?.trim()})`);
  } else if (strippedSize >= originalSize) {
    console.log(
      `  Node strip:      no size reduction (${formatBytes(originalSize)} -> ${formatBytes(strippedSize)})`,
    );
  } else {
    console.log(
      `  Node strip:      reverted; --version failed (${formatBytes(originalSize)} -> ${formatBytes(strippedSize)})`,
    );
  }
}

async function verifyNativeAddonArchitecture(addonPath, targetInfo) {
  if (process.platform === "win32") return;
  const result = spawnSync("file", ["-b", addonPath], { encoding: "utf8" });
  if (result.error)
    throw new Error(`Could not inspect better-sqlite3 architecture: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`Could not inspect better-sqlite3 architecture: ${result.stderr}`);

  const architecture = result.stdout.trim();
  const isExpected =
    targetInfo.npmArch === "x64"
      ? /\b(x86_64|x86-64|x64)\b/i.test(architecture)
      : /\b(arm64|aarch64)\b/i.test(architecture);
  if (!isExpected) {
    throw new Error(
      `better-sqlite3 architecture mismatch for ${targetInfo.npmPlatform}-${targetInfo.npmArch}: ${architecture}`,
    );
  }
  console.log(`  SQLite arch:     ${architecture}`);
}

async function download(url, destination) {
  try {
    await stat(destination);
    return;
  } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, data);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
}

async function findFile(directory, basename) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === basename) return path;
    if (entry.isDirectory()) {
      const found = await findFile(path, basename);
      if (found) return found;
    }
  }
  return null;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
