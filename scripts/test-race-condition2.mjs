/**
 * 竞态条件测试：通过真实 UI 操作触发 MCP + 设置面板竞态
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    console.log('=== 测试: 真实 UI 竞态条件 ===\n');

    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    // 1. 读取初始设置
    console.log('1. 读取初始设置...');
    const getSettings = async () => {
        const res = await page.evaluate(() => {
            return fetch('http://127.0.0.1:6806/api/file/getFile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '/data/storage/petal/siyuan-plugin-copilot/settings.json' })
            }).then(r => r.json());
        });
        return res;
    };

    const initial = await getSettings();
    console.log(`   初始 MCP 服务器: ${initial.mcpServers?.length || 0} 个`);

    // 2. 打开侧边栏（如果未打开）
    console.log('\n2. 打开侧边栏...');
    await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (plugin?.data?.dock) {
            plugin.data.dock.visible = true;
        }
    });

    // 等待侧边栏加载
    await page.waitForTimeout(1000);

    // 检查侧边栏输入框是否存在
    const sidebarReady = await page.evaluate(() => {
        return !!document.querySelector('textarea.ai-sidebar__input');
    });
    console.log(`   侧边栏已打开: ${sidebarReady}`);

    if (!sidebarReady) {
        console.log('   跳过: 侧边栏未就绪');
        await browser.close();
        return;
    }

    // 3. 多次并发测试：发送消息 + 打开设置面板
    console.log('\n3. 并发测试 (10次)...');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < 10; i++) {
        // 输入消息
        await page.fill('textarea.ai-sidebar__input', '你好');

        // 立即点击发送 + 打开设置（几乎同时）
        const sendPromise = page.click('button.ai-sidebar__send-btn').catch(() => {});
        const settingsPromise = page.evaluate(() => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
            if (plugin?.openSetting) {
                plugin.openSetting();
            }
        }).catch(() => {});

        await Promise.all([sendPromise, settingsPromise]);

        // 等待处理
        await page.waitForTimeout(500);

        // 验证设置
        const current = await getSettings();
        if (!current.mcpServers || current.mcpServers.length === 0) {
            console.log(`   第 ${i+1} 次: ✗ 设置被清空!`);
            failCount++;
        } else if (current.mcpServers.length !== (initial.mcpServers?.length || 0)) {
            console.log(`   第 ${i+1} 次: ✗ MCP 服务器数量改变: ${initial.mcpServers?.length} -> ${current.mcpServers.length}`);
            failCount++;
        } else {
            successCount++;
        }

        // 关闭设置面板
        await page.evaluate(() => {
            const dialog = document.querySelector('.b3-dialog');
            if (dialog) {
                const closeBtn = dialog.querySelector('.b3-dialog__close');
                closeBtn?.click();
            }
        });

        await page.waitForTimeout(300);
    }

    console.log(`\n   结果: ${successCount} 成功, ${failCount} 失败`);

    // 4. 检查最终状态
    console.log('\n4. 最终状态检查...');
    const final = await getSettings();
    console.log(`   MCP 服务器数量: ${final.mcpServers?.length || 0}`);
    console.log(`   aiProviders 存在: ${!!final.aiProviders}`);
    console.log(`   selectedProviderId: ${final.selectedProviderId || '(无)'}`);

    const allOK = failCount === 0 &&
                  (final.mcpServers?.length || 0) > 0 &&
                  !!final.aiProviders &&
                  !!final.selectedProviderId;

    console.log(`\n   总体结果: ${allOK ? '✓ 测试通过' : '✗ 测试失败'}`);

    await browser.close();
    console.log('\n=== 测试完成 ===');

    if (!allOK) process.exit(1);
}

main().catch(console.error);