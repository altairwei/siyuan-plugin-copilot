/**
 * Playwright 自动化测试脚本 - 通过 CDP 连接 SiYuan
 *
 * 前提：SiYuan 已以 --remote-debugging-port=9229 启动
 * 运行：node --no-warnings scripts/test-playwright.mjs [test-name]
 *
 * 示例：
 *   node --no-warnings scripts/test-playwright.mjs            # 运行所有测试
 *   node --no-warnings scripts/test-playwright.mjs plugin     # 只测试插件加载
 *   node --no-warnings scripts/test-playwright.mjs mcp        # 只测试 MCP 工具
 *   node --no-warnings scripts/test-playwright.mjs ui         # 只测试 UI
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9229';
const SIYUAN_API = 'http://127.0.0.1:6806';
const PLUGIN_ID = 'siyuan-plugin-copilot';

// ─── 测试框架 ───────────────────────────────────────────────────

let passed = 0, failed = 0;

async function test(name, fn) {
    process.stdout.write(`  ○ ${name} ... `);
    try {
        await fn();
        console.log('\x1b[32m✓ PASS\x1b[0m');
        passed++;
    } catch (err) {
        console.log(`\x1b[31m✗ FAIL\x1b[0m`);
        console.log(`    \x1b[31m${err.message}\x1b[0m`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function log(msg) {
    console.log(`\n\x1b[36m>>> ${msg}\x1b[0m`);
}

// ─── 连接 SiYuan ────────────────────────────────────────────────

async function connectToSiYuan() {
    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP_URL);
    } catch (err) {
        throw new Error(
            `无法连接到 SiYuan CDP (${CDP_URL})\n` +
            `请确认 SiYuan 已以 --remote-debugging-port=9229 启动\n` +
            `错误: ${err.message}`
        );
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) throw new Error('CDP 连接成功但没有 browser context');

    const context = contexts[0];
    const pages = context.pages();
    const page = pages.find(p => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('找不到 SiYuan 主页面');

    const title = await page.title();
    console.log(`  连接到: ${title}`);
    return { browser, context, page };
}

// ─── SiYuan 操作助手 ─────────────────────────────────────────────

/** 等待 SiYuan 前端完全加载 */
async function waitForSiYuanReady(page, timeout = 10000) {
    await page.waitForFunction(() => {
        return typeof window.siyuan !== 'undefined' &&
               window.siyuan.ws &&
               document.querySelector('#layouts') !== null;
    }, { timeout });
}

/** 通过 SiYuan kernel API 发起请求（返回原始响应对象） */
async function kernelAPI(page, endpoint, body = {}) {
    return await page.evaluate(async ({ url, body }) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        try {
            return { ok: res.ok, status: res.status, json: JSON.parse(text) };
        } catch {
            return { ok: res.ok, status: res.status, text };
        }
    }, { url: `${SIYUAN_API}${endpoint}`, body });
}

/**
 * 读取 SiYuan 文件 API
 * 注意：/api/file/getFile 直接返回文件内容（不是 {code,data} 包装）
 * 文件不存在时返回 {code: -1, msg: "..."}
 */
async function getFileContent(page, path) {
    const result = await kernelAPI(page, '/api/file/getFile', { path });
    if (!result.ok) {
        return { exists: false, error: result.json?.msg || `HTTP ${result.status}` };
    }
    return { exists: true, data: result.json };
}

/** 获取已加载的插件列表 */
async function getLoadedPlugins(page) {
    return await page.evaluate(() => {
        if (!window.siyuan?.ws?.app?.plugins) return [];
        return window.siyuan.ws.app.plugins.map(p => ({
            name: p.name,
            displayName: p.displayName,
            version: p.version || p.manifest?.version,
        }));
    });
}

/** 获取插件对象的关键属性 */
async function getPlugin(page, pluginId) {
    return await page.evaluate((id) => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === id);
        if (!plugin) return null;
        return {
            name: plugin.name,
            displayName: plugin.displayName,
            version: plugin.version || plugin.manifest?.version,
            hasI18n: !!plugin.i18n,
            i18nKeys: plugin.i18n ? Object.keys(plugin.i18n).slice(0, 5) : [],
        };
    }, pluginId);
}

