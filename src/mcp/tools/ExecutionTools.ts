import { exec } from 'child_process';
import { promisify } from 'util';
import { Sandbox } from '../../utils/Sandbox.js';
import { MCPTool } from '../types.js';

const execAsync = promisify(exec);

export function createExecutionTools(sandbox: Sandbox): MCPTool[] {
  return [
    {
      definition: {
        name: 'execute_command',
        description: 'Executes a shell command within the workspace sandbox',
        parameters: {
          type: 'object',
          properties: { 
            command: { type: 'string' }
          },
          required: ['command']
        }
      },
      async execute({ command }) {
        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: sandbox.getRoot(),
            timeout: 30000 // 30 second timeout
          });
          return {
            stdout,
            stderr,
            exitCode: 0
          };
        } catch (error: any) {
          return {
            stdout: error.stdout || '',
            stderr: error.stderr || error.message,
            exitCode: error.code || 1
          };
        }
      }
    }
  ];
}
