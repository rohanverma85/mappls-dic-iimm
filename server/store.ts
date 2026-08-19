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
      this.data = this.normalize(JSON.parse(await readFile(storePath, 'utf8')) as Partial<StoreData>);
    } catch {
      this.data = structuredClone(seedData);
      await this.persist();
    }
  }

  private normalize(input: Partial<StoreData>): StoreData {
    const defaults = structuredClone(seedData);
    const projects = (input.projects ?? defaults.projects).map((project) => {
      const seeded = defaults.projects.find((item) => item.id === project.id);
      return {
        ...project,
        center: project.center ?? seeded?.center ?? { lat:28.6139, lng:77.2090 },
        geofenceRadiusMeters: project.geofenceRadiusMeters ?? seeded?.geofenceRadiusMeters ?? 250,
        documents: project.documents ?? seeded?.documents ?? [],
      };
    });
    const assets = (input.assets ?? defaults.assets).map((asset) => {
      const seeded = defaults.assets.find((item) => item.id === asset.id);
      const project = projects.find((item) => item.id === asset.projectId);
      return {
        ...asset,
        geometry: asset.geometry ?? seeded?.geometry ?? { type:'Point' as const, coordinates:[project?.center.lng ?? 77.2090,project?.center.lat ?? 28.6139] },
        layerId: asset.layerId ?? seeded?.layerId ?? null,
      };
    });
    const defects = (input.defects ?? defaults.defects).map((defect) => ({
      ...defect,
      geofence: defect.geofence ?? null,
      locationAccuracyMeters: defect.locationAccuracyMeters ?? undefined,
      atr: defect.atr ?? undefined,
      feedback: defect.feedback ?? undefined,
    }));
    return {
      ...defaults,
      ...input,
      projects,
      assets,
      defects,
      gisLayers: input.gisLayers ?? defaults.gisLayers,
      gisImports: input.gisImports ?? [],
      syncConflicts: input.syncConflicts ?? [],
      mediaEvidence: input.mediaEvidence ?? [],
    };
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
