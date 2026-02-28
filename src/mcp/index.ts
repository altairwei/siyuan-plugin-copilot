/**
 * MCP Module Entry Point
 * Initializes MCP functionality and provides tool loading
 */

import type { McpConfig } from "./types.js";
import { getMcpTools, callMcpTool, testMcpConnection, refreshMcpTools } from "./mcpTools.js";

/**
 * Get MCP configuration from settings
 */
export function getMcpConfigFromSettings(settings: Record<string, unknown>): McpConfig {
    return {
        enabled: Boolean(settings.mcpEnabled),
        serverUrl: String(settings.mcpServerUrl || ""),
        authToken: String(settings.mcpAuthToken || ""),
        transport: "http",
        timeoutMs: Number(settings.mcpTimeoutMs || 20000),
        maxArgChars: Number(settings.mcpMaxArgChars || 12000),
        allowTools: String(settings.mcpAllowTools || "")
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t),
        denyTools: String(settings.mcpDenyTools || "")
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t),
        refreshToolsOnStart: Boolean(settings.mcpRefreshOnStart),
    };
}

/**
 * Load MCP tools based on current settings
 */
export async function loadMcpTools(settings: Record<string, unknown>) {
    const config = getMcpConfigFromSettings(settings);

    if (!config.enabled || !config.serverUrl) {
        return [];
    }

    try {
        const tools = await getMcpTools(config);
        console.log("[MCP] Loaded tools:", tools.length);
        return tools;
    } catch (error) {
        console.error("[MCP] Failed to load tools:", error);
        return [];
    }
}

/**
 * Call MCP tool with error handling
 */
export async function invokeMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    settings: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const config = getMcpConfigFromSettings(settings);
    return callMcpTool(toolName, args, config);
}

/**
 * Test MCP connection
 */
export async function testMcp(settings: Record<string, unknown>) {
    const config = getMcpConfigFromSettings(settings);
    console.log('[MCP Index] Testing with config:', { 
        enabled: config.enabled, 
        serverUrl: config.serverUrl,
        hasToken: !!config.authToken 
    });
    try {
        const result = await testMcpConnection(config);
        console.log('[MCP Index] Raw result from client:', result);
        return result;
    } catch (err) {
        console.error('[MCP Index] Exception caught:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Refresh MCP tools cache
 */
export function refreshMcp() {
    refreshMcpTools();
}

// Re-export types for external use
export * from "./types.js";