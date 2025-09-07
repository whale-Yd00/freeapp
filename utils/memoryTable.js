// 默认记忆表模板
const defaultMemoryTable = `# 背景设定
- 时间地点：
- 事件：
---
## 📋 记忆表格

### 【现在】
| 项目 | 内容 |
|------|------|
| 地点 | [当前所在的具体地点] |
| 人物 | [当前在场的所有人物] |
| 时间 | [精确的年月日和时间，格式：YYYY年MM月DD日 HH:MM] |

### 【重要物品（真实存在的物品）】
| 物品名称 | 物品描述 | 重要原因 |
|----------|----------|----------|
| [物品1]   | [详细的外观和特征描述] | [为什么这个物品重要] |
| [物品2]   | [详细的外观和特征描述] | [为什么这个物品重要] |
`;

// 记忆表管理类
class MemoryTableManager {
    constructor() {
        this.isInitialized = false;
        this.currentContact = null;
        this.lastToggleTime = 0;
        this.isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.debounceDelay = this.isIOSDevice ? 300 : 100; // iOS设备使用更长的防抖延迟
    }

    setCurrentContact(contact) {
        this.currentContact = contact;
    }

    getCurrentContact() {
        return this.currentContact || window.currentContact;
    }

    // 初始化记忆表管理器
    init() {
        if (this.isInitialized) return;
        this.bindEvents();
        this.isInitialized = true;
    }

    // 绑定事件监听器
    bindEvents() {
        // 可以在这里添加记忆表相关的事件监听器
        document.addEventListener('click', (e) => {
            const memoryPanel = document.getElementById('memoryPanel');
            // 点击记忆面板外部时关闭面板
            if (memoryPanel && memoryPanel.classList.contains('active') && 
                !memoryPanel.contains(e.target) && 
                !e.target.closest('.memory-btn')) {
                // 可以选择是否自动关闭，这里注释掉避免误触
                // this.toggleMemoryPanel(true);
            }
        });
    }

    // 获取默认记忆表模板
    getDefaultTemplate() {
        return defaultMemoryTable;
    }

    // 初始化联系人的记忆表内容
    initContactMemoryTable(contact) {
        if (!contact.memoryTableContent) {
            contact.memoryTableContent = defaultMemoryTable;
        }
        return contact;
    }

    // 更新联系人的记忆表内容
    updateContactMemoryTable(contact, newMemoryContent) {
        if (!contact) {
            console.warn('无法更新记忆表：联系人对象为空');
            return false;
        }
        
        contact.memoryTableContent = newMemoryContent || defaultMemoryTable;
        return true;
    }

    // 从API响应中提取记忆表内容
    extractMemoryTableFromResponse(responseText) {
        const memoryTableRegex = /<memory_table>([\s\S]*?)<\/memory_table>/;
        const memoryMatch = responseText.match(memoryTableRegex);
        
        if (memoryMatch && memoryMatch[1]) {
            return {
                memoryTable: memoryMatch[1].trim(),
                cleanedResponse: responseText.replace(memoryTableRegex, '').trim()
            };
        }
        
        return {
            memoryTable: null,
            cleanedResponse: responseText
        };
    }

    // 切换记忆面板显示/隐藏
    async toggleMemoryPanel(forceClose = false) {
        const panel = document.getElementById('memoryPanel');
        const isActive = panel.classList.contains('active');
        
        if (forceClose) { 
            panel.classList.remove('active'); 
            return; 
        }
        
        // 防抖机制：防止短时间内重复触发（特别是iOS设备）
        const currentTime = Date.now();
        if (currentTime - this.lastToggleTime < this.debounceDelay) {
            return;
        }
        this.lastToggleTime = currentTime;
        
        if (isActive) {
            panel.classList.remove('active');
        } else {
            // iOS设备额外检查：确保不是在键盘变化期间
            if (this.isIOSDevice) {
                const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const fullHeight = window.screen.height;
                const keyboardVisible = viewportHeight < fullHeight * 0.75; // 如果视口高度小于屏幕高度的75%，认为键盘可能正在显示
                
                if (keyboardVisible) {
                    return;
                }
            }
            
            const currentContact = this.getCurrentContact();
            
            if (currentContact) {
                const memoryTextarea = document.getElementById('memoryTextarea');
                memoryTextarea.value = currentContact.memoryTableContent || this.getDefaultTemplate();
                this.renderMemoryTable(memoryTextarea.value);
                document.getElementById('memoryTableView').style.display = 'block';
                memoryTextarea.style.display = 'none';
                document.getElementById('memoryEditBtn').textContent = '编辑';
                panel.classList.add('active');
            } else {
                if (window.showToast) {
                    window.showToast('请先选择一个聊天');
                }
            }
        }
    }

