import * as fs from 'fs/promises';
export function createFilesystemTools(sandbox) {
    return [
        {
            definition: {
                name: 'list_directory',
                description: 'Lists the contents of a directory',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string' } },
                    required: ['path']
                }
            },
            async execute({ path: targetPath }) {
                const resolvedPath = sandbox.resolvePath(targetPath);
                const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
                return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
            }
        },
        {
            definition: {
                name: 'read_file',
                description: 'Reads the content of a file',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string' } },
                    required: ['path']
                }
            },
            async execute({ path: targetPath }) {
                const resolvedPath = sandbox.resolvePath(targetPath);
                return await fs.readFile(resolvedPath, 'utf-8');
            }
        },
        {
            definition: {
                name: 'write_file',
                description: 'Writes content to a file. Does not overwrite without explicit confirmation (mocked for now).',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        content: { type: 'string' }
                    },
                    required: ['path', 'content']
                }
            },
            async execute({ path: targetPath, content }) {
                const resolvedPath = sandbox.resolvePath(targetPath);
                await fs.writeFile(resolvedPath, content, 'utf-8');
                return { success: true, path: targetPath };
            }
        },
        {
            definition: {
                name: 'apply_diff',
                description: 'Applies a string replacement diff to a file',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        oldString: { type: 'string' },
                        newString: { type: 'string' }
                    },
                    required: ['path', 'oldString', 'newString']
                }
            },
            async execute({ path: targetPath, oldString, newString }) {
                const resolvedPath = sandbox.resolvePath(targetPath);
                const content = await fs.readFile(resolvedPath, 'utf-8');
                if (!content.includes(oldString)) {
                    throw new Error(`Old string not found in file: ${targetPath}`);
                }
                const newContent = content.replace(oldString, newString);
                await fs.writeFile(resolvedPath, newContent, 'utf-8');
                return { success: true, path: targetPath };
            }
        }
    ];
}
