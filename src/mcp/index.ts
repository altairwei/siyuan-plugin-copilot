/**
 * MCP Module Entry Point
 * Supports multiple MCP servers via settings.mcpServers array
 */

import type { McpConfig } from "./types.js";
import { getMcpTools, callMcpTool, testMcpConnection, refreshMcpTools } from "./mcpTools.js";

// Tool name → server config mapping (populated during loadMcpTools)
const toolServerMap = new Map<string, McpConfig>();

/**
 * Build McpConfig from a single server entry in mcpServers array
 */
function buildMcpConfig(server: {
    id: string;
    name: string;
    url: string;
    authToken: string;
    timeoutMs: number;
    maxArgChars: number;
    enabled: boolean;
    allowTools: string[];
}): McpConfig {
    return {
        enabled: server.enabled,
        serverUrl: server.url,
        authToken: server.authToken || '',
        transport: 'http',
        timeoutMs: server.timeoutMs || 20000,
        maxArgChars: server.maxArgChars || 12000,
        allowTools: server.allowTools || [],
        denyTools: [],
        refreshToolsOnStart: true,
    };
}

/**
 * Get MCP configuration from settings (legacy single-server format)
 * Kept for backward compatibility
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
 * Load MCP tools from all enabled servers in settings.mcpServers
 */
export async function loadMcpTools(settings: Record<string, unknown>) {
    const mcpServers = settings.mcpServers as Array<{
        id: string;
        name: string;
        url: string;
        authToken: string;
        timeoutMs: number;
        maxArgChars: number;
        enabled: boolean;
        allowTools: string[];
    }> | undefined;

    if (!mcpServers || mcpServers.length === 0) {
        return [];
    }

    // Clear previous mapping
    toolServerMap.clear();

    const allTools: any[] = [];

    for (const server of mcpServers) {
        if (!server.enabled || !server.url) continue;
        if (!server.allowTools || server.allowTools.length === 0) continue;

        const config = buildMcpConfig(server);

        try {
            const tools = await getMcpTools(config);
            console.log(`[MCP] Loaded ${tools.length} tools from server: ${server.name}`);

            // Register each tool's server config for later invocation
            for (const tool of tools) {
                const toolName = tool.function?.name || '';
                if (toolName) {
                    toolServerMap.set(toolName, config);
                }
            }

            allTools.push(...tools);
        } catch (error) {
            console.error(`[MCP] Failed to load tools from server ${server.name}:`, error);
        }
    }

    console.log("[MCP] Total tools loaded from all servers:", allTools.length);
    return allTools;
}

/**
 * Call MCP tool - automatically routes to the correct server
 */
export async function invokeMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    settings: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
    // Look up which server has this tool
    let config = toolServerMap.get(toolName);

    if (!config) {
        // Fallback: try to find server from settings.mcpServers by matching allowTools
        const mcpServers = settings.mcpServers as Array<{
            id: string;
            name: string;
            url: string;
            authToken: string;
            timeoutMs: number;
            maxArgChars: number;
            enabled: boolean;
            allowTools: string[];
        }> | undefined;

        if (mcpServers) {
            const rawName = toolName.startsWith('mcp_') ? toolName.slice(4) : toolName;
            const server = mcpServers.find(s =>
                s.enabled && s.url && s.allowTools?.includes(rawName)
            );
            if (server) {
                config = buildMcpConfig(server);
            }
        }
    }

    if (!config) {
        return { success: false, error: `No MCP server found for tool: ${toolName}` };
    }

    console.log('[MCP Index] invokeMcpTool config:', {
        enabled: config.enabled,
        serverUrl: config.serverUrl,
        hasToken: !!config.authToken
    });
    return callMcpTool(toolName, args, config);
}

/**
 * Test MCP connection for a specific server config
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
