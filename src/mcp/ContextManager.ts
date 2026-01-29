import { MCPContext } from './types.js';

export class ContextManager {
  private context: MCPContext;

  constructor(initialContext: Partial<MCPContext> = {}) {
    this.context = {
      workspaceRoot: initialContext.workspaceRoot || process.cwd(),
      env: initialContext.env || {},
      permissions: initialContext.permissions || []
    };
  }

  getContext(): MCPContext {
    return { ...this.context };
  }

  updateEnv(key: string, value: string) {
    this.context.env[key] = value;
  }

  addPermission(toolName: string) {
    if (!this.context.permissions.includes(toolName)) {
      this.context.permissions.push(toolName);
    }
  }
}
