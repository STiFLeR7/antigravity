/**
 * @fileoverview Built-in filesystem tools for Antigravity.
 * 
 * These tools provide safe file system operations within a sandboxed
 * workspace. All operations are validated against allowed paths and
 * produce structured, auditable results.
 * 
 * @module @orchidsai/antigravity/tools/filesystem
 * @version 0.1.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { ToolResult } from '../types/core.types.js';
import { createUniqueId, createTimestamp } from '../types/core.types.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
} from '../types/tools.types.js';
import {
  ToolCategory,
  ToolPermission,
} from '../types/tools.types.js';

// ============ Input/Output Schemas ============

const ListDirectoryInputSchema = z.object({
  path: z.string().describe('Relative path from workspace root'),
  recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
  maxDepth: z.number().optional().default(3).describe('Maximum recursion depth'),
});

const ListDirectoryOutputSchema = z.object({
  path: z.string(),
  entries: z.array(z.object({
    name: z.string(),
    type: z.enum(['file', 'directory', 'symlink', 'other']),
    size: z.number().optional(),
    modifiedAt: z.string().optional(),
  })),
  totalCount: z.number(),
});

const ReadFileInputSchema = z.object({
  path: z.string().describe('Relative path from workspace root'),
  encoding: z.enum(['utf-8', 'base64']).optional().default('utf-8'),
  startLine: z.number().optional().describe('Start reading from this line (1-indexed)'),
  endLine: z.number().optional().describe('Stop reading at this line (inclusive)'),
});

const ReadFileOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.string(),
  size: z.number(),
  lineCount: z.number(),
  truncated: z.boolean(),
});

const WriteFileInputSchema = z.object({
  path: z.string().describe('Relative path from workspace root'),
  content: z.string().describe('Content to write'),
  createDirectories: z.boolean().optional().default(true),
  overwrite: z.boolean().optional().default(false).describe('Must be true to overwrite existing files'),
});

const WriteFileOutputSchema = z.object({
  path: z.string(),
  bytesWritten: z.number(),
  created: z.boolean(),
  overwritten: z.boolean(),
});

// ============ Type Definitions ============

type ListDirectoryInput = z.infer<typeof ListDirectoryInputSchema>;
type ListDirectoryOutput = z.infer<typeof ListDirectoryOutputSchema>;
type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;
type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
type WriteFileOutput = z.infer<typeof WriteFileOutputSchema>;

// ============ Helper Functions ============

/**
 * Validates that a path is within the allowed workspace boundaries.
 */
function isPathAllowed(targetPath: string, allowedPaths: ReadonlyArray<string>): boolean {
  const normalizedTarget = path.normalize(targetPath);
  
  return allowedPaths.some(allowed => {
    const normalizedAllowed = path.normalize(allowed);
    return normalizedTarget.startsWith(normalizedAllowed);
  });
}

/**
 * Resolves a relative path against workspace root with validation.
 */
function resolveSafePath(
  relativePath: string,
  workspaceRoot: string,
  allowedPaths: ReadonlyArray<string>,
): { valid: boolean; absolutePath: string; error?: string } {
  // Normalize and resolve
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  
  // Check for path traversal attacks
  if (!absolutePath.startsWith(workspaceRoot)) {
    return {
      valid: false,
      absolutePath,
      error: 'Path traversal detected - path escapes workspace root',
    };
  }
  
  // Check against allowed paths
  if (!isPathAllowed(absolutePath, allowedPaths)) {
    return {
      valid: false,
      absolutePath,
      error: 'Path not in allowed paths list',
    };
  }
  
  return { valid: true, absolutePath };
}

/**
 * Creates a success result.
 */
function successResult<T>(toolId: string, data: T, startTime: number): ToolResult<T> {
  return {
    id: createUniqueId(uuidv4()),
    toolId,
    success: true,
    data,
    error: null,
    durationMs: Date.now() - startTime,
    completedAt: createTimestamp(),
  };
}

/**
 * Creates a failure result.
 */
function failureResult<T>(
  toolId: string,
  code: string,
  message: string,
  startTime: number,
  recoverable: boolean = true,
): ToolResult<T> {
  return {
    id: createUniqueId(uuidv4()),
    toolId,
    success: false,
    data: null,
    error: {
      code,
      message,
      recoverable,
      suggestions: [],
    },
    durationMs: Date.now() - startTime,
    completedAt: createTimestamp(),
  };
}

// ============ Tool Implementations ============

