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
