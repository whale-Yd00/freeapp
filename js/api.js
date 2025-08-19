class APIService {
    constructor() {
        this.maxRetries = 3;
        this.baseDelay = 1000;
    }

    /**
     * 从AI返回的文本中提取完整的JSON对象
     * 自动清理markdown代码块标记和其他干扰文本
     * @param {string} text - AI返回的原始文本
     * @returns {string} 提取出的纯JSON字符串
     */
    extractJSON(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('无效的文本内容');
        }

        // 1. 首先尝试查找被markdown代码块包围的JSON
        const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // 2. 查找完整的JSON对象（从第一个{到最后一个}）
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const possibleJson = text.substring(firstBrace, lastBrace + 1);
            
            // 验证这是否是有效的JSON
            try {
                JSON.parse(possibleJson);
                return possibleJson;
            } catch (e) {
                // 如果解析失败，继续尝试其他方法
            }
        }

        // 3. 如果以上都失败，返回原始文本让调用者处理
        return text.trim();
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
                
                // 先获取原始响应文本
                const responseText = await response.text();
                console.log('API原始响应:', responseText);
                
                // 尝试解析为JSON
                try {
                    const data = JSON.parse(responseText);
                    console.log('API解析为JSON成功:', JSON.stringify(data, null, 2));
                    
                    // 检查completion_tokens是否为0
                    if (data.usage && data.usage.completion_tokens === 0) {
                        throw new Error('API错误：API响应，但AI空回复了。可能是模型问题、被截断或API提供商问题。请尝试多重试几次，或等待上游解决。');
                    }
                    
                    return data;
                } catch (parseError) {
                    // JSON解析失败，说明返回的是纯文本或混合内容，包装成标准格式
                    console.log('JSON解析失败，作为纯文本处理:', parseError.message);
                    
                    if (!responseText || responseText.trim() === '') {
                        throw new Error('API返回空响应');
                    }
                    
                    // 将原始文本包装成标准OpenAI格式，上层应用可以：
                    // 1. 直接使用content（普通聊天）
                    // 2. 调用extractJSON从content中提取JSON（需要JSON的功能）
                    return {
                        choices: [{
                            message: {
                                content: responseText.trim(),
                                role: 'assistant'
                            },
                            finish_reason: 'stop'
                        }],
                        usage: {
                            completion_tokens: responseText.length,
                            prompt_tokens: 0,
                            total_tokens: responseText.length
                        }
                    };
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