import assert from "node:assert/strict";
import { test } from "node:test";
import { posix, win32 } from "node:path";
import { resolveNpmInvocation } from "./npm-cli.mjs";

test("uses npm_execpath when it points to npm-cli.js", async () => {
  const npmCli = "/tools/node/lib/node_modules/npm/bin/npm-cli.js";
  const result = await resolveNpmInvocation({
    env: { npm_execpath: npmCli },
    execPath: "/tools/node/bin/node",
    platform: "linux",
    fs: fakeFs([npmCli]),
  });

  assert.deepEqual(result, { command: "/tools/node/bin/node", argsPrefix: [npmCli] });
});

test("resolves npm installed beside Node for nvm, fnm, Volta, and official installers", async (t) => {
  const installations = [
    ["nvm", "/Users/dev/.nvm/versions/node/v26.12.1/bin/node"],
    ["fnm", "/Users/dev/.local/share/fnm/node-versions/v26.12.1/installation/bin/node"],
    ["Volta", "/Users/dev/.volta/tools/image/node/26.12.1/bin/node"],
    ["official installer", "/usr/local/bin/node"],
  ];

  for (const [name, executable] of installations) {
    await t.test(name, async () => {
      const npmCli = posix.resolve(posix.dirname(executable), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
      const result = await resolveNpmInvocation({
        env: {},
        execPath: executable,
        platform: "linux",
        fs: fakeFs([npmCli]),
      });

      assert.deepEqual(result, { command: executable, argsPrefix: [npmCli] });
    });
  }
});

test("resolves Homebrew Node npm from the installation prefix", async () => {
  const executable = "/opt/homebrew/Cellar/node/26.12.1/bin/node";
  const npmCli = "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js";
  const result = await resolveNpmInvocation({
    env: {},
    execPath: executable,
    platform: "darwin",
    fs: fakeFs([npmCli]),
  });

  assert.deepEqual(result, { command: executable, argsPrefix: [npmCli] });
});

test("resolves Homebrew Node npm under the Cellar libexec directory", async () => {
  const executable = "/opt/homebrew/Cellar/node/26.12.1/bin/node";
  const npmCli = "/opt/homebrew/Cellar/node/26.12.1/libexec/lib/node_modules/npm/bin/npm-cli.js";
  const result = await resolveNpmInvocation({
    env: {},
    execPath: executable,
    platform: "darwin",
    fs: fakeFs([npmCli]),
  });

  assert.deepEqual(result, { command: executable, argsPrefix: [npmCli] });
});

test("resolves Windows npm installed beside node.exe", async () => {
  const executable = "C:\\Program Files\\nodejs\\node.exe";
  const npmCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  const result = await resolveNpmInvocation({
    env: {},
    execPath: executable,
    platform: "win32",
    fs: fakeFs([npmCli]),
    pathApi: win32,
  });

  assert.deepEqual(result, { command: executable, argsPrefix: [npmCli] });
});

test("resolves npm-cli.js after locating npm on PATH", async () => {
  const npmCommand = "/tools/bin/npm";
  const resolvedNpmCli = "/opt/npm/lib/node_modules/npm/bin/npm-cli.js";
  const result = await resolveNpmInvocation({
    env: { PATH: "/tools/bin" },
    execPath: "/opt/node/bin/node",
    platform: "linux",
    fs: fakeFs([npmCommand, resolvedNpmCli], { [npmCommand]: resolvedNpmCli }),
  });

  assert.deepEqual(result, { command: "/opt/node/bin/node", argsPrefix: [resolvedNpmCli] });
});

test("falls back to npm on PATH and cmd.exe on Windows", async (t) => {
  await t.test("POSIX", async () => {
    const result = await resolveNpmInvocation({
      env: {},
      execPath: "/missing/node",
      platform: "linux",
      fs: fakeFs([]),
    });
    assert.deepEqual(result, { command: "npm", argsPrefix: [] });
  });

  await t.test("Windows", async () => {
    const result = await resolveNpmInvocation({
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      execPath: "C:\\missing\\node.exe",
      platform: "win32",
      fs: fakeFs([]),
      pathApi: win32,
    });
    assert.deepEqual(result, {
      command: "C:\\Windows\\System32\\cmd.exe",
      argsPrefix: ["/d", "/s", "/c", "npm.cmd"],
    });
  });
});

function fakeFs(existingPaths, realpaths = {}) {
  const existing = new Set(existingPaths);
  return {
    async access(path) {
      if (!existing.has(path)) throw new Error(`Not found: ${path}`);
    },
    async stat(path) {
      if (!existing.has(path)) throw new Error(`Not found: ${path}`);
      return { isFile: () => true };
    },
    async realpath(path) {
      return realpaths[path] ?? path;
    },
  };
}
