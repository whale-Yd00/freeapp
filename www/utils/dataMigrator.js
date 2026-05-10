/*
 * [Whale-LLT]
 * Copyright (C) [2025] [Xuan Jing]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/**
 * IndexedDB 导入导出模块
 */

class IndexedDBManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.dbVersion = 14; // 结构化记忆 memoryEpisodes / memoryFacts
        this.db = null;
        
        // 定义所有对象存储的结构
        this.stores = {
            songs: { keyPath: 'id', autoIncrement: true },
            contacts: { keyPath: 'id' },
            apiSettings: { keyPath: 'id' },
            emojis: { keyPath: 'id' },
            emojiBlobs: { keyPath: 'id' },
            backgrounds: { keyPath: 'id' },
            userProfile: { keyPath: 'id' },
            moments: { keyPath: 'id' },
            weiboPosts: { keyPath: 'id', autoIncrement: true },
            hashtagCache: { keyPath: 'id' },
            customStyles: { keyPath: 'id' }, // 【核心修正】: 恢复这一行，不再注释
            customModels: { keyPath: 'id' },
            bubbleStickers: { keyPath: 'id' },
            bubbleStyles: { keyPath: 'id' }, // 新的样式库表
            todoItems: { keyPath: 'id', autoIncrement: true } // 新的待办事项表
        };
    }

    /**
     * 初始化数据库连接
     */
    async initDB() {
        // 如果已经有现有的db实例，直接使用
        if (window.db && window.isIndexedDBReady) {
            this.db = window.db;
            this.dbVersion = window.db.version;
            return this.db;
        }
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('数据库打开失败:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建所有对象存储（如果不存在）
                Object.entries(this.stores).forEach(([storeName, config]) => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, config);
                    }
                });

                if (!db.objectStoreNames.contains('memoryEpisodes')) {
                    const memoryEpisodesStore = db.createObjectStore('memoryEpisodes', { keyPath: 'id' });
                    memoryEpisodesStore.createIndex('contactId', 'contactId', { unique: false });
                    memoryEpisodesStore.createIndex('createdAt', 'createdAt', { unique: false });
                    memoryEpisodesStore.createIndex('type', 'type', { unique: false });
                }
                if (!db.objectStoreNames.contains('memoryFacts')) {
                    const memoryFactsStore = db.createObjectStore('memoryFacts', { keyPath: 'id' });
                    memoryFactsStore.createIndex('contactId', 'contactId', { unique: false });
                    memoryFactsStore.createIndex('subject', 'subject', { unique: false });
                    memoryFactsStore.createIndex('predicate', 'predicate', { unique: false });
                    memoryFactsStore.createIndex('status', 'status', { unique: false });
                    memoryFactsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    memoryFactsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
        });
    }

    /**
     * 获取数据库版本信息
     */
    async getDatabaseInfo() {
        if (!this.db) {
            await this.initDB();
        }
        
        return {
            name: this.db.name,
            version: this.db.version,
            stores: Array.from(this.db.objectStoreNames),
            exportTime: new Date().toISOString()
        };
    }

    /**
     * 导出整个数据库
     * @param {Object} options - 导出选项
     * @returns {Object} 导出的数据
     */
    async exportDatabase(options = {}) {
        try {
            if (!this.db) {
                await this.initDB();
            }

            const { stores = null, includeMetadata = true } = options;
            const exportData = {};
            
            // 添加元数据
            if (includeMetadata) {
                exportData._metadata = await this.getDatabaseInfo();
            }

            // 确定要导出的存储
            const storesToExport = stores || Array.from(this.db.objectStoreNames);
            
            // 导出每个对象存储的数据
            for (const storeName of storesToExport) {
                if (this.db.objectStoreNames.contains(storeName)) {
                    exportData[storeName] = await this.exportStore(storeName);
                }
            }

            // =======================================================
            // [新增] 尝试导出线下模式数据并打包进同一个文件
            // =======================================================
            try {
                const offlineData = await this.exportSillyTavernData();
                if (offlineData) {
                    // 将线下数据存在一个独立的字段里，互不干扰
                    exportData.sillyTavernOffline = offlineData;
                    console.log("已成功打包线下模式数据");
                }
            } catch (err) {
                console.warn("导出线下模式数据时遇到小问题（可忽略）:", err);
            }
            // =======================================================

            return exportData;
            
        } catch (error) {
            console.error('数据库导出失败:', error);
            throw new Error(`导出失败: ${error.message}`);
        }
    }

    /**
     * 导出单个对象存储
     * @param {string} storeName - 存储名称
     * @returns {Array} 存储中的所有数据
     */
    async exportStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * 导入数据库
     * @param {Object} importData - 要导入的数据
     * @param {Object} options - 导入选项
     */
    /**
     * [修改版] 导入数据库
     * 功能：兼容旧版本数据，自动忽略未知的表，自动填充存在的表
     */
    async importDatabase(importData, options = {}) {
        try {
            const { 
                overwrite = false, 
                // validateVersion = true, // [修改] 不再强制验证版本，改为自动兼容
                stores = null 
            } = options;

            if (!this.db) {
                await this.initDB();
            }

            // 1. 基础格式验证
            if (!importData || typeof importData !== 'object') {
                throw new Error('导入数据格式无效');
            }

            // 2. [修改] 版本检查逻辑改为：仅做日志提示，不阻断流程
            const fileVersion = importData._metadata ? importData._metadata.version : '未知';
            console.log(`正在导入数据... 文件版本: ${fileVersion}, 当前数据库版本: ${this.dbVersion}`);
            
            if (fileVersion !== this.dbVersion) {
                console.warn('版本不一致，正在尝试自动兼容模式导入...');
            }

            // 3. 确定要导入的存储
            // 过滤掉 '_metadata'，只获取数据表名称
            const fileStoreNames = Object.keys(importData).filter(key => key !== '_metadata' && key !== 'sillyTavernOffline');
            
            // 4. 清空现有数据（如果选择覆盖）
            // 注意：这里只清空那些“既在备份文件里有，又在当前数据库里有”的表，或者强制清空所有当前表
            if (overwrite) {
                const currentStoreNames = Array.from(this.db.objectStoreNames);
                for (const storeName of currentStoreNames) {
                    // 只有当我们要导入这个表的数据时，才清空它？
                    // 或者：既然是完全覆盖，应该清空所有表，防止旧数据残留混合
                    // 建议：为了安全，只清空当前数据库中存在的表
                    await this.clearStore(storeName);
                }
            }

            // 5. [核心修改] 智能导入数据
            const importResults = {};
            
            // 遍历备份文件中的所有表
            for (const storeName of fileStoreNames) {
                // 检查：当前数据库是否存在这个表？
                if (this.db.objectStoreNames.contains(storeName)) {
                    // 存在 -> 导入数据
                    console.log(`正在导入表: ${storeName}`);
                    const result = await this.importStore(storeName, importData[storeName], overwrite);
                    importResults[storeName] = result;
                } else {
                    // 不存在 -> 跳过（说明这是旧版本的废弃表，或者当前版本还没建这个表）
                    console.warn(`跳过表 ${storeName}: 当前数据库中不存在此表结构`);
                }
            }

            // 6. [补充逻辑] 检查那些“当前数据库有，但备份文件里没有”的表
            // 这些表会自动保持为空（因为上面overwrite清空了），这符合“自动补充表头”的逻辑
            // 不需要额外代码，因为 IndexedDB 已经初始化了这些空表。

            // =======================================================
            // [新增] 检测并导入线下模式数据
            // =======================================================
            if (importData.sillyTavernOffline) {
                console.log("检测到线下模式备份数据，正在恢复...");
                try {
                    // 调用刚才写的新方法，传入 overwrite 参数确保逻辑一致
                    await this.importSillyTavernData(importData.sillyTavernOffline, overwrite);
                    importResults['sillyTavernOffline'] = { success: true, message: "线下数据恢复成功" };
                } catch (err) {
                    console.error("恢复线下数据失败:", err);
                    importResults['sillyTavernOffline'] = { success: false, error: err.message };
                }
            }
            // =======================================================

            return { 
                success: true, 
                message: "兼容模式导入完成 (含线下数据)",
                importedStores: Object.keys(importResults), 
                results: importResults 
            };
            
        } catch (error) {
            console.error('数据库导入失败:', error);
            throw new Error(`导入失败: ${error.message}`);
        }
    }

    /**
     * 导入单个对象存储的数据
     * @param {string} storeName - 存储名称
     * @param {Array} data - 要导入的数据
     * @param {boolean} overwrite - 是否覆盖现有数据
     */
    async importStore(storeName, data, overwrite = false) {
        return new Promise((resolve, reject) => {
            if (!Array.isArray(data)) {
                reject(new Error(`存储 ${storeName} 的数据必须是数组格式`));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            let successCount = 0;
            let errorCount = 0;
            let completedCount = 0;
            const totalCount = data.length;
            
            if (totalCount === 0) {
                resolve({ successCount: 0, errorCount: 0, totalCount: 0 });
                return;
            }

            const processItem = (item, index) => {
                try {
                    // [修改] 深度克隆对象，防止引用问题
                    let processedItem = JSON.parse(JSON.stringify(item));
                    
                    // --- [新增] 数据清洗与补全逻辑 ---
                    
                    // 1. 针对 contacts (联系人) 表的补全
                    if (storeName === 'contacts') {
                        // 如果旧数据没有 voiceId，补全为空字符串
                        if (processedItem.voiceId === undefined) processedItem.voiceId = '';
                        // 如果旧数据没有 bubbleStyleId，补全为空
                        if (processedItem.bubbleStyleId === undefined) processedItem.bubbleStyleId = '';
                        // 如果旧数据没有 memoryTableContent，补全默认值
                        if (processedItem.memoryTableContent === undefined) {
                             processedItem.memoryTableContent = "## 📋 记忆表格\n\n### 【现在】\n| 项目 | 内容 |\n|------|------|\n| 地点 | 未知 |\n| 时间 | 未知 |\n";
                        }
                    }

                    // 2. 针对 userProfile (用户资料) 表的补全
                    if (storeName === 'userProfile') {
                        // 补全钱包数据
                        if (processedItem.wallet === undefined) {
                            processedItem.wallet = { balance: 0, transactions: [] };
                        }
                        if (processedItem.bubbleStyleId === undefined) processedItem.bubbleStyleId = '';
                    }

                    // 3. 针对 apiSettings (设置) 表的补全
                    if (storeName === 'apiSettings') {
                        if (processedItem.minimaxGroupId === undefined) processedItem.minimaxGroupId = '';
                        if (processedItem.minimaxApiKey === undefined) processedItem.minimaxApiKey = '';
                        if (processedItem.secondaryModel === undefined) processedItem.secondaryModel = 'sync_with_primary';
                    }
                    
                    // --------------------------------

                    // 处理 ID 逻辑 (保持你原有的逻辑不变)
                    if (storeName === 'apiSettings' && !processedItem.id) processedItem.id = 'settings';
                    else if (storeName === 'userProfile' && !processedItem.id) processedItem.id = 'profile';
                    else if (storeName === 'backgrounds' && !processedItem.id) processedItem.id = 'backgroundsMap';
                    else if (storeName === 'hashtagCache' && !processedItem.id) processedItem.id = 'cache';
                    else if (storeName === 'bubbleStyles' && !processedItem.id) processedItem.id = 'styles';

                    // 执行写入
                    const request = store.put(processedItem); 
                    
                    request.onsuccess = () => {
                        successCount++;
                        completedCount++;
                        if (completedCount === totalCount) {
                            resolve({ successCount, errorCount, totalCount });
                        }
                    };
                    
                    request.onerror = (event) => {
                        errorCount++;
                        completedCount++;
                        console.warn(`导入第 ${index + 1} 条记录失败 (${storeName}):`, event.target.error);
                        if (completedCount === totalCount) {
                            resolve({ successCount, errorCount, totalCount });
                        }
                    };
                } catch (error) {
                    errorCount++;
                    completedCount++;
                    console.error(`处理第 ${index + 1} 条记录时出错 (${storeName}):`, error);
                    if (completedCount === totalCount) {
                        resolve({ successCount, errorCount, totalCount });
                    }
                }
            };
            
            transaction.onerror = (event) => {
                reject(new Error(`事务失败 (${storeName}): ${event.target.error}`));
            };
            
            // 开始处理所有数据项
            data.forEach((item, index) => {
                processItem(item, index);
            });
        });
    }

    /**
     * 清空指定存储
     * @param {string} storeName - 存储名称
     */
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                console.error(`清空存储 ${storeName} 失败:`, request.error);
                reject(request.error);
            };
            
            transaction.onerror = () => {
                console.error(`清空存储 ${storeName} 的事务失败:`, transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * 下载导出文件或通过原生接口保存
     * @param {Object} exportData - 导出的数据
     * @param {string} filename - 文件名（可选）
     */
    downloadExport(exportData, filename = null) {
        try {
            const dataStr = JSON.stringify(exportData, null, 2);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const finalFilename = filename || `whale-chat-backup-${timestamp}.json`;

            // 检查是否存在原生安卓接口
            if (window.Android && typeof window.Android.saveFile === 'function') {
                // 调用原生接口保存文件
                window.Android.saveFile(dataStr, finalFilename);
                // 原生代码会显示Toast，所以JS端不需要再显示
            } else {
                // 降级使用网页下载方式
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                
                a.href = url;
                a.download = finalFilename;
                
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                URL.revokeObjectURL(url);

                if (typeof showToast === 'function') {
                    showToast('备份文件已开始下载！');
                }
            }
            
        } catch (error) {
            console.error('文件导出/下载失败:', error);
            throw new Error(`导出失败: ${error.message}`);
        }
    }

    /**
     * 从文件读取导入数据
     * @param {File} file - 要读取的文件
     * @returns {Object} 解析后的数据
     */
    async readImportFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('请选择要导入的文件'));
                return;
            }
            
            if (!file.name.endsWith('.json')) {
                reject(new Error('只支持 JSON 格式的备份文件'));
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const data = JSON.parse(text);
                    resolve(data);
                } catch (error) {
                    console.error('JSON解析失败:', error);
                    reject(new Error('文件格式错误，无法解析 JSON'));
                }
            };
            
            reader.onerror = () => {
                console.error('文件读取失败:', reader.error);
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsText(file, 'utf-8');
        });
    }

    /**
     * 获取数据库统计信息
     */
    async getStatistics() {
        if (!this.db) {
            await this.initDB();
        }
        
        const stats = {};
        
        for (const storeName of this.db.objectStoreNames) {
            const count = await this.getStoreCount(storeName);
            stats[storeName] = count;
        }
        
        return stats;
    }

    /**
     * 获取存储中的记录数量
     * @param {string} storeName - 存储名称
     */
    async getStoreCount(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 验证导入数据的完整性
     * @param {Object} importData - 要验证的数据
     */
    validateImportData(importData) {
        const errors = [];
        const warnings = [];
        
        // 基本格式检查
        if (!importData || typeof importData !== 'object') {
            errors.push('数据格式无效');
            return { valid: false, errors, warnings };
        }
        
        // 版本检查
        if (importData._metadata) {
            if (importData._metadata.version !== this.dbVersion) {
                warnings.push(`版本不匹配：当前 ${this.dbVersion}，导入 ${importData._metadata.version}`);
            }
        } else {
            warnings.push('缺少元数据信息');
        }
        
        // 存储结构检查
        const validStores = Object.keys(this.stores);
        // 【核心修正】在过滤器中把 'sillyTavernOffline' 也排除掉，防止它被当成普通表去验证
         const importStores = Object.keys(importData).filter(key => key !== '_metadata' && key !== 'sillyTavernOffline');

        for (const storeName of importStores) {
            if (!validStores.includes(storeName)) {
                warnings.push(`未知的存储: ${storeName}`);
            }
            
            if (!Array.isArray(importData[storeName])) {
                errors.push(`存储 ${storeName} 的数据格式无效（应为数组）`);
            }
        }
        
        const result = {
            valid: errors.length === 0,
            errors,
            warnings,
            storeCount: importStores.length
        };
        
        return result;
    }

    // ==========================================
    // [新增] 线下模式数据处理专用区域 (SillyTavernOfflineDB)
    // ==========================================

    /**
     * 连接到线下模式数据库
     */
    async openOfflineDB() {
        return new Promise((resolve, reject) => {
            // 线下模式的版本是 3 (根据你提供的html文件)
            const request = indexedDB.open('SillyTavernOfflineDB', 3);
            request.onerror = () => resolve(null); // 如果不存在或打不开，返回 null，不阻断主流程
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * [关键] 导出线下模式数据
     * 特别注意：保留 chatHistories 和 miscData 的 Key
     */
    async exportSillyTavernData() {
        const offlineDB = await this.openOfflineDB();
        if (!offlineDB) return null;

        const result = {};
        const storeNames = Array.from(offlineDB.objectStoreNames);

        for (const storeName of storeNames) {
            result[storeName] = await new Promise((resolve, reject) => {
                const transaction = offlineDB.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                
                // 判断是否是依赖 Key 的表 (chatHistories, miscData)
                // 依据你的 html 代码，characters, summaries, characterStates 都有 keyPath
                if (store.keyPath) {
                    // 有 keyPath 的表 (如 characters)，数据本身包含 ID，直接 getAll
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve([]);
                } else {
                    // [核心修改] 没有 keyPath 的表 (chatHistories, miscData)
                    // 必须手动收集 Key 和 Value，否则导入时不知道属于谁
                    const items = [];
                    const request = store.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            items.push({
                                key: cursor.key,   // 保留 Key (例如角色ID)
                                value: cursor.value // 保留内容 (例如聊天记录数组)
                            });
                            cursor.continue();
                        } else {
                            resolve(items);
                        }
                    };
                    request.onerror = () => resolve([]);
                }
            });
        }
        offlineDB.close();
        return result;
    }

    /**
     * [关键] 导入线下模式数据
     * 特别注意：恢复 Key-Value 对应关系
     */
    async importSillyTavernData(data, overwrite = false) {
        if (!data) return;
        
        // 打开数据库，版本号必须匹配
        const request = indexedDB.open('SillyTavernOfflineDB', 3);
        
        return new Promise((resolve, reject) => {
            request.onupgradeneeded = (event) => {
                // 如果用户从未打开过线下模式，这里需要建表，防止报错
                // 复制自 线下.html 的建表逻辑
                const db = event.target.result;
                const STORES = {
                    characters: 'characters',
                    chatHistories: 'chatHistories',
                    summaries: 'summaries',
                    characterStates: 'characterStates',
                    miscData: 'miscData'
                };
                if (!db.objectStoreNames.contains(STORES.characters)) db.createObjectStore(STORES.characters, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(STORES.chatHistories)) db.createObjectStore(STORES.chatHistories); // 无 keyPath
                if (!db.objectStoreNames.contains(STORES.miscData)) db.createObjectStore(STORES.miscData); // 无 keyPath
                if (!db.objectStoreNames.contains(STORES.summaries)) {
                    const s = db.createObjectStore(STORES.summaries, { keyPath: 'id' });
                    s.createIndex('characterId', 'characterId', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORES.characterStates)) db.createObjectStore(STORES.characterStates, { keyPath: 'characterId' });
            };

            request.onsuccess = async (event) => {
                const db = event.target.result;
                const storeNames = Object.keys(data);
                
                // 开启大事务
                // 过滤出数据库中实际存在的表，防止数据文件里有非法表名导致事务崩溃
                const validStoreNames = storeNames.filter(name => db.objectStoreNames.contains(name));
                if (validStoreNames.length === 0) {
                    db.close();
                    resolve();
                    return;
                }

                const transaction = db.transaction(validStoreNames, 'readwrite');

                for (const storeName of validStoreNames) {
                    const store = transaction.objectStore(storeName);
                    if (overwrite) {
                        await store.clear(); // 如果是覆盖模式，先清空
                    }

                    const items = data[storeName];
                    if (!Array.isArray(items)) continue;

                    items.forEach(item => {
                        // 判断是否是特殊的 Key-Value 结构
                        // 我们在导出时，给无 keyPath 的表包装成了 {key:..., value:...}
                        if (!store.keyPath && item.key !== undefined && item.value !== undefined) {
                            // [核心恢复] 使用 put(value, key) 恢复数据的所有权
                            store.put(item.value, item.key);
                        } else {
                            // 普通表，直接 put(value)
                            store.put(item);
                        }
                    });
                }

                transaction.oncomplete = () => {
                    db.close();
                    console.log("线下模式数据导入完成");
                    resolve();
                };
                transaction.onerror = (e) => {
                    console.error("线下模式导入失败", e);
                    db.close(); // 出错也要关闭
                    resolve(); // resolve 以免阻断主程序
                };
            };
            
            request.onerror = (e) => {
                console.error("无法打开线下数据库进行导入", e);
                resolve();
            };
        });
    }
    // ==========================================
    // [结束] 线下模式数据处理专用区域
    // ==========================================

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// 创建全局实例
const dbManager = new IndexedDBManager();

// HTML界面相关函数
// 文件选择触发函数
async function triggerFileSelect() {
    const isCapacitor = typeof window.capacitorExports !== 'undefined' && 
                        typeof window.capacitorExports.FilePicker !== 'undefined';
                        
    if (isCapacitor) {
        try {
            const { FilePicker } = window.capacitorExports;
            
            const result = await FilePicker.pickFiles({
                types: ['application/json'],
                readData: true, // 直接读取文件内容
            });

            if (result.files.length > 0) {
                const file = result.files[0];
                const jsonString = atob(file.data); // 文件内容是base64编码的，需要解码
                
                try {
                    const data = JSON.parse(jsonString);

                    // 确认导入
                    const firstConfirmMessage = '导入数据库将完全覆盖现有数据！\n\n这将删除：\n• 所有聊天记录和联系人\n• 用户资料和设置\n• 朋友圈动态和论坛帖子\n• 音乐库和表情包\n\n确定要继续吗？';
                    const secondConfirmMessage = '再次确认：此操作不可撤销！\n确定要用备份文件覆盖当前所有数据吗？';
                    
                    if (confirm(firstConfirmMessage)) {
                        if (confirm(secondConfirmMessage)) {
                            // 我们需要创建一个类似文件的对象来与现有代码兼容
                            const fileObj = new Blob([jsonString], {type: 'application/json'});
                            fileObj.name = file.name;
                            
                            await performImport(fileObj, true);
                        }
                    }
                } catch (err) {
                    console.error('JSON解析失败:', err);
                    showToast('文件格式错误，无法解析 JSON');
                }
            }
        } catch (error) {
            console.error('选择或读取文件失败:', error);
            showToast(`导入失败: ${error.message}`);
            
            // 降级到传统方法
            const fileInput = document.getElementById('importFileInput');
            if (fileInput) {
                fileInput.click();
            }
        }
    } else {
        // 使用传统的Web方法
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.click();
        } else {
            console.error('未找到文件输入元素！');
            alert('未找到文件输入元素，请检查页面');
        }
    }
}

// 文件选择处理函数
function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }
    
    if (typeof window.importDatabase === 'function') {
        window.importDatabase(file);
    } else {
        console.error('importDatabase 函数不存在！');
        alert('导入功能未正确加载，请刷新页面后重试');
    }
}