    // 切换记忆表编辑模式
    // 修改 toggleMemoryEditMode 函数，使用统一的获取当前联系人的方法
    async toggleMemoryEditMode() {
        const currentContact = this.getCurrentContact();
        
        if (!currentContact) {
            if (window.showToast) {
                window.showToast('请先选择一个聊天');
            }
            return;
        }

        const editBtn = document.getElementById('memoryEditBtn');
        const viewDiv = document.getElementById('memoryTableView');
        const editArea = document.getElementById('memoryTextarea');
        
        if (editBtn.textContent === '编辑') {
            viewDiv.style.display = 'none';
            editArea.style.display = 'block';
            editArea.value = currentContact.memoryTableContent || this.getDefaultTemplate();
            editArea.focus();
            editBtn.textContent = '保存';
        } else {
            // 保存记忆表内容
            currentContact.memoryTableContent = editArea.value;
            
            // 调用保存函数（如果存在）
            if (window.saveDataToDB) {
                await window.saveDataToDB();
            }
            
            this.renderMemoryTable(currentContact.memoryTableContent);
            viewDiv.style.display = 'block';
            editArea.style.display = 'none';
            editBtn.textContent = '编辑';
            
            if (window.showToast) {
                window.showToast('记忆已保存');
            }
        }
    }


    // 渲染记忆表内容
    renderMemoryTable(markdown) {
        const viewDiv = document.getElementById('memoryTableView');
        
        if (!viewDiv) {
            console.warn('记忆表视图元素不存在');
            return;
        }

        // 检查内容是否为空
        if (!markdown || markdown.trim() === '') {
            viewDiv.innerHTML = this.getEmptyMemoryTableHtml();
            return;
        }

        try {
            // 预处理markdown内容，防止表格单元格内容过长
            const cleanedMarkdown = this.preprocessMarkdownTable(markdown);
            
            // 确保 marked 库已加载
            if (typeof marked !== 'undefined') {
                viewDiv.innerHTML = marked.parse(cleanedMarkdown);
            } else {
                // Fallback if marked is not loaded
                console.warn('marked库未加载，使用预览模式');
                viewDiv.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word;">${cleanedMarkdown}</pre>`;
            }
        } catch (error) {
            console.error('渲染记忆表失败:', error);
            viewDiv.innerHTML = `<div style="color: #e53e3e; padding: 20px; text-align: center;">
                <p>记忆表渲染失败</p>
                <small>请检查记忆表格式是否正确</small>
            </div>`;
        }
    }

    // 预处理markdown表格内容，防止单元格内容过长
    preprocessMarkdownTable(markdown) {
        if (!markdown || typeof markdown !== 'string') {
            return '';
        }

        // 限制表格单元格内容的最大长度
        const MAX_CELL_LENGTH = 500;
        
        return markdown.replace(/\|([^|\n]*?)\|/g, (match, cellContent) => {
            if (cellContent && cellContent.length > MAX_CELL_LENGTH) {
                const truncated = cellContent.substring(0, MAX_CELL_LENGTH).trim();
                return `|${truncated}...|`;
            }
            return match;
        });
    }

    // 获取空记忆表的HTML
    getEmptyMemoryTableHtml() {
        return `
            <div style="text-align: center; padding: 40px;">
                <p style="font-size: 16px; color: #888;">记忆是空的。</p>
                <p style="font-size: 14px; color: #aaa;">点击"编辑"按钮，开始记录你们的故事吧。</p>
            </div>
        `;
    }

    // 验证记忆表内容格式
    validateMemoryTableContent(content) {
        if (!content || typeof content !== 'string') {
            return {
                isValid: false,
                error: '记忆表内容必须是非空字符串'
            };
        }

        // 基本的格式检查
        const hasBasicStructure = content.includes('#') || content.includes('|');
        
        return {
            isValid: true,
            hasStructure: hasBasicStructure,
            length: content.length
        };
    }

    // 导出记忆表内容
    exportMemoryTable(contact) {
        if (!contact || !contact.memoryTableContent) {
            return null;
        }

        const exportData = {
            contactName: contact.name,
            contactId: contact.id,
            memoryContent: contact.memoryTableContent,
            exportTime: new Date().toISOString(),
            version: '1.0'
        };

        return exportData;
    }

