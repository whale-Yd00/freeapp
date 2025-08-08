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
                
                // 【【【【【修改点 1】】】】】
                // 将请求路径修改为 /api/proxy/ 以匹配 netlify.toml 中的规则
                const response = await fetch('/api/proxy/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response.ok) {
                    const errorBody = await response.json();
                    throw new Error(`代理请求失败: ${response.status} - ${errorBody.error}`);
                }
                
                return await response.json();

            } catch (error) {
                console.error("API Call Error:", error);
                if (i < this.maxRetries - 1) {
                    const delay = this.baseDelay * Math.pow(2, i);
                    console.log(`Retrying in ${delay / 1000}s...`);
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

        // 【【【【【修改点 2】】】】】
        // 将请求路径修改为 /api/test-connection 以匹配 netlify.toml 中的规则
        const response = await fetch('/api/test-connection', {
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