// 全局UI函数已移至script.js

// 导出数据库
window.exportDatabase = async function() {
    try {
        if (typeof showToast === 'function') {
            showToast('正在导出数据库...');
        }
        
        // 【核心改动】直接调用 DatabaseManager 的导出和下载方法
        // 这个方法内部会检查 window.Android 接口
        const result = await window.DatabaseManager.exportAndDownload();
        
        if (result.success) {
            // 在非安卓环境下（即网页版），原生代码不会显示Toast，所以这里可以补一个
            if (!window.Android || typeof window.Android.saveFile !== 'function') {
                if (typeof showToast === 'function') {
                    showToast('数据库导出成功！');
                } else {
                    alert('数据库导出成功！');
                }
            }
            // 如果是在安卓App中，Java代码会自己显示Toast，JS端不需要再显示
        } else {
            // 处理导出失败的情况
            if (typeof showToast === 'function') {
                showToast('导出失败: ' + result.error);
            } else {
                alert('导出失败: ' + result.error);
            }
        }
    } catch (error) {
        if (typeof showToast === 'function') {
            showToast('导出出错: ' + error.message);
        } else {
            alert('导出出错: ' + error.message);
        }
        console.error('导出数据库失败:', error);
    }
};

// 导入数据库 - 强制覆盖模式
window.importDatabase = async function(file) {
    if (!file) {
        return;
    }
    
    const firstConfirmMessage = '导入数据库将完全覆盖现有数据！\n\n这将删除：\n• 所有聊天记录和联系人\n• 用户资料和设置\n• 朋友圈动态和论坛帖子\n• 音乐库和表情包\n\n确定要继续吗？';
    const secondConfirmMessage = '再次确认：此操作不可撤销！\n确定要用备份文件覆盖当前所有数据吗？';
    
    // 使用原生 confirm 对话框避免嵌套问题
    if (confirm(firstConfirmMessage)) {
        if (confirm(secondConfirmMessage)) {
            await performImport(file, true); // 强制覆盖
        }
    }
    
    // 重置文件输入
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) {
        fileInput.value = '';
    }
};

