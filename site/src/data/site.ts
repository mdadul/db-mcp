export const REPO = 'https://github.com/mdadul/db-mcp';
export const RELEASES = `${REPO}/releases/latest`;
export const ISSUES = `${REPO}/issues`;
export const MCP_URL = 'http://127.0.0.1:4080/mcp';

export const databases = [
  { name: 'PostgreSQL', img: '/postgre.png', note: 'Supabase · Neon · RDS · CockroachDB' },
  { name: 'MySQL', img: '/mysql.png', note: 'MariaDB · PlanetScale · RDS' },
  { name: 'SQLite', img: '/sqlite.webp', note: 'Local database files' },
  { name: 'Redshift', img: '/redshift.png', note: 'Amazon Redshift over SSL' },
  { name: 'MongoDB', img: '/mongodb.svg', note: 'Atlas · self-hosted · DocumentDB' },
];

export const clients = ['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code', 'Windsurf', 'LM Studio'];

export const tools = [
  {
    name: 'list_databases',
    desc: 'Lists every enabled connection with its database_id, so the agent knows what it can query.',
  },
  {
    name: 'get_database_schema',
    desc: 'Lists tables, with an optional name filter so large schemas never flood the context window.',
  },
  {
    name: 'get_table_schema',
    desc: 'Returns columns, types, indexes and foreign keys for one table.',
  },
  {
    name: 'execute_read_query',
    desc: 'Runs SELECT, EXPLAIN, DESCRIBE or SHOW. Returns row_count and truncated flags. 100 rows by default, 1000 max.',
  },
];

export const setupTabs = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    file: 'terminal',
    code: `claude mcp add --transport http db-mcp ${MCP_URL}`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    file: '~/.cursor/mcp.json',
    code: JSON.stringify({ mcpServers: { 'db-mcp': { url: MCP_URL } } }, null, 2),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    file: 'mcp.json',
    code: JSON.stringify({ servers: { 'db-mcp': { type: 'http', url: MCP_URL } } }, null, 2),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    file: 'mcp_config.json',
    code: JSON.stringify({ mcpServers: { 'db-mcp': { serverUrl: MCP_URL } } }, null, 2),
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    file: 'claude_desktop_config.json',
    code: JSON.stringify(
      { mcpServers: { 'db-mcp': { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } },
      null,
      2,
    ),
  },
];

export const faqs = [
  {
    q: 'Is my data sent anywhere?',
    a: 'Not by DB MCP. It runs on your computer, the MCP endpoint binds to 127.0.0.1 only, and there is no account, cloud service or telemetry. Query results go to the AI client you connected, which handles them like anything else you share with it.',
  },
  {
    q: 'Can an agent modify or drop my data?',
    a: 'Write statements are rejected before they reach the database. We still recommend a database user with read-only grants, because that is the safeguard you control at the database itself.',
  },
  {
    q: 'Which AI tools work with it?',
    a: 'Any client that speaks MCP over HTTP. The app writes the config for Claude Desktop, Cursor, VS Code, Windsurf and LM Studio, and shows a snippet for everything else, including Claude Code.',
  },
  {
    q: 'Is there a hosted or web version?',
    a: 'No, by design. DB MCP is a desktop app for macOS, Windows and Linux so your credentials stay in your OS keychain.',
  },
  {
    q: 'Why does my OS warn me on first launch?',
    a: 'Builds are not code-signed yet. On macOS, Control-click the app and choose Open. On Windows, click More info, then Run anyway. Full steps are in the README.',
  },
  {
    q: 'Does the MCP endpoint require authentication?',
    a: 'No. Any program running as your OS user can call it, so your user account is the trust boundary. Browser requests are rejected and the Host header is checked to block DNS rebinding.',
  },
];
