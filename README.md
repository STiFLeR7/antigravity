# 🚀 Antigravity

**Universal LLM Tool Server** - Connect Claude, OpenAI, and Gemini to your workspace

[![npm version](https://img.shields.io/npm/v/@stifler7/antigravity)](https://www.npmjs.com/package/@stifler7/antigravity)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green.svg)](https://nodejs.org/)

---

## 🎯 What is Antigravity?

Antigravity is a **production-ready tool server** that lets AI models interact with your filesystem safely. It works with:

| Provider | Protocol | Status |
|----------|----------|--------|
| **Claude** | MCP (Model Context Protocol) | ✅ Full Support |
| **OpenAI/ChatGPT** | Function Calling API | ✅ Full Support |
| **Google Gemini** | Function Calling API | ✅ Full Support |
| **Azure OpenAI** | Function Calling API | ✅ Full Support |
| **Vertex AI** | Function Calling API | ✅ Full Support |

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Claude      │     │     OpenAI      │     │     Gemini      │
│   (MCP stdio)   │     │   (HTTP API)    │     │   (HTTP API)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │      ANTIGRAVITY       │
                    │   Universal Server     │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │  Tool Registry   │  │
                    │  │  • filesystem    │  │
                    │  │  • (extensible)  │  │
                    │  └──────────────────┘  │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │   Permissions    │  │
                    │  │   & Sandbox      │  │
                    │  └──────────────────┘  │
                    └────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │     Your Workspace     │
                    │   (Safe & Auditable)   │
                    └────────────────────────┘
```

---

## ✨ Features

- 🔒 **Sandboxed Execution** - Files operations restricted to allowed paths
- 📝 **Full Auditability** - Every action is logged and traceable
- 🔐 **Permission System** - Fine-grained control (`FILE_READ`, `FILE_WRITE`, etc.)
- 🧩 **Extensible** - Easy to add custom tools
- 🌐 **Multi-Provider** - One server, all LLMs
- ⚡ **Production-Ready** - TypeScript strict mode, comprehensive tests

---

## 📦 Installation

```bash
# Global install (recommended for CLI)
npm install -g @stifler7/antigravity

# Or as a project dependency
npm install @stifler7/antigravity
```

---

## 🚀 Quick Start

### CLI Usage

```bash
# Start the server
antigravity serve

# With custom workspace
antigravity serve -w /path/to/project

# HTTP only (for OpenAI/Gemini)
antigravity serve --http-only -p 3000

# MCP only (for Claude Desktop)
antigravity serve --mcp-only

# List available tools
antigravity tools

# Help
antigravity --help
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "antigravity": {
      "command": "antigravity",
      "args": ["serve", "-w", "C:/path/to/your/project"]
    }
  }
}
```

Restart Claude Desktop, then ask Claude:
> "List the files in my project"  
> "Read the README.md file"  
> "Create a new file called hello.ts"

### OpenAI / ChatGPT

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

// 1. Get available tools
const toolsResponse = await fetch('http://localhost:3000/openai/tools');
const tools = await toolsResponse.json();

// 2. Call OpenAI with tools
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'List files in the src directory' }],
  tools: tools,
});

// 3. If OpenAI wants to call a tool
if (response.choices[0].message.tool_calls) {
  for (const toolCall of response.choices[0].message.tool_calls) {
    const result = await fetch('http://localhost:3000/openai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolCall),
    });
    console.log(await result.json());
  }
}
```

### Google Gemini

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Get available tools
const toolsResponse = await fetch('http://localhost:3000/gemini/tools');
const tools = await toolsResponse.json();

// 2. Call Gemini with tools
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
  tools: [tools],
});

const result = await model.generateContent('Read the package.json file');

// 3. Handle function calls
const functionCall = result.response.candidates[0].content.parts[0].functionCall;
if (functionCall) {
  const toolResult = await fetch('http://localhost:3000/gemini/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(functionCall),
  });
  console.log(await toolResult.json());
}
```

### As a Library

```typescript
import {
  UnifiedServer,
  ToolRegistry,
  filesystemTools,
  ToolPermission,
  LLMProvider,
  createOpenAIProvider,
} from '@stifler7/antigravity';

// Option 1: Use the unified server
const server = new UnifiedServer({
  workspaceRoot: '/path/to/project',
  enableMCP: true,
  enableHTTP: true,
  httpPort: 3000,
});
await server.start();

