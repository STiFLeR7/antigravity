export class MCPRegistry {
    tools = new Map();
    register(tool) {
        if (this.tools.has(tool.definition.name)) {
            throw new Error(`Tool already registered: ${tool.definition.name}`);
        }
        this.tools.set(tool.definition.name, tool);
    }
    getTool(name) {
        return this.tools.get(name);
    }
    getAllDefinitions() {
        return Array.from(this.tools.values()).map(t => t.definition);
    }
}
