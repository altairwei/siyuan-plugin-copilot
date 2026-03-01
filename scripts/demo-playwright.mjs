/**
 * 演示 Playwright 操作 SiYuan 前端的能力
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    console.log('=== Playwright 交互演示 ===\n');

    // 1. 获取当前文档信息
    const docInfo = await page.evaluate(() => {
        const protyle = document.querySelector('.protyle');
        return {
            title: protyle?.querySelector('.protyle-title')?.textContent?.trim() || '(无标题)',
            hasContent: !!protyle?.querySelector('.protyle-content'),
        };
    });
    console.log('1. 当前文档:', docInfo);

    // 2. 查找 Dock 按钮
    const dockButtons = await page.evaluate(() => {
        const docks = document.querySelectorAll('[data-dock]');
        return Array.from(docks).map(el => ({
            id: el.getAttribute('data-dock'),
            visible: el.offsetParent !== null,
        })).filter(d => d.visible);
    });
    console.log('\n2. 当前可见的 Dock 按钮:', dockButtons.map(d => d.id));

    // 3. 查找插件侧边栏容器
    const sidebarExists = await page.evaluate(() => {
        const id = 'siyuan-plugin-copilot';
        // 尝试各种可能的选择器
        return {
            byDataType: !!document.querySelector(`[data-type="${id}"]`),
            byDataDock: !!document.querySelector(`[data-dock="${id}"]`),
            byId: !!document.getElementById(id),
            // SiYuan 通常用这种方式渲染侧边栏
            dockR: !!document.querySelector('.dockr'),
        };
    });
    console.log('\n3. 插件 UI 容器:', JSON.stringify(sidebarExists));

    // 4. 尝试通过 SiYuan API 打开插件
    console.log('\n4. 通过 SiYuan API 打开插件侧边栏...');
    const openResult = await page.evaluate(async () => {
        // SiYuan 的 openDock API
        if (window.siyuan?.ws?.app?.openDock) {
            try {
                window.siyuan.ws.app.openDock('siyuan-plugin-copilot');
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
        return { success: false, reason: 'openDock not found' };
    });
    console.log('   结果:', openResult);

    // 5. 再次检查侧边栏是否出现
    await page.waitForTimeout(500);
    const sidebarNowVisible = await page.evaluate(() => {
        return {
            byDataType: !!document.querySelector('[data-type="siyuan-plugin-copilot"]'),
            byDataDock: !!document.querySelector('[data-dock="siyuan-plugin-copilot"]'),
            // 侧边栏可能直接在 DOM 中
            hasCopilotClass: !!document.querySelector('[class*="copilot"]'),
        };
    });
    console.log('\n5. 侧边栏现在是否可见:', JSON.stringify(sidebarNowVisible));

    // 6. 列出插件的所有方法/属性（如果可访问）
    const pluginMethods = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (!plugin) return null;
        const props = Object.getOwnPropertyNames(Object.getPrototypeOf(plugin)).filter(p => typeof plugin[p] === 'function');
        return { props: props.slice(0, 15), ownKeys: Object.keys(plugin).slice(0, 15) };
    });
    console.log('\n6. 插件暴露的方法示例:', pluginMethods);

    // 7. 截图演示（可选）
    // await page.screenshot({ path: 'siyuan-demo.png' });
    // console.log('\n截图已保存到 siyuan-demo.png');

    await browser.close();
    console.log('\n=== 完成 ===');
}

main().catch(console.error);