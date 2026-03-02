/**
 * 竞态条件测试：MCP 工具调用 + 设置面板加载
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    console.log('=== 测试: 竞态条件 - MCP 调用时打开设置面板 ===\n');

    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    // 1. 读取初始设置
    console.log('1. 读取初始设置...');
    const initialSettings = await page.evaluate(() => {
        return fetch('http://127.0.0.1:6806/api/file/getFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/data/storage/petal/siyuan-plugin-copilot/settings.json' })
        }).then(r => r.json());
    });

    const initialMcpServers = initialSettings.mcpServers || [];
    console.log(`   初始 MCP 服务器数量: ${initialMcpServers.length}`);
    const initialMcpConfig = JSON.stringify(initialMcpServers);

    // 2. 同时执行：MCP 工具调用 + 打开设置面板
    console.log('2. 并发执行: MCP 工具调用 + 打开设置面板...\n');

    // 启动 MCP 工具调用（异步）
    const mcpPromise = page.evaluate(async () => {
        // 尝试调用 MCP 工具
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (plugin?.aiSidebarApp?.sendMessage) {
            return await plugin.aiSidebarApp.sendMessage('你好');
        }
        return null;
    });

    // 等待一小段时间后打开设置面板（增加竞态概率）
    await page.waitForTimeout(50);

    // 打开设置面板（同时异步执行）
    const settingsPromise = page.evaluate(async () => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
        if (plugin?.openSetting) {
            plugin.openSetting();
            await new Promise(r => setTimeout(r, 500));
            // 读取设置面板中的 settings 值
            const settingsPanel = document.querySelector('.b3-dialog--open');
            return { opened: !!settingsPanel };
        }
        return { opened: false };
    });

    // 等待两者都完成
    const [mcpResult, settingsResult] = await Promise.all([mcpPromise, settingsPromise]);

    console.log('   MCP 调用结果:', mcpResult ? '成功' : '无可用方法');
    console.log('   设置面板打开:', settingsResult.opened ? '成功' : '失败');

    // 3. 再次读取设置，验证未被清空
    console.log('\n3. 验证设置未被清空...');
    await page.waitForTimeout(1000);

    const finalSettings = await page.evaluate(() => {
        return fetch('http://127.0.0.1:6806/api/file/getFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/data/storage/petal/siyuan-plugin-copilot/settings.json' })
        }).then(r => r.json());
    });

    const finalMcpServers = finalSettings.mcpServers || [];
    const finalMcpConfig = JSON.stringify(finalMcpServers);

    console.log(`   最终 MCP 服务器数量: ${finalMcpServers.length}`);
    console.log(`   配置是否一致: ${initialMcpConfig === finalMcpConfig ? '✓ 一致' : '✗ 不一致'}`);

    if (initialMcpConfig !== finalMcpConfig) {
        console.log('\n   初始配置:', initialMcpConfig.slice(0, 200));
        console.log('\n   最终配置:', finalMcpConfig.slice(0, 200));
    }

    // 4. 检查控制台是否有错误
    console.log('\n4. 检查控制台错误...');
    const errors = await page.evaluate(() => {
        return window.__pluginCopilotErrors || [];
    });

    if (errors.length > 0) {
        console.log('   发现运行时错误:', errors);
    } else {
        console.log('   无运行时错误 ✓');
    }

    // 5. 多次重复测试
    console.log('\n5. 多次重复测试 (5次)...');
    let allPassed = true;
    for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(200);

        // 并发执行
        await Promise.all([
            page.evaluate(() => {
                const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
                if (plugin?.openSetting) {
                    plugin.openSetting();
                }
            }),
            page.evaluate(() => {
                const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
                if (plugin?.aiSidebarApp?.sendMessage) {
                    return plugin.aiSidebarApp.sendMessage('测试' + Date.now());
                }
            })
        ]);

        await page.waitForTimeout(300);

        const checkSettings = await page.evaluate(() => {
            return fetch('http://127.0.0.1:6806/api/file/getFile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '/data/storage/petal/siyuan-plugin-copilot/settings.json' })
            }).then(r => r.json());
        });

        if (!checkSettings.mcpServers || checkSettings.mcpServers.length !== initialMcpServers.length) {
            console.log(`   第 ${i+1} 次: ✗ 配置丢失或改变`);
            allPassed = false;
        }
    }

    console.log(`   结果: ${allPassed ? '全部通过 ✓' : '存在失败 ✗'}`);

    await browser.close();
    console.log('\n=== 测试完成 ===');
}

main().catch(console.error);