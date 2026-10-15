import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export interface InstallContext {
  serverName: string;
  url: string;
  token: string;
}

export interface ClientOption {
  id: string;
  label: string;
  install(ctx: InstallContext): string;
}

function readJsonConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`${path} exists but is not valid JSON. Fix or remove it, then try again.`);
  }
}

// Merges one server entry into a client's JSON config without touching existing servers.
function mergeServerEntry(
  path: string,
  serversKey: string,
  serverName: string,
  entry: Record<string, unknown>
): void {
  mkdirSync(dirname(path), { recursive: true });
  const config = readJsonConfig(path);
  const servers = (config[serversKey] as Record<string, unknown> | undefined) ?? {};
  servers[serverName] = entry;
  config[serversKey] = servers;
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function claudeDesktopConfigPath(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    default:
      return join(home, ".config", "Claude", "claude_desktop_config.json");
  }
}

export const CLIENTS: ClientOption[] = [
  {
    id: "claude-code",
    label: "Claude Code (CLI)",
    install({ serverName, url, token }) {
      execFileSync(
        "claude",
        ["mcp", "add", "--transport", "http", serverName, url, "--header", `Authorization: Bearer ${token}`],
        { stdio: "inherit" }
      );
      return "Registered with Claude Code. Restart Claude Code to pick it up.";
    },
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    install({ serverName, url, token }) {
      const path = claudeDesktopConfigPath();
      mergeServerEntry(path, "mcpServers", serverName, {
        url,
        headers: { Authorization: `Bearer ${token}` },
      });
      return `Updated ${path}. Restart Claude Desktop to pick it up.`;
    },
  },
  {
    id: "cursor",
    label: "Cursor",
    install({ serverName, url, token }) {
      const path = join(homedir(), ".cursor", "mcp.json");
      mergeServerEntry(path, "mcpServers", serverName, {
        url,
        headers: { Authorization: `Bearer ${token}` },
      });
      return `Updated ${path}. Restart Cursor to pick it up.`;
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    install({ serverName, url, token }) {
      const path = join(homedir(), ".codeium", "windsurf", "mcp_config.json");
      mergeServerEntry(path, "mcpServers", serverName, {
        serverUrl: url,
        headers: { Authorization: `Bearer ${token}` },
      });
      return `Updated ${path}. Restart Windsurf to pick it up.`;
    },
  },
  {
    id: "opencode",
    label: "opencode",
    install({ serverName, url, token }) {
      const path = join(homedir(), ".config", "opencode", "opencode.json");
      mkdirSync(dirname(path), { recursive: true });
      const config = readJsonConfig(path);
      config.$schema ??= "https://opencode.ai/config.json";
      const mcp = (config.mcp as Record<string, unknown> | undefined) ?? {};
      mcp[serverName] = {
        type: "remote",
        url,
        headers: { Authorization: `Bearer ${token}` },
      };
      config.mcp = mcp;
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
      return `Updated ${path}. Restart opencode to pick it up.`;
    },
  },
  {
    id: "vscode",
    label: "VS Code (current project)",
    install({ serverName, url, token }) {
      const path = join(process.cwd(), ".vscode", "mcp.json");
      mergeServerEntry(path, "servers", serverName, {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      });
      return `Updated ${path}. Reload the VS Code window to pick it up.`;
    },
  },
];

export function findClient(id: string): ClientOption {
  const client = CLIENTS.find((c) => c.id === id);
  if (!client) {
    const ids = CLIENTS.map((c) => c.id).join(", ");
    throw new Error(`Unknown client "${id}". Available: ${ids}`);
  }
  return client;
}

export async function pickClient(): Promise<ClientOption> {
  console.log("Which AI tool do you want to connect db-mcp to?\n");
  for (const [i, client] of CLIENTS.entries()) {
    console.log(`  ${i + 1}) ${client.label}`);
  }
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question("\nEnter a number: ")).trim();
    const client = CLIENTS[Number(answer) - 1];
    if (!client) {
      throw new Error(`Invalid selection: "${answer}"`);
    }
    return client;
  } finally {
    rl.close();
  }
}
