/**
 * @fileoverview Basic usage example for Antigravity agent runtime.
 * 
 * Run this example:
 *   npx ts-node examples/basic-usage.ts
 * 
 * Or compile and run:
 *   npm run build
 *   node dist/examples/basic-usage.js
 */

import {
  // Core components
  DecisionLoop,
  ToolRegistry,
  
  // Built-in tools
  filesystemTools,
  
  // Types & helpers
  ToolPermission,
  createUniqueId,
  createTimestamp,
  Priority,
  PlannedActionStatus,
  Severity,
  
  // Type definitions
  type UserIntent,
  type WorkspaceMetadata,
  type MCPContext,
  type ExecutionPlan,
  type PlannedAction,
  type AgentStep,
  type Planner,
  type Reflector,
  type ReflectionResult,
  
  // Observability
  createLogger,
  ConsoleTransport,
} from '../src/index.js';

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// ============ Configuration ============

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const MAX_STEPS = 5;

// ============ Setup Logger ============

const logger = createLogger('example', {
  minLevel: Severity.INFO,
  transports: [new ConsoleTransport(true)],
  module: 'example',
  includeTimestamp: true,
});

// ============ Custom Planner ============

/**
 * A simple planner that reads a file and then lists a directory.
 */
function createDemoPlanner(): Planner {
  let callCount = 0;
  
  return (context: MCPContext): Promise<ExecutionPlan> => {
    callCount++;
    
    let action: PlannedAction | null = null;
    
    if (callCount === 1) {
      // First call: read the README
      action = {
        id: createUniqueId(uuidv4()),
        index: 0,
        toolId: 'filesystem.read_file',
        description: 'Read the README.md file',
        expectedParameters: { 
          path: 'README.md',
          startLine: 1,
          endLine: 20,  // Just first 20 lines
        },
        dependsOn: [],
        priority: Priority.NORMAL,
        status: PlannedActionStatus.PENDING,
      };
    } else if (callCount === 2) {
      // Second call: list the src directory
      action = {
        id: createUniqueId(uuidv4()),
        index: 0,
        toolId: 'filesystem.list_directory',
        description: 'List the src directory',
        expectedParameters: { path: 'src' },
        dependsOn: [],
        priority: Priority.NORMAL,
        status: PlannedActionStatus.PENDING,
      };
    }
    
    return Promise.resolve({
      id: createUniqueId(uuidv4()),
      description: action ? `Execute: ${action.description}` : 'No more actions',
      actions: action ? [action] : [],
      currentIndex: 0,
      confidence: action ? 0.9 : 0.0,
      createdAt: createTimestamp(),
      revision: 0,
    });
  };
}

// ============ Custom Reflector ============

/**
 * A reflector that continues for 2 successful iterations, then stops.
 */
function createDemoReflector(): Reflector {
  let successCount = 0;
  const maxSuccesses = 2;
  
  return (context: MCPContext, _steps: ReadonlyArray<AgentStep>): Promise<ReflectionResult> => {
    const lastResult = context.recentResults[context.recentResults.length - 1];
    
    if (lastResult?.success) {
      successCount++;
      logger.info(`Action succeeded (${successCount}/${maxSuccesses})`, {
        toolId: lastResult.toolId,
      });
    } else if (lastResult) {
      logger.warn('Action failed', {
        toolId: lastResult.toolId,
        error: lastResult.error?.message,
      });
      
      return Promise.resolve({
        shouldContinue: false,
        isSuccess: false,
        reason: `Action failed: ${lastResult.error?.message ?? 'Unknown error'}`,
        adjustments: [],
      });
    }
    
    if (successCount >= maxSuccesses) {
      return Promise.resolve({
        shouldContinue: false,
        isSuccess: true,
        reason: `Completed ${successCount} actions successfully`,
        adjustments: [],
      });
    }
    
    return Promise.resolve({
      shouldContinue: true,
      isSuccess: false,
      reason: `Continuing... (${successCount}/${maxSuccesses} done)`,
      adjustments: [],
    });
  };
}

// ============ Main Function ============

