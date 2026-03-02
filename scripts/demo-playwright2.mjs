/**
 * Playwright 深度演示 - 操作插件侧边栏和功能
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    console.log('=== 深度交互演示 ===\n');

    // 1. 打开侧边栏
    console.log('1. 打开插件侧边栏...');
    await page.evaluate(() => {
        // 尝试通过 eventBus 触发
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (plugin?.docks) {
            // 查找并打开 dock
            for (const dock of plugin.docks) {
                if (dock.name === 'siyuan-plugin-copilot') {
                    plugin.data = { ...plugin.data, dock: { visible: true } };
                    break;
                }
            }
        }
    });

    // 等待侧边栏加载
    await page.waitForTimeout(1000);

    // 2. 查找侧边栏元素
    const sidebar = await page.evaluate(() => {
        // 各种可能的选择器
        const selectors = [
            '[data-type="siyuan-plugin-copilot"]',
            '.layout__dock[data-dock="siyuan-plugin-copilot"]',
            '.dockr [data-dock="siyuan-plugin-copilot"]',
            '[class*="ai-sidebar"]',
            '[class*="copilot"]',
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                return {
                    selector: sel,
                    visible: el.offsetParent !== null,
                    tag: el.tagName,
                    classes: el.className?.slice(0, 50),
                };
            }
        }
        return null;
    });

    console.log('2. 侧边栏元素:', JSON.stringify(sidebar, null, 2) || '未找到');

    // 3. 访问插件内部状态
    console.log('\n3. 插件内部状态:');
    const pluginState = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (!plugin) return null;

        return {
            hasAiSidebarApp: !!plugin.aiSidebarApp,
            aiSidebarAppKeys: plugin.aiSidebarApp ? Object.keys(plugin.aiSidebarApp).slice(0, 10) : [],
            docksCount: plugin.docks?.length || 0,
            docks: plugin.docks?.map(d => ({ name: d.name, visible: d.data?.visible })),
            models: plugin.models ? Object.keys(plugin.models) : [],
            chatDialogsCount: plugin.chatDialogs?.size || 0,
            eventBus: !!plugin.eventBus,
            commandsCount: plugin.commands?.length || 0,
        };
    });
    console.log(JSON.stringify(pluginState, null, 2));

    // 4. 访问侧边栏内部 Svelte 状态
    console.log('\n4. 侧边栏内部状态:');
    const sidebarState = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (!plugin?.aiSidebarApp) return '无 aiSidebarApp';

        // 尝试访问 Svelte store
        const app = plugin.aiSidebarApp;
        return {
            hasProtyle: !!app.protyle,
            currentMode: app.currentMode,
            currentProvider: app.currentProvider,
            currentModelId: app.currentModelId,
            hasSettingsStore: !!app.settingsStore,
            hasConversations: !!app.conversations,
        };
    });
    console.log(JSON.stringify(sidebarState, null, 2));

    // 5. 测试发送消息（如果侧边栏已打开）
    console.log('\n5. 测试发送 AI 消息:');
    const sendTest = await page.evaluate(async () => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        const app = plugin?.aiSidebarApp;

        if (!app || !app.sendMessage) {
            return { success: false, reason: 'sendMessage 方法不存在' };
        }

        try {
            // 发送测试消息
            const result = await app.sendMessage('Say "TEST OK" if you receive this');
            return { success: true, result: result?.slice(0, 100) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
    console.log(JSON.stringify(sendTest, null, 2));

    await browser.close();
    console.log('\n=== 完成 ===');
}

main().catch(console.error);