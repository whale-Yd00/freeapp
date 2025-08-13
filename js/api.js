class APIService {
    constructor() {
        this.maxRetries = 3;
        this.baseDelay = 1000;
    }

    /**
     * 通用的OpenAI兼容API调用函数
     * @param {string} apiUrl - API地址
     * @param {string} apiKey - API密钥
     * @param {string} model - 模型名称
     * @param {Array} messages - 消息数组
     * @param {Object} options - 额外选项
     * @param {number} timeout - 超时时间(毫秒)，默认60秒
     * @returns {Promise} API响应
     */
    async callOpenAIAPI(apiUrl, apiKey, model, messages, options = {}, timeout = 60000) {
        const payload = {
            model: model,
            messages: messages,
            ...options
        };

        for (let i = 0; i < this.maxRetries; i++) {
            try {
                // 创建AbortController用于超时控制
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                // 直接调用API，不再通过Netlify函数
                const response = await fetch(apiUrl + '/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        // UA 伪装
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    // 特殊处理504错误（Gateway Timeout）
                    if (response.status === 504) {
                        throw new Error(`请求超时(504): 模型响应时间过长，请稍后重试`);
                    }
                    
                    try {
                        const errorBody = await response.text();
                        throw new Error(`API Error: ${errorBody}`);
                    } catch (parseError) {
                        // 如果错误响应也无法解析，返回状态码
                        throw new Error(`API请求失败: ${response.status} - ${response.statusText}`);
                    }
                }
                
                // 尝试解析JSON响应
                try {
                    const data = await response.json();
                    console.log('API完整返回:', JSON.stringify(data, null, 2));
                    return data;
                } catch (parseError) {
                    throw new Error(`响应格式错误: 无法解析API返回的JSON数据`);
                }

            } catch (error) {
                // AbortError (超时) 不重试
                if (error.name === 'AbortError') {
                    throw new Error('请求超时: 模型响应时间过长，请稍后重试');
                }
                
                if (i < this.maxRetries - 1) {
                    const delay = this.baseDelay * Math.pow(2, i);
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * 测试API连接
     * @param {string} apiUrl - API地址
     * @param {string} apiKey - API密钥
     * @returns {Promise} 连接测试结果
     */
    async testConnection(apiUrl, apiKey) {
        try {
            // 直接调用API，不再通过Netlify函数
            const response = await fetch(apiUrl + '/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    // UA 伪装
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API Error: ${errorBody}`);
            }
            
            const data = await response.json();
            console.log('API测试连接完整返回:', JSON.stringify(data, null, 2));
            return data;

        } catch (error) {
            throw new Error(`连接失败: ${error.message}`);
        }
    }
}

// 导出类供使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIService;
} else if (typeof window !== 'undefined') {
    window.apiService = new APIService();
}