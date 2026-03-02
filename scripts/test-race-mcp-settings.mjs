/**
 * 竞态条件测试：MCP 工具调用时打开设置面板
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    console.log('=== 测试: MCP 调用 + 设置面板竞态 ===\n');

    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    const getSettings = async () => {
        return await page.evaluate(() => {
            return fetch('http://127.0.0.1:6806/api/file/getFile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '/data/storage/petal/siyuan-plugin-copilot/settings.json' })
            }).then(r => r.json());
        });
    };

    const initial = await getSettings();
    console.log('初始设置: MCP=%d, aiProviders=%s, provider=%s',
        initial.mcpServers?.length || 0,
        !!initial.aiProviders,
        initial.selectedProviderId?.slice(0, 20) || '(无)');

    // 场景: 侧边栏已打开，输入消息，然后同时打开设置
    console.log('\n1. 打开侧边栏...');
    const sidebarReady = await page.evaluate(() => !!document.querySelector('textarea.ai-sidebar__input'));
    console.log('   侧边栏就绪:', sidebarReady);

    if (!sidebarReady) {
        console.log('   跳过: 侧边栏未打开');
        await browser.close();
        return;
    }

    console.log('\n2. 测试: 输入消息 → 点击发送 → 立即打开设置 (10次)...');

    let ok = 0;
    for (let i = 0; i < 10; i++) {
        // 输入消息
        await page.fill('textarea.ai-sidebar__input', '测试消息 ' + Date.now());

        // 同时执行：发送消息 + 打开设置
        await Promise.all([
            page.click('button.ai-sidebar__send-btn').catch(() => {}),
            page.evaluate(() => {
                const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
                if (plugin?.openSetting) plugin.openSetting();
            })
        ]);

        // 等待
        await page.waitForTimeout(400);

        // 检查设置
        const curr = await getSettings();
        if (curr.mcpServers?.length > 0 && curr.aiProviders && curr.selectedProviderId) {
            ok++;
        } else {
            console.log(`   第${i+1}次: 丢失 - mcp=${curr.mcpServers?.length}, provider=${!!curr.selectedProviderId}`);
        }

        // 关闭设置 (按 Escape)
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
    }

    console.log(`   结果: ${ok}/10 成功`);

    // 最终验证
    const final = await getSettings();
    console.log('\n3. 最终状态: MCP=%d, aiProviders=%s, provider=%s',
        final.mcpServers?.length || 0,
        !!final.aiProviders,
        final.selectedProviderId?.slice(0, 20) || '(无)');

    const passed = ok === 10 && final.mcpServers?.length > 0;
    console.log(`\n结论: ${passed ? '✓ 竞态条件已修复' : '✗ 仍有问题'}`);

    await browser.close();
    process.exit(passed ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });