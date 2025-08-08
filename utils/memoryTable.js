// 默认记忆表模板
const defaultMemoryTable = `# 角色设定
- 姓名：
- 性格特点：
- 性别：
- 说话风格：
- 职业：

# 用户设定
- 姓名：
- 性别：
- 与角色的关系：
- 用户性格：

# 背景设定
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

### 【重要物品】
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
        this.MESSAGE_THRESHOLD = 10; // 每10条消息触发一次更新
        this.contactMemoryTracking = new Map(); // 跟踪每个联系人的消息处理状态
    }

    setCurrentContact(contact) {
        this.currentContact = contact;
        
        // 初始化联系人的记忆跟踪状态
        if (contact && !this.contactMemoryTracking.has(contact.id)) {
            this.contactMemoryTracking.set(contact.id, {
                lastProcessedMessageIndex: -1, // 已处理的最后一条消息索引
                messageCount: 0 // 自上次更新以来的消息计数
            });
        }
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
        
        if (isActive) {
            panel.classList.remove('active');
        } else {
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

        // 确保 marked 库已加载
        if (typeof marked !== 'undefined') {
            viewDiv.innerHTML = markdown 
                ? marked.parse(markdown) 
                : this.getEmptyMemoryTableHtml();
        } else {
            // Fallback if marked is not loaded
            viewDiv.innerHTML = `<pre>${markdown || '记忆表为空'}</pre>`;
        }
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

    // 检查并触发记忆表格更新
    async checkAndTriggerMemoryUpdate(contact) {
        if (!contact || !contact.messages) {
            return false;
        }

        const contactId = contact.id;
        const currentMessageCount = contact.messages.length;
        
        // 获取或初始化跟踪状态
        if (!this.contactMemoryTracking.has(contactId)) {
            this.contactMemoryTracking.set(contactId, {
                lastProcessedMessageIndex: -1,
                messageCount: 0
            });
        }

        const tracking = this.contactMemoryTracking.get(contactId);
        const newMessages = currentMessageCount - (tracking.lastProcessedMessageIndex + 1);
        
        // 累计新消息数
        tracking.messageCount += newMessages;
        tracking.lastProcessedMessageIndex = currentMessageCount - 1;

        console.log(`联系人 ${contact.name}: 新消息 ${newMessages} 条，累计 ${tracking.messageCount} 条`);

        // 检查是否达到更新阈值
        if (tracking.messageCount >= this.MESSAGE_THRESHOLD) {
            console.log(`达到更新阈值，触发记忆表格更新 - 联系人: ${contact.name}`);
            
            // 重置计数
            tracking.messageCount = 0;
            
            // 触发记忆表格更新
            try {
                await this.triggerMemoryUpdate(contact);
                return true;
            } catch (error) {
                console.error('记忆表格更新失败:', error);
                return false;
            }
        }

        return false;
    }

    // 触发记忆表格更新
    async triggerMemoryUpdate(contact) {
        if (!contact || !window.promptBuilder) {
            console.warn('无法触发记忆表格更新：缺少必要的对象');
            return false;
        }

        try {
            // 获取最近的消息用于更新记忆表格
            const recentMessages = contact.messages.slice(-20); // 取最近20条消息
            const userProfile = window.userProfile || { name: '用户', personality: '' };
            const apiSettings = window.apiSettings || { contextMessageCount: 10 };

            // 构建记忆表格更新提示词
            const memoryUpdatePrompt = window.promptBuilder.buildMemoryUpdatePrompt(
                contact, 
                userProfile, 
                contact, 
                apiSettings, 
                recentMessages
            );

            console.log('发送记忆表格更新请求...');
            
            // 调用API更新记忆表格
            const response = await this.callMemoryUpdateAPI(memoryUpdatePrompt);
            
            if (response && !response.includes('无需更新')) {
                // 更新联系人的记忆表格内容
                contact.memoryTableContent = response;
                
                // 保存到数据库
                if (window.saveDataToDB) {
                    await window.saveDataToDB();
                }
                
                console.log(`记忆表格已更新 - 联系人: ${contact.name}`);
                
                // 如果记忆面板打开，刷新显示
                const memoryPanel = document.getElementById('memoryPanel');
                if (memoryPanel && memoryPanel.classList.contains('active')) {
                    this.renderMemoryTable(response);
                }
                
                return true;
            } else {
                console.log(`AI回复无需更新记忆表格 - 联系人: ${contact.name}`);
                return false;
            }
        } catch (error) {
            console.error('记忆表格更新过程中发生错误:', error);
            return false;
        }
    }

    // 调用记忆表格更新API
    async callMemoryUpdateAPI(prompt) {
        if (!window.chatAPI || !window.apiSettings) {
            throw new Error('API配置未找到');
        }

        try {
            // 构建API请求消息
            const messages = [
                {
                    role: 'user',
                    content: prompt
                }
            ];

            // 调用聊天API
            const response = await window.chatAPI.sendMessage(messages, {
                ...window.apiSettings,
                temperature: 0.3 // 使用较低的temperature确保更一致的输出
            });

            return response.trim();
        } catch (error) {
            console.error('记忆更新API调用失败:', error);
            throw error;
        }
    }

    // 手动触发记忆表格更新（供外部调用）
    async manualTriggerMemoryUpdate(contact = null) {
        const targetContact = contact || this.getCurrentContact();
        if (!targetContact) {
            if (window.showToast) {
                window.showToast('请先选择一个聊天');
            }
            return false;
        }

        return await this.triggerMemoryUpdate(targetContact);
    }

    // 重置联系人的消息计数
    resetMessageCount(contactId) {
        if (this.contactMemoryTracking.has(contactId)) {
            const tracking = this.contactMemoryTracking.get(contactId);
            tracking.messageCount = 0;
        }
    }

    // 获取联系人的消息统计
    getContactMessageStats(contactId) {
        if (this.contactMemoryTracking.has(contactId)) {
            return { ...this.contactMemoryTracking.get(contactId) };
        }
        return {
            lastProcessedMessageIndex: -1,
            messageCount: 0
        };
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

// 暴露记忆表格相关方法
window.checkAndTriggerMemoryUpdate = function(contact) {
    return window.memoryTableManager.checkAndTriggerMemoryUpdate(contact);
};

window.manualTriggerMemoryUpdate = function(contact = null) {
    return window.memoryTableManager.manualTriggerMemoryUpdate(contact);
};

window.getContactMessageStats = function(contactId) {
    return window.memoryTableManager.getContactMessageStats(contactId);
};

window.resetMessageCount = function(contactId) {
    return window.memoryTableManager.resetMessageCount(contactId);
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
