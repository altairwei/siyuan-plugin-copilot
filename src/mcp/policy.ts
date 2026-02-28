/**
 * MCP Security Policy Module
 * Handles allowlist/denylist, timeout, and argument size checks
 */

import type { McpConfig, PolicyCheckResult } from "./types.js";

export class McpPolicy {
    private config: McpConfig | null = null;

    /**
     * Initialize policy with configuration
     */
    configure(config: McpConfig): void {
        this.config = config;
    }

    /**
     * Check if a tool can be called
     */
    checkToolAccess(toolName: string): PolicyCheckResult {
        if (!this.config || !this.config.enabled) {
            return { allowed: false, reason: "MCP is not enabled" };
        }

        // Check deny list first (higher priority)
        if (this.config.denyTools.length > 0) {
            if (this.config.denyTools.includes(toolName)) {
                return { allowed: false, reason: `Tool '${toolName}' is in deny list` };
            }
        }

        // Check allow list (if not empty)
        if (this.config.allowTools.length > 0) {
            if (!this.config.allowTools.includes(toolName)) {
                return { allowed: false, reason: `Tool '${toolName}' is not in allow list` };
            }
        }

        return { allowed: true };
    }

    /**
     * Check if argument size is within limits
     */
    checkArgumentSize(args: Record<string, unknown>): PolicyCheckResult {
        if (!this.config) {
            return { allowed: true };
        }

        const argsJson = JSON.stringify(args);
        const size = new Blob([argsJson]).size;
        const maxChars = this.config.maxArgChars * 1024; // Convert KB to bytes

        if (size > maxChars) {
            return {
                allowed: false,
                reason: `Argument size ${size} bytes exceeds limit ${maxChars} bytes`,
            };
        }

        return { allowed: true };
    }

    /**
     * Get configured timeout
     */
    getTimeout(): number {
        return this.config?.timeoutMs || 20000;
    }

    /**
     * Check if MCP is enabled
     */
    isEnabled(): boolean {
        return this.config?.enabled || false;
    }

    /**
     * Validate configuration
     */
    validateConfig(config: Partial<McpConfig>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (config.enabled) {
            if (!config.serverUrl) {
                errors.push("Server URL is required when MCP is enabled");
            }
            if (config.serverUrl && !this.isValidUrl(config.serverUrl)) {
                errors.push("Server URL must be a valid HTTP/HTTPS URL");
            }
            if (config.timeoutMs && config.timeoutMs < 1000) {
                errors.push("Timeout must be at least 1000ms");
            }
            if (config.maxArgChars && config.maxArgChars < 1) {
                errors.push("Max argument size must be at least 1KB");
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Simple URL validation
     */
    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
            return false;
        }
    }
}

// Singleton instance
export const mcpPolicy = new McpPolicy();