async function performImport(file, overwrite) {
    try {
        if (typeof showToast === 'function') {
            showToast('正在导入数据库...');
        }
        
        if (!window.DatabaseManager) {
            console.error('window.DatabaseManager 不存在！');
            alert('数据库管理器未初始化，请刷新页面后重试');
            return;
        }
        
        if (!window.DatabaseManager.importFromFile) {
            console.error('importFromFile 方法不存在！');
            alert('导入功能不可用，请检查代码');
            return;
        }
        
        const result = await window.DatabaseManager.importFromFile(file, overwrite);
        
        if (result.success) {
            // 刷新统计信息
            if (typeof window.refreshDatabaseStats === 'function') {
                window.refreshDatabaseStats();
            }
            
            // 清空内存中的数据，确保数据同步
            if (typeof window.contacts !== 'undefined') {
                window.contacts = [];
            }
            if (typeof window.currentContact !== 'undefined') {
                window.currentContact = null;
            }
            if (typeof window.emojis !== 'undefined') {
                window.emojis = [];
            }
            if (typeof window.backgrounds !== 'undefined') {
                window.backgrounds = {};
            }
            if (typeof window.userProfile !== 'undefined') {
                window.userProfile = { name: '我的昵称', avatar: '', personality: '' };
            }
            if (typeof window.moments !== 'undefined') {
                window.moments = [];
            }
            if (typeof window.weiboPosts !== 'undefined') {
                window.weiboPosts = [];
            }
            
            // 显示成功消息
            const successMessage = `导入成功！\n导入了 ${result.result?.importedStores?.length || '多个'} 个数据表\n页面将自动刷新以更新显示`;
            
            if (typeof showToast === 'function') {
                showToast('导入成功！正在刷新页面以应用新数据...');
            }
            
            // 显示警告信息（如果有）
            if (result.validation && result.validation.warnings.length > 0) {
                alert('导入成功，但有以下警告，请及时截图:\n' + result.validation.warnings.join('\n') + '\n\n页面即将刷新');
            } else {
                alert(successMessage);
            }
            
            // 自动刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } else {
            console.error('导入失败:', result.error);
            if (typeof showToast === 'function') {
                showToast('导入失败: ' + result.error);
            } else {
                alert('导入失败: ' + result.error);
            }
            
            if (result.validation) {
                console.error('验证详情:', result.validation);
            }
        }
    } catch (error) {
        console.error('performImport 函数出错:', error);
        if (typeof showToast === 'function') {
            showToast('导入出错: ' + error.message);
        } else {
            alert('导入出错: ' + error.message);
        }
    }
}

