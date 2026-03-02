/**
 * MCP Client Implementation using official @modelcontextprotocol/sdk
 * Supports both StreamableHTTP and SSE transports with automatic fallback
 * following the SDK's official backwards-compatible client example.
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
    McpConfig,
    McpTool,
    McpCallToolResult,
} from './types.js';
import { McpErrorCode, McpError } from './types.js';

type McpTransport = StreamableHTTPClientTransport | SSEClientTransport;

export class McpClient {
    private client: Client | null = null;
    private config: McpConfig | null = null;
    private transport: McpTransport | null = null;
    private isInitialized = false;

    /**
     * Initialize connection to MCP server using official SDK.
     * Following the SDK's backwards-compatible example:
     * 1. Try StreamableHTTP first (modern protocol)
     * 2. Fall back to SSE transport (older protocol) if StreamableHTTP fails
     */
    async connect(config: McpConfig): Promise<void> {
        if (!config.serverUrl) {
            throw this.createError(McpErrorCode.InvalidParams, 'Server URL is required');
        }

        this.config = config;
        const url = new URL(config.serverUrl);
        const authHeaders = config.authToken
            ? { Authorization: `Bearer ${config.authToken}` }
            : {};

        // Step 1: Try StreamableHTTP transport first
        try {
            console.log('[MCP] Trying StreamableHTTP transport...');
            const transport = new StreamableHTTPClientTransport(url, {
                requestInit: { headers: { ...authHeaders } },
            });
            const client = new Client({
                name: 'siyuan-copilot',
                version: '1.6.12',
            });

            await client.connect(transport);

            this.client = client;
            this.transport = transport;
            this.isInitialized = true;
            console.log('[MCP] Connected via StreamableHTTP transport');
            return;
        } catch (error: any) {
            console.log('[MCP] StreamableHTTP failed:', error?.message);
        }

        // Step 2: Fall back to SSE transport (for older servers like Aliyun Bailian)
        try {
            console.log('[MCP] Falling back to SSE transport...');
            const transport = new SSEClientTransport(url, {
                requestInit: { headers: { ...authHeaders } },
            });
            const client = new Client({
                name: 'siyuan-copilot',
                version: '1.6.12',
            });

            await client.connect(transport);

            this.client = client;
            this.transport = transport;
            this.isInitialized = true;
            console.log('[MCP] Connected via SSE transport');
            return;
        } catch (sseError: any) {
            console.error('[MCP] SSE transport also failed:', sseError?.message);
            this.disconnect();
            throw this.wrapError(
                new Error(`Could not connect with any transport.\nStreamableHTTP: ${sseError?.message}\nSSE: ${sseError?.message}`)
            );
        }
    }

    /**
     * Disconnect from MCP server
     */
    disconnect(): void {
        if (this.client) {
            // close() returns Promise; swallow cleanup failures to avoid breaking test flow.
            void this.client.close().catch((error: unknown) => {
                console.warn('[MCP] Ignoring close() error during disconnect:', error);
            });
            this.client = null;
        }
        this.transport = null;
        this.isInitialized = false;
        this.config = null;
    }

    /**
     * List available tools from MCP server (standard SDK usage with schema validation)
     */
    async listTools(): Promise<McpTool[]> {
        if (!this.client || !this.isInitialized) {
            throw this.createError(McpErrorCode.InvalidRequest, 'Not connected to MCP server');
        }

        try {
            // Standard SDK usage with proper schema validation
            const result = await this.client.request(
                { method: 'tools/list' },
                ListToolsResultSchema
            );

            console.log('[MCP] Loaded tools via SDK:', result.tools.length);

            return result.tools.map((tool: any) => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: {
                    type: 'object',
                    properties: tool.inputSchema?.properties || {},
                    required: tool.inputSchema?.required || [],
                },
            }));
        } catch (error) {
            console.error('[MCP] Failed to list tools with SDK:', error);
            throw error; // Re-throw to let caller handle
        }
    }

    /**
     * Call a specific tool on MCP server
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
        if (!this.client || !this.isInitialized) {
            throw this.createError(McpErrorCode.InvalidRequest, 'Not connected to MCP server');
        }

        try {
            console.log('[MCP] Calling tool:', name, 'with args:', args);
            
            // Correct SDK usage: complete request object with params
            const request = {
                method: 'tools/call' as const,
                params: {
                    name,
                    arguments: args,
                }
            };
            console.log('[MCP] Request:', JSON.stringify(request));
            
            const response = await this.client.request(
                request,
                CallToolResultSchema
            );

            console.log('[MCP] Tool response:', response);
            const result = response as McpCallToolResult;

            // Check if result is an error
            if (result.isError) {
                const errorText = result.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('\n');
                throw this.createError(McpErrorCode.ServerError, errorText || 'Tool execution returned error');
            }

            return result;
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            throw this.createError(
                McpErrorCode.ServerError,
                `Tool '${name}' execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Test connection to MCP server
     */
    async testConnection(config: McpConfig): Promise<{
        success: boolean;
        serverInfo?: { name: string; version: string };
        error?: string
    }> {
        try {
            await this.connect(config);

            // Get server info using SDK methods
            const serverVersion = this.client?.getServerVersion();
            console.log('[MCP] Server version:', serverVersion);

            this.disconnect();

            return {
                success: true,
                serverInfo: serverVersion
                    ? { name: serverVersion.name, version: serverVersion.version }
                    : { name: 'Unknown', version: 'Unknown' }
            };
        } catch (error) {
            this.disconnect();

            // Log detailed error for debugging
            console.error('[MCP] Test connection error:', error);
            console.error('[MCP] Error type:', error instanceof Error ? error.constructor.name : typeof error);
            console.error('[MCP] Error name:', error instanceof Error ? error.name : 'N/A');

            const message = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, error: message };
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.isInitialized && this.client !== null;
    }

    /**
     * Get server info
     */
    getServerInfo(): { name: string; version: string } | null {
        const serverVersion = this.client?.getServerVersion();
        if (!serverVersion) return null;
        return {
            name: serverVersion.name,
            version: serverVersion.version,
        };
    }

    /**
     * Create MCP error
     */
    private createError(code: McpErrorCode, message: string): McpError {
        return new McpError(code, message);
    }

    /**
     * Wrap unknown error
     */
    private wrapError(error: unknown): McpError {
        if (error instanceof McpError) {
            return error;
        }
        return new McpError(
            McpErrorCode.InternalError,
            error instanceof Error ? error.message : 'Unknown error',
            error
        );
    }
}

// Singleton instance
export const mcpClient = new McpClient();