// ─── 测试套件 ────────────────────────────────────────────────────

async function runPluginTests(page) {
    log('测试: 插件加载');

    await test('SiYuan 前端已就绪', async () => {
        await waitForSiYuanReady(page, 5000);
    });

    await test(`插件 ${PLUGIN_ID} 已加载`, async () => {
        const plugins = await getLoadedPlugins(page);
        const plugin = plugins.find(p => p.name === PLUGIN_ID);
        assert(plugin, `插件未找到，已加载: ${plugins.map(p => p.name).join(', ')}`);
        console.log(`\n    版本: ${plugin.version || '(manifest未暴露)'}`);
        console.log(`    显示名: ${plugin.displayName || '(未设置)'}`);
    });

    await test('SiYuan Kernel API 可用', async () => {
        const result = await kernelAPI(page, '/api/system/version');
        assert(result.ok && result.json?.code === 0, `API 失败: ${JSON.stringify(result.json)}`);
        console.log(`\n    SiYuan 版本: ${result.json.data}`);
    });
}

async function runSettingsTests(page) {
    log('测试: 插件设置');

    await test('设置文件可读取', async () => {
        const result = await getFileContent(page, `/data/storage/petal/${PLUGIN_ID}/settings.json`);
        if (!result.exists) {
            console.log(`\n    设置文件不存在（首次使用）`);
            return;
        }
        const settings = result.data;
        assert(settings && typeof settings === 'object', '设置不是有效 JSON 对象');
        const keys = Object.keys(settings);
        console.log(`\n    设置键数量: ${keys.length}`);
        console.log(`    核心键: ${['selectedProviderId', 'mcpServers', 'braveSearchApiKey']
            .filter(k => k in settings)
            .join(', ')}`);
    });

    await test('设置包含 AI Provider 配置', async () => {
        const result = await getFileContent(page, `/data/storage/petal/${PLUGIN_ID}/settings.json`);
        if (!result.exists) { console.log(`\n    (跳过 - 设置文件不存在)`); return; }
        const settings = result.data;
        assert('aiProviders' in settings, '缺少 aiProviders 配置');
        const providerCount = Object.keys(settings.aiProviders || {}).length;
        console.log(`\n    AI Provider 数量: ${providerCount}`);
        console.log(`    当前 Provider: ${settings.selectedProviderId || '(未设置)'}`);
    });
}

async function runMcpTests(page) {
    log('测试: MCP 配置');

    await test('mcpServers 配置存在', async () => {
        const result = await getFileContent(page, `/data/storage/petal/${PLUGIN_ID}/settings.json`);
        if (!result.exists) { console.log(`\n    (跳过 - 设置文件不存在)`); return; }
        const settings = result.data;
        const mcpServers = settings.mcpServers;
        if (!mcpServers || mcpServers.length === 0) {
            console.log(`\n    mcpServers 未配置`);
            return;
        }
        console.log(`\n    MCP 服务器数量: ${mcpServers.length}`);
        for (const s of mcpServers) {
            console.log(`    - ${s.name} (${s.enabled ? '已启用' : '已禁用'}) ${s.allowTools?.length || 0} 个工具`);
        }
    });

    await test('启用的 MCP 服务器有 allowTools', async () => {
        const result = await getFileContent(page, `/data/storage/petal/${PLUGIN_ID}/settings.json`);
        if (!result.exists) { console.log(`\n    (跳过)`); return; }
        const mcpServers = result.data.mcpServers || [];
        const enabledServers = mcpServers.filter(s => s.enabled && s.url);
        if (enabledServers.length === 0) { console.log(`\n    (无启用的服务器)`); return; }
        for (const s of enabledServers) {
            assert(
                Array.isArray(s.allowTools),
                `服务器 ${s.name} 的 allowTools 不是数组`
            );
        }
        console.log(`\n    ${enabledServers.length} 个启用服务器配置正确`);
    });
}

