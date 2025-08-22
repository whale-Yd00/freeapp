/**
 * 图片关键词生成器
 * 使用AI将中文图片描述转换为更精准的英文搜索关键词，提升Unsplash图片搜索效果
 */

class ImageKeywordGenerator {
    constructor() {
        this.initialized = false;
    }

    /**
     * 初始化关键词生成器
     * @param {Object} apiSettings - API配置
     * @param {Object} apiService - API服务实例
     */
    init(apiSettings, apiService) {
        this.apiSettings = apiSettings;
        this.apiService = apiService;
        this.initialized = true;
    }

    /**
     * 使用AI生成适合Unsplash搜索的关键词
     * @param {string} content 原始内容描述
     * @returns {Promise<string>} 生成的搜索关键词
     */
    async generateKeyword(content) {
        // 检查初始化状态
        if (!this.initialized) {
            console.warn('ImageKeywordGenerator未初始化，使用原始内容作为搜索关键词');
            return content;
        }

        // 检查API配置
        if (!this.apiSettings || !this.apiSettings.url || !this.apiSettings.key || !this.apiSettings.model) {
            console.warn('AI API未配置，使用原始内容作为搜索关键词');
            return content;
        }
        
        try {
            const prompt = `Generate 2-5 English keywords for Unsplash photo search based on this description: "${content}"

Requirements:
- Only return keywords separated by spaces
- Focus on visual, concrete elements
- Avoid abstract concepts
- Prefer landscapes, objects, scenes over people
- Maximum 50 characters total

Keywords:`;

            // 处理次要模型选择逻辑
            const modelToUse = this.apiSettings.secondaryModel === 'sync_with_primary' 
                ? this.apiSettings.model 
                : (this.apiSettings.secondaryModel || this.apiSettings.model);
            
            console.log(`[ImageKeywordGenerator] 使用模型: ${modelToUse} (secondaryModel配置: ${this.apiSettings.secondaryModel})`);
            
            const response = await this.apiService.callOpenAIAPI(
                this.apiSettings.url,
                this.apiSettings.key,
                modelToUse,
                [{ role: 'user', content: prompt }],
                {
                    temperature: 0.7,
                    max_tokens: 3000
                },
                (this.apiSettings.timeout * 1000) || 30000
            );
            
            // 检查响应的完整性
            const choice = response.choices[0];
            if (!choice) {
                console.warn('[ImageKeywordGenerator] API响应中没有choices，使用原始内容');
                return content;
            }
            
            // 检查是否被截断
            if (choice.finish_reason === 'length') {
                console.warn('[ImageKeywordGenerator] API响应被截断，使用原始内容');
                return content;
            }
            
            // 检查是否有错误
            if (choice.finish_reason !== 'stop' && choice.finish_reason !== null) {
                console.warn(`[ImageKeywordGenerator] API响应异常结束 (${choice.finish_reason})，使用原始内容`);
                return content;
            }
            
            const keyword = choice.message?.content?.trim();
            if (!keyword || keyword.length === 0) {
                console.warn('[ImageKeywordGenerator] AI返回空关键词，使用原始内容');
                return content;
            }
            
            // 验证关键词是否为有效的英文
            const isValidKeyword = /^[a-zA-Z0-9\s\-.,!?]+$/.test(keyword) && 
                                 keyword.length > 0 && 
                                 keyword.length < 200 && 
                                 !keyword.includes('{') && 
                                 !keyword.includes('}');
            
            if (!isValidKeyword) {
                console.warn(`[ImageKeywordGenerator] 生成的关键词格式无效: "${keyword.substring(0, 100)}..."，使用原始内容`);
                return content;
            }
            
            console.log(`[ImageKeywordGenerator] AI生成关键词: "${keyword}" (原始: "${content}")`);
            return keyword;
            
        } catch (error) {
            console.warn('[ImageKeywordGenerator] 生成关键词失败，使用原始内容:', error);
            return content;
        }
    }

    /**
     * 批量生成关键词（用于同时处理多个描述）
     * @param {Array<string>} contents 原始内容描述数组
     * @returns {Promise<Array<string>>} 生成的搜索关键词数组
     */
    async generateKeywords(contents) {
        if (!Array.isArray(contents)) {
            throw new Error('contents必须是数组');
        }

        const results = [];
        for (const content of contents) {
            const keyword = await this.generateKeyword(content);
            results.push(keyword);
        }
        return results;
    }

    /**
     * 检查是否已初始化并可用
     * @returns {boolean}
     */
    isReady() {
        return this.initialized && 
               this.apiSettings && 
               this.apiSettings.url && 
               this.apiSettings.key && 
               this.apiSettings.model;
    }
}

// 创建全局实例
window.imageKeywordGenerator = new ImageKeywordGenerator();

/**
 * 向后兼容的全局函数
 * @param {string} content 原始内容描述
 * @returns {Promise<string>} 生成的搜索关键词
 */
async function generateImageSearchKeyword(content) {
    return await window.imageKeywordGenerator.generateKeyword(content);
}

// 导出到全局作用域以保持向后兼容
window.generateImageSearchKeyword = generateImageSearchKeyword;