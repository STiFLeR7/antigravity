export class ContextManager {
    context;
    constructor(initialContext = {}) {
        this.context = {
            workspaceRoot: initialContext.workspaceRoot || process.cwd(),
            env: initialContext.env || {},
            permissions: initialContext.permissions || []
        };
    }
    getContext() {
        return { ...this.context };
    }
    updateEnv(key, value) {
        this.context.env[key] = value;
    }
    addPermission(toolName) {
        if (!this.context.permissions.includes(toolName)) {
            this.context.permissions.push(toolName);
        }
    }
}
