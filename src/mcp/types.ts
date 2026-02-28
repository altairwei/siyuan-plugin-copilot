/**
 * MCP (Model Context Protocol) Type Definitions
 * Reference: https://spec.modelcontextprotocol.io/
 */

// JSON-RPC 2.0 base types
export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: unknown;
    error?: JsonRpcError;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

// MCP Protocol types
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface McpTool {
    name: string;
    description?: string;
    inputSchema: McpInputSchema;
}

export interface McpInputSchema {
    type: "object";
    properties?: Record<string, McpProperty>;
    required?: string[];
}

export interface McpProperty {
    type: string;
    description?: string;
    default?: JsonValue;
    enum?: JsonValue[];
    items?: McpProperty;
    properties?: Record<string, McpProperty>;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
}

// MCP Server capabilities
export interface McpServerCapabilities {
    tools?: {
        listChanged?: boolean;
    };
}

export interface McpServerInfo {
    name: string;
    version: string;
    capabilities?: McpServerCapabilities;
}

// MCP Initialize response
export interface McpInitializeResult {
    protocolVersion: string;
    serverInfo: McpServerInfo;
    capabilities: McpServerCapabilities;
}

// MCP Tools list response
export interface McpListToolsResult {
    tools: McpTool[];
}

// MCP Call tool response
export interface McpCallToolResult {
    content: McpContent[];
    isError?: boolean;
}

export interface McpContent {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;  // base64 for images
    mimeType?: string;
    uri?: string;
    mimeType?: string;
}

// MCP Error codes
export enum McpErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    ServerError = -32000,
}

// MCP Custom errors
export class McpError extends Error {
    constructor(
        public code: McpErrorCode,
        message: string,
        public data?: unknown
    ) {
        super(message);
        this.name = "McpError";
    }
}

// Configuration types
export interface McpConfig {
    enabled: boolean;
    serverUrl: string;
    authToken: string;
    transport: "http";  // MVP 固定 http/sse
    timeoutMs: number;
    maxArgChars: number;
    allowTools: string[];
    denyTools: string[];
    refreshToolsOnStart: boolean;
}

// Policy check result
export interface PolicyCheckResult {
    allowed: boolean;
    reason?: string;
}