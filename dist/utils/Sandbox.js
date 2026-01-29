import * as path from 'path';
export class Sandbox {
    root;
    constructor(root) {
        this.root = root;
        this.root = path.resolve(root);
    }
    resolvePath(unsafePath) {
        const resolved = path.resolve(this.root, unsafePath);
        if (!resolved.startsWith(this.root)) {
            throw new Error(`Access denied: Path ${unsafePath} is outside the sandbox root ${this.root}`);
        }
        return resolved;
    }
    getRoot() {
        return this.root;
    }
}