    // 导入记忆表内容
    importMemoryTable(contact, importData) {
        if (!contact || !importData || !importData.memoryContent) {
            return false;
        }

        const validation = this.validateMemoryTableContent(importData.memoryContent);
        if (!validation.isValid) {
            console.warn('导入的记忆表内容格式无效:', validation.error);
            return false;
        }

        contact.memoryTableContent = importData.memoryContent;
        return true;
    }

    // 清空记忆表内容
    clearMemoryTable(contact) {
        if (!contact) return false;
        
        contact.memoryTableContent = defaultMemoryTable;
        return true;
    }

    // 获取记忆表统计信息
    getMemoryTableStats(contact) {
        if (!contact || !contact.memoryTableContent) {
            return {
                isEmpty: true,
                length: 0,
                lineCount: 0,
                tableCount: 0
            };
        }

        const content = contact.memoryTableContent;
        const lines = content.split('\n').filter(line => line.trim());
        const tableMatches = content.match(/\|.*\|/g) || [];

        return {
            isEmpty: content.trim() === defaultMemoryTable.trim(),
            length: content.length,
            lineCount: lines.length,
            tableCount: tableMatches.length,
            hasContent: content.trim().length > 0
        };
    }

    // 搜索记忆表内容
    searchMemoryTable(contact, searchTerm) {
        if (!contact || !contact.memoryTableContent || !searchTerm) {
            return {
                found: false,
                matches: []
            };
        }

        const content = contact.memoryTableContent.toLowerCase();
        const term = searchTerm.toLowerCase();
        const lines = contact.memoryTableContent.split('\n');
        const matches = [];

        lines.forEach((line, index) => {
            if (line.toLowerCase().includes(term)) {
                matches.push({
                    lineNumber: index + 1,
                    content: line.trim(),
                    highlighted: line.replace(
                        new RegExp(searchTerm, 'gi'), 
                        `<mark>$&</mark>`
                    )
                });
            }
        });

        return {
            found: matches.length > 0,
            matches: matches,
            totalMatches: matches.length
        };
    }

