/**
 * Playwright 深度演示 - 操作插件侧边栏和功能
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    console.log('=== Playwright 深度交互演示 ===\n');

    // 1. 探索插件结构
    console.log('1. 插件内部结构:');
    const pluginState = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (!plugin) return { error: '插件未找到' };

        return {
            name: plugin.name,
            displayName: plugin.displayName,
            // 关键属性
            aiSidebarApp: !!plugin.aiSidebarApp,
            models: plugin.models ? Object.keys(plugin.models) : [],
            docks: plugin.docks ? plugin.docks : 'not array',
            chatDialogs: plugin.chatDialogs ? `Map with ${plugin.chatDialogs.size} entries` : null,
            eventBus: !!plugin.eventBus,
            commandsCount: plugin.commands?.length || 0,
            // data 属性
            dataKeys: plugin.data ? Object.keys(plugin.data) : [],
            // i18n
            i18nLoaded: !!plugin.i18n,
        };
    });
    console.log(JSON.stringify(pluginState, null, 2));

    // 2. 查看侧边栏 DOM
    console.log('\n2. 侧边栏 DOM:');
    const sidebarDOM = await page.evaluate(() => {
        // 查找 copilot 相关元素
        const copilotEls = document.querySelectorAll('[class*="copilot"], [class*="ai-side"]');
        const results = [];
        copilotEls.forEach(el => {
            if (el.offsetParent !== null) { // visible
                results.push({
                    tag: el.tagName,
                    id: el.id,
                    classes: el.className.slice(0, 60),
                    visible: true,
                });
            }
        });
        return results;
    });
    console.log(JSON.stringify(sidebarDOM, null, 2));

    // 3. 访问 aiSidebarApp
    console.log('\n3. aiSidebarApp 属性:');
    const sidebarApp = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        const app = plugin?.aiSidebarApp;
        if (!app) return '不存在';

        return {
            keys: Object.keys(app).slice(0, 20),
            isSubscribe: typeof app.subscribe === 'function',
            hasSendMessage: typeof app.sendMessage === 'function',
            hasSettingsStore: !!app.settingsStore,
            hasConversations: Array.isArray(app.conversations) ? `${app.conversations.length} items` : typeof app.conversations,
        };
    });
    console.log(JSON.stringify(sidebarApp, null, 2));

    // 4. 检查 eventBus 可用的事件
    console.log('\n4. EventBus 测试:');
    const eventBusTest = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        const eb = plugin?.eventBus;
        if (!eb) return '不存在';

        // 列出所有监听器
        const listeners = {};
        const origOn = eb.on.bind(eb);
        eb.on = function(event, handler) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler.name || 'anonymous');
            return origOn(event, handler);
        };

        // 尝试触发一个自定义事件看是否能监听
        let received = false;
        eb.on('test-event', () => { received = true; });
        setTimeout(() => eb.emit('test-event', { test: true }), 0);

        return {
            hasOn: typeof eb.on === 'function',
            hasEmit: typeof eb.emit === 'function',
            registeredEvents: Object.keys(listeners),
            customEventWorks: received,
        };
    });
    console.log(JSON.stringify(eventBusTest, null, 2));

    // 5. 尝试读取 settingsStore
    console.log('\n5. Settings Store:');
    const settings = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        // 尝试多种方式访问设置
        if (plugin?.settingsStore) {
            let val = null;
            plugin.settingsStore.subscribe(v => val = v)();
            return { source: 'settingsStore', keys: Object.keys(val || {}).slice(0, 10) };
        }
        if (plugin?.data?.settings) {
            return { source: 'data.settings', keys: Object.keys(plugin.data.settings).slice(0, 10) };
        }
        return { source: 'not found' };
    });
    console.log(JSON.stringify(settings, null, 2));

    await browser.close();
    console.log('\n=== 完成 ===');
}

main().catch(console.error);