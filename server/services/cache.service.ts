/**
 * In-Memory Cache Service
 * 
 * Provides a simple, efficient caching layer for frequently accessed data.
 * Suitable for serverless environments where Redis may not be available.
 * 
 * Features:
 * - TTL (Time To Live) support
 * - Automatic cleanup of expired entries
 * - Memory usage monitoring
 * - Cache hit/miss statistics
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  hitRate: number;
}

class InMemoryCacheService {
  private cache: Map<string, CacheEntry<any>>;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout | null;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    };

    // Start automatic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);

    console.log('✅ In-Memory Cache Service initialized');
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    this.stats.hits++;
    this.updateHitRate();
    return entry.value as T;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in milliseconds (optional)
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.DEFAULT_TTL);
    
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
    });

    this.stats.sets++;
    this.stats.size = this.cache.size;
  }

  /**
   * Delete a value from the cache
   * @param key Cache key
   * @returns true if deleted, false if not found
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
    }
    return deleted;
  }

  /**
   * Check if a key exists in the cache (and is not expired)
   * @param key Cache key
   * @returns true if exists and not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      return false;
    }

    return true;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    console.log('🗑️ Cache cleared');
  }

  /**
   * Get or set a value (lazy loading pattern)
   * @param key Cache key
   * @param factory Function to generate value if not cached
   * @param ttl Time to live in milliseconds (optional)
   * @returns Cached or newly generated value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      console.log(`✅ Cache HIT: ${key}`);
      return cached;
    }

    console.log(`❌ Cache MISS: ${key} - fetching...`);
    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Remove expired entries from the cache
   */
  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.cache.size;
      console.log(`🧹 Cache cleanup: ${evicted} expired entries removed`);
    }
  }

  /**
   * Update hit rate statistic
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get memory usage estimate (approximate)
   */
  getMemoryUsage(): { entries: number; estimatedMB: number } {
    const memoryUsage = process.memoryUsage();
    return {
      entries: this.cache.size,
      estimatedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    };
  }

  /**
   * Graceful shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    console.log('🔄 Cache service destroyed');
  }
}

// Singleton instance
const cacheService = new InMemoryCacheService();

// Graceful shutdown
process.on('SIGTERM', () => {
  cacheService.destroy();
});

process.on('SIGINT', () => {
  cacheService.destroy();
});

export { cacheService, InMemoryCacheService };
export type { CacheStats };
