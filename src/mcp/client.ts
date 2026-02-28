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

            // Create client instance
            this.client = new Client({
                name: 'siyuan-copilot',
                version: '1.6.12',
            });

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
            this.client.close();
            this.client = null;
        }
        this.transport = null;
        this.isInitialized = false;
        this.config = null;
    }

    /**
     * List available tools from MCP server
     */
    async listTools(): Promise<McpTool[]> {
        if (!this.client || !this.isInitialized) {
            throw this.createError(McpErrorCode.InvalidRequest, 'Not connected to MCP server');
        }

        try {
            const response = await this.client.request(
                { method: 'tools/list' },
                {}
            );

            // Handle SDK response format
            const tools = (response as any).tools || [];
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
            
            // Get server info
            const serverInfo = this.client?.serverInfo;
            this.disconnect();
            
            return { 
                success: true, 
                serverInfo: serverInfo 
                    ? { name: serverInfo.name, version: serverInfo.version }
                    : undefined
            };
        } catch (error) {
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
        if (!this.client?.serverInfo) return null;
        return {
            name: this.client.serverInfo.name,
            version: this.client.serverInfo.version,
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