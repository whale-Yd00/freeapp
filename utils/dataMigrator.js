/**
 * IndexedDB 导入导出模块
 */

class IndexedDBManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.dbVersion = 7;
        this.db = null;
        
        // 定义不参与手动导入导出的存储（图片等大数据）
        this.excludedFromManualExport = ['emojiImages'];
        
        // 定义所有对象存储的结构
        this.stores = {
            songs: { keyPath: 'id', autoIncrement: true },
            contacts: { keyPath: 'id' },
            apiSettings: { keyPath: 'id' },
            emojis: { keyPath: 'id' },
            emojiImages: { keyPath: 'tag' }, // 存储表情图片的base64数据
            backgrounds: { keyPath: 'id' },
            userProfile: { keyPath: 'id' },
            moments: { keyPath: 'id' },
            weiboPosts: { keyPath: 'id', autoIncrement: true },
            hashtagCache: { keyPath: 'id' },
            characterMemories: { keyPath: 'contactId' },
            conversationCounters: { keyPath: 'id' },
            globalMemory: { keyPath: 'id' },
            memoryProcessedIndex: { keyPath: 'contactId' }
        };
    }

    /**
     * 检查并自动升级现有数据库
     */
    async autoUpgradeDatabase() {
        try {
            console.log('正在检查数据库版本...');
            
            // 先检查现有数据库版本（不进行升级）
            const currentVersion = await this.getCurrentDatabaseVersion();
            
            if (currentVersion < this.dbVersion) {
                console.log(`检测到旧版本数据库 (版本 ${currentVersion})，开始自动升级到版本 ${this.dbVersion}`);
                
                // 导出现有数据
                const exportedData = await this.exportDatabase();
                console.log('现有数据导出完成');
                
                // 关闭现有连接
                if (this.db) {
                    this.db.close();
                    this.db = null;
                }
                
                // 删除旧数据库，重新创建新版本
                await this.deleteDatabase();
                console.log('旧数据库已删除');
                
                // 重新初始化新版本数据库
                await this.initDB();
                console.log('新版本数据库已创建');
                
                // 迁移数据
                const migratedData = await this.migrateData(exportedData);
                console.log('数据迁移完成');
                
                // 导入迁移后的数据
                await this.importDatabase(migratedData, { 
                    overwrite: true,
                    validateVersion: false,
                    enableMigration: false  // 数据已经迁移过了
                });
                console.log('数据导入完成');
                
                // 显示升级成功消息
                if (typeof showToast === 'function') {
                    showToast(`数据库已自动从版本 ${currentVersion} 升级到版本 ${this.dbVersion}`);
                } else {
                    console.log(`数据库已自动从版本 ${currentVersion} 升级到版本 ${this.dbVersion}`);
                }
                
                return { upgraded: true, fromVersion: currentVersion, toVersion: this.dbVersion };
            } else {
                console.log(`数据库版本正常 (版本 ${currentVersion})`);
                return { upgraded: false, currentVersion };
            }
            
        } catch (error) {
            console.error('自动升级数据库时出错:', error);
            // 如果升级失败，仍然尝试正常初始化
            await this.initDB();
            throw error;
        }
    }

    /**
     * 获取当前数据库版本（不进行升级）
     */
    async getCurrentDatabaseVersion() {
        return new Promise((resolve, reject) => {
            // 先尝试打开数据库，不指定版本
            const request = indexedDB.open(this.dbName);
            
            request.onsuccess = () => {
                const db = request.result;
                const version = db.version;
                db.close();
                resolve(version);
            };
            
            request.onerror = () => {
                console.log('数据库不存在，将创建新数据库');
                resolve(0); // 数据库不存在，返回版本0
            };
            
            request.onupgradeneeded = () => {
                // 取消升级操作
                const db = request.result;
                const version = db.version;
                db.close();
                resolve(version);
            };
        });
    }

    /**
     * 删除数据库
     */
    async deleteDatabase() {
        return new Promise((resolve, reject) => {
            const deleteRequest = indexedDB.deleteDatabase(this.dbName);
            
            deleteRequest.onsuccess = () => {
                console.log('数据库删除成功');
                resolve();
            };
            
            deleteRequest.onerror = () => {
                console.error('数据库删除失败:', deleteRequest.error);
                reject(deleteRequest.error);
            };
            
            deleteRequest.onblocked = () => {
                console.warn('数据库删除被阻塞，可能有其他连接未关闭');
                // 等待一段时间后重试
                setTimeout(() => {
                    resolve(); // 即使被阻塞也继续
                }, 1000);
            };
        });
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
                let result = request.result;
                
                // 为保护用户隐私，在导出时移除API密钥
                if (storeName === 'apiSettings') {
                    result = result.map(item => {
                        const sanitized = { ...item };
                        // 移除普通API密钥和ElevenLabs API密钥
                        if (sanitized.key) {
                            delete sanitized.key;
                        }
                        if (sanitized.elevenLabsApiKey) {
                            delete sanitized.elevenLabsApiKey;
                        }
                        if (sanitized.geminiKey) {
                            delete sanitized.geminiKey;
                        }
                        // 保留URL和其他设置
                        return sanitized;
                    });
                }
                
                resolve(result);
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
    async importDatabase(importData, options = {}) {
        try {
            const { 
                overwrite = false, 
                validateVersion = true,
                stores = null,
                enableMigration = true
            } = options;

            if (!this.db) {
                await this.initDB();
            }

            // 验证数据格式
            if (!importData || typeof importData !== 'object') {
                throw new Error('导入数据格式无效');
            }

            // 版本检查和迁移处理
            let migratedData = importData;
            if (importData._metadata && importData._metadata.version !== this.dbVersion) {
                if (enableMigration && importData._metadata.version < this.dbVersion) {
                    console.log(`检测到版本 ${importData._metadata.version}，开始迁移到版本 ${this.dbVersion}`);
                    migratedData = await this.migrateData(importData);
                } else if (validateVersion) {
                    throw new Error(`数据库版本不匹配。当前版本: ${this.dbVersion}, 导入版本: ${importData._metadata.version}`);
                }
            }

            // 确定要导入的存储
            const storesToImport = stores || Object.keys(migratedData).filter(key => key !== '_metadata');
            
            // 清空现有数据（如果选择覆盖）
            if (overwrite) {
                for (const storeName of storesToImport) {
                    if (this.db.objectStoreNames.contains(storeName)) {
                        await this.clearStore(storeName);
                    }
                }
            }

            // 导入数据
            const importResults = {};
            for (const storeName of storesToImport) {
                if (this.db.objectStoreNames.contains(storeName) && migratedData[storeName]) {
                    const result = await this.importStore(storeName, migratedData[storeName], overwrite);
                    importResults[storeName] = result;
                }
            }

            return { success: true, importedStores: storesToImport, results: importResults, migrated: migratedData !== importData };
            
        } catch (error) {
            console.error('数据库导入失败:', error);
            throw new Error(`导入失败: ${error.message}`);
        }
    }

    /**
     * 数据迁移函数
     * @param {Object} importData - 原始导入数据
     * @returns {Object} 迁移后的数据
     */
    async migrateData(importData) {
        const { _metadata } = importData;
        const fromVersion = _metadata.version;
        const toVersion = this.dbVersion;
        
        console.log(`开始数据迁移：从版本 ${fromVersion} 到版本 ${toVersion}`);
        
        // 创建迁移后的数据副本
        const migratedData = JSON.parse(JSON.stringify(importData));
        
        // 更新元数据版本
        migratedData._metadata.version = toVersion;
        migratedData._metadata.migrationTime = new Date().toISOString();
        migratedData._metadata.originalVersion = fromVersion;
        
        // 根据版本差异进行迁移
        if (fromVersion <= 4 && toVersion >= 5) {
            // 版本4到5的迁移：添加缺失的存储
            this.migrateFrom4To5(migratedData);
        }
        
        if (fromVersion <= 5 && toVersion >= 6) {
            // 版本5到6的迁移（如果有需要的话）
            this.migrateFrom5To6(migratedData);
        }
        
        if (fromVersion <= 6 && toVersion >= 7) {
            // 版本6到7的迁移（如果有需要的话）
            this.migrateFrom6To7(migratedData);
        }
        
        console.log('数据迁移完成');
        return migratedData;
    }
    
    /**
     * 从版本4迁移到版本7（包含5、6的所有变更）
     * @param {Object} data - 数据对象
     */
    migrateFrom4To5(data) {
        console.log('执行版本4到7的迁移');
        
        // 版本5新增：表情图片分离存储
        if (!data.emojiImages) {
            data.emojiImages = [];
            console.log('添加 emojiImages 存储');
        }
        
        // 版本6新增：记忆系统相关存储
        if (!data.characterMemories) {
            data.characterMemories = [];
            console.log('添加 characterMemories 存储');
        }
        
        if (!data.conversationCounters) {
            data.conversationCounters = [];
            console.log('添加 conversationCounters 存储');
        }
        
        if (!data.globalMemory) {
            data.globalMemory = [];
            console.log('添加 globalMemory 存储');
        }
        
        // 版本7新增：记忆处理索引
        if (!data.memoryProcessedIndex) {
            data.memoryProcessedIndex = [];
            console.log('添加 memoryProcessedIndex 存储');
        }
        
        // 表情数据结构优化（版本5的核心功能）
        this.optimizeEmojiStructure(data);
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            const newStores = ['emojiImages', 'characterMemories', 'conversationCounters', 'globalMemory', 'memoryProcessedIndex'];
            for (const store of newStores) {
                if (!data._metadata.stores.includes(store)) {
                    data._metadata.stores.push(store);
                }
            }
        }
    }
    
    /**
     * 从版本5迁移到版本6
     * @param {Object} data - 数据对象
     */
    migrateFrom5To6(data) {
        console.log('执行版本5到6的迁移');
        // 如果有需要的字段更新，在这里添加
    }
    
    /**
     * 从版本6迁移到版本7
     * @param {Object} data - 数据对象
     */
    migrateFrom6To7(data) {
        console.log('执行版本6到7的迁移');
        // 如果有需要的字段更新，在这里添加
    }

    /**
     * 优化表情数据结构（版本5的核心功能）
     * 将表情从 base64 URL 格式迁移到 tag 格式
     * @param {Object} data - 数据对象
     */
    optimizeEmojiStructure(data) {
        console.log('开始优化表情数据结构');
        
        if (!data.contacts || !Array.isArray(data.contacts)) {
            console.log('没有联系人数据，跳过表情优化');
            return;
        }
        
        if (!data.emojis || !Array.isArray(data.emojis)) {
            console.log('没有表情数据，跳过表情优化');
            return;
        }
        
        // 确保 emojiImages 存储存在
        if (!data.emojiImages) {
            data.emojiImages = [];
        }
        
        let processedCount = 0;
        const base64UrlPattern = /data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/g;
        
        // 遍历所有联系人的消息
        for (const contact of data.contacts) {
            if (!contact.messages || !Array.isArray(contact.messages)) {
                continue;
            }
            
            for (const message of contact.messages) {
                if (message.content && typeof message.content === 'string') {
                    const matches = message.content.match(base64UrlPattern);
                    if (matches) {
                        for (const base64Url of matches) {
                            // 查找对应的表情
                            const emoji = data.emojis.find(e => e.url === base64Url);
                            if (emoji && emoji.meaning) {
                                // 保存图片到 emojiImages 存储
                                const existingImage = data.emojiImages.find(img => img.tag === emoji.meaning);
                                if (!existingImage) {
                                    data.emojiImages.push({
                                        tag: emoji.meaning,
                                        data: base64Url
                                    });
                                }
                                
                                // 更新表情数据结构
                                if (!emoji.tag) {
                                    emoji.tag = emoji.meaning;
                                }
                                if (emoji.url) {
                                    delete emoji.url; // 移除旧的url字段
                                }
                                
                                // 替换消息中的格式
                                message.content = message.content.replace(
                                    base64Url,
                                    `[emoji:${emoji.meaning}]`
                                );
                                
                                processedCount++;
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`表情数据结构优化完成，处理了 ${processedCount} 个表情引用`);
        console.log(`创建了 ${data.emojiImages.length} 个表情图片记录`);
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
                    // 对于某些存储，需要确保正确的数据格式
                    let processedItem = { ...item };
                    
                    // 特殊处理不同类型的存储
                    if (storeName === 'apiSettings' || storeName === 'userProfile' || 
                        storeName === 'backgrounds' || storeName === 'hashtagCache') {
                        // 这些存储使用特定的ID结构
                        if (!processedItem.id) {
                            if (storeName === 'apiSettings') processedItem.id = 'settings';
                            else if (storeName === 'userProfile') processedItem.id = 'profile';
                            else if (storeName === 'backgrounds') processedItem.id = 'backgroundsMap';
                            else if (storeName === 'hashtagCache') processedItem.id = 'cache';
                        }
                    }

                    const request = store.put(processedItem); // 使用 put 而不是 add，允许覆盖
                    
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
     * 下载导出文件
     * @param {Object} exportData - 导出的数据
     * @param {string} filename - 文件名（可选）
     */
    downloadExport(exportData, filename = null) {
        try {
            const dataStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = filename || `whale-chat-backup-${timestamp}.json`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('文件下载失败:', error);
            throw new Error(`下载失败: ${error.message}`);
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
            if (importData._metadata.version > this.dbVersion) {
                errors.push(`不支持从较新版本降级：导入版本 ${importData._metadata.version} 高于当前版本 ${this.dbVersion}`);
            } else if (importData._metadata.version < this.dbVersion) {
                warnings.push(`检测到旧版本数据：导入版本 ${importData._metadata.version}，将自动迁移到当前版本 ${this.dbVersion}`);
            }
        } else {
            warnings.push('缺少元数据信息，可能是早期版本的备份文件');
        }
        
        // 存储结构检查
        const validStores = Object.keys(this.stores);
        const importStores = Object.keys(importData).filter(key => key !== '_metadata');

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

    /**
     * 验证导入文件的合法性
     * @param {Object} importData - 要验证的数据
     */
    validateFileIntegrity(importData) {
        // 基本格式检查
        if (!importData || typeof importData !== 'object') {
            return {
                valid: false,
                error: '文件格式无效：不是有效的JSON对象'
            };
        }

        // 检查是否包含关键的 objectStore
        const requiredStores = ['contacts', 'userProfile'];
        const availableStores = Object.keys(importData).filter(key => key !== '_metadata');
        
        // 检查必需的存储是否存在
        const missingStores = requiredStores.filter(store => !availableStores.includes(store));
        
        if (missingStores.length > 0) {
            return {
                valid: false,
                error: `文件不是有效的数据库备份文件，缺少关键数据表：${missingStores.join(', ')}`
            };
        }

        // 检查是否有任何有效的存储
        const validStores = Object.keys(this.stores);
        const hasValidStore = availableStores.some(store => validStores.includes(store));
        
        if (!hasValidStore) {
            return {
                valid: false,
                error: '文件不包含任何有效的数据表，可能不是本应用的备份文件'
            };
        }

        // 检查数据表内容是否为数组格式
        for (const storeName of availableStores) {
            if (validStores.includes(storeName)) {
                if (!Array.isArray(importData[storeName])) {
                    return {
                        valid: false,
                        error: `数据表 ${storeName} 格式错误：应为数组格式`
                    };
                }
            }
        }

        return {
            valid: true,
            foundStores: availableStores.length,
            validStores: availableStores.filter(store => validStores.includes(store))
        };
    }

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
function triggerFileSelect() {
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) {
        fileInput.click();
    } else {
        console.error('未找到文件输入元素！');
        alert('未找到文件输入元素，请检查页面');
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

// 全局UI函数 - 供HTML界面调用
window.refreshDatabaseStats = async function() {
    const statsContent = document.getElementById('databaseStatsContent');
    const refreshBtn = document.querySelector('.refresh-stats-btn');
    
    if (!statsContent) return;
    
    try {
        if (refreshBtn) {
            refreshBtn.textContent = '刷新中...';
            refreshBtn.disabled = true;
        }
        
        const result = await window.DatabaseManager.getStats();
        
        if (result.success) {
            const stats = result.stats;
            let statsHtml = '';
            
            const storeLabels = {
                'contacts': '联系人/群聊',
                'songs': '音乐文件', 
                'apiSettings': 'API设置',
                'emojis': '表情包',
                'emojiImages': '表情图片',
                'backgrounds': '聊天背景',
                'userProfile': '用户资料',
                'moments': '朋友圈',
                'weiboPosts': '论坛帖子',
                'hashtagCache': '话题缓存',
                'characterMemories': '角色记忆',
                'globalMemory': '全局记忆',
                'conversationCounters': '聊天计数器',
                'memoryProcessedIndex': '总结缓存',
            };
            
            let totalRecords = 0;
            Object.entries(stats).forEach(([storeName, count]) => {
                const label = storeLabels[storeName] || storeName;
                statsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>${label}:</span>
                    <span><strong>${count}</strong> 条记录</span>
                </div>`;
                totalRecords += count;
            });
            
            statsHtml += `<hr style="margin: 10px 0;"><div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>总计:</span>
                <span>${totalRecords} 条记录</span>
            </div>`;
            
            statsContent.innerHTML = statsHtml;
        } else {
            statsContent.innerHTML = `<div style="color: #dc3545;">加载失败: ${result.error}</div>`;
        }
    } catch (error) {
        if (statsContent) {
            statsContent.innerHTML = `<div style="color: #dc3545;">加载出错: ${error.message}</div>`;
        }
    } finally {
        if (refreshBtn) {
            refreshBtn.textContent = '刷新统计';
            refreshBtn.disabled = false;
        }
    }
};

// 导出数据库
window.exportDatabase = async function() {
    try {
        if (typeof showToast === 'function') {
            showToast('正在导出数据库...');
        }
        const result = await window.DatabaseManager.exportAndDownload();
        
        if (result.success) {
            if (typeof showToast === 'function') {
                showToast('数据库导出成功！');
            } else {
                alert('数据库导出成功！');
            }
        } else {
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
            let successMessage = result.message || `导入成功！\n导入了 ${result.result?.importedStores?.length || '多个'} 个数据表\n页面将自动刷新以更新显示`;
            
            if (typeof showToast === 'function') {
                const toastMessage = result.result?.migrated ? '导入并迁移成功！正在刷新页面...' : '导入成功！正在刷新页面以应用新数据...';
                showToast(toastMessage);
            }
            
            // 显示警告信息（如果有）
            if (result.validation && result.validation.warnings.length > 0) {
                const warningMessage = result.result?.migrated 
                    ? `数据迁移成功，但有以下提示信息，请及时截图:\n${result.validation.warnings.join('\n')}\n\n${successMessage}\n\n页面即将刷新`
                    : `导入成功，但有以下警告，请及时截图:\n${result.validation.warnings.join('\n')}\n\n页面即将刷新`;
                alert(warningMessage);
            } else {
                alert(successMessage + '\n\n页面即将刷新');
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

// 剪贴板操作函数
window.exportToClipboard = async function() {
    try {
        if (typeof showToast === 'function') {
            showToast('正在导出数据到剪贴板...');
        }
        
        const result = await window.DatabaseManager.exportToClipboard();
        
        if (result.success) {
            if (typeof showToast === 'function') {
                showToast('数据已复制到剪贴板！');
            } else {
                alert('数据已复制到剪贴板！');
            }
        } else {
            if (typeof showToast === 'function') {
                showToast('复制失败: ' + result.error);
            } else {
                alert('复制失败: ' + result.error);
            }
        }
    } catch (error) {
        if (typeof showToast === 'function') {
            showToast('复制出错: ' + error.message);
        } else {
            alert('复制出错: ' + error.message);
        }
        console.error('复制到剪贴板失败:', error);
    }
};


// 导出功能函数，供HTML界面调用
window.DatabaseManager = {
    
    /**
     * 初始化数据库 - 使用现有的db实例并检查版本升级
     */
    async init() {
        try {
            // 如果已经有现有的db实例，先检查版本
            if (window.db && window.isIndexedDBReady) {
                dbManager.db = window.db;
                dbManager.dbVersion = window.db.version;
                
                // 检查是否需要升级
                if (window.db.version < dbManager.dbVersion) {
                    console.log('检测到已有数据库版本较低，需要升级');
                    // 重置状态以便进行升级
                    window.db.close();
                    window.db = null;
                    window.isIndexedDBReady = false;
                    dbManager.db = null;
                    
                    // 执行自动升级
                    const upgradeResult = await dbManager.autoUpgradeDatabase();
                    
                    // 更新全局变量
                    window.db = dbManager.db;
                    window.isIndexedDBReady = true;
                    
                    return { success: true, upgraded: upgradeResult.upgraded, upgradeResult };
                } else {
                    return { success: true, upgraded: false };
                }
            } else {
                // 执行自动升级检查
                const upgradeResult = await dbManager.autoUpgradeDatabase();
                
                // 更新全局变量
                window.db = dbManager.db;
                window.isIndexedDBReady = true;
                
                return { success: true, upgraded: upgradeResult.upgraded, upgradeResult };
            }
        } catch (error) {
            console.error('数据库初始化失败:', error);
            return { success: false, error: error.message };
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
            
            // 新增：检查文件合法性
            const validationResult = dbManager.validateFileIntegrity(importData);
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: validationResult.error,
                    validation: validationResult
                };
            }
            
            // 验证数据
            const validation = dbManager.validateImportData(importData);
            
            if (!validation.valid) {
                return { 
                    success: false, 
                    error: '数据验证失败：' + validation.errors.join(', '),
                    validation 
                };
            }
            
            // 导入数据（启用迁移功能）
            const result = await dbManager.importDatabase(importData, { 
                overwrite,
                validateVersion: false,  // 关闭严格版本验证，启用迁移
                enableMigration: true   // 启用数据迁移
            });
            
            const successMessage = result.migrated 
                ? `导入并迁移成功！已将数据从版本 ${importData._metadata?.version || '未知'} 迁移到版本 ${this.dbVersion}，导入了 ${result.importedStores?.length || 0} 个数据表`
                : `导入成功！导入了 ${result.importedStores?.length || 0} 个数据表`;
                
            return { 
                success: true, 
                message: successMessage,
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
    },
    
    /**
     * 上传数据到云端
     */
    async uploadDataToCloud(syncKey) {
        try {
            // 获取所有数据（排除图片等大文件）
            const allStores = Array.from(dbManager.db.objectStoreNames);
            const exportStores = allStores.filter(store => !dbManager.excludedFromManualExport.includes(store));
            
            const data = await dbManager.exportDatabase({ stores: exportStores });
            
            // 清空头像base64数据以减少数据大小
            this.clearAvatarData(data);
            
            // 调用上传API - 使用配置的URL
            const apiUrl = window.SyncConfig ? window.SyncConfig.getApiUrl('upload') : '/api/sync/upload';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    syncKey: syncKey,
                    data: data
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                return { success: true, message: '数据上传成功！' };
            } else {
                return { success: false, error: result.error || '上传失败' };
            }
        } catch (error) {
            console.error('上传数据失败:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 从云端下载数据
     */
    async downloadDataFromCloud(syncKey) {
        try {
            const apiUrl = window.SyncConfig ? window.SyncConfig.getApiUrl('download') : '/api/sync/download';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    syncKey: syncKey
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // 验证下载的数据
                const validation = dbManager.validateFileIntegrity(result.data);
                if (!validation.valid) {
                    return { success: false, error: validation.error };
                }
                
                // 导入数据（覆盖模式）
                const importResult = await dbManager.importDatabase(result.data, { 
                    overwrite: true,
                    validateVersion: false 
                });
                
                return { 
                    success: true, 
                    message: `数据下载成功！导入了 ${importResult.importedStores?.length || 0} 个数据表`,
                    result: importResult
                };
            } else {
                return { success: false, error: result.error || '下载失败' };
            }
        } catch (error) {
            console.error('下载数据失败:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 清空导出数据中的头像base64数据
     */
    clearAvatarData(data) {
        // 清空用户资料中的头像
        if (data.userProfile && Array.isArray(data.userProfile)) {
            data.userProfile.forEach(profile => {
                if (profile.avatar) {
                    profile.avatar = '';
                }
            });
        }
        
        // 清空联系人中的头像
        if (data.contacts && Array.isArray(data.contacts)) {
            data.contacts.forEach(contact => {
                if (contact.avatar) {
                    contact.avatar = '';
                }
            });
        }
        
        // 清空朋友圈中的头像
        if (data.moments && Array.isArray(data.moments)) {
            data.moments.forEach(moment => {
                if (moment.authorAvatar) {
                    moment.authorAvatar = '';
                }
            });
        }
    }
};

// 页面加载完成后初始化
if (typeof document !== 'undefined') {
    // 等待主应用初始化完成后再初始化数据库管理器
    const initializeDatabaseManager = () => {
        window.DatabaseManager.init().then(result => {
            if (result.success) {
                // 增强API设置模态框
                if (typeof window.enhanceApiSettingsModal === 'function') {
                    window.enhanceApiSettingsModal();
                }
            } else {
                console.error('数据库管理器初始化失败:', result.error);
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeDatabaseManager, 1000);
        });
    } else {
        setTimeout(initializeDatabaseManager, 1000);
    }
}

// 云同步相关函数
window.uploadDataToCloud = async function() {
    const syncKeyInput = document.getElementById('syncKeyInput');
    const syncStatus = document.getElementById('syncStatus');
    
    if (!syncKeyInput || !syncKeyInput.value.trim()) {
        if (typeof showToast === 'function') {
            showToast('请输入同步标识符');
        } else {
            alert('请输入同步标识符');
        }
        return;
    }
    
    const syncKey = syncKeyInput.value.trim();
    
    try {
        syncStatus.textContent = '正在上传数据到云端...';
        syncStatus.style.color = '#1565c0';
        
        const result = await window.DatabaseManager.uploadDataToCloud(syncKey);
        
        if (result.success) {
            syncStatus.textContent = '上传成功！数据已保存到云端';
            syncStatus.style.color = '#2e7d32';
            
            if (typeof showToast === 'function') {
                showToast('数据上传成功！');
            }
        } else {
            const errorMessage = (typeof result.error === 'object' && result.error !== null)
                ? JSON.stringify(result.error)
                : result.error;
            syncStatus.textContent = '上传失败: ' + errorMessage;
            syncStatus.style.color = '#d32f2f';
            
            if (typeof showToast === 'function') {
                showToast('上传失败: ' + errorMessage);
            }
        }
    } catch (error) {
        syncStatus.textContent = '上传出错: ' + error.message;
        syncStatus.style.color = '#d32f2f';
        
        if (typeof showToast === 'function') {
            showToast('上传出错: ' + error.message);
        }
        console.error('云端上传失败:', error);
    }
};

window.downloadDataFromCloud = async function() {
    const syncKeyInput = document.getElementById('syncKeyInput');
    const syncStatus = document.getElementById('syncStatus');
    
    if (!syncKeyInput || !syncKeyInput.value.trim()) {
        if (typeof showToast === 'function') {
            showToast('请输入同步标识符');
        } else {
            alert('请输入同步标识符');
        }
        return;
    }
    
    const syncKey = syncKeyInput.value.trim();
    
    const confirmMessage = '从云端下载数据将完全覆盖现有数据！\n\n这将删除：\n• 所有聊天记录和联系人\n• 用户资料和设置\n• 朋友圈动态和论坛帖子\n• 音乐库和表情包\n\n确定要继续吗？';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        syncStatus.textContent = '正在从云端下载数据...';
        syncStatus.style.color = '#1565c0';
        
        const result = await window.DatabaseManager.downloadDataFromCloud(syncKey);
        
        if (result.success) {
            syncStatus.textContent = '下载成功！正在刷新页面...';
            syncStatus.style.color = '#2e7d32';
            
            // 刷新统计信息
            if (typeof window.refreshDatabaseStats === 'function') {
                window.refreshDatabaseStats();
            }
            
            // 清空内存数据
            window.clearMemoryData();
            
            if (typeof showToast === 'function') {
                showToast('下载成功！正在刷新页面...');
            }
            
            alert(result.message + '\n页面将自动刷新以更新显示');
            
            // 自动刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            syncStatus.textContent = '下载失败: ' + result.error;
            syncStatus.style.color = '#d32f2f';
            
            if (typeof showToast === 'function') {
                showToast('下载失败: ' + result.error);
            }
        }
    } catch (error) {
        syncStatus.textContent = '下载出错: ' + error.message;
        syncStatus.style.color = '#d32f2f';
        
        if (typeof showToast === 'function') {
            showToast('下载出错: ' + error.message);
        }
        console.error('云端下载失败:', error);
    }
};

// 清空内存数据的辅助函数
window.clearMemoryData = function() {
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
};

// 将HTML中的script内容整合到这里
window.triggerFileSelect = triggerFileSelect;
window.handleFileSelect = handleFileSelect;