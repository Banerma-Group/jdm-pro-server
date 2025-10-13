const debug = require('debug')('memory-monitor');
const redisClient = require('../services/redis');

class MemoryMonitor {
  constructor(options = {}) {
    this.options = {
      maxHeapUsed: options.maxHeapUsed || 400 * 1024 * 1024, // 400MB
      criticalHeapUsed: options.criticalHeapUsed || 450 * 1024 * 1024, // 450MB
      checkInterval: options.checkInterval || 60000, // 1 minute
      gcThreshold: options.gcThreshold || 350 * 1024 * 1024, // 350MB
      ...options,
    };

    this.isMonitoring = false;
    this.memoryHistory = [];
    this.maxHistorySize = 20;
    this.onCriticalMemory = options.onCriticalMemory || this.defaultCriticalHandler.bind(this);
  }

  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, this.options.checkInterval);

    debug('Memory monitoring started');
    this.logMemoryUsage();
  }

  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    debug('Memory monitoring stopped');
  }

  checkMemory() {
    const memInfo = this.getMemoryInfo();
    this.addToHistory(memInfo);

    if (memInfo.heapUsed > this.options.criticalHeapUsed) {
      this.handleCriticalMemory(memInfo);
    } else if (memInfo.heapUsed > this.options.maxHeapUsed) {
      this.handleHighMemory(memInfo);
    } else if (memInfo.heapUsed > this.options.gcThreshold) {
      this.forceGarbageCollection();
    }
  }

  getMemoryInfo() {
    const used = process.memoryUsage();
    return {
      rss: used.rss,
      heapUsed: used.heapUsed,
      heapTotal: used.heapTotal,
      external: used.external,
      timestamp: Date.now(),
    };
  }

  addToHistory(memInfo) {
    this.memoryHistory.push(memInfo);
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }
  }

  logMemoryUsage() {
    const memInfo = this.getMemoryInfo();
    const mb = bytes => Math.round((bytes / 1024 / 1024) * 100) / 100;

    debug(
      `Memory: RSS=${mb(memInfo.rss)}MB, Heap=${mb(memInfo.heapUsed)}/${mb(memInfo.heapTotal)}MB, External=${mb(memInfo.external)}MB`
    );

    return memInfo;
  }

  forceGarbageCollection() {
    if (global.gc) {
      const beforeGC = this.getMemoryInfo();
      global.gc();
      const afterGC = this.getMemoryInfo();

      const saved = beforeGC.heapUsed - afterGC.heapUsed;
      const mb = bytes => Math.round((bytes / 1024 / 1024) * 100) / 100;

      debug(`GC: Freed ${mb(saved)}MB (${mb(beforeGC.heapUsed)}MB → ${mb(afterGC.heapUsed)}MB)`);
      return saved;
    }
    return 0;
  }

  handleHighMemory(memInfo) {
    const mb = bytes => Math.round((bytes / 1024 / 1024) * 100) / 100;
    console.warn(`⚠️ High memory usage: ${mb(memInfo.heapUsed)}MB`);

    this.forceGarbageCollection();
    this.logMemoryUsage();
  }

  handleCriticalMemory(memInfo) {
    const mb = bytes => Math.round((bytes / 1024 / 1024) * 100) / 100;
    console.error(`🚨 Critical memory usage: ${mb(memInfo.heapUsed)}MB`);

    this.onCriticalMemory(memInfo);
  }

  defaultCriticalHandler(memInfo) {
    console.error('Initiating graceful shutdown due to memory pressure');

    // Try emergency cleanup
    this.emergencyCleanup();

    // Schedule process restart
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }

  emergencyCleanup() {
    try {
      // Force garbage collection multiple times
      if (global.gc) {
        for (let i = 0; i < 3; i++) {
          global.gc();
        }
      }

      // Clear memory history
      this.memoryHistory = [];

      debug('Emergency cleanup completed');
    } catch (error) {
      console.error('Error during emergency cleanup:', error);
    }
  }

  getMemoryTrend() {
    if (this.memoryHistory.length < 2) return null;

    const recent = this.memoryHistory.slice(-5);
    const avg = recent.reduce((sum, mem) => sum + mem.heapUsed, 0) / recent.length;
    const first = recent[0].heapUsed;
    const last = recent[recent.length - 1].heapUsed;

    return {
      trend: last > first ? 'increasing' : 'decreasing',
      change: last - first,
      average: avg,
      samples: recent.length,
    };
  }

  async cleanupRedisKeys(pattern = 'logistics-bot:*', maxAge = 7 * 24 * 60 * 60) {
    try {
      const stream = redisClient.scanStream({
        match: pattern,
        count: 100,
      });

      let cleaned = 0;
      const now = Math.floor(Date.now() / 1000);

      stream.on('data', async keys => {
        for (const key of keys) {
          try {
            const ttl = await redisClient.ttl(key);
            if (ttl === -1 || ttl > maxAge) {
              await redisClient.expire(key, maxAge);
              cleaned++;
            }
          } catch (error) {
            // Ignore individual key errors
          }
        }
      });

      stream.on('end', () => {
        debug(`Cleaned up ${cleaned} Redis keys`);
      });
    } catch (error) {
      console.warn('Error cleaning up Redis keys:', error);
    }
  }

  // Clean up session interactions across all sessions
  async cleanupAllSessionInteractions() {
    try {
      const sessionKeys = await redisClient.keys('logistics-bot:*');
      let totalCleaned = 0;

      for (const key of sessionKeys) {
        try {
          const sessionData = await redisClient.get(key);
          if (!sessionData) continue;

          const session = JSON.parse(sessionData);
          if (!session || typeof session !== 'object') continue;

          const interactionKeys = Object.keys(session).filter(k => k.startsWith('interaction_'));

          if (interactionKeys.length > 20) {
            // Keep only the 20 most recent interactions
            const keyTimestamps = interactionKeys.map(k => ({
              key: k,
              timestamp: session[k] || 0,
            }));

            keyTimestamps.sort((a, b) => b.timestamp - a.timestamp);
            const keysToRemove = keyTimestamps.slice(20).map(item => item.key);

            keysToRemove.forEach(k => delete session[k]);

            await redisClient.set(key, JSON.stringify(session));
            totalCleaned += keysToRemove.length;
          }
        } catch (error) {
          // Skip problematic sessions
        }
      }

      debug(`Cleaned ${totalCleaned} interaction keys from Redis sessions`);
      return totalCleaned;
    } catch (error) {
      console.warn('Error cleaning up session interactions:', error);
      return 0;
    }
  }

  // Get memory statistics
  getStats() {
    const memInfo = this.getMemoryInfo();
    const trend = this.getMemoryTrend();

    return {
      current: memInfo,
      trend,
      history: this.memoryHistory.slice(-10),
      thresholds: {
        gc: this.options.gcThreshold,
        warning: this.options.maxHeapUsed,
        critical: this.options.criticalHeapUsed,
      },
    };
  }
}

