class APIService {
    constructor() {
        this.maxRetries = 3;
        this.baseDelay = 1000;
    }

    /**
     * 从AI返回的文本中提取完整的JSON对象。
     * 自动清理markdown代码块标记和其他干扰文本。
     * @param {string} text - AI返回的原始文本。
     * @returns {string} 提取出的纯JSON字符串。
     */
    extractJSON(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('无效的文本内容');
        }

        // 1. 优先提取 markdown 代码块中的 JSON
        const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // 2. 尝试从首个{到最后一个}截取
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const possibleJson = text.substring(firstBrace, lastBrace + 1);
            // 验证这是否是有效的JSON
            try {
                JSON.parse(possibleJson);
                return possibleJson;
            } catch (_) {
                // 如果解析失败，继续尝试兜底方案
            }
        }
        
        // 3. 兜底返回原始文本，让调用者处理
        return text.trim();
    }

    /**
     * 通用的OpenAI兼容API调用函数。
     * @param {string} apiUrl - API地址。
     * @param {string} apiKey - API密钥。
     * @param {string} model - 模型名称。
     * @param {Array} messages - 消息数组。
     * @param {Object} options - 额外选项 (如 temperature, top_p 等)。
     * @param {number} timeout - 超时时间(毫秒)，默认60秒。
     * @returns {Promise<Object>} 返回API响应的JSON对象。
     */
    async callOpenAIAPI(apiUrl, apiKey, model, messages, options = {}, timeout = 60000) {
        console.log(`[API调用] callOpenAIAPI被调用:`, {
            apiUrl: apiUrl.substring(0, 30) + '...',
            apiKey: apiKey ? apiKey.substring(0, 10) + '...' : 'null',
            model,
            messagesCount: messages.length
        });

        // 自动设置 deepseek 模型的 max_tokens 为 8100
        if (model && model.toLowerCase().includes('deepseek')) {
            options = { ...options, max_tokens: 8100 };
            console.log(`[API调用] 检测到 deepseek 模型，自动设置 max_tokens 为 8100`);
        }

        const payload = { model, messages, ...options, stream: false };

        let success = false;
        let shouldRecord = true;
        let resultData = null;

        try {
            for (let i = 0; i < this.maxRetries; i++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeout);

                    const response = await fetch(apiUrl + '/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                        },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        if (response.status === 504) {
                            const errorBody = await response.text();
                            console.error('ERROR: API网关超时 (504) - 完整返回:', errorBody);
                            throw new Error('请求超时(504): 模型响应时间过长，请稍后重试');
                        }
                        const errorBody = await response.text().catch(() => `[无法解析的错误响应]`);
                        console.error('ERROR: API请求失败 - 完整返回:', errorBody);
                        throw new Error(`API Error (${response.status}): ${errorBody || response.statusText}`);
                    }

                    const responseText = await response.text();
                    console.log('API原始响应:', responseText);

                    try {
                        const data = JSON.parse(responseText);
                        console.log('API解析为JSON成功:', JSON.stringify(data, null, 2));

                        if (data.usage && data.usage.completion_tokens === 0) {
                            console.error('ERROR: API返回空回复 (completion_tokens=0) - 完整返回:', JSON.stringify(data, null, 2));
                            throw new Error('API错误：API响应，但AI空回复了。可能是模型问题、被截断或API提供商问题。请稍后重试。');
                        }

                        success = true;
                        resultData = data;
                        break; // 成功，跳出重试循环
                    } catch (parseError) {
                        console.log('JSON解析失败，作为纯文本处理:', parseError.message);
                        if (!responseText || responseText.trim() === '') {
                            throw new Error('API返回空响应');
                        }
                        // 将原始文本包装成标准OpenAI格式
                        success = true;
                        resultData = {
                            choices: [{
                                message: { content: responseText.trim(), role: 'assistant' },
                                finish_reason: 'stop'
                            }],
                            usage: {
                                completion_tokens: responseText.length,
                                prompt_tokens: 0,
                                total_tokens: responseText.length
                            }
                        };
                        break; // 成功，跳出重试循环
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        throw new Error('请求超时: 模型响应时间过长，请稍后重试');
                    }
                    if (i < this.maxRetries - 1) {
                        const delay = this.baseDelay * Math.pow(2, i);
                        console.log(`第 ${i + 1} 次尝试失败，将在 ${delay}ms 后重试...`);
                        await new Promise(res => setTimeout(res, delay));
                    } else {
                        throw error; // 所有重试均失败，抛出最后一次的错误
                    }
                }
            }
        } catch (error) {
            // 记录失败的API调用
            if (shouldRecord && window.apiConfigManager) {
                try {
                    console.log(`[API统计] API调用失败，记录失败统计: ${error.message}`);
                    const configId = window.apiConfigManager.activeConfigId || 'unknown';
                    const config = window.apiConfigManager.activeConfigId
                        ? await window.apiConfigManager.getConfigById(window.apiConfigManager.activeConfigId)
                        : null;
                    if (config) {
                        let keyIndex = -1;
                        if (config.apiKeys && config.apiKeys.length > 0) {
                            keyIndex = config.apiKeys.findIndex(k => k.key === apiKey && k.enabled);
                        }
                        if (keyIndex === -1 && config.key === apiKey) keyIndex = 0;
                        if (keyIndex !== -1) {
                            window.apiConfigManager.recordCall(configId, keyIndex, apiKey, false);
                        }
                    }
                } catch (recordError) {
                    console.warn('记录API调用失败统计失败:', recordError);
                }
            }
            throw error; // 重新抛出原始错误
        }

        // 记录成功的API调用
        if (success && shouldRecord && window.apiConfigManager) {
            try {
                console.log(`[API统计] API调用成功，记录成功统计。`);
                const configId = window.apiConfigManager.activeConfigId || 'unknown';
                const config = window.apiConfigManager.activeConfigId
                    ? await window.apiConfigManager.getConfigById(window.apiConfigManager.activeConfigId)
                    : null;
                if (config) {
                    let keyIndex = -1;
                    if (config.apiKeys && config.apiKeys.length > 0) {
                        keyIndex = config.apiKeys.findIndex(k => k.key === apiKey && k.enabled);
                    }
                    if (keyIndex === -1 && config.key === apiKey) keyIndex = 0;
                    if (keyIndex !== -1) {
                        window.apiConfigManager.recordCall(configId, keyIndex, apiKey, true);
                    }
                }
            } catch (err) {
                console.warn('记录API调用成功统计失败:', err);
            }
        }

        if (success) {
            return resultData;
        }
        
        // 如果循环结束都没有成功，则抛出通用错误
        throw new Error('API调用最终失败');
    }

    /**
     * 测试API连接。
     * @param {string} apiUrl - API地址。
     * @param {string} apiKey - API密钥。
     * @returns {Promise<Object>} 连接测试结果。
     */
    async testConnection(apiUrl, apiKey) {
        try {
            const response = await fetch(apiUrl + '/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                const errorBody = await response.text();
                console.error('ERROR: API测试连接失败 - 完整返回:', errorBody);
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

// UMD 风格导出 + 全局实例
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIService;
}
if (typeof window !== 'undefined') {
    window.APIService = APIService;
    if (!window.apiService) {
        window.apiService = new APIService();
    }
}