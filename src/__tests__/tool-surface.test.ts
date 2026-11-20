/**
 * Locks the flat tool surface: a fresh session lists every tool with no
 * navigate call, because Conduit refuses to list or proxy navigate/back.
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';
import { getAllTools, getHandlerForTool } from '../domains/index.js';

const DOMAIN_TOOLS = [
  'ironscales_allowlist_manage',
  'ironscales_email_classify',
  'ironscales_incidents_get',
  'ironscales_incidents_list',
  'ironscales_remediation_act',
  'ironscales_stats_company',
];

async function connect(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);
  return client;
}

describe('flat tool surface', () => {
  it('tools/list on a fresh session returns status plus all 6 domain tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map((t) => t.name).sort()).toEqual(['ironscales_status', ...DOMAIN_TOOLS].sort());
  });

  it('has no navigate/back tools', () => {
    const names = getAllTools().map((t) => t.name);
    expect(names.filter((n) => /_(navigate|back)$/.test(n))).toEqual([]);
  });

  it('has no duplicate tool names', () => {
    const names = getAllTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('routes every listed tool to a handler', () => {
    for (const tool of getAllTools()) {
      expect(getHandlerForTool(tool.name)).toBeDefined();
    }
  });

  it('ironscales_status reports every tool without a navigate call', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'ironscales_status', arguments: {} });
    await client.close();

    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(text).tools).toEqual(expect.arrayContaining(DOMAIN_TOOLS));
  });

  it('returns isError for the removed navigate tool', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'ironscales_navigate',
      arguments: { domain: 'incidents' },
    });
    await client.close();

    expect(result.isError).toBe(true);
  });
});
