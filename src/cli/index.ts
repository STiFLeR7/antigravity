#!/usr/bin/env node
/**
 * @fileoverview Antigravity CLI
 * 
 * Universal LLM tool server that works with:
 * - Claude (MCP over stdio)
 * - OpenAI (HTTP API)
 * - Gemini (HTTP API)
 * 
 * Usage:
 *   antigravity serve [options]
 *   antigravity tools [options]
 *   antigravity --help
 */

import { startUnifiedServer } from '../server/unified.js';
import { ToolRegistry } from '../mcp/tool-registry.js';
import { filesystemTools } from '../tools/filesystem.js';
import { ToolPermission } from '../types/index.js';
import type { ToolDefinition } from '../types/tools.types.js';

/**
 * CLI Configuration.
 */
interface CLIConfig {
  command: 'serve' | 'tools' | 'help' | 'version';
  workspace: string;
  port: number;
  enableMCP: boolean;
  enableHTTP: boolean;
  apiKey: string | undefined;
  permissions: ToolPermission[];
  verbose: boolean;
}

/**
 * Parse command line arguments.
 */
function parseArgs(args: string[]): CLIConfig {
  const config: CLIConfig = {
    command: 'help',
    workspace: process.cwd(),
    port: 3000,
    enableMCP: true,
    enableHTTP: true,
    apiKey: undefined,
    permissions: [ToolPermission.FILE_READ, ToolPermission.FILE_WRITE],
    verbose: false,
  };
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    switch (arg) {
      case 'serve':
      case 'start':
        config.command = 'serve';
        break;
      
      case 'tools':
      case 'list':
        config.command = 'tools';
        break;
      
      case '-h':
      case '--help':
      case 'help':
        config.command = 'help';
        break;
      
      case '-v':
      case '--version':
      case 'version':
        config.command = 'version';
        break;
      
      case '-w':
      case '--workspace':
        config.workspace = args[++i] ?? process.cwd();
        break;
      
      case '-p':
      case '--port':
        config.port = parseInt(args[++i] ?? '3000', 10);
        break;
      
      case '--mcp-only':
        config.enableHTTP = false;
        break;
      
      case '--http-only':
        config.enableMCP = false;
        break;
      
      case '--api-key':
        config.apiKey = args[++i];
        break;
      
      case '--read-only':
        config.permissions = [ToolPermission.FILE_READ];
        break;
      
      case '--full-access':
        config.permissions = [
          ToolPermission.FILE_READ,
          ToolPermission.FILE_WRITE,
          ToolPermission.FILE_DELETE,
          ToolPermission.SHELL_EXECUTE,
        ];
        break;
      
      case '--verbose':
        config.verbose = true;
        break;
    }
    
    i++;
  }
  
  return config;
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                         ANTIGRAVITY                               ║
║           Universal LLM Tool Server for AI Agents                 ║
╚═══════════════════════════════════════════════════════════════════╝

USAGE:
  antigravity <command> [options]

COMMANDS:
  serve         Start the server (default)
  tools         List available tools
  help          Show this help message
  version       Show version

OPTIONS:
  -w, --workspace <path>    Workspace root directory (default: cwd)
  -p, --port <number>       HTTP server port (default: 3000)
  --mcp-only                Only enable MCP (Claude) server
  --http-only               Only enable HTTP (OpenAI/Gemini) server
  --api-key <key>           Require API key for HTTP requests
  --read-only               Only allow read operations
  --full-access             Allow all operations including shell
  --verbose                 Enable verbose logging

EXAMPLES:
  # Start server with defaults
  antigravity serve

  # Start with custom workspace and port
  antigravity serve -w /path/to/project -p 8080

  # Claude-only (MCP) mode
  antigravity serve --mcp-only

  # OpenAI/Gemini only (HTTP) mode
  antigravity serve --http-only -p 3000

  # Secure mode with API key
  antigravity serve --api-key my-secret-key

PROVIDERS:
  Claude    MCP over stdio (add to claude_desktop_config.json)
  OpenAI    HTTP API at http://localhost:PORT/openai/*
  Gemini    HTTP API at http://localhost:PORT/gemini/*

