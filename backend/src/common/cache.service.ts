import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Small key-value cache with expiry. Uses Redis when REDIS_URL is set (Docker and production);
 * otherwise an in-memory map, so local development still needs no extra services.
 * Values are stored as JSON.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly log = new Logger('Cache');
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    this.redis = url ? new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false }) : null;
    this.redis?.on('error', (e) => this.log.warn(`Redis error: ${e.message}`));
    this.log.log(this.redis ? 'Using Redis' : 'REDIS_URL not set, using in-memory cache');
  }

  get backend(): 'Redis' | 'In-memory' {
    return this.redis ? 'Redis' : 'In-memory';
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.redis ? await this.redis.get(key) : this.memoryGet(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSec: number) {
    const raw = JSON.stringify(value);
    if (this.redis) await this.redis.set(key, raw, 'EX', ttlSec);
    else this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSec * 1000 });
  }

  /** Return the cached value, or compute it, store it for ttlSec and return it. */
  async wrap<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await compute();
    await this.set(key, value, ttlSec);
    return value;
  }

  /** Increment a counter; the expiry starts with the first increment. Returns the new count. */
  async incr(key: string, ttlSec: number): Promise<number> {
    if (this.redis) {
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, ttlSec);
      return n;
    }
    const n = Number(this.memoryGet(key) ?? 0) + 1;
    const existing = this.memory.get(key);
    this.memory.set(key, { value: String(n), expiresAt: existing && n > 1 ? existing.expiresAt : Date.now() + ttlSec * 1000 });
    return n;
  }

  async del(key: string) {
    if (this.redis) await this.redis.del(key);
    else this.memory.delete(key);
  }

  /** Round-trip time in milliseconds, or null if the cache cannot be reached. */
  async ping(): Promise<number | null> {
    const t = process.hrtime.bigint();
    try {
      if (this.redis) await this.redis.ping();
      return Number(process.hrtime.bigint() - t) / 1e6;
    } catch {
      return null;
    }
  }

  private memoryGet(key: string): string | null {
    const e = this.memory.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { this.memory.delete(key); return null; }
    return e.value;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
