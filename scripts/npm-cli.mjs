import { access, realpath, stat } from "node:fs/promises";
import { delimiter, dirname, join, posix, win32 } from "node:path";

const npmCliSuffix = /(?:^|[\\/])npm-cli\.js$/i;

export async function resolveNpmInvocation({
  env = process.env,
  execPath = process.execPath,
  platform = process.platform,
  fs = { access, realpath, stat },
  pathApi = platform === "win32" ? win32 : posix,
} = {}) {
  const isWindows = platform === "win32";
  const canAccess = async (path) => {
    try {
      await fs.access(path);
      return true;
    } catch {
      try {
        await fs.stat(path);
        return true;
      } catch {
        return false;
      }
    }
  };

  const npmExecPath = env.npm_execpath ?? env.NPM_EXEC_PATH;
  if (npmExecPath && npmCliSuffix.test(npmExecPath) && await canAccess(npmExecPath)) {
    return { command: execPath, argsPrefix: [npmExecPath] };
  }

  const resolvedNode = await resolvePath(execPath, fs);
  const nodeDirectory = pathApi.dirname(resolvedNode);
  const nodeCandidates = [
    pathApi.join(nodeDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    pathApi.join(nodeDirectory, "..", "libexec", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    pathApi.join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  if (platform === "darwin") {
    nodeCandidates.push(pathApi.join(nodeDirectory, "..", "..", "..", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"));
  }

  for (const candidate of nodeCandidates) {
    if (await canAccess(candidate)) return { command: execPath, argsPrefix: [candidate] };
  }

  const npmOnPath = await findNpmOnPath(env, platform, fs, pathApi);
  if (npmOnPath) {
    const resolvedNpm = await resolvePath(npmOnPath, fs);
    const cliCandidates = npmCliCandidates(resolvedNpm, pathApi);
    for (const candidate of cliCandidates) {
      if (await canAccess(candidate)) return { command: execPath, argsPrefix: [candidate] };
    }
  }

  if (isWindows) return { command: env.ComSpec ?? env.COMSPEC ?? "cmd.exe", argsPrefix: ["/d", "/s", "/c", "npm.cmd"] };
  return { command: "npm", argsPrefix: [] };
}

async function findNpmOnPath(env, platform, fs, pathApi) {
  const pathValue = env.PATH ?? env.Path ?? "";
  const pathDirectories = pathValue.split(pathApi.delimiter ?? (platform === "win32" ? ";" : ":"));
  const names = platform === "win32" ? ["npm.cmd", "npm.exe", "npm"] : ["npm"];

  for (const directory of pathDirectories) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      try {
        await fs.stat(candidate);
        return candidate;
      } catch {}
    }
  }
  return null;
}

function npmCliCandidates(npmPath, pathApi) {
  if (npmCliSuffix.test(npmPath)) return [npmPath];

  const npmDirectory = pathApi.dirname(npmPath);
  return [
    pathApi.join(npmDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    pathApi.join(npmDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    pathApi.join(npmDirectory, "npm-cli.js"),
  ];
}

async function resolvePath(path, fs) {
  try {
    return await fs.realpath(path);
  } catch {
    return path;
  }
}
