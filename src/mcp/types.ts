import { Action, Observation } from '../types/index.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPTool {
  definition: ToolDefinition;
  execute(parameters: any): Promise<any>;
}

export interface MCPContext {
  workspaceRoot: string;
  env: Record<string, string>;
  permissions: string[];
}
