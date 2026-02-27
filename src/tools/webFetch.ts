/**
 * Web Fetch 工具
 * 获取网页内容并提取可读文本
 */

export interface WebFetchConfig {
    apiKey?: string;           // 可选：用于 Firecrawl fallback
    baseUrl?: string;          // 可选：Firecrawl API 地址
    httpProxy?: string;        // HTTP 代理
    socksProxy?: string;       // SOCKS5 代理
    timeoutSeconds?: number;   // 超时时间
    maxChars?: number;         // 最大字符数
    readabilityEnabled?: boolean; // 是否启用 Readability 提取
}

export interface WebFetchParams {
    url: string;
    extractMode?: 'markdown' | 'text';  // 提取模式
    maxChars?: number;                   // 最大字符数
}

/**
 * Fetch 响应
 */
export interface WebFetchResponse {
    type: 'web_fetch';
    url: string;
    finalUrl: string;
    status: number;
    contentType: string;
    title?: string;
    extractMode: string;
    extractor: string;
    text: string;
    truncated?: boolean;
    length?: number;
    fetchedAt: string;
    tookMs: number;
    error?: string;
    warning?: string;
}

/**
 * 获取代理配置
 */
function getProxyConfig(config: WebFetchConfig): RequestInit {
    const init: RequestInit = {};
    
    if (config.httpProxy || config.socksProxy) {
        // 注意：浏览器环境下的 fetch 不支持直接设置代理
        // 需要系统级代理或浏览器扩展支持
        // 这里仅记录配置，实际代理需要用户在系统层面设置
        console.log('[web-fetch] Proxy configured:', config.httpProxy || config.socksProxy);
    }
    
    return init;
}

/**
 * 简单的 HTML 到纯文本转换
 * 作为 Readability 的轻量替代
 */
function htmlToText(html: string): string {
    // 移除脚本和样式
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // 替换常见 HTML 标签
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    
    // 移除所有剩余的 HTML 标签
    text = text.replace(/<[^>]+>/g, '');
    
    // 解码 HTML 实体
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&[a-z]+;/gi, '');
    
    // 清理多余空白
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    
    return text.trim();
}

/**
 * 提取页面标题
 */
function extractTitle(html: string): string | undefined {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
        return titleMatch[1].trim();
    }
    
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
        return h1Match[1].trim();
    }
    
    return undefined;
}

/**
 * 执行网页 fetch
 */
export async function webFetch(
    config: WebFetchConfig,
    params: WebFetchParams
): Promise<WebFetchResponse> {
    const start = Date.now();
    const { url } = params;
    const extractMode = params.extractMode || 'markdown';
    const maxChars = params.maxChars || config.maxChars || 8000;

    // 验证 URL
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return {
            type: 'web_fetch',
            url,
            finalUrl: url,
            status: 0,
            contentType: '',
            extractMode,
            extractor: 'error',
            text: '',
            fetchedAt: new Date().toISOString(),
            tookMs: Date.now() - start,
            error: 'Invalid URL: must be http or https'
        };
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
            type: 'web_fetch',
            url,
            finalUrl: url,
            status: 0,
            contentType: '',
            extractMode,
            extractor: 'error',
            text: '',
            fetchedAt: new Date().toISOString(),
            tookMs: Date.now() - start,
            error: 'Invalid URL: must be http or https'
        };
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/markdown, text/html;q=0.9, */*;q=0.1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
            },
            ...getProxyConfig(config)
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        let text = '';
        let title: string | undefined;
        let extractor = 'raw';

        const body = await response.text();

        if (contentType.includes('text/html')) {
            // HTML 内容提取
            if (config.readabilityEnabled !== false) {
                // 使用简单的 HTML 提取
                title = extractTitle(body);
                text = htmlToText(body);
                extractor = 'html-text';
            } else {
                text = body;
                extractor = 'raw';
            }
        } else if (contentType.includes('text/markdown')) {
            // Markdown 直接返回
            text = body;
            extractor = 'markdown';
        } else if (contentType.includes('application/json')) {
            // JSON 格式化
            try {
                text = JSON.stringify(JSON.parse(body), null, 2);
                extractor = 'json';
            } catch {
                text = body;
                extractor = 'raw';
            }
        } else {
            text = body;
            extractor = 'raw';
        }

        // 如果是 text 模式，将 markdown 转为纯文本
        if (extractMode === 'text' && extractor === 'markdown') {
            // 简单的 markdown 转文本
            text = text
                .replace(/^#{1,6}\s+/gm, '')  // 移除标题标记
                .replace(/\*\*([^*]+)\*\*/g, '$1')  // 移除粗体
                .replace(/\*([^*]+)\*/g, '$1')  // 移除斜体
                .replace(/`([^`]+)`/g, '$1')  // 移除行内代码
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // 转换链接
                .replace(/!\[([^\]]*)\]\([^)]+\)/g, '');  // 移除图片
        }

        // 截断处理
        let truncated = false;
        if (text.length > maxChars) {
            text = text.substring(0, maxChars);
            truncated = true;
        }

        return {
            type: 'web_fetch',
            url,
            finalUrl: url,
            status: response.status,
            contentType,
            title,
            extractMode,
            extractor,
            text,
            truncated,
            length: text.length,
            fetchedAt: new Date().toISOString(),
            tookMs: Date.now() - start,
            warning: truncated ? `内容已截断至 ${maxChars} 字符` : undefined
        };

    } catch (error) {
        const errorMsg = (error as Error).message;
        let hint = '';
        
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
            hint = '\n\n提示：无法连接到目标网页。请检查：\n1. 是否有网络连接\n2. 是否需要代理才能访问该网站\n3. 代理是否已启用（系统级）';
        }

        return {
            type: 'web_fetch',
            url,
            finalUrl: url,
            status: 0,
            contentType: '',
            extractMode,
            extractor: 'error',
            text: '',
            fetchedAt: new Date().toISOString(),
            tookMs: Date.now() - start,
            error: `网络请求失败: ${errorMsg}${hint}`
        };
    }
}

/**
 * 格式化 Fetch 结果为 Markdown
 */
export function formatFetchResult(response: WebFetchResponse): string {
    if (response.error) {
        return `❌ 获取网页失败: ${response.error}`;
    }

    let markdown = `## 📄 ${response.title || response.url}\n\n`;
    markdown += `**原始链接**: ${response.url}\n`;
    markdown += `**最终链接**: ${response.finalUrl}\n`;
    markdown += `**状态码**: ${response.status}\n`;
    markdown += `**内容类型**: ${response.contentType}\n`;
    markdown += `**提取方式**: ${response.extractor}\n`;
    markdown += `**获取时间**: ${response.tookMs}ms\n\n`;
    
    if (response.warning) {
        markdown += `> ⚠️ ${response.warning}\n\n`;
    }
    
    markdown += '---\n\n';
    markdown += response.text;

    return markdown;
}