async function main(): Promise<void> {
  logger.info('=== Antigravity Basic Usage Example ===');
  
  // 1. Create tool registry with permissions
  logger.info('Setting up tool registry...');
  const registry = new ToolRegistry({
    grantedPermissions: [
      ToolPermission.FILE_READ,
      ToolPermission.FILE_WRITE,
    ],
    allowedCategories: [],
    defaultTimeoutMs: 10000,
    strictValidation: true,
  });
  
  // 2. Register filesystem tools
  for (const tool of filesystemTools) {
    registry.register(tool as Parameters<typeof registry.register>[0]);
    logger.info(`Registered tool: ${tool.id}`);
  }
  
  // 3. Create the decision loop
  logger.info('Creating decision loop...');
  const loop = new DecisionLoop(
    {
      maxSteps: MAX_STEPS,
      toolTimeoutMs: 10000,
      sessionTimeoutMs: 60000,
      verbose: true,
      dryRun: false,
      allowedToolCategories: [],
      forbiddenPaths: ['node_modules', '.git'],
      planner: createDemoPlanner(),
      reflector: createDemoReflector(),
    },
    registry
  );
  
  // 4. Setup event listeners
  loop.on('loop:start', (sessionId, intent) => {
    logger.info('Loop started', { sessionId, intent: intent.rawInput });
  });
  
  loop.on('loop:step', (step) => {
    logger.info(`Step ${step.stepNumber}: ${step.phase}`, {
      description: step.description,
      outcome: step.outcome,
    });
  });
  
  loop.on('planning:complete', (plan) => {
    logger.info('Plan created', {
      actions: plan.actions.length,
      description: plan.description,
    });
  });
  
  loop.on('action:complete', (action, result) => {
    logger.info('Action completed', {
      toolId: action.toolId,
      success: result.success,
      durationMs: result.durationMs,
    });
  });
  
  loop.on('loop:complete', (sessionId, steps) => {
    logger.info('Loop completed successfully', {
      sessionId,
      totalSteps: steps.length,
    });
  });
  
  loop.on('loop:failed', (sessionId, reason) => {
    logger.error('Loop failed', { sessionId, reason });
  });
  
  // 5. Define the user intent
  const intent: UserIntent = {
    rawInput: 'Read README and list source files',
    action: 'explore',
    target: 'workspace',
    constraints: [],
    confidence: 1.0,
    capturedAt: createTimestamp(),
  };
  
  // 6. Define workspace metadata
  const workspace: WorkspaceMetadata = {
    rootPath: WORKSPACE_ROOT,
    projectType: 'typescript',
    frameworks: ['node'],
    activeFile: null,
    selection: null,
    gitBranch: 'main',
    hasUncommittedChanges: false,
    scannedAt: createTimestamp(),
  };
  
  // 7. Run the agent!
  logger.info('Starting agent execution...', { workspaceRoot: WORKSPACE_ROOT });
  
  try {
    const result = await loop.run(intent, workspace);
    
    console.log('\n' + '='.repeat(50));
    console.log('EXECUTION RESULT');
    console.log('='.repeat(50));
    console.log(`Success: ${result.success}`);
    console.log(`Steps: ${result.steps.length}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Reason: ${result.reason}`);
    
    // Print step summaries
    console.log('\nStep Summary:');
    for (const step of result.steps) {
      console.log(`  [${step.stepNumber}] ${step.phase}: ${step.description} (${step.outcome})`);
    }
    
    // Print tool results
    console.log('\nTool Results:');
    for (const toolResult of result.finalContext.recentResults) {
      console.log(`  ${toolResult.toolId}: ${toolResult.success ? 'SUCCESS' : 'FAILED'} (${toolResult.durationMs}ms)`);
      if (toolResult.success && toolResult.data) {
        const data = toolResult.data as Record<string, unknown>;
        if ('entries' in data) {
          // Directory listing
          const entries = data.entries as Array<{ name: string; type: string }>;
          console.log(`    Found ${entries.length} entries:`);
          entries.slice(0, 5).forEach(e => console.log(`      - ${e.name} (${e.type})`));
          if (entries.length > 5) console.log(`      ... and ${entries.length - 5} more`);
        } else if ('content' in data) {
          // File content
          const content = (data.content as string).slice(0, 200);
          console.log(`    Content preview: ${content}...`);
        }
      }
    }
    
  } catch (error) {
    logger.error('Execution error', {}, error as Error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
