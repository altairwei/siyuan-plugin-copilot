/**
 * MCP Tools Adapter
 * Converts MCP tools to Copilot's AVAILABLE_TOOLS format
 */

import type { McpTool, McpConfig } from "./types.js";
import { mcpClient } from "./client.js";
import { mcpPolicy } from "./policy.js";
import { mcpToolCache } from "./cache.js";

/**
 * Convert MCP tool to Copilot tool format
 */
function mcpToolToCopilotTool(mcpTool: McpTool, index: number): {
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
} {
    // Validate required fields
    if (!mcpTool || typeof mcpTool !== 'object') {
        console.error(`[MCP] Tool ${index}: Invalid tool object (not an object):`, mcpTool);
        return {
            function: {
                name: `mcp_invalid_tool_${index}`,
                description: '[MCP] Invalid tool - not an object',
                parameters: { type: 'object', properties: {} },
            },
        };
    }
    
    if (!mcpTool.name) {
        console.error(`[MCP] Tool ${index}: Missing name:`, mcpTool);
        return {
            function: {
                name: `mcp_invalid_tool_${index}`,
                description: '[MCP] Invalid tool - missing name',
                parameters: { type: 'object', properties: {} },
            },
        };
    }

    // Prefix with mcp_ to avoid name collisions
    const toolName = `mcp_${mcpTool.name}`;

    // Build description
    const description = mcpTool.description && typeof mcpTool.description === 'string'
        ? `[MCP] ${mcpTool.description}`
        : `[MCP] ${mcpTool.name} - No description available`;

    // Convert MCP input schema to Copilot JSON Schema format
    // Ensure inputSchema exists and has correct type
    const safeSchema: McpInputSchema = (mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object') 
        ? mcpTool.inputSchema 
        : { type: 'object' };
    
    let parameters = convertMcpSchemaToJsonSchema(safeSchema);
    
    // Ensure parameters is always a valid object
    if (!parameters || typeof parameters !== 'object') {
        console.error(`[MCP] Tool ${index}: convertMcpSchemaToJsonSchema returned invalid value:`, parameters);
        parameters = { type: 'object', properties: {} };
    }

    const result = {
        function: {
            name: toolName,
            description,
            parameters,
        },
    };
    
    // Validate result
    if (!result.function.name || !result.function.description || !result.function.parameters) {
        console.error(`[MCP] Tool ${index}: Invalid result:`, result);
    }
    
    return result;
}

/**
 * Convert MCP input schema to JSON Schema (Copilot compatible)
 */
function convertMcpSchemaToJsonSchema(inputSchema: McpTool["inputSchema"]): Record<string, unknown> {
    // Ensure we always return a valid JSON Schema object
    if (!inputSchema || typeof inputSchema !== 'object') {
        console.warn('[MCP] Invalid inputSchema, using default:', inputSchema);
        return {
            type: "object",
            properties: {},
        };
    }

    const result: Record<string, unknown> = {
        type: "object",
        properties: {},
    };

    if (inputSchema.required && Array.isArray(inputSchema.required) && inputSchema.required.length > 0) {
        result.required = inputSchema.required;
    }

    if (inputSchema.properties && typeof inputSchema.properties === 'object') {
        const properties: Record<string, unknown> = {};

        for (const [key, prop] of Object.entries(inputSchema.properties)) {
            if (prop && typeof prop === 'object') {
                properties[key] = convertMcpPropertyToJsonSchema(prop as any);
            }
        }

        result.properties = properties;
    }

    return result;
}

/**
 * Convert MCP property to JSON Schema property
 */
function convertMcpPropertyToJsonSchema(prop: {
    type?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
}): Record<string, unknown> {
    const jsonSchema: Record<string, unknown> = {
        type: mapMcpTypeToJsonSchemaType(prop.type || "string"),
    };

    if (prop.description) {
        jsonSchema.description = prop.description;
    }

    if (prop.default !== undefined) {
        jsonSchema.default = prop.default;
    }

    if (prop.enum) {
        jsonSchema.enum = prop.enum;
    }

    if (prop.minimum !== undefined) {
        jsonSchema.minimum = prop.minimum;
    }

    if (prop.maximum !== undefined) {
        jsonSchema.maximum = prop.maximum;
    }

    if (prop.minLength !== undefined) {
        jsonSchema.minLength = prop.minLength;
    }

    if (prop.maxLength !== undefined) {
        jsonSchema.maxLength = prop.maxLength;
    }

    return jsonSchema;
}

/**
 * Map MCP types to JSON Schema types
 */
function mapMcpTypeToJsonSchemaType(mcpType?: string): string {
    switch (mcpType) {
        case "string":
            return "string";
        case "number":
        case "integer":
            return "number";
        case "boolean":
            return "boolean";
        case "array":
            return "array";
        case "object":
            return "object";
        default:
            return "string";
    }
}

/**
 * Get all available MCP tools as Copilot tools
 */
export async function getMcpTools(config: McpConfig): Promise<
    Array<{
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }>
> {
    // Check if MCP is enabled
    if (!config.enabled) {
        return [];
    }

    // Configure policy
    mcpPolicy.configure(config);

    // Try to get from cache first
    const cachedTools = mcpToolCache.getTools();
    if (cachedTools) {
        console.log("[MCP] Using cached tools:", cachedTools.length);
        return cachedTools.map((tool, index) => mcpToolToCopilotTool(tool, index));
    }

    // Connect to MCP server
    try {
        await mcpClient.connect(config);

        // Get tools list
        const tools = await mcpClient.listTools();

        // Cache the tools
        mcpToolCache.setTools(tools);

        // Disconnect after getting tools (MVP: don't keep persistent connection)
        mcpClient.disconnect();

        console.log("[MCP] Loaded tools:", tools.length);
        return tools.map((tool, index) => mcpToolToCopilotTool(tool, index));
    } catch (error) {
        console.error("[MCP] Failed to load tools:", error);
        mcpClient.disconnect();
        return [];
    }
}

/**
 * Call an MCP tool
 */
export async function callMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    config: McpConfig
): Promise<{ success: boolean; result?: unknown; error?: string }> {
    // Remove mcp_ prefix for actual MCP call
    const actualToolName = toolName.startsWith("mcp_") ? toolName.slice(4) : toolName;

    // Policy check: tool access
    const accessCheck = mcpPolicy.checkToolAccess(actualToolName);
    if (!accessCheck.allowed) {
        return { success: false, error: `MCP_TOOL_NOT_ALLOWED: ${accessCheck.reason}` };
    }

    // Policy check: argument size
    const sizeCheck = mcpPolicy.checkArgumentSize(args);
    if (!sizeCheck.allowed) {
        return { success: false, error: `MCP_INVALID_ARGUMENT: ${sizeCheck.reason}` };
    }

    try {
        // Connect
        await mcpClient.connect(config);

        // Call tool
        const result = await mcpClient.callTool(actualToolName, args);

        // Disconnect
        mcpClient.disconnect();

        // Check if result is an error
        if (result.isError) {
            const errorText = result.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("\n");
            return { success: false, error: `MCP_SERVER_ERROR: ${errorText}` };
        }

        // Format result for Copilot
        const formattedResult = formatMcpResult(result);
        return { success: true, result: formattedResult };
    } catch (error) {
        mcpClient.disconnect();
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: `MCP_CONNECTION_ERROR: ${errorMessage}` };
    }
}

/**
 * Format MCP result to Copilot compatible format
 */
function formatMcpResult(result: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }): string {
    const parts: string[] = [];

    for (const content of result.content) {
        if (content.type === "text" && content.text) {
            parts.push(content.text);
        } else if (content.type === "image" && content.data) {
            // For images, return as base64 data URL
            const mimeType = content.mimeType || "image/png";
            parts.push(`[Image: data:${mimeType};base64,${content.data.substring(0, 50)}...]`);
        }
    }

    return parts.join("\n") || "[No content]";
}

/**
 * Test MCP connection
 */
export async function testMcpConnection(
    config: McpConfig
): Promise<{ success: boolean; serverInfo?: string; error?: string }> {
    const result = await mcpClient.testConnection(config);

    if (result.success && result.serverInfo) {
        return {
            success: true,
            serverInfo: `${result.serverInfo.name} v${result.serverInfo.version}`,
        };
    }

    return { success: false, error: result.error || 'Unknown error' };
}

/**
 * Refresh MCP tools cache
 */
export function refreshMcpTools(): void {
    mcpToolCache.forceRefresh();
}