import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Activity, Role, StoreData, User } from '../shared/types.js';
import { seedData } from './seed.js';

const appRoot = path.resolve(process.cwd());
const dataDir = path.join(appRoot, 'data');
const storePath = path.join(dataDir, 'store.json');

export class JsonStore {
  private data: StoreData = structuredClone(seedData);
  private ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    await mkdir(dataDir, { recursive: true });
    try {
      this.data = JSON.parse(await readFile(storePath, 'utf8')) as StoreData;
    } catch {
      this.data = structuredClone(seedData);
      await this.persist();
    }
  }

  async all() {
    await this.ready;
    return this.data;
  }

  async mutate<T>(fn: (data: StoreData) => T | Promise<T>) {
    await this.ready;
    const result = await fn(this.data);
    await this.persist();
    return result;
  }

  private async persist() {
    await writeFile(storePath, JSON.stringify(this.data, null, 2));
  }

  async reset() {
    this.data = structuredClone(seedData);
    await this.persist();
  }

  async activity(user: User, action: string, entityType: string, entityId: string, detail: string) {
    return this.mutate((data) => {
      const entry: Activity = {
        id: `act-${Date.now()}`,
        tenantId: user.tenantId,
        actorId: user.id,
        actorRole: user.role as Role,
        action,
        entityType,
        entityId,
        timestamp: new Date().toISOString(),
        detail,
      };
      data.activities.unshift(entry);
      return entry;
    });
  }
}

export const store = new JsonStore();
