/**
 * 竞态条件测试：简化版
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    console.log('=== 测试: 竞态条件 (简化版) ===\n');

    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    // 1. 读取初始设置
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
    console.log('1. 初始设置:');
    console.log(`   MCP 服务器: ${initial.mcpServers?.length || 0} 个`);
    console.log(`   aiProviders: ${!!initial.aiProviders}`);
    console.log(`   selectedProviderId: ${initial.selectedProviderId || '(无)'}`);

    // 2. 重复测试: 打开设置面板多次
    console.log('\n2. 重复打开设置面板 (10次)...');

    let successCount = 0;
    for (let i = 0; i < 10; i++) {
        // 打开设置
        await page.evaluate(() => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-copilot');
            if (plugin?.openSetting) plugin.openSetting();
        });

        // 等待加载
        await page.waitForTimeout(200);

        // 检查设置是否还在
        const current = await getSettings();
        if (current.mcpServers?.length === initial.mcpServers?.length && current.aiProviders && current.selectedProviderId) {
            successCount++;
        }

        // 点击对话框外部关闭
        await page.click('body', { position: { x: 10, y: 10 } }).catch(() => {});
        await page.waitForTimeout(100);
    }

    console.log(`   成功: ${successCount}/10`);

    // 3. 最终验证
    console.log('\n3. 最终状态:');
    const final = await getSettings();
    console.log(`   MCP 服务器: ${final.mcpServers?.length || 0} 个`);
    console.log(`   aiProviders: ${!!final.aiProviders}`);
    console.log(`   selectedProviderId: ${final.selectedProviderId || '(无)'}`);

    const allOK = successCount === 10 &&
                  final.mcpServers?.length > 0 &&
                  !!final.aiProviders &&
                  !!final.selectedProviderId;

    console.log(`\n   结果: ${allOK ? '✓ 测试通过' : '✗ 测试失败'}`);

    await browser.close();
    process.exit(allOK ? 0 : 1);
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});