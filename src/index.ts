import { Action, AgentContext, Observation } from './types/index.js';
import { LoopController, Decider, ToolExecutor } from './agent/LoopController.js';
import { MCPRegistry } from './mcp/MCPRegistry.js';
import { MCPDispatcher } from './mcp/MCPDispatcher.js';
import { ContextManager } from './mcp/ContextManager.js';
import { Sandbox } from './utils/Sandbox.js';
import { createFilesystemTools } from './mcp/tools/FilesystemTools.js';
import { createExecutionTools } from './mcp/tools/ExecutionTools.js';

class MockDecider implements Decider {
  private steps = 0;
  async decide(context: AgentContext): Promise<{ action?: Action; thought: string; terminal?: boolean }> {
    this.steps++;
    if (this.steps === 1) {
      return {
        thought: 'I will list the files using a shell command.',
        action: { 
          tool: 'execute_command', 
          parameters: { command: 'dir' }, // Using 'dir' for Windows
          reasoning: 'To verify execution tools.' 
        }
      };
    } else {
      return {
        thought: 'Task completed.',
        terminal: true
      };
    }
  }
}

async function main() {
  const sandbox = new Sandbox(process.cwd());
  const registry = new MCPRegistry();
  
  createFilesystemTools(sandbox).forEach(tool => registry.register(tool));
  createExecutionTools(sandbox).forEach(tool => registry.register(tool));

  const contextManager = new ContextManager();
  const dispatcher = new MCPDispatcher(registry, contextManager.getContext());

  const decider = new MockDecider();
  const executor: ToolExecutor = {
    execute: (action: Action) => dispatcher.dispatch(action)
  };

  const controller = new LoopController(decider, executor);

  console.log('Starting Antigravity Phase 4 Verification...');
  const result = await controller.run('Run a shell command');

  console.log('Run complete.');
  console.log('Success:', result.success);
  
  const execObservation = result.history.find(h => h.action?.tool === 'execute_command')?.observation;
  console.log('Command Output (stdout):', execObservation?.data?.stdout?.substring(0, 100) + '...');
}

main().catch(console.error);
