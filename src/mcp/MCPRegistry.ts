import { MCPTool, ToolDefinition } from './types.js';

export class MCPRegistry {
  private tools: Map<string, MCPTool> = new Map();

  register(tool: MCPTool) {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }
}