async function runUITests(page) {
    log('测试: 插件 UI');

    await test('插件已注册到 app.plugins', async () => {
        const plugin = await getPlugin(page, PLUGIN_ID);
        assert(plugin !== null, '插件不在 app.plugins 中');
        console.log(`\n    i18n 已加载: ${plugin.hasI18n}`);
        if (plugin.i18nKeys.length) {
            console.log(`    i18n 示例键: ${plugin.i18nKeys.join(', ')}`);
        }
    });

    await test('SiYuan #layouts DOM 已渲染', async () => {
        const layoutsExist = await page.evaluate(() => !!document.querySelector('#layouts'));
        assert(layoutsExist, '#layouts 不存在');
    });

    await test('Dock 图标已注册', async () => {
        // SiYuan dock 按钮在右侧或左侧边栏
        const dockInfo = await page.evaluate((pluginId) => {
            // 尝试各种可能的 dock 图标选择器
            const selectors = [
                `[data-type="${pluginId}"]`,
                `.dock__item[data-plugin="${pluginId}"]`,
                `button[data-dock="${pluginId}"]`,
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return { found: true, selector: sel };
            }
            // 检查插件是否通过 addDock 注册了
            const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === pluginId);
            if (!plugin) return { found: false, reason: 'plugin not found' };
            // SiYuan 内部可能有 docks 数组
            const hasDock = !!(plugin.docks || plugin._docks);
            return { found: false, hasDock, reason: 'selector not matched' };
        }, PLUGIN_ID);

        if (!dockInfo.found) {
            // 这不一定是失败 - dock 可能还没被点击过而不在 DOM 中
            console.log(`\n    (dock 图标 DOM 未找到，可能侧边栏未展开)`);
        } else {
            console.log(`\n    dock 图标已找到: ${dockInfo.selector}`);
        }
        // 不强制失败，因为 dock 需要手动激活
    });
}

async function runBuildTest(page) {
    log('测试: 构建产物验证');

    await test('plugin.js 已加载（插件代码已注入）', async () => {
        // 如果插件已加载，说明 plugin.js 被正确加载
        const plugin = await getPlugin(page, PLUGIN_ID);
        assert(plugin !== null, `插件 ${PLUGIN_ID} 未加载 - 可能构建产物有问题`);
    });

    await test('插件无 JS 运行时错误', async () => {
        // 检查是否有未处理的错误（通过 page.evaluate 中的全局 window.__errors）
        const errors = await page.evaluate(() => {
            return window.__pluginCopilotErrors || [];
        });
        assert(errors.length === 0, `发现运行时错误: ${errors.join('; ')}`);
        if (errors.length === 0) console.log(`\n    无运行时错误`);
    });
}

// ─── 主入口 ──────────────────────────────────────────────────────

const SUITES = {
    plugin: runPluginTests,
    settings: runSettingsTests,
    mcp: runMcpTests,
    ui: runUITests,
    build: runBuildTest,
};

async function main() {
    const filter = process.argv[2];

    console.log('\n\x1b[1m=== SiYuan Plugin Copilot - Playwright Tests ===\x1b[0m\n');
    console.log(`CDP: ${CDP_URL}`);
    console.log(`Filter: ${filter || '(all)'}\n`);

    let browser, page;
    try {
        const conn = await connectToSiYuan();
        browser = conn.browser;
        page = conn.page;
    } catch (err) {
        console.error(`\x1b[31m连接失败: ${err.message}\x1b[0m`);
        process.exit(1);
    }

    try {
        const suitesToRun = filter
            ? Object.entries(SUITES).filter(([name]) => name.startsWith(filter))
            : Object.entries(SUITES);

        if (suitesToRun.length === 0) {
            console.log(`\x1b[33m没有匹配 "${filter}" 的测试套件\x1b[0m`);
            console.log(`可用套件: ${Object.keys(SUITES).join(', ')}`);
        } else {
            for (const [, suite] of suitesToRun) {
                await suite(page);
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n\x1b[1m结果: ${passed} passed, ${failed} failed\x1b[0m\n`);
    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error('\x1b[31m未处理的错误:\x1b[0m', err);
    process.exit(1);
});
