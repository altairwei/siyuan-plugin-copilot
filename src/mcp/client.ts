/**
 * MCP Client Implementation
 * Handles HTTP/SSE transport for connecting to MCP servers
 */

import type {
    McpConfig,
    McpTool,
    McpInitializeResult,
    McpListToolsResult,
    McpCallToolResult,
    JsonRpcRequest,
    JsonRpcResponse,
    McpErrorCode,
    McpError,
} from "./types.js";

export class McpClient {
    private config: McpConfig | null = null;
    private serverInfo: McpInitializeResult | null = null;
    private abortController: AbortController | null = null;
    private requestId = 0;

    /**
     * Initialize connection to MCP server
     */
    async connect(config: McpConfig): Promise<McpInitializeResult> {
        if (!config.serverUrl) {
            throw new McpError(McpErrorCode.InvalidParams, "Server URL is required");
        }

        this.config = config;
        this.abortController = new AbortController();

        try {
            // Call initialize method
            const result = await this.sendRequest<McpInitializeResult>(
                "initialize",
                {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                        name: "siyuan-copilot",
                        version: "1.6.12",
                    },
                }
            );

            this.serverInfo = result;
            console.log("[MCP] Connected to server:", result.serverInfo.name, result.serverInfo.version);
            return result;
        } catch (error) {
            this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnect from MCP server
     */
    disconnect(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.serverInfo = null;
        this.config = null;
    }

    /**
     * List available tools from MCP server
     */
    async listTools(): Promise<McpTool[]> {
        if (!this.serverInfo) {
            throw new McpError(McpErrorCode.InvalidRequest, "Not connected to MCP server");
        }

        try {
            const result = await this.sendRequest<McpListToolsResult>("tools/list");
            return result.tools || [];
        } catch (error) {
            console.error("[MCP] Failed to list tools:", error);
            return [];
        }
    }

    /**
     * Call a specific tool on MCP server
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
        if (!this.serverInfo) {
            throw new McpError(McpErrorCode.InvalidRequest, "Not connected to MCP server");
        }

        try {
            const result = await this.sendRequest<McpCallToolResult>("tools/call", {
                name,
                arguments: args,
            });
            return result;
        } catch (error) {
            // Re-throw with tool context
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                McpErrorCode.ServerError,
                `Tool '${name}' execution failed: ${error instanceof Error ? error.message : "Unknown error"}`
            );
        }
    }

    /**
     * Test connection to MCP server
     */
    async testConnection(config: McpConfig): Promise<{ success: boolean; serverInfo?: McpInitializeResult; error?: string }> {
        try {
            const result = await this.connect(config);
            this.disconnect();
            return { success: true, serverInfo: result };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: message };
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.serverInfo !== null;
    }

    /**
     * Get current server info
     */
    getServerInfo(): McpInitializeResult | null {
        return this.serverInfo;
    }

    /**
     * Send JSON-RPC request to MCP server
     */
    private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
        if (!this.config || !this.abortController) {
            throw new McpError(McpErrorCode.InvalidRequest, "Client not initialized");
        }

        const request: JsonRpcRequest = {
            jsonrpc: "2.0",
            id: ++this.requestId,
            method,
            params,
        };

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        // Add auth token if provided
        if (this.config.authToken) {
            headers["Authorization"] = `Bearer ${this.config.authToken}`;
        }

        const response = await fetch(this.config.serverUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: this.abortController.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new McpError(
                McpErrorCode.ServerError,
                `HTTP ${response.status}: ${errorText}`
            );
        }

        const jsonResponse = await response.json() as JsonRpcResponse;

        if (jsonResponse.error) {
            throw new McpError(
                jsonResponse.error.code as McpErrorCode,
                jsonResponse.error.message,
                jsonResponse.error.data
            );
        }

        return jsonResponse.result as T;
    }
}

// Singleton instance
export const mcpClient = new McpClient();