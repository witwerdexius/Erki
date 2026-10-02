import { timingSafeEqual } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildMcpServer } from '@/lib/mcp/server';
import { createMcpContext } from '@/lib/mcp/context';

// MCP-Endpunkt für die KI-Bearbeitung von Planungen.
// URL: https://<app>/api/mcp/<ERKI_MCP_TOKEN>
// Das Token steht im Pfad, weil Claude.ai-Connectors keine eigenen Header erlauben.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenValid(token: string): boolean {
  const expected = process.env.ERKI_MCP_TOKEN;
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!tokenValid(token)) return new Response('Not found', { status: 404 });

  // Stateless: pro Request ein frischer Server + Transport (passt zu Serverless).
  const server = buildMcpServer(createMcpContext());
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