CLAUDE DESKTOP CONFIG:
  {
    "mcpServers": {
      "antigravity": {
        "command": "antigravity",
        "args": ["serve", "-w", "/path/to/workspace"]
      }
    }
  }

OPENAI USAGE:
  1. Get tools:    GET  http://localhost:3000/openai/tools
  2. Execute:      POST http://localhost:3000/openai/execute

GEMINI USAGE:
  1. Get tools:    GET  http://localhost:3000/gemini/tools
  2. Execute:      POST http://localhost:3000/gemini/execute

For more info: https://github.com/STiFLeR7/antigravity
`);
}

/**
 * Print version.
 */
function printVersion(): void {
  console.log('antigravity v0.2.0');
}

/**
 * List available tools.
 */
function listTools(config: CLIConfig): void {
  const registry = new ToolRegistry({
    grantedPermissions: config.permissions,
    allowedCategories: [],
    defaultTimeoutMs: 30000,
    strictValidation: true,
  });
  
  for (const tool of filesystemTools) {
    registry.register(tool as ToolDefinition<Record<string, unknown>, unknown>);
  }
  
  const tools = registry.list();
  
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                      AVAILABLE TOOLS                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  for (const tool of tools) {
    console.log(`  📦 ${tool.id}`);
    console.log(`     ${tool.description}`);
    console.log(`     Category: ${tool.category}`);
    console.log('');
  }
  
  console.log(`Total: ${tools.length} tools\n`);
}

/**
 * Start the server.
 */
async function startServer(config: CLIConfig): Promise<void> {
  console.error('╔═══════════════════════════════════════════════════════════════════╗');
  console.error('║                         ANTIGRAVITY                               ║');
  console.error('║           Universal LLM Tool Server v0.2.0                        ║');
  console.error('╚═══════════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`  Workspace:  ${config.workspace}`);
  console.error(`  MCP:        ${config.enableMCP ? '✓ Enabled (stdio)' : '✗ Disabled'}`);
  console.error(`  HTTP:       ${config.enableHTTP ? `✓ Enabled (port ${config.port})` : '✗ Disabled'}`);
  console.error(`  Auth:       ${config.apiKey !== undefined ? '✓ API key required' : '✗ No authentication'}`);
  console.error('');
  
  const server = await startUnifiedServer({
    workspaceRoot: config.workspace,
    enableMCP: config.enableMCP,
    enableHTTP: config.enableHTTP,
    httpPort: config.port,
    apiKey: config.apiKey,
    permissions: config.permissions,
    logLevel: config.verbose ? 'debug' : 'info',
  });
  
  server.on('ready', (providers: string[]) => {
    console.error(`  Ready for: ${providers.join(', ')}`);
    console.error('');
    
    if (config.enableHTTP) {
      console.error('  Endpoints:');
      console.error(`    Health:   GET  http://localhost:${config.port}/health`);
      console.error(`    Tools:    GET  http://localhost:${config.port}/tools`);
      console.error(`    OpenAI:   POST http://localhost:${config.port}/openai/execute`);
      console.error(`    Gemini:   POST http://localhost:${config.port}/gemini/execute`);
      console.error('');
    }
    
    console.error('  Press Ctrl+C to stop\n');
  });
  
  server.on('tool:call', (provider: string, toolName: string, _args: unknown) => {
    if (config.verbose === true) {
      console.error(`  [${provider}] → ${toolName}`);
    }
  });
  
  server.on('tool:result', (provider: string, toolName: string, success: boolean) => {
    if (config.verbose === true) {
      console.error(`  [${provider}] ← ${toolName}: ${success ? '✓' : '✗'}`);
    }
  });
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.error('\n  Shutting down...');
    void server.stop().then(() => process.exit(0));
  });
  
  process.on('SIGTERM', () => {
    void server.stop().then(() => process.exit(0));
  });
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Default to serve if no command
  if (args.length === 0) {
    args.push('serve');
  }
  
  const config = parseArgs(args);
  
  switch (config.command) {
    case 'serve':
      await startServer(config);
      break;
    
    case 'tools':
      listTools(config);
      break;
    
    case 'version':
      printVersion();
      break;
    
    case 'help':
    default:
      printHelp();
      break;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
