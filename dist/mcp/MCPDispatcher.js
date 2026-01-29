export class MCPDispatcher {
    registry;
    context;
    constructor(registry, context) {
        this.registry = registry;
        this.context = context;
    }
    async dispatch(action) {
        const tool = this.registry.getTool(action.tool);
        if (!tool) {
            return {
                success: false,
                error: `Tool not found: ${action.tool}`,
                timestamp: Date.now()
            };
        }
        // Basic permission check (can be expanded)
        if (this.context.permissions.length > 0 && !this.context.permissions.includes(action.tool)) {
            return {
                success: false,
                error: `Permission denied for tool: ${action.tool}`,
                timestamp: Date.now()
            };
        }
        try {
            // Validate parameters against schema (simple check for now)
            this.validateParameters(tool.definition, action.parameters);
            const result = await tool.execute(action.parameters);
            return {
                success: true,
                data: result,
                timestamp: Date.now()
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || 'Unknown error during tool execution',
                timestamp: Date.now()
            };
        }
    }
    validateParameters(definition, parameters) {
        if (definition.parameters.required) {
            for (const req of definition.parameters.required) {
                if (!(req in parameters)) {
                    throw new Error(`Missing required parameter: ${req}`);
                }
            }
        }
    }
}