/**
 * Lists contents of a directory.
 */
async function executeListDirectory(
  input: ListDirectoryInput,
  context: ToolExecutionContext,
): Promise<ToolResult<ListDirectoryOutput>> {
  const startTime = Date.now();
  const toolId = 'filesystem.list_directory';
  
  // Validate and resolve path
  const pathResult = resolveSafePath(
    input.path,
    context.workspaceRoot,
    context.allowedPaths,
  );
  
  if (!pathResult.valid) {
    return failureResult(toolId, 'INVALID_PATH', pathResult.error!, startTime);
  }
  
  const absolutePath = pathResult.absolutePath;
  
  try {
    // Check if path exists and is a directory
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      return failureResult(toolId, 'NOT_DIRECTORY', 'Path is not a directory', startTime);
    }
    
    // Read directory entries
    const dirEntries = await fs.readdir(absolutePath, { withFileTypes: true });
    
    const entries = await Promise.all(
      dirEntries.map(async (entry) => {
        const entryPath = path.join(absolutePath, entry.name);
        let type: 'file' | 'directory' | 'symlink' | 'other' = 'other';
        let size: number | undefined;
        let modifiedAt: string | undefined;
        
        if (entry.isFile()) {
          type = 'file';
          try {
            const entryStats = await fs.stat(entryPath);
            size = entryStats.size;
            modifiedAt = entryStats.mtime.toISOString();
          } catch {
            // Ignore stat errors for individual files
          }
        } else if (entry.isDirectory()) {
          type = 'directory';
        } else if (entry.isSymbolicLink()) {
          type = 'symlink';
        }
        
        return { name: entry.name, type, size, modifiedAt };
      })
    );
    
    const output: ListDirectoryOutput = {
      path: input.path,
      entries,
      totalCount: entries.length,
    };
    
    return successResult(toolId, output, startTime);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failureResult(toolId, 'FS_ERROR', message, startTime);
  }
}

/**
 * Reads contents of a file.
 */
async function executeReadFile(
  input: ReadFileInput,
  context: ToolExecutionContext,
): Promise<ToolResult<ReadFileOutput>> {
  const startTime = Date.now();
  const toolId = 'filesystem.read_file';
  
  // Validate and resolve path
  const pathResult = resolveSafePath(
    input.path,
    context.workspaceRoot,
    context.allowedPaths,
  );
  
  if (!pathResult.valid) {
    return failureResult(toolId, 'INVALID_PATH', pathResult.error!, startTime);
  }
  
  const absolutePath = pathResult.absolutePath;
  
  try {
    // Check if file exists
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      return failureResult(toolId, 'NOT_FILE', 'Path is not a file', startTime);
    }
    
    // Read file content
    const encoding = input.encoding ?? 'utf-8';
    let content = await fs.readFile(absolutePath, encoding === 'utf-8' ? 'utf-8' : 'base64');
    
    // Handle line range if specified
    let lineCount = 0;
    let truncated = false;
    
    if (encoding === 'utf-8') {
      const lines = content.split('\n');
      lineCount = lines.length;
      
      if (input.startLine !== undefined || input.endLine !== undefined) {
        const start = (input.startLine ?? 1) - 1; // Convert to 0-indexed
        const end = input.endLine ?? lines.length;
        
        if (start >= 0 && start < lines.length) {
          content = lines.slice(start, end).join('\n');
          truncated = start > 0 || end < lines.length;
        }
      }
    }
    
    const output: ReadFileOutput = {
      path: input.path,
      content,
      encoding,
      size: stats.size,
      lineCount,
      truncated,
    };
    
    return successResult(toolId, output, startTime);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failureResult(toolId, 'FS_ERROR', message, startTime);
  }
}

/**
 * Writes content to a file.
 */
