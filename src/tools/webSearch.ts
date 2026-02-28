/**
 * Web Search 工具
 * 使用 Brave Search API 进行网络搜索
 */

/**
 * Brave Search API 配置
 */
export interface BraveSearchConfig {
    apiKey: string;
    baseUrl?: string;
}

/**
 * 搜索参数
 */
export interface WebSearchParams {
    query: string;
    count?: number;        // 返回结果数量，默认 10，最大 20
    country?: string;     // 国家代码，如 'US', 'CN', 'JP' 等
    searchLang?: string;  // 搜索语言，如 'zh-hans', 'en' 等
    uiLang?: string;     // UI 语言
    freshness?: string;  // 时间过滤：'pd' (过去一天), 'pw' (过去一周), 'pm' (过去一月), 'py' (过去一年)
    offset?: number;     // 偏移量，用于分页
}

/**
 * 搜索结果项
 */
export interface WebSearchResult {
    title: string;
    url: string;
    description: string;
    age?: string;        // 发布时间（如 "2 days ago"）
    language?: string;   // 检测到的语言
    family_friendly?: boolean;
}

/**
 * 搜索响应
 */
export interface WebSearchResponse {
    type: 'web_search';
    query: string;
    results: WebSearchResult[];
    error?: string;
}

/**
 * 执行网络搜索
 */
export async function webSearch(
    config: BraveSearchConfig,
    params: WebSearchParams
): Promise<WebSearchResponse> {
    const {
        query,
        count = 10,
        country,
        searchLang,
        uiLang,
        freshness,
        offset
    } = params;

    if (!query || query.trim() === '') {
        return {
            type: 'web_search',
            query: query || '',
            results: [],
            error: '搜索关键词不能为空'
        };
    }

    if (!config.apiKey) {
        return {
            type: 'web_search',
            query,
            results: [],
            error: 'Brave Search API Key 未配置。请在设置中配置 braveSearchApiKey。'
        };
    }

    const baseUrl = config.baseUrl || 'https://api.search.brave.com/res/v1';
    const url = new URL(`${baseUrl}/web/search`);

    // 添加搜索参数
    url.searchParams.set('q', query);
    url.searchParams.set('count', Math.min(count, 20).toString());
    
    if (country) {
        url.searchParams.set('country', country);
    }
    if (searchLang) {
        url.searchParams.set('search_lang', searchLang);
    }
    if (uiLang) {
        url.searchParams.set('ui_lang', uiLang);
    }
    if (freshness) {
        url.searchParams.set('freshness', freshness);
    }
    if (offset !== undefined) {
        url.searchParams.set('offset', offset.toString());
    }

    try {
        let response;
        try {
            response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': config.apiKey
                }
            });
        } catch (fetchError) {
            // 网络错误（连接失败、超时等）
            const errorMsg = (fetchError as Error).message;
            let hint = '';
            if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                hint = '\n\n提示：无法连接到 Brave Search 服务器。请检查：\n1. 是否有网络连接\n2. 是否需要代理才能访问外网\n3. 代理是否已启用';
            }
            return {
                type: 'web_search',
                query,
                results: [],
                error: `网络请求失败: ${errorMsg}${hint}`
            };
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `搜索请求失败: ${response.status}`;
            
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage = errorJson.error;
                } else if (errorJson.message) {
                    errorMessage = errorJson.message;
                }
            } catch {
                if (errorText) {
                    errorMessage += ` - ${errorText}`;
                }
            }
            
            return {
                type: 'web_search',
                query,
                results: [],
                error: errorMessage
            };
        }

        const data = await response.json();

        // 解析搜索结果
        const results: WebSearchResult[] = [];
        
        // Brave Search API 返回的结果格式
        if (data.web?.results && Array.isArray(data.web.results)) {
            for (const item of data.web.results) {
                results.push({
                    title: item.title || '',
                    url: item.url || '',
                    description: item.description || '',
                    age: item.age,
                    language: item.language,
                    family_friendly: item.family_friendly
                });
            }
        }

        return {
            type: 'web_search',
            query,
            results
        };

    } catch (error) {
        console.error('Web search error:', error);
        return {
            type: 'web_search',
            query,
            results: [],
            error: `搜索请求失败: ${(error as Error).message}`
        };
    }
}

/**
 * 格式化搜索结果为 Markdown
 */
export function formatSearchResults(response: WebSearchResponse): string {
    if (response.error) {
        return `搜索失败: ${response.error}`;
    }

    if (response.results.length === 0) {
        return `未找到与 "${response.query}" 相关的结果。`;
    }

    let markdown = `## 搜索结果: "${response.query}"\n\n`;
    markdown += `找到 ${response.results.length} 个结果\n\n`;

    for (let i = 0; i < response.results.length; i++) {
        const result = response.results[i];
        markdown += `### ${i + 1}. ${result.title}\n`;
        markdown += `**链接**: ${result.url}\n`;
        if (result.age) {
            markdown += `**时间**: ${result.age}\n`;
        }
        markdown += `\n${result.description}\n\n`;
        markdown += '---\n\n';
    }

    return markdown;
}