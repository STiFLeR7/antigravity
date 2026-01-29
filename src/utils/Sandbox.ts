import * as path from 'path';

export class Sandbox {
  constructor(private root: string) {
    this.root = path.resolve(root);
  }

  resolvePath(unsafePath: string): string {
    const resolved = path.resolve(this.root, unsafePath);
    if (!resolved.startsWith(this.root)) {
      throw new Error(`Access denied: Path ${unsafePath} is outside the sandbox root ${this.root}`);
    }
    return resolved;
  }

  getRoot(): string {
    return this.root;
  }
}