    // 使用次要模型更新记忆表格
    async updateMemoryTableWithSecondaryModel(contact) {
        try {
            // 获取当前联系人
            const currentContact = this.getCurrentContact();
            if (!currentContact || currentContact.id !== contact.id) {
                console.warn('当前联系人不匹配，跳过记忆表格更新');
                return false;
            }

            // 获取最近的对话历史
            const recentMessages = this.getRecentMessages(currentContact, 10);
            if (recentMessages.length === 0) {
                console.log('没有对话历史，跳过记忆表格更新');
                return false;
            }

            // 使用promptBuilder构建记忆表格更新提示词
            if (!window.promptBuilder) {
                console.error('promptBuilder未初始化');
                return false;
            }

            const memoryUpdatePrompt = window.promptBuilder.buildMemoryUpdatePrompt(
                contact, 
                window.userProfile || { name: '用户', nickname: '用户', personality: '' }, 
                currentContact, 
                window.apiSettings,
                recentMessages
            );

            // 获取模型配置
            const modelToUse = this.getSecondaryModel();
            
            // 调用API更新记忆表格
            const response = await window.apiService.callOpenAIAPI(
                window.apiSettings.url,
                window.apiSettings.key,
                modelToUse,
                [{ role: 'user', content: memoryUpdatePrompt }],
                { 
                    temperature: 0.3,
                    max_tokens: 8000,
                    stream: false
                },
                (window.apiSettings.timeout || 60) * 1000
            );
            console.log('记忆表格更新API完整返回:', JSON.stringify(response, null, 2));

            // 处理响应
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
                console.warn('记忆表格更新API响应格式异常:', response);
                return false;
            }

            const newMemoryTableContent = response.choices[0].message.content;
            if (!newMemoryTableContent || newMemoryTableContent.trim() === '') {
                console.warn('记忆表格更新API返回空内容');
                return false;
            }

            // 更新联系人的记忆表格内容
            const updateResult = this.updateContactMemoryTable(contact, newMemoryTableContent.trim());
            if (updateResult) {
                console.log('记忆表格更新成功');
                // 保存数据
                if (window.saveDataToDB) {
                    await window.saveDataToDB();
                }
                return true;
            }

            return false;
        } catch (error) {
            console.error('使用次要模型更新记忆表格失败:', error);
            return false;
        }
    }

    /**
     * 异步更新记忆表格 - 使用API队列
     */
    async updateMemoryTableAsync(contact, options = {}) {
        if (!window.apiRequestQueue) {
            console.warn('API队列未初始化，回退到同步更新');
            return this.updateMemoryTableWithSecondaryModel(contact);
        }

        const priority = options.priority || window.apiRequestQueue.PRIORITY.LOW;
        const description = `更新${contact.name || contact.nickname || '联系人'}的记忆表格`;
        const EVENT_TYPE = 'memory_update';
        const STATUS_BALL_ID = `special_event_${EVENT_TYPE}`;

        // 显示记忆更新状态球
        if (window.statusBallManager && window.STATUS_BALL_CONFIGS?.[EVENT_TYPE]) {
            const queueState = {
                completedTasks: 0,
                totalTasks: 1,
                currentTask: description,
                eventType: EVENT_TYPE,
                config: window.STATUS_BALL_CONFIGS[EVENT_TYPE]
            };
            window.statusBallManager.showSpecialEvent(EVENT_TYPE, queueState);
        }

        return new Promise((resolve) => {
            window.apiRequestQueue.addRequest(
                () => this.updateMemoryTableWithSecondaryModel(contact),
                {
                    priority,
                    description,
                    onComplete: (requestId, result) => {
                        console.log(`记忆表格异步更新完成: ${description}`);
                        
                        // 更新悬浮球状态为完成
                        if (window.statusBallManager && window.STATUS_BALL_CONFIGS?.[EVENT_TYPE]) {
                            const completedState = {
                                completedTasks: 1,
                                totalTasks: 1,
                                currentTask: description,
                                eventType: EVENT_TYPE,
                                config: window.STATUS_BALL_CONFIGS[EVENT_TYPE],
                                completed: true
                            };
                            window.statusBallManager.showSpecialEvent(EVENT_TYPE, completedState);
                            
                            // 3秒后自动隐藏
                            setTimeout(() => {
                                if (window.statusBallManager) {
                                    window.statusBallManager.removeState(STATUS_BALL_ID);
                                }
                            }, 3000);
                        }
                        
                        resolve(result);
                    },
                    onError: (requestId, error) => {
                        console.error(`记忆表格异步更新失败: ${description}`, error);
                        
                        // 隐藏悬浮球（失败时）
                        if (window.statusBallManager) {
                            window.statusBallManager.removeState(STATUS_BALL_ID);
                        }
                        
                        resolve(false);
                    }
                }
            );
        });
    }

    // 获取次要模型
    getSecondaryModel() {
        const secondaryModel = window.apiSettings?.secondaryModel;
        if (secondaryModel && secondaryModel !== 'sync_with_primary') {
            return secondaryModel;
        }
        // 如果没有配置次要模型，使用主要模型
        return window.apiSettings?.model || 'gpt-3.5-turbo';
    }

    // 获取最近的对话消息
    getRecentMessages(contact, count = 10) {
        if (!contact || !contact.messages) {
            return [];
        }
        
        return contact.messages
            .slice(-count) // 取最近的消息
            .map(msg => ({
                role: msg.type === 'user' ? 'user' : 'assistant',
                content: msg.content,
                timestamp: msg.timestamp
            }));
    }
}

// 创建全局记忆表管理器实例
window.memoryTableManager = new MemoryTableManager();

// 向全局作用域暴露主要函数，保持向后兼容
window.toggleMemoryPanel = function(forceClose = false) {
    return window.memoryTableManager.toggleMemoryPanel(forceClose);
};

window.toggleMemoryEditMode = function() {
    return window.memoryTableManager.toggleMemoryEditMode();
};

window.renderMemoryTable = function(markdown) {
    return window.memoryTableManager.renderMemoryTable(markdown);
};

window.updateMemoryTableWithSecondaryModel = function(contact, useAsync = true) {
    if (useAsync && window.memoryTableManager && window.memoryTableManager.updateMemoryTableAsync) {
        return window.memoryTableManager.updateMemoryTableAsync(contact);
    }
    return window.memoryTableManager.updateMemoryTableWithSecondaryModel(contact);
};

// 暴露默认模板
window.defaultMemoryTable = defaultMemoryTable;

// 自动初始化
document.addEventListener('DOMContentLoaded', function() {
    window.memoryTableManager.init();
});

// 导出模块（如果使用ES6模块）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MemoryTableManager,
        defaultMemoryTable
    };
}
