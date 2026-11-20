import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getAllTools, getHandlerForTool } from './domains/index.js';
import { registerResourceHandlers } from './resources.js';
import { logger } from './utils/logger.js';

export function createServer(): Server {
  const server = new Server(
    { name: 'ironscales-mcp', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
    }
  );

  // MCP Apps (SEP-1865): serve the ui:// incident-card resource.
  registerResourceHandlers(server);

  // Flat tool list: every tool is listed up front, with no navigation state.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: getAllTools() }));

  // Route tool calls by name.
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const handler = getHandlerForTool(name);

    if (!handler) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      return await handler.handleCall(name, (args ?? {}) as Record<string, unknown>, extra);
    } catch (error) {
      logger.error('Tool call failed', { tool: name, error: (error as Error).message });
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}
