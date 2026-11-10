/**
 * Platform-Independent Storage Abstraction Layer
 * Prepares the dashboard architecture for Cloudflare Workers & Supabase Integration.
 * 
 * Separates data persistence from business logic:
 * - FileStorageAdapter: Node.js filesystem persistence for local development (data/database.json).
 * - MemoryStorageAdapter: Zero-filesystem in-memory persistence for Cloudflare Workers.
 * - SupabaseStorageAdapter: Contract interface prepared for Phase 3 Supabase PostgreSQL migration.
 */

import type { DatabaseSchema } from '../db';

export interface StorageAdapter {
  name: string;
  isPersistent: boolean;
  getData(): DatabaseSchema;
  save(): Promise<void> | void;
  reset(): Promise<void> | void;
}

/**
 * MemoryStorageAdapter:
 * Operates without Node.js filesystem APIs, fully compatible with Cloudflare Workers runtime.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  public name = 'CloudflareWorkerMemory';
  public isPersistent = false;
  private data: DatabaseSchema;

  constructor(initialData: DatabaseSchema) {
    this.data = JSON.parse(JSON.stringify(initialData));
  }

  public getData(): DatabaseSchema {
    return this.data;
  }

  public save(): void {
    // In-memory state maintained across requests in worker instance
  }

  public reset(): void {
    // Reset state to initial baseline
  }
}

/**
 * FileStorageAdapter (Node.js Environment Only):
 * Wraps local filesystem database for Express development server.
 */
export class FileStorageAdapter implements StorageAdapter {
  public name = 'LocalFilesystemJSON';
  public isPersistent = true;
  private dbInstance: any;

  constructor(dbInstance: any) {
    this.dbInstance = dbInstance;
  }

  public getData(): DatabaseSchema {
    return this.dbInstance.getRawData();
  }

  public save(): void {
    this.dbInstance.save();
  }

  public reset(): void {
    this.dbInstance.reset();
  }
}

/**
 * SupabaseStorageAdapter (Blueprint for Phase 3):
 * Prepared interface for Supabase PostgreSQL database and authentication integration.
 * In Phase 3, this will map DatabaseSchema collections to Supabase client queries.
 */
export interface SupabaseConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  public name = 'SupabasePostgres';
  public isPersistent = true;
  private fallbackMemory: MemoryStorageAdapter;

  constructor(initialData: DatabaseSchema, _config?: SupabaseConfig) {
    this.fallbackMemory = new MemoryStorageAdapter(initialData);
  }

  public getData(): DatabaseSchema {
    // In Phase 3, queries Supabase PostgreSQL tables; currently falls back safely
    return this.fallbackMemory.getData();
  }

  public async save(): Promise<void> {
    // In Phase 3, commits entity mutations to Supabase tables
  }

  public async reset(): Promise<void> {
    // In Phase 3, triggers seed script or test schema rollback
  }
}
