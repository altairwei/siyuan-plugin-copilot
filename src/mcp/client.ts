/**
 * MCP Client Implementation using official @modelcontextprotocol/sdk
 * Uses StreamableHTTPClientTransport - the recommended transport for HTTP connections
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import {
    StreamableHTTPClientTransport,
    type StreamableHTTPClientTransportOptions
} from '@modelcontextprotocol/sdk/client/streamableHttp';
import type {
    McpConfig,
    McpTool,
    McpCallToolResult,
    McpErrorCode,
    McpError
} from './types.js';

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
     * List available tools from MCP server (bypass SDK validation)
     */
    async listTools(): Promise<McpTool[]> {
        if (!this.client || !this.isInitialized) {
            throw this.createError(McpErrorCode.InvalidRequest, 'Not connected to MCP server');
        }

        try {
            // Use direct fetch to avoid SDK zod validation
            const requestBody = {
                jsonrpc: '2.0',
                id: crypto.randomUUID(),
                method: 'tools/list',
                params: {}
            };

            const response = await fetch(this.config!.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.config!.authToken ? { 'Authorization': `Bearer ${this.config!.authToken}` } : {})
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                console.error('[MCP] HTTP error:', response.status);
                return [];
            }

            // Handle SSE or JSON response
            const contentType = response.headers.get('content-type');
            let result: any;

            if (contentType?.includes('text/event-stream')) {
                // SSE response - read first event
                const reader = response.body?.getReader();
                if (!reader) return [];
                
                const decoder = new TextDecoder();
                let buffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') return [];
                            try {
                                result = JSON.parse(data);
                                reader.cancel();
                                return result.result?.tools?.map((tool: any) => ({
                                    name: tool.name,
                                    description: tool.description || '',
                                    inputSchema: {
                                        type: 'object',
                                        properties: tool.inputSchema?.properties || {},
                                        required: tool.inputSchema?.required || [],
                                    },
                                })) || [];
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                }
                return [];
            } else {
                // JSON response
                const json = await response.json();
                result = json.result;
            }

            const tools = result?.tools || [];
            console.log('[MCP] Loaded tools via fetch:', tools.length);
            
            return tools.map((tool: any) => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: {
                    type: 'object',
                    properties: tool.inputSchema?.properties || {},
                    required: tool.inputSchema?.required || [],
                },
            }));
        } catch (error) {
            console.error('[MCP] Failed to list tools:', error);
            return [];
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
            const response = await this.client.request(
                { method: 'tools/call' },
                {
                    name,
                    arguments: args,
                }
            );

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