// Singleton instance
let instance = null;

function createMemoryMonitor(options) {
  if (!instance) {
    instance = new MemoryMonitor(options);
  }
  return instance;
}

function getMemoryMonitor() {
  return instance;
}

// Utility functions for session cleanup
function cleanupSessionObject(session, maxInteractions = 30) {
  if (!session || typeof session !== 'object') return session;

  const cleaned = { ...session };

  // Clean up interaction keys
  const interactionKeys = Object.keys(cleaned).filter(key => key.startsWith('interaction_'));

  if (interactionKeys.length > maxInteractions) {
    const keyTimestamps = interactionKeys.map(key => ({
      key,
      timestamp: cleaned[key] || 0,
    }));

    keyTimestamps.sort((a, b) => b.timestamp - a.timestamp);
    const keysToRemove = keyTimestamps.slice(maxInteractions).map(item => item.key);

    keysToRemove.forEach(key => delete cleaned[key]);
  }

  // Clean up temporary data
  const tempKeys = Object.keys(cleaned).filter(
    key => key.startsWith('temp_') || key.startsWith('cache_')
  );
  tempKeys.forEach(key => delete cleaned[key]);

  // Limit search history
  if (cleaned.searchHistory && Array.isArray(cleaned.searchHistory)) {
    if (cleaned.searchHistory.length > 10) {
      cleaned.searchHistory = cleaned.searchHistory.slice(-10);
    }
  }

  return cleaned;
}

module.exports = {
  MemoryMonitor,
  createMemoryMonitor,
  getMemoryMonitor,
  cleanupSessionObject,
};
