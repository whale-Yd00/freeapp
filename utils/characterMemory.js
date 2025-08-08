class CharacterMemoryManager {
    constructor() {
        this.isInitialized = false;
        this.conversationCounters = new Map(); // 按角色ID存储对话计数
        this.lastProcessedMessageIndex = new Map(); // 按联系人ID存储最后处理记忆的消息索引
        this.globalMemory = ''; // 全局记忆
    }

    /**
     * 初始化角色记忆管理器
     */
    async init() {
        console.log('[记忆调试] 开始初始化角色记忆管理器', {
            isInitialized: this.isInitialized,
            isIndexedDBReady: window.isIndexedDBReady,
            hasDb: !!window.db
        });
        
        if (this.isInitialized) {
            console.log('[记忆调试] 角色记忆管理器已初始化，跳过');
            return;
        }
        
        this.bindEvents();
        console.log('[记忆调试] 事件监听器已绑定');
        
        // 如果数据库已准备好，立即加载数据
        if (window.isIndexedDBReady && window.db) {
            console.log('[记忆调试] 数据库已准备好，开始加载数据');
            await this.loadConversationCounters();
            await this.getGlobalMemory();
        } else {
            console.log('[记忆调试] 数据库未准备好，跳过数据加载');
        }
        
        this.isInitialized = true;
        console.log('[记忆调试] 角色记忆管理器初始化完成');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 页面关闭前触发记忆更新检查
        window.addEventListener('beforeunload', async (e) => {
            await this.handlePageUnload();
        });
    }

    /**
     * 页面关闭时的处理逻辑
     */
    async handlePageUnload() {
        const currentContact = this.getCurrentContact();
        if (!currentContact) return;

        console.log('页面关闭，检查是否需要更新角色记忆');
        
        // 检查是否有新的用户消息需要处理
        if (!this.hasNewUserMessages(currentContact)) {
            console.log('没有新的用户消息，跳过记忆更新');
            return;
        }
        
        if (currentContact.type === 'group') {
            // 群聊：检查所有成员
            if (window.contacts && Array.isArray(window.contacts)) {
                for (const memberId of currentContact.members) {
                    const member = window.contacts.find(c => c.id === memberId);
                    if (member && member.type === 'private') {
                        await this.checkAndUpdateMemory(member.id, currentContact, true);
                    }
                }
            }
        } else {
            // 私聊：检查当前角色
            await this.checkAndUpdateMemory(currentContact.id, currentContact, true);
        }
    }

    /**
     * 获取当前联系人
     */
    getCurrentContact() {
        return window.currentContact || window.memoryTableManager?.getCurrentContact();
    }

    /**
     * 检查系统是否准备好执行记忆操作
     */
    isSystemReady() {
        const ready = window.contacts && 
               Array.isArray(window.contacts) && 
               window.apiSettings && 
               (window.apiSettings.url || window.apiSettings.apiUrl) && // 检查两个可能的字段
               window.apiService;
               
        console.log('[记忆调试] isSystemReady 检查详情:', {
            hasContacts: !!window.contacts,
            isContactsArray: Array.isArray(window.contacts),
            hasApiSettings: !!window.apiSettings,
            hasUrl: !!(window.apiSettings?.url),
            hasApiUrl: !!(window.apiSettings?.apiUrl),
            hasApiService: !!window.apiService,
            ready: ready
        });
        
        return ready;
    }

    /**
     * 检查是否有新的用户消息需要处理
     */
    hasNewUserMessages(contact) {
        if (!contact || !contact.messages || contact.messages.length === 0) {
            return false;
        }
        
        const lastProcessedIndex = this.lastProcessedMessageIndex.get(contact.id) || -1;
        const currentMessageCount = contact.messages.length;
        
        // 从最后处理的位置开始，检查是否有新的用户消息
        for (let i = lastProcessedIndex + 1; i < currentMessageCount; i++) {
            if (contact.messages[i].role === 'user') {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 统计从最后处理位置开始的用户消息数量
     */
    getNewUserMessageCount(contact) {
        if (!contact || !contact.messages || contact.messages.length === 0) {
            console.log('[记忆调试] getNewUserMessageCount: 没有消息');
            return 0;
        }
        
        const lastProcessedIndex = this.lastProcessedMessageIndex.get(contact.id) || -1;
        const currentMessageCount = contact.messages.length;
        let userMessageCount = 0;
        
        console.log('[记忆调试] getNewUserMessageCount 详情:', {
            contactId: contact.id,
            lastProcessedIndex,
            currentMessageCount,
            totalMessages: contact.messages.length
        });
        
        // 从最后处理的位置开始计数用户消息
        for (let i = lastProcessedIndex + 1; i < currentMessageCount; i++) {
            const message = contact.messages[i];
            console.log(`[记忆调试] 检查消息 ${i}:`, {
                role: message.role,
                content: message.content?.substring(0, 50),
                isUser: message.role === 'user'
            });
            
            if (message.role === 'user') {
                userMessageCount++;
            }
        }
        
        console.log('[记忆调试] 新用户消息数量:', userMessageCount);
        return userMessageCount;
    }

    /**
     * 从IndexedDB加载对话计数器
     */
    async loadConversationCounters() {
        console.log('[记忆调试] 尝试加载对话计数器', {
            isIndexedDBReady: window.isIndexedDBReady,
            hasDb: !!window.db,
            dbVersion: window.db?.version
        });
        
        if (!window.isIndexedDBReady || !window.db) {
            console.log('[记忆调试] IndexedDB未准备好，跳过加载对话计数器');
            return;
        }

        try {
            // 检查数据库中是否存在conversationCounters表
            const storeNames = Array.from(window.db.objectStoreNames);
            console.log('[记忆调试] 数据库中的所有表:', storeNames);
            
            if (!window.db.objectStoreNames.contains('conversationCounters')) {
                console.log('[记忆调试] conversationCounters表不存在，使用默认值');
                return;
            }

            const transaction = window.db.transaction(['conversationCounters'], 'readonly');
            const store = transaction.objectStore('conversationCounters');
            const data = await this.promisifyRequest(store.get('counters'));
            
            if (data) {
                this.conversationCounters = new Map(Object.entries(data));
                console.log('[记忆调试] 已加载对话计数器:', this.conversationCounters);
            } else {
                console.log('[记忆调试] 对话计数器数据为空，使用默认值');
            }
        } catch (error) {
            console.error('[记忆调试] 加载对话计数器失败:', error);
        }
    }

    /**
     * 保存对话计数器到IndexedDB
     */
    async saveConversationCounters() {
        if (!window.isIndexedDBReady || !window.db) {
            console.warn('IndexedDB未准备好，无法保存对话计数器');
            return;
        }

        try {
            const transaction = window.db.transaction(['conversationCounters'], 'readwrite');
            const store = transaction.objectStore('conversationCounters');
            const countersObj = Object.fromEntries(this.conversationCounters);
            await this.promisifyRequest(store.put({ id: 'counters', ...countersObj }));
            console.log('对话计数器已保存');
        } catch (error) {
            console.error('保存对话计数器失败:', error);
        }
    }

    /**
     * 获取角色记忆
     */
    async getCharacterMemory(contactId) {
        console.log('[记忆调试] 尝试获取角色记忆', {
            contactId,
            isIndexedDBReady: window.isIndexedDBReady,
            hasDb: !!window.db
        });
        
        if (!window.isIndexedDBReady || !window.db) {
            console.log('[记忆调试] IndexedDB未准备好，无法获取角色记忆');
            return null;
        }

        try {
            // 检查数据库中是否存在characterMemories表
            if (!window.db.objectStoreNames.contains('characterMemories')) {
                console.log('[记忆调试] characterMemories表不存在');
                return null;
            }

            const transaction = window.db.transaction(['characterMemories'], 'readonly');
            const store = transaction.objectStore('characterMemories');
            const data = await this.promisifyRequest(store.get(contactId));
            console.log('[记忆调试] 获取角色记忆结果:', {
                contactId,
                hasData: !!data,
                memoryLength: data?.memory?.length || 0,
                preview: data?.memory?.substring(0, 100) || null
            });
            return data ? data.memory : null;
        } catch (error) {
            console.error('[记忆调试] 获取角色记忆失败:', error);
            return null;
        }
    }

    /**
     * 保存角色记忆
     */
    async saveCharacterMemory(contactId, memory) {
        if (!window.isIndexedDBReady || !window.db) {
            console.warn('IndexedDB未准备好，无法保存角色记忆');
            return false;
        }

        try {
            const transaction = window.db.transaction(['characterMemories'], 'readwrite');
            const store = transaction.objectStore('characterMemories');
            const memoryData = {
                contactId: contactId,
                memory: memory,
                updateCount: (await this.getMemoryUpdateCount(contactId)) + 1,
                lastUpdated: new Date().toISOString()
            };
            
            await this.promisifyRequest(store.put(memoryData));
            console.log(`角色 ${contactId} 的记忆已保存`);
            return true;
        } catch (error) {
            console.error('保存角色记忆失败:', error);
            return false;
        }
    }

    /**
     * 获取记忆更新次数
     */
    async getMemoryUpdateCount(contactId) {
        if (!window.isIndexedDBReady || !window.db) {
            return 0;
        }

        try {
            const transaction = window.db.transaction(['characterMemories'], 'readonly');
            const store = transaction.objectStore('characterMemories');
            const data = await this.promisifyRequest(store.get(contactId));
            return data ? (data.updateCount || 0) : 0;
        } catch (error) {
            console.error('获取记忆更新次数失败:', error);
            return 0;
        }
    }

    /**
     * 增加对话计数
     */
    incrementConversationCounter(contactId) {
        const current = this.conversationCounters.get(contactId) || 0;
        const newCount = current + 1;
        this.conversationCounters.set(contactId, newCount);
        
        console.log(`角色 ${contactId} 对话计数: ${newCount}`);
        
        // 异步保存，避免阻塞
        this.saveConversationCounters();
        
        return newCount;
    }

    /**
     * 重置对话计数
     */
    resetConversationCounter(contactId) {
        this.conversationCounters.set(contactId, 0);
        this.saveConversationCounters();
    }

    /**
     * 获取对话计数
     */
    getConversationCounter(contactId) {
        return this.conversationCounters.get(contactId) || 0;
    }

    /**
     * 检查并更新记忆（主入口）
     */
    async checkAndUpdateMemory(contactId, currentContact, forceCheck = false) {
        console.log('[记忆调试] 记忆更新检查开始', {
            contactId,
            currentContactId: currentContact?.id,
            forceCheck,
            systemReady: this.isSystemReady(),
            isIndexedDBReady: window.isIndexedDBReady,
            hasContacts: !!window.contacts,
            hasApiSettings: !!window.apiSettings,
            hasApiService: !!window.apiService
        });

        // 系统准备度检查
        if (!this.isSystemReady()) {
            console.log('[记忆调试] 系统未准备好，跳过记忆更新', {
                contacts: !!window.contacts,
                apiSettings: !!window.apiSettings,
                apiUrl: !!window.apiSettings?.apiUrl,
                apiService: !!window.apiService
            });
            return;
        }

        const contact = window.contacts.find(c => c.id === contactId);
        if (!contact) {
            console.warn('[记忆调试] 未找到联系人:', contactId);
            return;
        }

        // 使用新的触发条件：用户发送2条消息就触发
        const newUserMessageCount = this.getNewUserMessageCount(currentContact);
        const shouldCheck = forceCheck || newUserMessageCount >= 2;
        
        console.log('[记忆调试] 触发条件检查', {
            contactId,
            newUserMessageCount,
            forceCheck,
            shouldCheck,
            lastProcessedIndex: this.lastProcessedMessageIndex.get(currentContact?.id),
            totalMessages: currentContact?.messages?.length
        });

        if (!shouldCheck) {
            console.log(`[记忆调试] 角色 ${contactId} 暂不需要检查记忆更新，新用户消息数: ${newUserMessageCount}`);
            return;
        }

        console.log(`[记忆调试] 开始检查角色 ${contactId} 的记忆更新，新用户消息数: ${newUserMessageCount}`);
        
        try {
            // 第一步：使用次要模型判断是否需要更新记忆
            console.log('[记忆调试] 开始调用次要模型判断是否需要更新记忆');
            const shouldUpdate = await this.checkMemoryUpdateNeeded(contact, currentContact);
            
            console.log('[记忆调试] 次要模型判断结果:', { contactId, shouldUpdate });
            
            if (shouldUpdate) {
                console.log(`[记忆调试] 角色 ${contactId} 需要更新记忆，开始调用主要模型`);
                // 第二步：使用主要模型生成/更新记忆
                await this.generateAndUpdateMemory(contact, currentContact);
            } else {
                console.log(`[记忆调试] 角色 ${contactId} 无需更新记忆`);
            }
            
            // 无论是否更新记忆，都标记当前消息已处理
            console.log('[记忆调试] 标记消息已处理:', currentContact?.id);
            this.markMessagesProcessed(currentContact);
        } catch (error) {
            console.error('[记忆调试] 检查更新记忆时发生错误:', error);
        }
    }

    /**
     * 标记消息已处理
     */
    markMessagesProcessed(contact) {
        if (contact && contact.messages && contact.messages.length > 0) {
            this.lastProcessedMessageIndex.set(contact.id, contact.messages.length - 1);
            console.log(`标记联系人 ${contact.id} 的消息已处理到索引 ${contact.messages.length - 1}`);
        }
    }

    /**
     * 获取全局记忆
     */
    async getGlobalMemory() {
        console.log('[记忆调试] 尝试获取全局记忆', {
            isIndexedDBReady: window.isIndexedDBReady,
            hasDb: !!window.db,
            currentGlobalMemory: this.globalMemory,
            globalMemoryLength: this.globalMemory.length
        });
        
        if (!window.isIndexedDBReady || !window.db) {
            console.log('[记忆调试] IndexedDB未准备好，返回内存中的全局记忆:', this.globalMemory);
            return this.globalMemory;
        }

        try {
            // 检查数据库中是否存在globalMemory表
            if (!window.db.objectStoreNames.contains('globalMemory')) {
                console.log('[记忆调试] globalMemory表不存在，使用默认值');
                return this.globalMemory;
            }

            const transaction = window.db.transaction(['globalMemory'], 'readonly');
            const store = transaction.objectStore('globalMemory');
            const data = await this.promisifyRequest(store.get('memory'));
            this.globalMemory = data ? data.content : '';
            console.log('[记忆调试] 从数据库获取全局记忆成功:', {
                hasData: !!data,
                contentLength: this.globalMemory.length,
                preview: this.globalMemory.substring(0, 100)
            });
            return this.globalMemory;
        } catch (error) {
            console.error('[记忆调试] 获取全局记忆失败:', error);
            return this.globalMemory;
        }
    }

    /**
     * 保存全局记忆
     */
    async saveGlobalMemory(memory) {
        if (!window.isIndexedDBReady || !window.db) {
            this.globalMemory = memory;
            console.warn('IndexedDB未准备好，全局记忆仅保存在内存中');
            return false;
        }

        try {
            const transaction = window.db.transaction(['globalMemory'], 'readwrite');
            const store = transaction.objectStore('globalMemory');
            await this.promisifyRequest(store.put({
                id: 'memory',
                content: memory,
                lastUpdated: new Date().toISOString()
            }));
            this.globalMemory = memory;
            console.log('全局记忆已保存');
            return true;
        } catch (error) {
            console.error('保存全局记忆失败:', error);
            return false;
        }
    }

    /**
     * 检查并更新全局记忆
     */
    async checkAndUpdateGlobalMemory(forumContent, forceCheck = false) {
        console.log('开始检查全局记忆更新');
        
        // 检查必要的依赖是否准备好（全局记忆不需要contacts数组）
        if (!window.apiSettings || !window.apiSettings.url || !window.apiService) {
            console.log('系统未准备好，跳过全局记忆更新');
            return;
        }
        
        try {
            // 第一步：使用次要模型判断是否需要更新全局记忆
            const shouldUpdate = await this.checkGlobalMemoryUpdateNeeded(forumContent);
            
            if (shouldUpdate) {
                console.log('需要更新全局记忆');
                // 第二步：使用主要模型生成/更新全局记忆
                await this.generateAndUpdateGlobalMemory(forumContent);
            } else {
                console.log('无需更新全局记忆');
            }
        } catch (error) {
            console.error('检查更新全局记忆时发生错误:', error);
        }
    }

    /**
     * 检查是否需要更新记忆（调用次要模型）
     */
    async checkMemoryUpdateNeeded(contact, currentContact) {
        const currentMemory = await this.getCharacterMemory(contact.id);
        const recentContext = this.buildRecentContext(currentContact);
        
        // 构建判断提示词
        const prompt = this.buildMemoryCheckPrompt(currentMemory, recentContext, contact);
        
        try {
            // 使用相同的API设置，但降低temperature
            const response = await window.apiService.callOpenAIAPI(
                window.apiSettings.url,
                window.apiSettings.key,
                window.apiSettings.model,
                [{ role: 'user', content: prompt }],
                { 
                    temperature: 0.1, // 降低随机性，让判断更稳定
                    max_tokens: 5000
                }
            );
            
            // 安全检查API响应格式
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
                console.warn('API响应格式异常:', response);
                return false;
            }
            
            const content = response.choices[0].message.content;
            if (!content || typeof content !== 'string') {
                console.warn('API响应内容为空或格式错误:', content);
                return false;
            }
            
            const result = content.trim();
            console.log('记忆更新判断结果:', result);
            
            // 如果模型有回复且不含"不"或"否"，则认为满足条件
            return result.length > 0 && !result.includes('不') && !result.includes('否');
        } catch (error) {
            console.error('调用次要模型判断记忆更新失败:', error);
            return false; // 出错时保守处理，不更新
        }
    }

    /**
     * 检查是否需要更新全局记忆（调用次要模型）
     */
    async checkGlobalMemoryUpdateNeeded(forumContent) {
        const currentGlobalMemory = await this.getGlobalMemory();
        
        // 构建判断提示词
        const prompt = this.buildGlobalMemoryCheckPrompt(currentGlobalMemory, forumContent);
        
        try {
            const response = await window.apiService.callOpenAIAPI(
                window.apiSettings.url,
                window.apiSettings.key,
                window.apiSettings.model,
                [{ role: 'user', content: prompt }],
                { 
                    temperature: 0.1,
                    max_tokens: 7000
                }
            );
            
            // 安全检查API响应格式
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
                console.warn('全局记忆API响应格式异常:', response);
                return false;
            }
            
            const content = response.choices[0].message.content;
            if (!content || typeof content !== 'string') {
                console.warn('全局记忆API响应内容为空或格式错误:', content);
                return false;
            }
            
            const result = content.trim();
            console.log('全局记忆更新判断结果:', result);
            
            // 如果模型有回复且不含"不"或"否"，则认为满足条件
            return result.length > 0 && !result.includes('不') && !result.includes('否');
        } catch (error) {
            console.error('调用次要模型判断全局记忆更新失败:', error);
            return false;
        }
    }

    /**
     * 生成并更新记忆（调用主要模型）
     */
    async generateAndUpdateMemory(contact, currentContact) {
        const currentMemory = await this.getCharacterMemory(contact.id);
        const recentContext = this.buildRecentContext(currentContact);
        
        // 构建记忆生成提示词
        const prompt = this.buildMemoryGeneratePrompt(currentMemory, recentContext, contact);
        
        try {
            const response = await window.apiService.callOpenAIAPI(
                window.apiSettings.url,
                window.apiSettings.key,
                window.apiSettings.model,
                [{ role: 'user', content: prompt }],
                { 
                    temperature: 0.3,
                    max_tokens: 10000
                }
            );
            
            // 安全检查API响应格式
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
                console.warn('生成记忆API响应格式异常:', response);
                return;
            }
            
            const content = response.choices[0].message.content;
            if (!content || typeof content !== 'string') {
                console.warn('生成记忆API响应内容为空或格式错误:', content);
                return;
            }
            
            const newMemory = content.trim();
            console.log('生成的新记忆:', newMemory);
            
            // 保存新记忆
            await this.saveCharacterMemory(contact.id, newMemory);
            
        } catch (error) {
            console.error('生成记忆失败:', error);
        }
    }

    /**
     * 生成并更新全局记忆（调用主要模型）
     */
    async generateAndUpdateGlobalMemory(forumContent) {
        const currentGlobalMemory = await this.getGlobalMemory();
        
        // 构建记忆生成提示词
        const prompt = this.buildGlobalMemoryGeneratePrompt(currentGlobalMemory, forumContent);
        
        try {
            const response = await window.apiService.callOpenAIAPI(
                window.apiSettings.url,
                window.apiSettings.key,
                window.apiSettings.model,
                [{ role: 'user', content: prompt }],
                { 
                    temperature: 0.3,
                    max_tokens: 10000
                }
            );
            
            // 安全检查API响应格式
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
                console.warn('生成全局记忆API响应格式异常:', response);
                return;
            }
            
            const content = response.choices[0].message.content;
            if (!content || typeof content !== 'string') {
                console.warn('生成全局记忆API响应内容为空或格式错误:', content);
                return;
            }
            
            const newGlobalMemory = content.trim();
            console.log('生成的新全局记忆:', newGlobalMemory);
            
            // 保存新全局记忆
            await this.saveGlobalMemory(newGlobalMemory);
            
        } catch (error) {
            console.error('生成全局记忆失败:', error);
        }
    }

    /**
     * 构建最近对话上下文
     */
    buildRecentContext(contact) {
        if (!contact.messages || contact.messages.length === 0) {
            return '暂无对话记录';
        }

        const recentMessages = contact.messages.slice(-20); // 获取最近20条消息
        const contextLines = [];
        
        recentMessages.forEach(msg => {
            const sender = msg.role === 'user' ? 
                (window.userProfile?.name || '用户') : 
                (window.contacts && Array.isArray(window.contacts) ? 
                    window.contacts.find(c => c.id === msg.senderId)?.name || contact.name : 
                    contact.name);
                
            let content = msg.content;
            
            // 处理特殊消息类型
            if (msg.type === 'red_packet') {
                try {
                    const packet = JSON.parse(content);
                    content = `[发送红包: ${packet.message}, 金额: ${packet.amount}元]`;
                } catch (e) {
                    content = '[发送红包]';
                }
            } else if (msg.type === 'emoji') {
                const emoji = window.emojis && Array.isArray(window.emojis) ? 
                    window.emojis.find(e => e.url === msg.content) : null;
                content = `[表情: ${emoji?.meaning || '未知表情'}]`;
            }
            
            contextLines.push(`${sender}: ${content}`);
        });
        
        return contextLines.join('\n');
    }

    /**
     * 构建记忆检查提示词
     */
    buildMemoryCheckPrompt(currentMemory, recentContext, contact) {
        return `你是一个记忆分析助手。请判断以下对话内容是否需要更新角色记忆。

当前角色记忆：
${currentMemory || '暂无记忆'}

最近对话内容：
${recentContext}

判断标准：
1. 当前对话是否涉及到传入记忆中没有的内容？
2. 当前事件是否涉及到用户本身的形象，或现实生活中的事件？（例如：用户正在接受心理治疗、用户正在准备演讲比赛、用户喜欢你称呼他为...等）

请仅回答"满足"或"不满足"，不要其他解释。`;
    }

    /**
     * 构建记忆生成提示词
     */
    buildMemoryGeneratePrompt(currentMemory, recentContext, contact) {
        const userName = window.userProfile?.name || '用户';
        
        return `你是一个记忆整理助手。请根据原有记忆和最新对话，更新角色记忆。

角色信息：
- 姓名：${contact.name}
- 人设：${contact.personality}

用户信息：
- 姓名：${userName}
- 人设：${window.userProfile?.personality || '未设置'}

原有记忆：
${currentMemory || '暂无原有记忆'}

最新对话内容：
${recentContext}

请整合原有记忆和新的对话内容，生成更新后的完整记忆。记忆应该包含：
1. 用户的重要个人信息、生活状态、兴趣爱好
2. 用户与角色的互动历史和关系发展
3. 重要的事件和约定
4. 其他值得记住的细节

请直接输出更新后的记忆内容为列表，不要其他解释：`;
    }

    /**
     * 构建全局记忆检查提示词
     */
    buildGlobalMemoryCheckPrompt(currentGlobalMemory, forumContent) {
        return `你是一个全局记忆分析助手。请判断以下论坛内容是否需要更新全局记忆。

当前全局记忆：
${currentGlobalMemory || '暂无记忆'}

论坛内容：
${forumContent}

判断标准：
1. 论坛内容是否涉及到全局记忆中没有的重要信息？
2. 论坛内容是否涉及到用户本身的形象，或现实生活中的重要事件？

请仅回答"满足"或"不满足"，不要其他解释。`;
    }

    /**
     * 构建全局记忆生成提示词
     */
    buildGlobalMemoryGeneratePrompt(currentGlobalMemory, forumContent) {
        const userName = window.userProfile?.name || '用户';
        
        return `你是一个全局记忆整理助手。请根据原有全局记忆和新的论坛内容，更新全局记忆。

用户信息：
- 姓名：${userName}
- 人设：${window.userProfile?.personality || '未设置'}

原有全局记忆：
${currentGlobalMemory || '暂无原有记忆'}

新的论坛内容：
${forumContent}

请整合原有全局记忆和新的论坛内容，生成更新后的完整全局记忆。全局记忆应该包含：
1. 用户在论坛中表达的重要观点、兴趣和态度
2. 用户参与的重要讨论和互动
3. 用户在论坛中展现的性格特征
4. 其他所有角色都应该知道的关于用户的重要信息

请直接输出更新后的全局记忆内容为列表，不要其他解释：`;
    }

    /**
     * Promise化IndexedDB请求
     */
    promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 导出角色记忆数据
     */
    async exportMemoryData() {
        if (!window.isIndexedDBReady || !window.db) {
            return {
                characterMemories: {},
                globalMemory: this.globalMemory
            };
        }

        try {
            const transaction = window.db.transaction(['characterMemories', 'globalMemory'], 'readonly');
            
            // 导出角色记忆
            const memoryStore = transaction.objectStore('characterMemories');
            const allMemories = await this.promisifyRequest(memoryStore.getAll());
            
            const characterMemories = {};
            allMemories.forEach(memory => {
                characterMemories[memory.contactId] = {
                    memory: memory.memory,
                    updateCount: memory.updateCount,
                    lastUpdated: memory.lastUpdated
                };
            });
            
            // 导出全局记忆
            const globalStore = transaction.objectStore('globalMemory');
            const globalData = await this.promisifyRequest(globalStore.get('memory'));
            const globalMemory = globalData ? globalData.content : '';
            
            return {
                characterMemories: characterMemories,
                globalMemory: globalMemory
            };
        } catch (error) {
            console.error('导出记忆数据失败:', error);
            return {
                characterMemories: {},
                globalMemory: this.globalMemory
            };
        }
    }

    /**
     * 导入角色记忆数据
     */
    async importMemoryData(memoryData) {
        if (!window.isIndexedDBReady || !window.db || !memoryData) {
            return false;
        }

        try {
            const transaction = window.db.transaction(['characterMemories', 'globalMemory'], 'readwrite');
            
            // 导入角色记忆
            if (memoryData.characterMemories) {
                const memoryStore = transaction.objectStore('characterMemories');
                
                for (const [contactId, data] of Object.entries(memoryData.characterMemories)) {
                    const memoryRecord = {
                        contactId: contactId,
                        memory: data.memory,
                        updateCount: data.updateCount || 0,
                        lastUpdated: data.lastUpdated || new Date().toISOString()
                    };
                    await this.promisifyRequest(memoryStore.put(memoryRecord));
                }
            }
            
            // 导入全局记忆
            if (memoryData.globalMemory !== undefined) {
                const globalStore = transaction.objectStore('globalMemory');
                await this.promisifyRequest(globalStore.put({
                    id: 'memory',
                    content: memoryData.globalMemory,
                    lastUpdated: new Date().toISOString()
                }));
                this.globalMemory = memoryData.globalMemory;
            }
            
            console.log('记忆数据导入成功');
            return true;
        } catch (error) {
            console.error('导入记忆数据失败:', error);
            return false;
        }
    }
}

// 创建全局实例
window.characterMemoryManager = new CharacterMemoryManager();

// 暴露主要函数到全局作用域
window.checkAndUpdateMemory = function(contactId, currentContact, forceCheck = false) {
    return window.characterMemoryManager.checkAndUpdateMemory(contactId, currentContact, forceCheck);
};

window.incrementConversationCounter = function(contactId) {
    return window.characterMemoryManager.incrementConversationCounter(contactId);
};

window.checkAndUpdateGlobalMemory = function(forumContent, forceCheck = false) {
    return window.characterMemoryManager.checkAndUpdateGlobalMemory(forumContent, forceCheck);
};

// 自动初始化
document.addEventListener('DOMContentLoaded', function() {
    if (window.characterMemoryManager) {
        window.characterMemoryManager.init();
    }
});

// 导出模块（如果使用ES6模块）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CharacterMemoryManager
    };
}