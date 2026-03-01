/**
 * 演示：实际发送 AI 消息
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';

async function main() {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const page = browser.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));

    console.log('=== 测试发送 AI 消息 ===\n');

    // 1. 找到输入框并输入文本
    console.log('1. 输入测试消息...');
    await page.fill('textarea.ai-sidebar__input', '请用一句话介绍你自己');

    // 2. 点击发送按钮
    console.log('2. 点击发送按钮...');
    await page.click('button.ai-sidebar__send-btn');

    // 3. 等待响应出现（轮询检查消息列表）
    console.log('3. 等待 AI 响应...\n');

    // 方法1: 等待新消息出现
    try {
        await page.waitForSelector('.ai-sidebar__message', { timeout: 30000 });
    } catch {
        console.log('   (超时，尝试其他方式...)');
    }

    // 4. 获取消息列表
    const messages = await page.evaluate(() => {
        const msgContainer = document.querySelector('.ai-sidebar__messages');
        if (!msgContainer) return '消息容器不存在';

        const msgElements = msgContainer.querySelectorAll('.ai-sidebar__message, [class*="message"]');
        const msgs = [];
        msgElements.forEach(el => {
            const isUser = el.classList.contains('ai-sidebar__message--user') ||
                          el.querySelector('[class*="user"]') !== null;
            const text = el.textContent?.slice(0, 200) || '';
            const hasLoading = el.querySelector('.b3-spin, [class*="loading"]') !== null;
            if (text.trim()) {
                msgs.push({
                    isUser,
                    hasLoading,
                    text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
                });
            }
        });
        return msgs;
    });

    console.log('消息列表:');
    messages.forEach((m, i) => {
        const prefix = m.isUser ? '👤 用户' : '🤖 AI';
        const loading = m.hasLoading ? ' [加载中]' : '';
        console.log(`  ${i + 1}. ${prefix}${loading}: ${m.text}`);
    });

    // 5. 检查当前模式
    const currentMode = await page.evaluate(() => {
        const select = document.querySelector('#chat-mode-select');
        return select?.value || select?.selectedOptions?.[0]?.textContent || '未知';
    });
    console.log(`\n当前聊天模式: ${currentMode}`);

    // 6. 测试切换模式
    console.log('\n7. 测试切换模式...');
    const modes = await page.evaluate(() => {
        const select = document.querySelector('#chat-mode-select');
        return Array.from(select?.options || []).map(o => ({ value: o.value, text: o.textContent }));
    });
    console.log('可用模式:', modes.map(m => m.text).join(', '));

    if (modes.length > 1) {
        // 切换到下一个模式
        const newMode = modes[1].value;
        await page.selectOption('#chat-mode-select', newMode);
        await page.waitForTimeout(500);
        console.log(`已切换到: ${modes[1].text}`);
    }

    // 7. 截图（可选）
    // await page.screenshot({ path: 'test-message.png', fullPage: false });
    // console.log('\n截图已保存');

    await browser.close();
    console.log('\n=== 完成 ===');
}

main().catch(console.error);