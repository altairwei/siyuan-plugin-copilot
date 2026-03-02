/**
 * 竞态条件测试：MCP 工具调用时打开设置面板 (无等待版)
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    console.log('=== 测试: MCP + 设置面板竞态 ===\n');

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
    console.log('初始: MCP=%d, aiProviders=%s', initial.mcpServers?.length || 0, !!initial.aiProviders);

    // 检查侧边栏
    const hasInput = await page.evaluate(() => !!document.querySelector('textarea.ai-sidebar__input'));
    console.log('侧边栏: %s\n', hasInput ? '已打开' : '未打开');

    if (!hasInput) {
        console.log('请先打开侧边栏');
        await browser.close();
        process.exit(0);
    }

    // 直接测试：不等待 AI 响应
    console.log('测试: 发送消息 + 打开设置 (10次)...');

    let ok = 0;
    for (let i = 0; i < 10; i++) {
        // 填写输入框
        await page.evaluate(() => {
            const input = document.querySelector('textarea.ai-sidebar__input');
            if (input) input.value = 'hi';
        });

        // 并发：点击发送 + 打开设置
        await Promise.all([
            page.evaluate(() => {
                const btn = document.querySelector('button.ai-sidebar__send-btn');
                if (btn) btn.click();
            }),
            page.evaluate(() => {
                const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
                plugin?.openSetting?.();
            })
        ]);

        // 短暂等待
        await page.waitForTimeout(200);

        // 检查
        const curr = await getSettings();
        if (curr.mcpServers?.length > 0 && curr.aiProviders) ok++;

        // 关闭设置
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(150);
    }

    console.log('结果: %d/10 成功\n', ok);

    const final = await getSettings();
    console.log('最终: MCP=%d, aiProviders=%s', final.mcpServers?.length || 0, !!final.aiProviders);

    const passed = ok === 10;
    console.log(passed ? '\n✓ 竞态条件已修复' : '\n✗ 仍有问题');

    await browser.close();
    process.exit(passed ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });