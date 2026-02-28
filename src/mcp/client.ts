/**
 * MCP Client Implementation using official @modelcontextprotocol/sdk
 * Uses StreamableHTTPClientTransport - the recommended transport for HTTP connections
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import {
    StreamableHTTPClientTransport,
    type StreamableHTTPClientTransportOptions
} from '@modelcontextprotocol/sdk/client/streamableHttp';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
    McpConfig,
    McpTool,
    McpCallToolResult,
} from './types.js';
import { McpErrorCode, McpError } from './types.js';

export class McpClient {
    private client: Client | null = null;
    private config: McpConfig | null = null;
    private transport: StreamableHTTPClientTransport | null = null;
    private isInitialized = false;

    /**
     * Initialize connection to MCP server using official SDK
     */
    async connect(config: McpConfig): Promise<void> {
        if (!config.serverUrl) {
            throw this.createError(McpErrorCode.InvalidParams, 'Server URL is required');
        }

        this.config = config;

        try {
            // Create transport options
            const transportOptions: StreamableHTTPClientTransportOptions = {
                requestInit: {
                    headers: config.authToken
                        ? { Authorization: `Bearer ${config.authToken}` }
                        : {},
                },
            };

            // Create transport
            this.transport = new StreamableHTTPClientTransport(
                new URL(config.serverUrl),
                transportOptions
            );

            // Create client instance with validation disabled
            this.client = new Client({
                name: 'siyuan-copilot',
                version: '1.6.12',
            }, {
                // Disable JSON Schema validation to avoid zod errors
                jsonSchemaValidator: undefined,
            } as any);

            // Connect via transport (this includes initialize handshake)
            await this.client.connect(this.transport);

            // connect() already handles initialization, no need to manually call initialize

            this.isInitialized = true;
            console.log('[MCP] Connected successfully via official SDK');
        } catch (error) {
            this.disconnect();
            throw this.wrapError(error);
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
        if (!this.client || !this.isInitialized || !this.config) {
            throw this.createError(McpErrorCode.InvalidRequest, 'Not connected to MCP server');
        }

        try {
            console.log('[MCP] Calling tool:', name, 'with args:', args);
            
            // Use direct fetch for tool call to have full control over JSON-RPC format
            const requestBody = {
                jsonrpc: '2.0',
                id: crypto.randomUUID(),
                method: 'tools/call',
                params: {
                    name,
                    arguments: args,
                }
            };
            
            console.log('[MCP] Request body:', JSON.stringify(requestBody));

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (this.config.authToken) {
                headers['Authorization'] = `Bearer ${this.config.authToken}`;
            }

            const response = await fetch(this.config.serverUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[MCP] HTTP error:', response.status, errorText);
                throw this.createError(
                    McpErrorCode.ServerError,
                    `HTTP ${response.status}: ${errorText}`
                );
            }

            const jsonResponse = await response.json();
            console.log('[MCP] Response:', jsonResponse);

            if (jsonResponse.error) {
                throw this.createError(
                    McpErrorCode.ServerError,
                    jsonResponse.error.message || 'Tool execution error'
                );
            }

            const result = jsonResponse.result as McpCallToolResult;

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