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
     * @returns {Promise} API响应
     */
    async callOpenAIAPI(apiUrl, apiKey, model, messages, options = {}) {
        const payload = {
            model: model,
            messages: messages,
            ...options
        };

        for (let i = 0; i < this.maxRetries; i++) {
            try {
                const requestBody = {
                    apiUrl: apiUrl,
                    apiKey: apiKey,
                    model: model,
                    messages: messages,
                    ...options
                };
                
                // 创建AbortController用于超时控制
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
                
                const response = await fetch('/api/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    // 特殊处理504错误（Gateway Timeout）
                    if (response.status === 504) {
                        throw new Error(`请求超时(504): 模型响应时间过长，请稍后重试`);
                    }
                    
                    try {
                        const errorBody = await response.json();
                        throw new Error(`代理请求失败: ${response.status} - ${errorBody.error}`);
                    } catch (parseError) {
                        // 如果错误响应也无法解析JSON，返回状态码
                        throw new Error(`代理请求失败: ${response.status} - ${response.statusText}`);
                    }
                }
                
                // 尝试解析JSON响应
                try {
                    return await response.json();
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
        const requestBody = {
            apiUrl: apiUrl,
            apiKey: apiKey,
        };

        const response = await fetch('/api-test/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`连接失败: ${response.status} - ${errorData.error}`);
        }

        return await response.json();
    }
}

// 创建全局实例
window.apiService = new APIService();
