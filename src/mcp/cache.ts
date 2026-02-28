/**
 * MCP Tools Cache Module
 * Caches tool list to avoid repeated API calls
 */

import type { McpTool } from "./types.js";

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export class McpToolCache {
    private toolsCache: CacheEntry<McpTool[]> | null = null;
    private defaultTtlMs = 5 * 60 * 1000; // 5 minutes default TTL

    /**
     * Get cached tools if not expired
     */
    getTools(): McpTool[] | null {
        if (!this.toolsCache) {
            return null;
        }

        const now = Date.now();
        if (now - this.toolsCache.timestamp > this.toolsCache.ttl) {
            // Cache expired
            this.toolsCache = null;
            return null;
        }

        return this.toolsCache.data;
    }

    /**
     * Set tools cache
     */
    setTools(tools: McpTool[], ttlMs?: number): void {
        this.toolsCache = {
            data: tools,
            timestamp: Date.now(),
            ttl: ttlMs || this.defaultTtlMs,
        };
    }

    /**
     * Invalidate cache
     */
    invalidate(): void {
        this.toolsCache = null;
    }

    /**
     * Check if cache has valid data
     */
    hasValidCache(): boolean {
        return this.getTools() !== null;
    }

    /**
     * Get cache age in milliseconds
     */
    getCacheAge(): number | null {
        if (!this.toolsCache) {
            return null;
        }
        return Date.now() - this.toolsCache.timestamp;
    }

    /**
     * Force refresh (invalidate and return null)
     */
    forceRefresh(): void {
        this.invalidate();
    }
}

// Singleton instance
export const mcpToolCache = new McpToolCache();