// 扩展现有的showApiSettingsModal函数
window.enhanceApiSettingsModal = function() {
    if (typeof window.showApiSettingsModal === 'function') {
        const originalShowApiSettingsModal = window.showApiSettingsModal;
        window.showApiSettingsModal = function() {
            originalShowApiSettingsModal.call(this);
            // 延迟加载统计信息，确保模态框已显示
            setTimeout(() => {
                if (typeof window.refreshDatabaseStats === 'function') {
                    window.refreshDatabaseStats();
                }
            }, 300);
        };
    }
};

// 导出功能函数，供HTML界面调用
window.DatabaseManager = {
    
    /**
     * 初始化数据库 - 使用现有的db实例
     */
    async init() {
        try {
            // 如果已经有现有的db实例，直接使用
            if (window.db && window.isIndexedDBReady) {
                dbManager.db = window.db;
                dbManager.dbVersion = window.db.version;
                return { success: true };
            } else {
                await dbManager.initDB();
                return { success: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 导出数据库数据
     */
    async exportData() {
        try {
            const data = await dbManager.exportDatabase();
            return data;
        } catch (error) {
            throw error;
        }
    },
    
    /**
     * 导出数据库并下载
     */
    async exportAndDownload() {
        try {
            const data = await dbManager.exportDatabase();
            dbManager.downloadExport(data);
            return { success: true, message: '导出成功！' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 从文件导入数据库
     * @param {File} file - 导入文件
     * @param {boolean} overwrite - 是否覆盖现有数据
     */
    async importFromFile(file, overwrite = false) {
        try {
            const importData = await dbManager.readImportFile(file);
            
            // [修改] 验证数据 (即使有警告也继续)
            const validation = dbManager.validateImportData(importData);
            
            if (!validation.valid) {
                return { 
                    success: false, 
                    error: '数据格式严重错误，无法解析：' + validation.errors.join(', '),
                    validation 
                };
            }
            
            // [修改] 调用导入，不需要 validateVersion: true，因为我们已经内置了兼容逻辑
            const result = await dbManager.importDatabase(importData, { 
                overwrite,
                validateVersion: false // 显式关闭版本验证
            });
            
            return { 
                success: true, 
                message: `导入成功！导入了 ${result.importedStores?.length || 0} 个数据表`,
                result,
                validation 
            };
            
        } catch (error) {
            console.error('导入过程出错:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 获取数据库统计信息
     */
    async getStats() {
        try {
            const stats = await dbManager.getStatistics();
            return { success: true, stats };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// 页面加载完成后初始化
if (typeof document !== 'undefined') {
    // 立即初始化数据库管理器，不再使用setTimeout延迟
    const initialize = () => {
        window.DatabaseManager.init().then(result => {
            if (result.success) {
                if (typeof window.enhanceApiSettingsModal === 'function') {
                    window.enhanceApiSettingsModal();
                }
            } else {
                console.error('数据库管理器初始化失败:', result.error);
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}

// 将HTML中的script内容整合到这里
window.triggerFileSelect = triggerFileSelect;
window.handleFileSelect = handleFileSelect;
