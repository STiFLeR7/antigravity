# Antigravity Design Specification (v0)

## 1. High-Level Architecture
Antigravity is structured as a modular runtime.

- **Loop Controller**: Manages the state machine of the agent.
- **MCP Registry**: Stores and validates tool definitions.
- **Context Provider**: Aggregates workspace state, history, and user intent.
- **Dispatcher**: Safely executes tools and captures results.
- **Sandbox**: Enforces filesystem and execution constraints.

## 2. Agent Lifecycle
The lifecycle follows a deterministic sequence:
1. **Goal**: User provides intent.
2. **Plan**: Agent decomposes goal into steps.
3. **Act**: Agent selects and invokes a tool via MCP.
4. **Observe**: System captures tool output and environment changes.
5. **Reflect**: Agent evaluates result against the plan.
6. **Continue**: Loop repeats or terminates on success/fail.

## 3. MCP Schema Specification (v0)
Tool contracts use JSON Schema.

### Context Schema
```json
{
  "intent": "string",
  "workspace": {
    "root": "string",
    "files": ["string"]
  },
  "history": [
    {
      "step": "number",
      "action": "object",
      "observation": "object"
    }
  ],
  "memory": "object"
}
```

### Tool Contract Example
```json
{
  "name": "read_file",
  "description": "Reads the content of a file",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  }
}
```

## 4. Trust & Permission Boundaries
- **Filesystem**: Operations restricted to `process.cwd()` or a configured workspace root.
- **Execution**: Shell commands restricted to non-interactive, time-limited processes.
- **Validation**: Every tool output is validated against its schema before being added to context.
- **User Interrupt**: The loop can be paused or terminated by the host IDE at any step.

## 5. Failure Semantics
- **Tool Error**: Result captured as an error observation; agent must reflect and decide whether to retry or pivot.
- **Timeout**: Action is aborted; system injects a timeout error into context.
- **Validation Error**: tool call rejected; agent notified of schema mismatch.
