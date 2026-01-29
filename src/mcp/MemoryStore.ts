export interface MemoryEntry {
  key: string;
  value: any;
  timestamp: number;
}

export class MemoryStore {
  private memory: Map<string, MemoryEntry> = new Map();

  set(key: string, value: any) {
    this.memory.set(key, {
      key,
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): any {
    return this.memory.get(key)?.value;
  }

  getAll(): MemoryEntry[] {
    return Array.from(this.memory.values());
  }

  clear() {
    this.memory.clear();
  }
}