// Option 2: Use providers directly
const openai = createOpenAIProvider();
const tools = filesystemTools.map(t => openai.formatTool(t));
// Use tools array in your OpenAI API calls

// Option 3: Use tool registry directly
const registry = new ToolRegistry({
  grantedPermissions: [ToolPermission.FILE_READ],
});
filesystemTools.forEach(tool => registry.register(tool));

const result = await registry.invoke({
  toolId: 'filesystem.read_file',
  input: { path: 'README.md' },
  context: myContext,
});
```

---

## 🔧 Available Tools

| Tool | Description | Permission |
|------|-------------|------------|
| `filesystem.list_directory` | List directory contents | `FILE_READ` |
| `filesystem.read_file` | Read file content | `FILE_READ` |
| `filesystem.write_file` | Write content to file | `FILE_WRITE` |

---

## 🔐 Permissions

| Permission | Description |
|------------|-------------|
| `FILE_READ` | Read files and list directories |
| `FILE_WRITE` | Create and modify files |
| `FILE_DELETE` | Delete files and directories |
| `SHELL_EXECUTE` | Run shell commands |
| `NETWORK` | Make network requests |

```bash
# Read-only mode
antigravity serve --read-only

# Full access (be careful!)
antigravity serve --full-access
```

---

## 🛡️ Security

Antigravity is designed with security in mind:

1. **Path Sandboxing** - All file operations are restricted to the workspace
2. **Permission Validation** - Each tool declares required permissions
3. **Input Validation** - All inputs are validated with Zod schemas
4. **Audit Logging** - Every operation is logged
5. **API Key Support** - Optional authentication for HTTP endpoints

```bash
# Require API key for HTTP requests
antigravity serve --api-key your-secret-key
```

---

## 📡 API Reference

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/tools` | GET | List all tools (generic format) |
| `/openai/tools` | GET | List tools (OpenAI format) |
| `/openai/execute` | POST | Execute tool (OpenAI format) |
| `/gemini/tools` | GET | List tools (Gemini format) |
| `/gemini/execute` | POST | Execute tool (Gemini format) |
| `/execute` | POST | Execute tool (generic format) |

### Generic Execute Request

```json
POST /execute
{
  "provider": "openai" | "gemini" | "generic",
  "tool": "filesystem.read_file",
  "arguments": {
    "path": "README.md"
  }
}
```

---

## 🔌 Adding Custom Tools

```typescript
import { UnifiedServer, ToolPermission } from '@stifler7/antigravity';
import { z } from 'zod';

const myCustomTool = {
  id: 'custom.greet',
  name: 'Greet',
  description: 'Returns a greeting message',
  category: 'custom',
  requiredPermissions: [],
  inputSchema: z.object({
    name: z.string().describe('Name to greet'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async (input) => ({
    message: `Hello, ${input.name}!`,
  }),
};

const server = new UnifiedServer({
  workspaceRoot: '/path/to/project',
  customTools: [myCustomTool],
});
```

---

## 🧪 Development

```bash
# Clone
git clone https://github.com/STiFLeR7/antigravity.git
cd antigravity

# Install
npm install

# Build
npm run build

# Test
npm test

# Start locally
npm start
```

---

## 📁 Project Structure

```
antigravity/
├── src/
│   ├── index.ts           # Main exports
│   ├── cli/               # CLI application
│   ├── providers/         # LLM provider adapters
│   │   ├── base.ts        # Abstract provider interface
│   │   ├── claude.ts      # Claude MCP adapter
│   │   ├── openai.ts      # OpenAI function calling adapter
│   │   └── gemini.ts      # Google Gemini adapter
│   ├── server/            # Server implementations
│   │   └── unified.ts     # Multi-provider server
│   ├── mcp/               # MCP runtime
│   │   ├── context-manager.ts
│   │   └── tool-registry.ts
│   ├── agent/             # Agent runtime
│   │   ├── lifecycle.ts
│   │   └── decision-loop.ts
│   ├── tools/             # Built-in tools
│   │   └── filesystem.ts
│   ├── observability/     # Logging & tracing
│   │   ├── logger.ts
│   │   └── tracer.ts
│   └── types/             # TypeScript definitions
├── examples/              # Usage examples
├── tests/                 # Test suites
└── README.md
```

---

## 📄 License

MIT © STiFLeR7

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for the Model Context Protocol
- [OpenAI](https://openai.com) for function calling API design
- [Google](https://google.com) for Gemini API

---

**Made with ❤️ for the AI developer community**
