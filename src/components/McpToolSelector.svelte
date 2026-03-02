<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { t } from '../utils/i18n';
    import type { McpTool } from '../mcp/types';

    export let plugin: any;
    export let settings: Record<string, any> = {};

    const dispatch = createEventDispatcher();

    interface ToolSelection {
        name: string;
        description: string;
        selected: boolean;
    }

    let loading = true;
    let error = '';
    let tools: ToolSelection[] = [];
    let serverInfo = '';
    let searchQuery = '';

    // Get current allowed tools from settings
    $: currentAllowedTools = (settings.mcpAllowTools || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter((t: string) => t);

    // Filter tools by search query
    $: filteredTools = tools.filter(tool => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return tool.name.toLowerCase().includes(query) || 
               tool.description.toLowerCase().includes(query);
    });

    // Count selected tools
    $: selectedCount = tools.filter(t => t.selected).length;

    onMount(async () => {
        await fetchTools();
    });

    async function fetchTools() {
        loading = true;
        error = '';
        
        try {
            const { testMcp, loadMcpTools } = await import('../mcp');
            
            // Test connection and get tools
            const result = await testMcp(settings);
            
            if (!result.success) {
                error = result.error || 'Connection failed';
                loading = false;
                return;
            }

            serverInfo = result.serverInfo || 'Unknown Server';

            // Load tools
            const loadedTools = await loadMcpTools(settings);
            
            // Convert to ToolSelection format
            tools = loadedTools.map((tool: any) => {
                const toolName = tool.function?.name?.replace('mcp_', '') || tool.name || '';
                const description = tool.function?.description?.replace('[MCP]', '').trim() || 
                                   tool.description || 'No description';
                
                // Check if this tool is in the allowed list
                const isAllowed = currentAllowedTools.length === 0 || 
                                 currentAllowedTools.includes(toolName);
                
                return {
                    name: toolName,
                    description: description,
                    selected: isAllowed
                };
            });

            // Sort by name
            tools.sort((a, b) => a.name.localeCompare(b.name));

        } catch (err) {
            error = err instanceof Error ? err.message : 'Unknown error';
            console.error('[McpToolSelector] Error:', err);
        } finally {
            loading = false;
        }
    }

    function toggleTool(name: string) {
        tools = tools.map(tool => 
            tool.name === name ? { ...tool, selected: !tool.selected } : tool
        );
    }

    function selectAll() {
        tools = tools.map(tool => ({ ...tool, selected: true }));
    }

    function deselectAll() {
        tools = tools.map(tool => ({ ...tool, selected: false }));
    }

    async function confirm() {
        // Get selected tool names
        const selectedTools = tools
            .filter(t => t.selected)
            .map(t => t.name);
        
        // Update settings
        const newSettings = {
            ...settings,
            mcpAllowTools: selectedTools.join(', ')
        };

        // Save settings
        await plugin.saveData('settings.json', newSettings);
        
        // Notify parent and close
        dispatch('confirm', { settings: newSettings, selectedTools });
        dispatch('close');
    }

    function close() {
        dispatch('close');
    }
</script>

