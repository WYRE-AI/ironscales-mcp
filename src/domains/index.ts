import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getCredentials } from '../utils/client.js';
import { incidentsHandler } from './incidents.js';
import { emailHandler } from './email.js';
import { remediationHandler } from './remediation.js';
import { statsHandler } from './stats.js';
import { allowlistHandler } from './allowlist.js';

/**
 * The tool list is flat: every tool is listed and callable immediately, with
 * no navigate/back step. Conduit refuses to list or proxy navigation tools, so
 * gating tools behind them leaves the domain tools unreachable.
 */

const statusHandler: DomainHandler = {
  getTools: () => [
    {
      name: 'ironscales_status',
      description: 'Check Ironscales API connection status and list the available tools.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
  ],
  async handleCall(): Promise<CallToolResult> {
    const creds = getCredentials();
    const status = {
      connected: !!creds,
      companyId: creds?.companyId ?? null,
      tools: getAllTools().map((t) => t.name),
    };
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  },
};

const HANDLERS: DomainHandler[] = [
  statusHandler,
  incidentsHandler,
  emailHandler,
  remediationHandler,
  statsHandler,
  allowlistHandler,
];

export function getAllTools(): Tool[] {
  return HANDLERS.flatMap((handler) => handler.getTools());
}

export function getHandlerForTool(toolName: string): DomainHandler | undefined {
  return HANDLERS.find((handler) => handler.getTools().some((t) => t.name === toolName));
}
