## Project Summary
Antigravity is an MCP-backed agent runtime designed for the OrchidsAI IDE. it enables autonomous, structured, and auditable interaction with project workspaces through a disciplined agent loop and the Model Context Protocol (MCP).

## Tech Stack
- TypeScript / Node.js
- JSON Schema (for tool contracts)
- MCP (Model Context Protocol)

## Architecture
- **Agent Decision Loop**: Orchestrates the Goal-Plan-Act-Observe-Reflect cycle.
- **MCP Runtime**: Manages context, tool registration, and dispatching.
- **Tooling Layer**: Provides filesystem, execution, and workspace utilities.
- **State & Memory**: Handles session persistence and historical context.
- **IDE Integration**: Connects the runtime to the OrchidsAI IDE interface.

## User Preferences
- Follow the provided Statement of Work (SoW) strictly.
- Priorities: Correctness, clarity, and composability.

## Project Guidelines
- No blind overwrites in `write_file`.
- All changes must be traceable and reversible.
- Enforce strict sandboxing for workspace tools.
- Log every decision deterministically.

## Common Patterns
- (Empty)
