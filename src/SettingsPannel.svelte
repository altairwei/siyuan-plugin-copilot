<script lang="ts">
    import { onMount } from 'svelte';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { t } from './utils/i18n';
    import { getDefaultSettings, BUILT_IN_MCP_SERVERS } from './defaultSettings';
    import { pushMsg, pushErrMsg, lsNotebooks } from './api';
    import { confirm } from 'siyuan';
    import ProviderConfigPanel from './components/ProviderConfigPanel.svelte';
    import type { CustomProviderConfig, BuiltInMcpServer } from './defaultSettings';
    export let plugin;

    // 使用动态默认设置
    let settings = { ...getDefaultSettings() };

    // MCP 多 Server 管理状态
    let selectedMcpServerId = '';
    let showAddMcpServer = false;
    let newMcpServerName = '';
    let newMcpServerUrl = '';
    
    // 当前选中 Server 的工具列表
    let mcpServerTools: Array<{name: string, description: string, selected: boolean}> = [];
    let mcpServerToolsLoading = false;
    let mcpServerToolsError = '';
    let showMcpAuthToken = false;
    let mcpToolsSearchQuery = '';
    let showMcpToolsList = true; // 控制工具列表折叠/展开

    // 获取当前选中的 Server
    $: selectedMcpServer = settings.mcpServers?.find(s => s.id === selectedMcpServerId);
    
    // 过滤后的工具列表
    $: filteredMcpServerTools = mcpServerTools.filter(tool => {
        if (!mcpToolsSearchQuery) return true;
        const query = mcpToolsSearchQuery.toLowerCase();
        return tool.name.toLowerCase().includes(query) || 
               tool.description.toLowerCase().includes(query);
    });
    
    // 选中的工具数量
    $: selectedMcpToolsCount = mcpServerTools.filter(t => t.selected).length;

    // 笔记本列表
    let notebookOptions: Record<string, string> = {};

    interface ISettingGroup {
        name: string;
        items: ISettingItem[];
        //  Type："checkbox" | "select" | "textinput" | "textarea" | "number" | "slider" | "button" | "hint" | "custom";
    }

    const builtInProviderNames: Record<string, string> = {
        Achuan: t('platform.builtIn.Achuan'),
        gemini: t('platform.builtIn.gemini'),
        openai: t('platform.builtIn.openai'),
        deepseek: t('platform.builtIn.deepseek'),
        moonshot: t('platform.builtIn.moonshot'),
        volcano: t('platform.builtIn.volcano'),
    };

    // 内置平台的默认 API 地址
    const builtInProviderDefaultUrls: Record<string, string> = {
        Achuan: 'https://gpt.achuan-2.top/',
        gemini: 'https://generativelanguage.googleapis.com',
        deepseek: 'https://api.deepseek.com',
        moonshot: 'https://api.moonshot.cn',
        openai: 'https://api.openai.com',
        volcano: 'https://ark.cn-beijing.volces.com',
    };

    // 内置平台的官网链接
    const builtInProviderWebsites: Record<string, string> = {
        Achuan: 'https://gpt.achuan-2.top/register?aff=ZndO',
        gemini: 'https://aistudio.google.com/apikey',
        deepseek: 'https://platform.deepseek.com/',
        moonshot: 'https://platform.moonshot.cn/',
        openai: 'https://platform.openai.com/',
        volcano: 'https://console.volcengine.com/ark',
    };

    // 内置 MCP Server 名称映射
    const builtInMcpServerNames: Record<string, string> = {
        github: 'GitHub',
    };

    // 内置 MCP Server 的官网链接（获取 Token 的帮助页面）
    const builtInMcpServerWebsites: Record<string, string> = {
        github: 'https://github.com/settings/tokens?type=pat',
    };

    // 获取内置 MCP Server 的网站链接
    function getMcpServerWebsite(serverName: string): string | undefined {
        // 通过 name 查找对应的 key
        for (const [key, name] of Object.entries(builtInMcpServerNames)) {
            if (name === serverName) {
                return builtInMcpServerWebsites[key];
            }
        }
        return undefined;
    }

    // 当前选中的平台ID
    let selectedProviderId = '';

    // 新增自定义平台相关状态
    let showAddPlatform = false;
    let newPlatformName = '';

    function handleProviderChange() {
        saveSettings();
    }

    // 处理平台重命名
    function handleProviderRename(providerId: string, newName: string) {
        const provider = settings.aiProviders.customProviders.find(p => p.id === providerId);
        if (provider) {
            provider.name = newName;
            // 触发响应式更新
            settings = {
                ...settings,
                aiProviders: {
                    ...settings.aiProviders,
                    customProviders: [...settings.aiProviders.customProviders],
                },
            };
            saveSettings();
            pushMsg(`平台已重命名为: ${newName}`);
        }
    }

    // 生成自定义平台ID
    function generateCustomPlatformId(): string {
        return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 添加自定义平台
    function addCustomPlatform() {
        if (!newPlatformName.trim()) {
            pushErrMsg(t('platform.nameRequired'));
            return;
        }

        const newPlatform: CustomProviderConfig = {
            id: generateCustomPlatformId(),
            name: newPlatformName.trim(),
            apiKey: '',
            customApiUrl: '',
            models: [],
        };

        // 使用响应式更新确保 Svelte 检测到变化
        settings = {
            ...settings,
            aiProviders: {
                ...settings.aiProviders,
                customProviders: [...settings.aiProviders.customProviders, newPlatform],
            },
            // 自动选中新创建的平台（仅设置面板，不影响对话）
            selectedProviderId: newPlatform.id,
        };

        // 更新本地选中状态
        selectedProviderId = newPlatform.id;

        newPlatformName = '';
        showAddPlatform = false;
        saveSettings();
        pushMsg(t('aiSidebar.success.addPromptSuccess') + `: ${newPlatform.name}`);
    }

    // 删除平台（内置平台也可删除）
    function removePlatform(providerId: string) {
        const platformName =
            builtInProviderNames[providerId] ||
            settings.aiProviders?.customProviders?.find(p => p.id === providerId)?.name ||
            t('platform.unknown');

        confirm(
            t('aiSidebar.confirm.deletePlatform.title'),
            t('aiSidebar.confirm.deletePlatform.message', { platformName }),
            async () => {
                // 检查是否需要清空当前选中的模型
                // 只有当删除的平台是当前正在使用的平台时才清空模型选择
                const shouldClearModel = settings.currentProvider === providerId;

                // 如果是内置平台，删除其所有配置
                if (builtInProviderNames[providerId]) {
                    // 使用响应式更新确保 Svelte 检测到变化
                    settings = {
                        ...settings,
                        aiProviders: {
                            ...settings.aiProviders,
                            [providerId]: {
                                apiKey: '',
                                customApiUrl: '',
                                models: [],
                            },
                        },
                    };
                } else {
                    // 如果是自定义平台，从列表中移除
                    // 使用响应式更新确保 Svelte 检测到变化
                    const filteredProviders = settings.aiProviders.customProviders.filter(
                        p => p.id !== providerId
                    );
                    settings = {
                        ...settings,
                        aiProviders: {
                            ...settings.aiProviders,
                            customProviders: filteredProviders,
                        },
                    };
                }

                // 如果删除的是当前选中的平台（在设置面板中），清空面板选择
                if (selectedProviderId === providerId) {
                    selectedProviderId = '';
                    settings.selectedProviderId = '';
                }

                // 只有当删除的平台是当前对话使用的平台时，才清空对话中的平台和模型选择
                if (shouldClearModel) {
                    settings = {
                        ...settings,
                        currentProvider: '',
                        currentModelId: '',
                    };
                }

                saveSettings();
                pushMsg(t('aiSidebar.success.deletePromptSuccess') + `: ${platformName}`);
            }
        );
    }

    // 获取所有平台选项（内置+自定义） - 使用响应式语句
    $: allProviderOptions = (() => {
        const builtIn = Object.keys(builtInProviderNames).map(id => ({
            id,
            name: builtInProviderNames[id],
            type: 'built-in' as const,
        }));

        const custom = (settings.aiProviders?.customProviders || []).map(
            (p: CustomProviderConfig) => ({
                id: p.id,
                name: p.name,
                type: 'custom' as const,
            })
        );

        return [...builtIn, ...custom];
    })();

    // 获取当前选中平台的名称 - 使用响应式语句
    $: selectedProviderName = (() => {
        if (!selectedProviderId) return t('platform.select');

        if (builtInProviderNames[selectedProviderId]) {
            return builtInProviderNames[selectedProviderId];
        }

        const customProvider = settings.aiProviders?.customProviders?.find(
            (p: CustomProviderConfig) => p.id === selectedProviderId
        );
        return customProvider?.name || t('platform.unknown');
    })();

    // 获取所有 MCP Server 选项（内置+自定义）
    $: allMcpServerOptions = (() => {
        // 从 settings.mcpServers 中获取所有服务器，判断是内置还是自定义
        return (settings.mcpServers || []).map(s => ({
            id: s.id,
            name: s.name,
            type: Object.values(builtInMcpServerNames).includes(s.name) ? 'built-in' as const : 'custom' as const,
        }));
    })();

    // 保存选中的平台ID（仅在设置面板中选择平台，不影响对话中的当前平台）
    function handleProviderSelect() {
        // 使用响应式更新确保 Svelte 检测到变化
        settings = {
            ...settings,
            selectedProviderId: selectedProviderId,
        };
        saveSettings();
    }

    // ==================== MCP 多 Server 管理 ====================

    // 生成唯一 ID
    function generateMcpServerId(): string {
        return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 添加 MCP Server
    function addMcpServer() {
        if (!newMcpServerName.trim()) {
            pushErrMsg('请填写 Server 名称');
            return;
        }

        const newServer = {
            id: generateMcpServerId(),
            name: newMcpServerName.trim(),
            url: '', // URL 可后续在详情页面填写
            authToken: '',
            timeoutMs: 20000,
            maxArgChars: 12000,
            enabled: true,
            allowTools: [],
        };

        settings = {
            ...settings,
            mcpServers: [...(settings.mcpServers || []), newServer],
        };

        selectedMcpServerId = newServer.id;
        newMcpServerName = '';
        newMcpServerUrl = '';
        showAddMcpServer = false;
        mcpServerTools = [];

        saveSettings();
        pushMsg('MCP Server 已添加');
    }

    // 添加内置 MCP Server
    function addBuiltInMcpServer(server: BuiltInMcpServer) {
        const newServer = {
            id: generateMcpServerId(),
            name: server.name,
            url: server.url,
            authToken: '', // 用户需要自行填写 token
            timeoutMs: 20000,
            maxArgChars: 12000,
            enabled: true,
            allowTools: server.defaultTools,
        };

        settings = {
            ...settings,
            mcpServers: [...(settings.mcpServers || []), newServer],
        };

        selectedMcpServerId = newServer.id;
        mcpServerTools = [];
        saveSettings();
        pushMsg(`${server.name} Server 已添加，请填写认证 Token`);
    }

    // 删除 MCP Server
    function removeMcpServer(serverId: string) {
        const server = settings.mcpServers?.find(s => s.id === serverId);
        if (!server) return;

        // 检查是否是内置服务器
        const isBuiltIn = Object.values(builtInMcpServerNames).includes(server.name);

        confirm(
            isBuiltIn ? '重置 MCP Server' : '删除 MCP Server',
            isBuiltIn
                ? `确定要重置 "${server.name}" 吗？这将清除所有配置（如 Token）。`
                : `确定要删除 "${server.name}" 吗？`,
            () => {
                if (isBuiltIn) {
                    // 内置服务器：清除配置但保留条目
                    settings = {
                        ...settings,
                        mcpServers: settings.mcpServers.map(s =>
                            s.id === serverId
                                ? {
                                      ...s,
                                      authToken: '',
                                      enabled: true,
                                      allowTools: BUILT_IN_MCP_SERVERS[Object.keys(builtInMcpServerNames).find(k => builtInMcpServerNames[k] === s.name)]?.defaultTools || [],
                                  }
                                : s
                        ),
                    };
                } else {
                    // 自定义服务器：删除条目
                    settings = {
                        ...settings,
                        mcpServers: settings.mcpServers.filter(s => s.id !== serverId),
                    };
                }

                if (selectedMcpServerId === serverId) {
                    selectedMcpServerId = '';
                    mcpServerTools = [];
                }

                saveSettings();
                pushMsg(isBuiltIn ? 'MCP Server 已重置' : 'MCP Server 已删除');
            }
        );
    }

    // 拉取 MCP Server 工具列表
    async function fetchMcpServerTools() {
        if (!selectedMcpServer) return;

        console.log('[Settings] fetchMcpServerTools called');
        console.log('[Settings] Server:', selectedMcpServer);

        mcpServerToolsLoading = true;
        mcpServerToolsError = '';

        try {
            const { getMcpTools, refreshMcpTools } = await import('./mcp/mcpTools');

            // 构建单服务器的 McpConfig，allowTools 为空以获取所有工具
            const config = {
                enabled: true,
                serverUrl: selectedMcpServer.url,
                authToken: selectedMcpServer.authToken || '',
                transport: 'http' as const,
                timeoutMs: selectedMcpServer.timeoutMs || 20000,
                maxArgChars: selectedMcpServer.maxArgChars || 12000,
                allowTools: [] as string[], // 空 = 获取所有工具用于展示
                denyTools: [] as string[],
                refreshToolsOnStart: true,
            };

            // 刷新缓存以确保获取最新工具列表
            refreshMcpTools();

            // 直接加载该服务器的所有工具
            const loadedTools = await getMcpTools(config);
            console.log('[Settings] Loaded tools:', loadedTools.length);

            // 转换为本地格式
            mcpServerTools = loadedTools.map((tool: any) => {
                const rawName = tool.function?.name || tool.name || '';
                const toolName = rawName.replace('mcp_', '');
                const description = tool.function?.description?.replace('[MCP]', '').trim() ||
                                   tool.description || 'No description';

                // 检查是否已允许
                const isAllowed = selectedMcpServer.allowTools.includes(toolName);

                return {
                    name: toolName,
                    description: description,
                    selected: isAllowed
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            console.log('[Settings] Final tools:', mcpServerTools);

        } catch (err) {
            console.error('[Settings] MCP fetch error:', err);
            mcpServerToolsError = err instanceof Error ? err.message : 'Unknown error';
        } finally {
            mcpServerToolsLoading = false;
        }
    }

    // 切换工具选择（自动保存）
    function toggleMcpServerTool(name: string) {
        mcpServerTools = mcpServerTools.map(tool =>
            tool.name === name ? { ...tool, selected: !tool.selected } : tool
        );
        saveMcpServerTools();
    }

    // 全选（自动保存）
    function selectAllMcpServerTools() {
        mcpServerTools = mcpServerTools.map(tool => ({ ...tool, selected: true }));
        saveMcpServerTools();
    }

    // 取消全选（自动保存）
    function deselectAllMcpServerTools() {
        mcpServerTools = mcpServerTools.map(tool => ({ ...tool, selected: false }));
        saveMcpServerTools();
    }

    // 保存工具选择到 Server
    async function saveMcpServerTools() {
        if (!selectedMcpServer) return;

        const selectedTools = mcpServerTools
            .filter(t => t.selected)
            .map(t => t.name);

        settings = {
            ...settings,
            mcpServers: settings.mcpServers.map(s =>
                s.id === selectedMcpServerId
                    ? { ...s, allowTools: selectedTools }
                    : s
            ),
        };

        await saveSettings();
        pushMsg('工具选择已保存');
    }

    // 保存 Server 配置
    async function saveMcpServerConfig() {
        await saveSettings();
        pushMsg('配置已保存');
    }

    let groups: ISettingGroup[] = [
        {
            name: t('settings.settingsGroup.systemPrompt'),
            items: [
                {
                    key: 'aiSystemPrompt',
                    value: settings.aiSystemPrompt,
                    type: 'textarea',
                    title: t('settings.ai.systemPrompt.title'),
                    description: t('settings.ai.systemPrompt.description'),
                    direction: 'row',
                    rows: 4,
                    placeholder: t('settings.ai.systemPrompt.placeholder'),
                },
            ],
        },
        {
            name: t('settings.settingsGroup.platformManagement'),
            items: [],
        },
        {
            name: t('settings.settingsGroup.displayAndOperation'),
            items: [
                {
                    key: 'sendMessageShortcut',
                    value: settings.sendMessageShortcut,
                    type: 'select',
                    title: t('settings.sendMessageShortcut.title'),
                    description: t('settings.sendMessageShortcut.description'),
                    options: {
                        'ctrl+enter': t('settings.sendMessageShortcut.options.ctrlEnter'),
                        enter: t('settings.sendMessageShortcut.options.enter'),
                    },
                },
                {
                    key: 'messageFontSize',
                    value: settings.messageFontSize,
                    type: 'number',
                    title: t('settings.messageFontSize.title'),
                    description: t('settings.messageFontSize.description'),
                    number: {
                        min: 5,
                        max: 32,
                        step: 1,
                    },
                },
                {
                    key: 'multiModelViewMode',
                    value: settings.multiModelViewMode,
                    type: 'select',
                    title: t('settings.multiModelViewMode.title'),
                    description: t('settings.multiModelViewMode.description'),
                    options: {
                        tab: t('settings.multiModelViewMode.options.tab'),
                        card: t('settings.multiModelViewMode.options.card'),
                    },
                },
            ],
        },
        {
            name: t('settings.settingsGroup.noteExport'),
            items: [
                {
                    key: 'exportNotebook',
                    value: settings.exportNotebook,
                    type: 'select',
                    title: t('settings.exportNotebook.title'),
                    description: t('settings.exportNotebook.description'),
                    options: notebookOptions,
                },
                {
                    key: 'exportDefaultPath',
                    value: settings.exportDefaultPath,
                    type: 'textinput',
                    title: t('settings.exportDefaultPath.title'),
                    description: t('settings.exportDefaultPath.description'),
                    placeholder: t('settings.exportDefaultPath.placeholder'),
                },
            ],
        },
        {
            name: t('settings.settingsGroup.sessionManagement') || '会话管理',
            items: [
                {
                    key: 'autoRenameSession',
                    value: settings.autoRenameSession,
                    type: 'checkbox',
                    title: t('settings.autoRenameSession.title') || '会话自动重命名',
                    description:
                        t('settings.autoRenameSession.description') ||
                        '在首次发送消息时，自动使用AI生成会话标题',
                },
            ],
        },
        {
            name: t('settings.settingsGroup.webApp') || '网页小程序',
            items: [
                {
                    key: 'openLinksInWebView',
                    value: settings.openLinksInWebView,
                    type: 'checkbox',
                    title: t('settings.openLinksInWebView.title') || '在 WebView 中打开链接',
                    description:
                        t('settings.openLinksInWebView.description') ||
                        '点击思源笔记中的 https 链接时，在内置 WebView 标签页中打开，而不是外部浏览器',
                },
                {
                    key: 'searchEngine',
                    value: settings.searchEngine,
                    type: 'select',
                    title: t('settings.searchEngine.title') || '搜索引擎',
                    description:
                        t('settings.searchEngine.description') || '选择地址栏使用的默认搜索引擎',
                    options: {
                        google: 'Google',
                        bing: 'Bing',
                    },
                },
            ],
        },
        {
            name: t('settings.settingsGroup.webSearch') || '网络搜索',
            items: [
                {
                    key: 'braveSearchApiKey',
                    value: settings.braveSearchApiKey,
                    type: 'textinput',
                    title: t('settings.braveSearchApiKey.title') || 'Brave Search API Key',
                    description:
                        t('settings.braveSearchApiKey.description') ||
                        '用于 Agent 模式的网络搜索功能。获取 API Key: https://brave.com/search/api/',
                    placeholder: 'BSA************',
                },
                {
                    key: 'braveSearchBaseUrl',
                    value: settings.braveSearchBaseUrl,
                    type: 'textinput',
                    title: t('settings.braveSearchBaseUrl.title') || 'Brave Search API 基础 URL',
                    description:
                        t('settings.braveSearchBaseUrl.description') ||
                        '可选，留空使用默认值 https://api.search.brave.com/res/v1',
                    placeholder: 'https://api.search.brave.com/res/v1',
                },
            ],
        },
        {
            name: t('settings.settingsGroup.mcp') || 'MCP (Model Context Protocol)',
            items: [], // 使用自定义渲染
        },
        {
            name: t('settings.settingsGroup.translate') || '翻译设置',
            items: [
                {
                    key: 'translateTemperature',
                    value: settings.translateTemperature,
                    type: 'number',
                    title: t('settings.translate.temperature.title') || '翻译 Temperature',
                    description:
                        t('settings.translate.temperature.description') ||
                        '翻译专用的 temperature 参数（0-2），为空则使用模型默认值。值越小，翻译越准确一致；值越大，翻译越灵活多样',
                    number: {
                        min: 0,
                        max: 2,
                        step: 0.1,
                    },
                },
                {
                    key: 'translatePrompt',
                    value: settings.translatePrompt,
                    type: 'textarea',
                    title: t('settings.translate.prompt.title') || '翻译提示词',
                    description:
                        t('settings.translate.prompt.description') ||
                        '翻译时使用的提示词模板，${content} 会被替换为要翻译的内容',
                    direction: 'row',
                    rows: 8,
                    placeholder:
                        t('settings.translate.prompt.placeholder') || '输入翻译提示词模板...',
                },
            ],
        },
        {
            name: t('settings.settingsGroup.reset') || 'Reset Settings',
            items: [
                {
                    key: 'reset',
                    value: '',
                    type: 'button',
                    title: t('settings.reset.title') || 'Reset Settings',
                    description:
                        t('settings.reset.description') || 'Reset all settings to default values',
                    button: {
                        label: t('settings.reset.label') || 'Reset',
                        callback: async () => {
                            confirm(
                                t('settings.reset.title') || 'Reset Settings',
                                t('settings.reset.confirmMessage') ||
                                    'Are you sure you want to reset all settings to default values? This action cannot be undone.',
                                async () => {
                                    // 确认回调
                                    settings = { ...getDefaultSettings() };
                                    updateGroupItems();
                                    await saveSettings();
                                    await pushMsg(t('settings.reset.message'));
                                },
                                () => {
                                    // 取消回调（可选）
                                    console.log('Reset cancelled');
                                }
                            );
                        },
                    },
                },
            ],
        },
        {
            name: '❤️用爱发电',
            items: [
                {
                    key: 'donateInfo',
                    value: '',
                    type: 'hint',
                    title: '用爱发电',
                    description: `
                        <p style="margin-top:12px;">如果喜欢我的插件，欢迎给GitHub仓库点star和微信赞赏，这会激励我继续完善此插件和开发新插件。</p>

                        <p style="margin-top:12px;">维护插件费时费力，个人时间和精力有限，开源只是分享，不等于我要浪费我的时间免费帮用户实现ta需要的功能，</p>

                        <p style="margin-top:12px;">我需要的功能我会慢慢改进（打赏可以催更），有些我觉得可以改进、但是现阶段不必要的功能需要打赏才改进（会标注打赏标签和需要打赏金额），而不需要的功能、实现很麻烦的功能会直接关闭issue不考虑实现，我没实现的功能欢迎有大佬来pr</p>

                        <p style="margin-top:12px;">累积赞赏50元的朋友如果想加我微信和进粉丝交流群，可以在赞赏的时候备注微信号，或者发邮件到<a href="mailto:achuan-2@outlook.com">achuan-2@outlook.com</a>来进行好友申请</p>
                        
                        <div style="margin-top:12px;">
                        <img src="plugins/siyuan-plugin-copilot/assets/donate.png" alt="donate" style="max-width:260px; height:auto; border:1px solid var(--b3-border-color);"/>
                        </div>
                        <p style="margin-top:12px;">也欢迎大家使用我的<a href="https://gpt.achuan-2.top/register?aff=ZndO">AI API中转站</a>，提供Openai ChatGPT、Gemini、Claude、Deepseek、Grok等API直连中转服务，只要用户注册我就有收益</p>
                    `,
                },
            ],
        },
    ];

    let focusGroup = groups[0].name;

    interface ChangeEvent {
        group: string;
        key: string;
        value: any;
    }

    const onChanged = ({ detail }: CustomEvent<ChangeEvent>) => {
        console.log(detail.key, detail.value);
        // 使用 in 操作符检查 key 是否存在，而不是检查值是否为 undefined
        // 这样可以正确处理值为 undefined 的设置项（如 translateTemperature）
        if (detail.key in settings) {
            settings[detail.key] = detail.value;
            saveSettings();
        }
    };

    async function saveSettings() {
        await plugin.saveSettings(settings);
    }

    onMount(async () => {
        await runload();
    });

    async function runload() {
        try {
            const loadedSettings = await plugin.loadSettings();
            settings = { ...loadedSettings };
        } catch (err) {
            console.error('[SettingsPannel] Failed to load settings:', err);
            // 加载失败时保留现有设置，不清空
            return;
        }

        // 确保 aiProviders 存在
        if (!settings.aiProviders) {
            settings.aiProviders = {
                gemini: { apiKey: '', customApiUrl: '', models: [] },
                deepseek: { apiKey: '', customApiUrl: '', models: [] },
                openai: { apiKey: '', customApiUrl: '', models: [] },
                moonshot: { apiKey: '', customApiUrl: '', models: [] },
                volcano: { apiKey: '', customApiUrl: '', models: [] },
                Achuan: { apiKey: '', customApiUrl: '', models: [] },
                customProviders: [],
            };
        }

        // 确保每个内置平台都存在（支持旧配置升级）
        const builtInPlatformIds = [
            'Achuan',
            'gemini',
            'deepseek',
            'openai',
            'moonshot',
            'volcano',
        ];
        for (const platformId of builtInPlatformIds) {
            if (!settings.aiProviders[platformId]) {
                settings.aiProviders[platformId] = { apiKey: '', customApiUrl: '', models: [] };
            }
        }

        // 确保 customProviders 数组存在
        if (!settings.aiProviders.customProviders) {
            settings.aiProviders.customProviders = [];
        }

        // 确保每个内置 MCP Server 都存在（自动添加）
        if (!settings.mcpServers) {
            settings.mcpServers = [];
        }
        for (const [id, server] of Object.entries(BUILT_IN_MCP_SERVERS)) {
            const exists = settings.mcpServers.some(s => s.name === server.name);
            if (!exists) {
                settings.mcpServers.push({
                    id: generateMcpServerId(),
                    name: server.name,
                    url: server.url,
                    authToken: '',
                    timeoutMs: 20000,
                    maxArgChars: 12000,
                    enabled: true,
                    allowTools: server.defaultTools,
                });
            }
        }

        // 恢复选中的平台ID（仅用于设置面板显示）
        // 优先使用 selectedProviderId，如果不存在则使用 currentProvider 作为初始值
        selectedProviderId = settings.selectedProviderId || settings.currentProvider || 'openai';

        // 确保 selectedProviderId 设置被保存
        if (!settings.selectedProviderId) {
            settings.selectedProviderId = selectedProviderId;
        }

        // 加载笔记本列表
        await loadNotebooks();

        updateGroupItems();
        // 确保设置已保存（可能包含新的默认值）
        await saveSettings();

        // console.debug(t('common.configComplete'));
    }

    // 加载笔记本列表
    async function loadNotebooks() {
        try {
            const notebooks = await lsNotebooks();
            if (notebooks?.notebooks && notebooks.notebooks.length > 0) {
                // 构建笔记本选项对象 { id: name }，只显示 closed=false 的笔记本
                notebookOptions = {};
                notebookOptions[''] =
                    t('settings.exportNotebook.placeholder') || '-- 请选择笔记本 --';
                notebooks.notebooks
                    .filter(notebook => notebook.closed === false)
                    .forEach(notebook => {
                        notebookOptions[notebook.id] = notebook.name;
                    });
            } else {
                notebookOptions = {
                    '': t('settings.exportNotebook.placeholder') || '-- 请选择笔记本 --',
                };
            }
        } catch (error) {
            console.error('Load notebooks error:', error);
            notebookOptions = {
                '': t('settings.exportNotebook.placeholder') || '-- 请选择笔记本 --',
            };
        }
    }

    function updateGroupItems() {
        groups = groups.map(group => ({
            ...group,
            items: group.items.map(item => {
                const updatedItem: any = {
                    ...item,
                    value: settings[item.key] ?? item.value,
                };
                // 为笔记本选择器更新 options
                if (item.key === 'exportNotebook') {
                    updatedItem.options = notebookOptions;
                }
                return updatedItem;
            }),
        }));
    }

    $: currentGroup = groups.find(group => group.name === focusGroup);
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <li
                data-name="editor"
                class:b3-list-item--focus={group.name === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group.name;
                }}
                on:keydown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        focusGroup = group.name;
                    }
                }}
                role="tab"
                tabindex="0"
            >
                <span class="b3-list-item__text">{group.name}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        {#if focusGroup === t('settings.settingsGroup.systemPrompt')}
            <SettingPanel
                group={currentGroup?.name || ''}
                settingItems={currentGroup?.items || []}
                display={true}
                on:changed={onChanged}
            />
        {:else if focusGroup === t('settings.settingsGroup.platformManagement')}
            <!-- 新的侧边栏布局：左侧为平台列表/操作，右侧为平台配置主区域 -->
            <div class="platform-management-layout">
                <aside class="platform-sidebar">
                    <div class="unified-platform-manager">
                        <div class="manager-header">
                            <h5>{t('platform.management')}</h5>
                            <button
                                class="b3-button b3-button--outline"
                                on:click={() => (showAddPlatform = !showAddPlatform)}
                            >
                                {showAddPlatform ? t('platform.cancel') : t('platform.add')}
                            </button>
                        </div>

                        {#if showAddPlatform}
                            <div class="add-platform-form">
                                <div>
                                    <div>{t('platform.name')}</div>
                                    <input
                                        class="b3-text-field fn__flex-1"
                                        type="text"
                                        bind:value={newPlatformName}
                                        placeholder={t('platform.namePlaceholder')}
                                        on:keydown={e => e.key === 'Enter' && addCustomPlatform()}
                                    />
                                </div>
                                <button
                                    class="b3-button b3-button--outline"
                                    on:click={addCustomPlatform}
                                    disabled={!newPlatformName.trim()}
                                >
                                    {t('platform.confirmAdd')}
                                </button>
                            </div>
                        {/if}

                        <div class="platform-list">
                            {#each allProviderOptions as platform}
                                <div
                                    class="platform-item"
                                    class:platform-item--selected={selectedProviderId ===
                                        platform.id}
                                    on:click={() => {
                                        selectedProviderId = platform.id;
                                        handleProviderSelect();
                                    }}
                                    on:keydown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            selectedProviderId = platform.id;
                                            handleProviderSelect();
                                        }
                                    }}
                                    role="button"
                                    tabindex="0"
                                >
                                    <div class="platform-item__info">
                                        <span class="platform-item__name">{platform.name}</span>
                                        <span class="platform-item__type">
                                            {platform.type === 'built-in'
                                                ? t('platform.type.builtin')
                                                : t('platform.type.custom')}
                                        </span>
                                    </div>
                                    <button
                                        class="b3-button b3-button--text b3-button--error"
                                        on:click|stopPropagation={() => removePlatform(platform.id)}
                                        title="删除平台"
                                    >
                                        <svg class="b3-button__icon">
                                            <use xlink:href="#iconTrashcan"></use>
                                        </svg>
                                    </button>
                                </div>
                            {/each}
                            {#if allProviderOptions.length === 0}
                                <div class="empty-hint">暂无可用平台</div>
                            {/if}
                        </div>
                    </div>
                </aside>

                <main class="platform-main">
                    {#if selectedProviderId}
                        {#if builtInProviderNames[selectedProviderId]}
                            {#key selectedProviderId}
                                <ProviderConfigPanel
                                    providerId={selectedProviderId}
                                    providerName={selectedProviderName}
                                    defaultApiUrl={builtInProviderDefaultUrls[selectedProviderId]}
                                    websiteUrl={builtInProviderWebsites[selectedProviderId]}
                                    bind:config={settings.aiProviders[selectedProviderId]}
                                    isCustomProvider={false}
                                    on:change={handleProviderChange}
                                />
                            {/key}
                        {:else}
                            {#each settings.aiProviders.customProviders as customProvider}
                                {#if customProvider.id === selectedProviderId}
                                    {#key customProvider.id}
                                        <ProviderConfigPanel
                                            providerId={customProvider.id}
                                            providerName={customProvider.name}
                                            defaultApiUrl=""
                                            websiteUrl=""
                                            bind:config={customProvider}
                                            isCustomProvider={true}
                                            on:change={handleProviderChange}
                                            on:rename={e =>
                                                handleProviderRename(
                                                    customProvider.id,
                                                    e.detail.newName
                                                )}
                                        />
                                    {/key}
                                {/if}
                            {/each}
                        {/if}
                    {:else}
                        <div class="no-selection">
                            {t('platform.selectHint') || '请选择一个平台以查看或编辑其配置'}
                        </div>
                    {/if}
                </main>
            </div>
        {:else if focusGroup === (t('settings.settingsGroup.sessionManagement') || '会话管理')}
            <div class="session-management-panel">
                <SettingPanel
                    group={currentGroup?.name || ''}
                    settingItems={currentGroup?.items || []}
                    display={true}
                    on:changed={onChanged}
                />

                {#if settings.autoRenameSession}
                    <div class="auto-rename-model-selector">
                        <div class="config__item">
                            <div class="config__item-label">
                                <div class="config__item-title">
                                    {t('settings.autoRenameSession.modelTitle') || '重命名模型'}
                                </div>
                                <div class="config__item-description">
                                    {t('settings.autoRenameSession.modelDescription') ||
                                        '选择用于生成会话标题的AI模型'}
                                </div>
                            </div>
                            <div
                                class="config__item-control"
                                style="display: flex; gap: 8px; align-items: center;"
                            >
                                <select
                                    class="b3-select"
                                    bind:value={settings.autoRenameProvider}
                                    on:change={() => {
                                        settings.autoRenameModelId = '';
                                        saveSettings();
                                    }}
                                >
                                    <option value="">
                                        {t('settings.autoRenameSession.selectProvider') ||
                                            '-- 选择平台 --'}
                                    </option>
                                    {#each allProviderOptions as provider}
                                        {#if settings.aiProviders[provider.id]?.models?.length > 0 || (provider.type === 'custom' && settings.aiProviders.customProviders.find(p => p.id === provider.id)?.models?.length > 0)}
                                            <option value={provider.id}>{provider.name}</option>
                                        {/if}
                                    {/each}
                                </select>

                                {#if settings.autoRenameProvider}
                                    <select
                                        class="b3-select"
                                        bind:value={settings.autoRenameModelId}
                                        on:change={saveSettings}
                                    >
                                        <option value="">
                                            {t('settings.autoRenameSession.selectModel') ||
                                                '-- 选择模型 --'}
                                        </option>
                                        {#if builtInProviderNames[settings.autoRenameProvider]}
                                            {#each settings.aiProviders[settings.autoRenameProvider]?.models || [] as model}
                                                <option value={model.id}>
                                                    {model.name || model.id}
                                                </option>
                                            {/each}
                                        {:else}
                                            {#each settings.aiProviders.customProviders.find(p => p.id === settings.autoRenameProvider)?.models || [] as model}
                                                <option value={model.id}>
                                                    {model.name || model.id}
                                                </option>
                                            {/each}
                                        {/if}
                                    </select>
                                {/if}
                            </div>
                        </div>

                        <!-- 自定义提示词 -->
                        <div class="config__item" style="margin-top: 16px;">
                            <div class="config__item-label">
                                <div class="config__item-title">
                                    {t('settings.autoRenameSession.promptTitle') || '自定义提示词'}
                                </div>
                                <div class="config__item-description">
                                    {t('settings.autoRenameSession.promptDescription') ||
                                        '自定义生成会话标题的提示词，使用 {message} 作为用户消息的占位符'}
                                </div>
                            </div>
                            <div class="config__item-control">
                                <textarea
                                    class="b3-text-field"
                                    rows="4"
                                    bind:value={settings.autoRenamePrompt}
                                    on:change={saveSettings}
                                    placeholder={t(
                                        'settings.autoRenameSession.promptPlaceholder'
                                    ) ||
                                        '请根据以下用户消息生成一个简洁的会话标题（不超过20个字，不要使用引号）：\n\n{message}'}
                                ></textarea>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {:else if focusGroup === (t('settings.settingsGroup.mcp') || 'MCP (Model Context Protocol)')}
            <div class="platform-management-layout">
                <!-- 左侧：Server 列表 -->
                <aside class="platform-sidebar">
                    <div class="unified-platform-manager">
                        <div class="manager-header">
                            <h5>MCP Servers</h5>
                            <button
                                class="b3-button b3-button--outline"
                                on:click={() => showAddMcpServer = !showAddMcpServer}
                            >
                                {showAddMcpServer ? '取消' : '+ 添加'}
                            </button>
                        </div>

                        <!-- 添加自定义 Server 表单 -->
                        {#if showAddMcpServer}
                            <div class="add-platform-form">
                                <input
                                    class="b3-text-field"
                                    style="width: 100%;"
                                    type="text"
                                    bind:value={newMcpServerName}
                                    placeholder="Server 名称"
                                    on:keydown={e => e.key === 'Enter' && newMcpServerName.trim() && addMcpServer()}
                                />
                                <button
                                    class="b3-button b3-button--outline"
                                    on:click={addMcpServer}
                                    disabled={!newMcpServerName.trim()}
                                >
                                    添加
                                </button>
                            </div>
                        {/if}

                        <!-- Server 列表（内置 + 自定义） -->
                        <div class="platform-list">
                            {#each allMcpServerOptions as server (server.id)}
                                <div
                                    class="platform-item"
                                    class:platform-item--selected={selectedMcpServerId === server.id}
                                    on:click={() => {
                                        selectedMcpServerId = server.id;
                                        mcpServerTools = [];
                                    }}
                                    on:keydown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            selectedMcpServerId = server.id;
                                            mcpServerTools = [];
                                        }
                                    }}
                                    role="button"
                                    tabindex="0"
                                >
                                    <div class="platform-item__info">
                                        <span class="platform-item__name">{server.name}</span>
                                        <span class="platform-item__type">
                                            {server.type === 'built-in' ? '内置' : '自定义'}
                                        </span>
                                    </div>
                                    <button
                                        class="b3-button b3-button--text b3-button--error"
                                        on:click|stopPropagation={() => {
                                            // 找到对应的 server id 进行删除
                                            const toRemove = settings.mcpServers?.find(s => s.name === server.name);
                                            if (toRemove) {
                                                removeMcpServer(toRemove.id);
                                            }
                                        }}
                                        title="删除"
                                    >
                                        <svg class="b3-button__icon" style="width: 16px; height: 16px;">
                                            <use xlink:href="#iconTrashcan"></use>
                                        </svg>
                                    </button>
                                </div>
                            {/each}
                            {#if allMcpServerOptions.length === 0}
                                <div class="empty-hint">暂无可用 MCP Server</div>
                            {/if}
                        </div>
                    </div>
                </aside>

                <!-- 右侧：Server 配置详情 -->
                <main class="platform-main">
                    {#if selectedMcpServer}
                        <div class="provider-config">
                            <div class="provider-config__header">
                                <h4>{selectedMcpServer.name}</h4>
                                {#if getMcpServerWebsite(selectedMcpServer.name)}
                                    <a
                                        class="platform-link"
                                        href={getMcpServerWebsite(selectedMcpServer.name)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="访问平台"
                                    >
                                        <svg class="b3-button__icon">
                                            <use xlink:href="#iconLink"></use>
                                        </svg>
                                        <span>访问平台</span>
                                    </a>
                                {/if}
                            </div>
                            
                            <!-- 启用开关 -->
                            <div class="provider-config__section">
                                <label class="fn__flex" style="align-items: center; gap: 12px; cursor: pointer;">
                                    <input 
                                        type="checkbox" 
                                        class="b3-switch"
                                        bind:checked={selectedMcpServer.enabled}
                                        on:change={saveMcpServerConfig}
                                    />
                                    <span class="b3-label__text" style="margin: 0;">启用此 Server</span>
                                </label>
                            </div>
                            <!-- 基本配置 -->
                            <div class="provider-config__section">
                                <!-- 仅自定义服务器显示 URL 字段 -->
                                {#if !getMcpServerWebsite(selectedMcpServer.name)}
                                <div class="config-item">
                                    <div class="b3-label__text">Server URL</div>
                                    <input
                                        class="b3-text-field fn__block"
                                        type="text"
                                        bind:value={selectedMcpServer.url}
                                        on:change={saveMcpServerConfig}
                                        placeholder="https://mcp.example.com"
                                    />
                                </div>
                                {/if}

                                <div class="config-item" style="margin-top: 16px;">
                                    <div class="b3-label__text">认证 Token（可选）</div>
                                    <div class="api-key-input-wrapper">
                                        {#if showMcpAuthToken}
                                            <input
                                                class="b3-text-field fn__flex-1"
                                                type="text"
                                                bind:value={selectedMcpServer.authToken}
                                                on:change={saveMcpServerConfig}
                                                placeholder="Bearer token"
                                            />
                                        {:else}
                                            <input
                                                class="b3-text-field fn__flex-1"
                                                type="password"
                                                bind:value={selectedMcpServer.authToken}
                                                on:change={saveMcpServerConfig}
                                                placeholder="Bearer token"
                                            />
                                        {/if}
                                        <button
                                            class="b3-button b3-button--text api-key-toggle"
                                            on:click={() => (showMcpAuthToken = !showMcpAuthToken)}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href={showMcpAuthToken ? '#iconEye' : '#iconEyeoff'}></use>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="config-item" style="margin-top: 16px;">
                                    <div class="b3-label__text">调用超时（毫秒）</div>
                                    <input 
                                        class="b3-text-field fn__block"
                                        type="number"
                                        bind:value={selectedMcpServer.timeoutMs}
                                        on:change={saveMcpServerConfig}
                                        min="1000"
                                        max="120000"
                                        step="1000"
                                    />
                                </div>
                            </div>
                            
                            <!-- 工具管理 -->
                            <div class="provider-config__section" style="margin-top: 24px;">
                                <div class="section-header">
                                    <h5>工具管理</h5>
                                    <button
                                        class="b3-button b3-button--outline"
                                        on:click={fetchMcpServerTools}
                                        disabled={mcpServerToolsLoading}
                                    >
                                        拉取工具
                                    </button>
                                </div>
                                
                                {#if mcpServerToolsError}
                                    <div class="b3-label__text" style="color: var(--b3-theme-error); margin-top: 12px;">
                                        {mcpServerToolsError}
                                    </div>
                                {:else if mcpServerTools.length > 0}
                                    <div class="tools-search-row" style="margin-top: 16px;">
                                        <input 
                                            class="b3-text-field fn__flex-1" 
                                            placeholder="搜索工具..."
                                            bind:value={mcpToolsSearchQuery}
                                        />
                                        <button class="b3-button b3-button--outline" on:click={selectAllMcpServerTools}>全选</button>
                                        <button class="b3-button b3-button--outline" on:click={deselectAllMcpServerTools}>取消全选</button>
                                    </div>
                                    
                                    <div class="tools-list-header">
                                        <button
                                            class="tools-list-toggle"
                                            on:click={() => showMcpToolsList = !showMcpToolsList}
                                        >
                                            <svg class="b3-button__icon">
                                                <use
                                                    xlink:href={showMcpToolsList ? '#iconDown' : '#iconRight'}
                                                ></use>
                                            </svg>
                                            <span>已启用工具 ({selectedMcpToolsCount})</span>
                                        </button>
                                    </div>

                                    {#if showMcpToolsList}
                                    <div class="tools-list-container">
                                        {#each filteredMcpServerTools as tool, index}
                                            <label class="tool-list-item" class:tool-list-item--last={index === filteredMcpServerTools.length - 1}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={tool.selected}
                                                    on:change={() => toggleMcpServerTool(tool.name)}
                                                />
                                                <div class="tool-list-item__content">
                                                    <div class="tool-list-item__name">{tool.name}</div>
                                                    <div class="tool-list-item__desc">{tool.description}</div>
                                                </div>
                                            </label>
                                        {/each}
                                    </div>
                                    {/if}
                                {:else}
                                    <div class="empty-tools-hint">
                                        点击"拉取工具"获取可用工具列表
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div class="no-selection">
                            <p>请选择一个 MCP Server 或添加新 Server</p>
                            <details class="mcp-guide">
                                <summary>如何开通联网搜索 MCP？</summary>
                                <div class="mcp-guide-content">
                                    <ol>
                                        <li>
                                            进入百炼的 <a href="https://bailian.console.aliyun.com/cn-beijing/?tab=app#/mcp-market" target="_blank">MCP 广场</a>，找到<strong>联网搜索</strong> MCP 服务。
                                        </li>
                                        <li>
                                            单击<strong>立即开通</strong> &gt; <strong>确认开通</strong>。
                                            <p class="tip">联网搜索、网页抓取等 MCP 服务<strong>限时免费</strong>，每月 2000 次免费额度。</p>
                                        </li>
                                        <li>
                                            开通成功后，在 MCP 广场获取配置信息：
                                            <ul>
                                                <li><strong>Streamable HTTP Endpoint</strong>：<code>https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp</code></li>
                                                <li><strong>API Key</strong>：即百炼 API Key</li>
                                            </ul>
                                        </li>
                                    </ol>
                                </div>
                            </details>
                        </div>
                    {/if}
                </main>
            </div>
        {:else}
            <SettingPanel
                group={currentGroup?.name || ''}
                settingItems={currentGroup?.items || []}
                display={true}
                on:changed={onChanged}
            />
        {/if}
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
        display: flex;
        flex-direction: row;
        overflow: hidden;
    }
    .config__panel > .b3-tab-bar {
        width: min(30%, 170px);
    }

    .config__tab-wrap {
        flex: 1;
        height: 100%;
        overflow: hidden;
        padding: 2px;
        display: flex;
        flex-direction: column;
    }

    /* 平台管理：侧边栏布局 */
    .platform-management-layout {
        display: flex;
        gap: 16px;
        flex: 1;
        min-height: 0;
        align-items: stretch;
    }

    .platform-sidebar {
        width: 260px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .platform-main {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .no-selection {
        padding: 24px;
        background: var(--b3-theme-background);
        border: 1px dashed var(--b3-border-color);
        border-radius: 6px;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
        margin: auto;
    }

    .unified-platform-manager {
        background: var(--b3-theme-surface);
        border-radius: 6px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }

    .manager-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;

        h5 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .add-platform-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 4px;
        margin-bottom: 16px;
    }

    .platform-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }

    .platform-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
            border-color: var(--b3-theme-primary);
        }

        &.platform-item--selected {
            background: var(--b3-theme-primary-lightest);
            border-color: var(--b3-theme-primary);
        }
    }

    .platform-item__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
    }

    .platform-item__name {
        font-size: 14px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }

    .platform-item__type {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        padding: 2px 6px;
        background: var(--b3-theme-surface);
        border-radius: 10px;
        align-self: flex-start;
    }

    .empty-hint {
        padding: 20px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    /* 内置 MCP Servers */
    .builtin-servers {
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        margin-bottom: 12px;
    }

    .builtin-servers-header {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .builtin-server-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 12px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        margin-bottom: 6px;
        cursor: pointer;
        transition: all 0.2s;

        &:last-child {
            margin-bottom: 0;
        }

        &:hover:not(:disabled) {
            border-color: var(--b3-theme-primary);
            background: var(--b3-theme-primary-lightest);
        }

        &:disabled {
            cursor: default;
            opacity: 0.6;
        }

        &--added {
            border-color: var(--b3-theme-primary);
            background: var(--b3-theme-primary-lightest);
        }
    }

    .builtin-server-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }

    .builtin-server-status {
        font-size: 11px;
        color: var(--b3-theme-primary);
    }

    .session-management-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        overflow-y: auto;
    }

    .auto-rename-model-selector {
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        margin-top: 8px;
    }

    .config__item {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .config__item-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .config__item-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }

    .config__item-description {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
    }

    .config__item-control {
        display: flex;
        gap: 8px;
        align-items: center;

        .b3-select {
            flex: 1;
            min-width: 0;
        }

        textarea.b3-text-field {
            width: 100%;
            min-height: 80px;
            padding: 8px 12px;
            font-size: 13px;
            line-height: 1.6;
            font-family: var(--b3-font-family);
            resize: vertical;

            &::placeholder {
                color: var(--b3-theme-on-surface-light);
                opacity: 0.6;
            }
        }
    }

    /* Provider Config 样式（用于 MCP 设置等） */
    .provider-config {
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        height: 100%;
        overflow-y: auto;
    }

    .provider-config__header {
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .provider-config__section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .platform-link {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--b3-theme-primary);
        text-decoration: none;
        border-radius: 4px;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-primary);
        }

        svg {
            width: 14px;
            height: 14px;
        }
    }

    /* MCP 工具管理 */
    .mcp-management-panel {
        padding: 16px;
        overflow-y: auto;
    }

    .mcp-tools-section {
        margin-top: 16px;
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
    }

    .mcp-tools-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .mcp-server-info {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }

    .mcp-selection-count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .config-item {
        margin-bottom: 0;
    }

    .api-key-input-wrapper {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
    }

    .api-key-toggle {
        flex-shrink: 0;
        opacity: 0.6;
        transition: opacity 0.2s;

        &:hover {
            opacity: 1;
        }
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;

        h5 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .tools-search-row {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .tools-list-header {
        margin-top: 16px;
        margin-bottom: 12px;
    }

    .tools-list-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        width: 100%;
        justify-content: flex-start;
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        font-weight: 500;
        background: none;
        border: none;
        cursor: pointer;
        transition: color 0.2s;

        &:hover {
            color: var(--b3-theme-on-background);
        }

        .b3-button__icon {
            width: 14px;
            height: 14px;
        }
    }

    .tools-list-container {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        overflow: hidden;
        background: var(--b3-theme-background);
    }

    .tool-list-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);
        cursor: pointer;
        transition: background 0.15s;
        margin-bottom: 0;

        &:hover {
            background: var(--b3-theme-background-light);
        }

        &--last {
            border-bottom: none;
            margin-bottom: 0;
        }

        input[type="checkbox"] {
            margin-top: 2px;
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }
    }

    .tool-list-item__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .tool-list-item__name {
        font-weight: 600;
        font-size: 14px;
        color: var(--b3-theme-on-background);
    }

    .tool-list-item__desc {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        line-height: 1.5;
    }

    .empty-tools-hint {
        color: var(--b3-theme-on-surface-light);
        text-align: center;
        padding: 40px 20px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        font-size: 13px;
    }

    .mcp-guide {
        margin-top: 16px;
        text-align: left;
        font-size: 13px;

        summary {
            cursor: pointer;
            color: var(--b3-theme-primary);
            font-weight: 500;
            padding: 8px 0;

            &:hover {
                color: var(--b3-theme-primary-light);
            }
        }

        &-content {
            padding: 12px 16px;
            background: var(--b3-theme-surface);
            border-radius: 4px;
            margin-top: 8px;

            ol, ul {
                padding-left: 20px;
                margin: 8px 0;
            }

            li {
                margin: 8px 0;
                line-height: 1.6;
            }

            code {
                background: var(--b3-theme-background);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
            }

            a {
                color: var(--b3-theme-primary);
                text-decoration: none;

                &:hover {
                    text-decoration: underline;
                }
            }

            .tip {
                font-size: 12px;
                color: var(--b3-theme-on-surface-light);
                margin-top: 4px;
            }
        }
    }
</style>
