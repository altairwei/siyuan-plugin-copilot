import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';

const serverUrl = process.env.MCP_SERVER_URL || 'https://api.githubcopilot.com/mcp/';
const token = process.env.MCP_AUTH_TOKEN;

if (!token) {
  console.error('❌ Missing MCP_AUTH_TOKEN env var');
  process.exit(1);
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const client = new Client({ name: 'siyuan-copilot-test', version: '0.0.1' });

  try {
    await client.connect(transport);
    const server = client.getServerVersion();
    console.log('✅ Connected:', server?.name, server?.version);

    const toolsResp = await client.request({ method: 'tools/list' }, {});
    const tools = toolsResp?.tools || [];
    console.log(`✅ tools/list ok, count=${tools.length}`);

    for (const t of tools.slice(0, 20)) {
      console.log(`- ${t.name}: ${t.description || 'No description'}`);
    }
  } catch (e) {
    console.error('❌ MCP test failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    try { await client.close(); } catch {}
  }
}

main();