<div class="mcp-tool-selector">
    <div class="header">
        <h3>{t('settings.mcp.fetchTools.title') || 'MCP 工具列表'}</h3>
        {#if serverInfo}
            <span class="server-info">{serverInfo}</span>
        {/if}
    </div>

    {#if loading}
        <div class="loading">
            <div class="spinner"></div>
            <span>{t('settings.mcp.fetchTools.loading') || '正在连接并获取工具列表...'}</span>
        </div>
    {:else if error}
        <div class="error">
            <p>{t('settings.mcp.fetchTools.error') || '获取工具失败'}: {error}</p>
            <button class="btn btn-primary" on:click={fetchTools}>
                {t('settings.mcp.fetchTools.retry') || '重试'}
            </button>
        </div>
    {:else}
        <div class="tool-controls">
            <input 
                type="text" 
                class="search-input"
                placeholder={t('settings.mcp.fetchTools.search') || '搜索工具...'}
                bind:value={searchQuery}
            />
            <div class="selection-info">
                {selectedCount} / {tools.length} {t('settings.mcp.fetchTools.selected') || '已选择'}
            </div>
            <button class="btn btn-sm" on:click={selectAll}>
                {t('settings.mcp.fetchTools.selectAll') || '全选'}
            </button>
            <button class="btn btn-sm" on:click={deselectAll}>
                {t('settings.mcp.fetchTools.deselectAll') || '取消全选'}
            </button>
        </div>

        <div class="tools-list">
            {#each filteredTools as tool (tool.name)}
                <label class="tool-item" class:selected={tool.selected}>
                    <input 
                        type="checkbox" 
                        checked={tool.selected}
                        on:change={() => toggleTool(tool.name)}
                    />
                    <div class="tool-info">
                        <span class="tool-name">{tool.name}</span>
                        <span class="tool-desc">{tool.description}</span>
                    </div>
                </label>
            {/each}
            
            {#if filteredTools.length === 0}
                <div class="no-tools">
                    {t('settings.mcp.fetchTools.noTools') || '没有找到匹配的工具'}
                </div>
            {/if}
        </div>

        <div class="footer">
            <button class="btn btn-secondary" on:click={close}>
                {t('settings.mcp.fetchTools.cancel') || '取消'}
            </button>
            <button class="btn btn-primary" on:click={confirm}>
                {t('settings.mcp.fetchTools.confirm') || '确认并保存'} ({selectedCount})
            </button>
        </div>
    {/if}
</div>

<style>
    .mcp-tool-selector {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 16px;
        background: var(--b3-theme-background);
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--b3-theme-background-light);
    }

    .header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }

    .server-info {
        font-size: 12px;
        color: var(--b3-theme-on-background-light);
        background: var(--b3-theme-background-light);
        padding: 4px 8px;
        border-radius: 4px;
    }

    .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        gap: 12px;
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--b3-theme-background-light);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .error {
        text-align: center;
        padding: 20px;
        color: var(--b3-theme-error);
    }

    .tool-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 12px;
        flex-wrap: wrap;
    }

    .search-input {
        flex: 1;
        min-width: 150px;
        padding: 8px 12px;
        border: 1px solid var(--b3-theme-background-light);
        border-radius: 4px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
    }

    .search-input:focus {
        outline: none;
        border-color: var(--b3-theme-primary);
    }

    .selection-info {
        font-size: 13px;
        color: var(--b3-theme-on-background-light);
        white-space: nowrap;
    }

    .tools-list {
        flex: 1;
        overflow-y: auto;
        border: 1px solid var(--b3-theme-background-light);
        border-radius: 4px;
        max-height: 400px;
    }

    .tool-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--b3-theme-background-light);
        cursor: pointer;
        transition: background 0.15s;
    }

    .tool-item:hover {
        background: var(--b3-theme-background-light);
    }

    .tool-item.selected {
        background: rgba(30, 128, 255, 0.1);
    }

    .tool-item input[type="checkbox"] {
        margin-top: 3px;
        width: 16px;
        height: 16px;
        cursor: pointer;
    }

    .tool-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .tool-name {
        font-weight: 500;
        font-size: 13px;
        color: var(--b3-theme-on-background);
    }

    .tool-desc {
        font-size: 12px;
        color: var(--b3-theme-on-background-light);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .no-tools {
        padding: 20px;
        text-align: center;
        color: var(--b3-theme-on-background-light);
    }

    .footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--b3-theme-background-light);
    }

    .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s;
    }

    .btn-primary {
        background: var(--b3-theme-primary);
        color: white;
    }

    .btn-primary:hover {
        background: var(--b3-theme-primary-light);
    }

    .btn-secondary {
        background: var(--b3-theme-background-light);
        color: var(--b3-theme-on-background);
    }

    .btn-secondary:hover {
        background: var(--b3-theme-surface);
    }

    .btn-sm {
        padding: 6px 12px;
        font-size: 12px;
    }
</style>