async function executeWriteFile(
  input: WriteFileInput,
  context: ToolExecutionContext,
): Promise<ToolResult<WriteFileOutput>> {
  const startTime = Date.now();
  const toolId = 'filesystem.write_file';
  
  // Check for dry-run mode
  if (context.dryRun) {
    context.logger.info('Dry-run mode: would write file', { path: input.path });
    return successResult(toolId, {
      path: input.path,
      bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
      created: true,
      overwritten: false,
    }, startTime);
  }
  
  // Validate and resolve path
  const pathResult = resolveSafePath(
    input.path,
    context.workspaceRoot,
    context.allowedPaths,
  );
  
  if (!pathResult.valid) {
    return failureResult(toolId, 'INVALID_PATH', pathResult.error!, startTime);
  }
  
  const absolutePath = pathResult.absolutePath;
  
  try {
    // Check if file exists
    let fileExists = false;
    try {
      await fs.access(absolutePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    
    // Enforce overwrite flag
    if (fileExists && !input.overwrite) {
      return failureResult(
        toolId,
        'FILE_EXISTS',
        'File already exists. Set overwrite: true to replace it.',
        startTime,
      );
    }
    
    // Create directories if needed
    if (input.createDirectories) {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    }
    
    // Write the file
    await fs.writeFile(absolutePath, input.content, 'utf-8');
    
    const output: WriteFileOutput = {
      path: input.path,
      bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
      created: !fileExists,
      overwritten: fileExists,
    };
    
    return successResult(toolId, output, startTime);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return failureResult(toolId, 'FS_ERROR', message, startTime);
  }
}

// ============ Tool Definitions ============

/**
 * Tool definition for listing directory contents.
 */
export const listDirectoryTool: ToolDefinition<ListDirectoryInput, ListDirectoryOutput> = {
  id: 'filesystem.list_directory',
  name: 'List Directory',
  description: 'Lists the contents of a directory within the workspace. Returns file names, types, sizes, and modification times.',
  category: ToolCategory.FILESYSTEM,
  inputSchema: {
    id: 'filesystem.list_directory.input',
    version: '1.0.0',
    schema: ListDirectoryInputSchema as unknown as Record<string, unknown>,
    description: 'Input for listing directory contents',
    examples: [{ path: 'src' }, { path: 'src/components', recursive: true }],
  },
  outputSchema: {
    id: 'filesystem.list_directory.output',
    version: '1.0.0',
    schema: ListDirectoryOutputSchema as unknown as Record<string, unknown>,
    description: 'Directory listing result',
    examples: [],
  },
  permissions: [ToolPermission.FILE_READ],
  hasSideEffects: false,
  idempotent: true,
  estimatedDurationMs: 100,
  execute: executeListDirectory,
  version: '1.0.0',
};

/**
 * Tool definition for reading file contents.
 */
export const readFileTool: ToolDefinition<ReadFileInput, ReadFileOutput> = {
  id: 'filesystem.read_file',
  name: 'Read File',
  description: 'Reads the contents of a file within the workspace. Supports reading specific line ranges.',
  category: ToolCategory.FILESYSTEM,
  inputSchema: {
    id: 'filesystem.read_file.input',
    version: '1.0.0',
    schema: ReadFileInputSchema as unknown as Record<string, unknown>,
    description: 'Input for reading file contents',
    examples: [{ path: 'src/index.ts' }, { path: 'README.md', startLine: 1, endLine: 50 }],
  },
  outputSchema: {
    id: 'filesystem.read_file.output',
    version: '1.0.0',
    schema: ReadFileOutputSchema as unknown as Record<string, unknown>,
    description: 'File content result',
    examples: [],
  },
  permissions: [ToolPermission.FILE_READ],
  hasSideEffects: false,
  idempotent: true,
  estimatedDurationMs: 50,
  execute: executeReadFile,
  version: '1.0.0',
};

/**
 * Tool definition for writing file contents.
 */
export const writeFileTool: ToolDefinition<WriteFileInput, WriteFileOutput> = {
  id: 'filesystem.write_file',
  name: 'Write File',
  description: 'Writes content to a file within the workspace. Requires explicit overwrite flag for existing files.',
  category: ToolCategory.FILESYSTEM,
  inputSchema: {
    id: 'filesystem.write_file.input',
    version: '1.0.0',
    schema: WriteFileInputSchema as unknown as Record<string, unknown>,
    description: 'Input for writing file contents',
    examples: [{ path: 'output.txt', content: 'Hello, World!' }],
  },
  outputSchema: {
    id: 'filesystem.write_file.output',
    version: '1.0.0',
    schema: WriteFileOutputSchema as unknown as Record<string, unknown>,
    description: 'File write result',
    examples: [],
  },
  permissions: [ToolPermission.FILE_WRITE],
  hasSideEffects: true,
  idempotent: false,
  estimatedDurationMs: 50,
  execute: executeWriteFile,
  version: '1.0.0',
};

/**
 * All filesystem tools.
 */
export const filesystemTools = [
  listDirectoryTool,
  readFileTool,
  writeFileTool,
] as const;
