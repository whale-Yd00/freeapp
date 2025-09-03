/**
 * IndexedDB 导入导出模块
 */

class IndexedDBManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.dbVersion = 13;
        this.db = null;
        
        // 定义不参与手动导入导出的存储（图片等大数据）
        this.excludedFromManualExport = ['emojiImages', 'fileStorage'];
        
        // 定义所有对象存储的结构
        this.stores = {
            songs: { keyPath: 'id', autoIncrement: true },
            contacts: { keyPath: 'id' },
            apiSettings: { keyPath: 'id' },
            emojis: { keyPath: 'id' },
            emojiImages: { keyPath: 'tag' }, // 存储表情图片的base64数据（将逐步迁移到fileStorage）
            backgrounds: { keyPath: 'id' },
            userProfile: { keyPath: 'id' },
            moments: { keyPath: 'id' },
            weiboPosts: { keyPath: 'id', autoIncrement: true },
            hashtagCache: { keyPath: 'id' },
            characterMemories: { keyPath: 'contactId' },
            conversationCounters: { keyPath: 'id' },
            globalMemory: { keyPath: 'id' },
            memoryProcessedIndex: { keyPath: 'contactId' },
            fileStorage: { keyPath: 'fileId' }, // 新增：存储原始文件Blob数据
            fileReferences: { keyPath: 'referenceId' }, // 新增：存储文件引用关系
            themeConfig: { keyPath: 'type' } // 新增：存储主题配置（颜色、渐变等）
        };
    }

    /**
     * 检查并自动升级现有数据库
     */
    async autoUpgradeDatabase() {
        try {
            console.log('正在检查数据库版本...');
            
            // 首先检查当前真实的数据库版本
            const currentVersion = await this.getCurrentDatabaseVersion();
            console.log(`当前数据库版本: ${currentVersion}, 目标版本: ${this.dbVersion}`);
            
            
            // 关闭现有连接，确保干净状态
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            
            // 清理全局状态
            window.db = null;
            window.isIndexedDBReady = false;
            
            // 直接使用initDB进行升级，它会自动触发onupgradeneeded
            await this.initDB();
            
            console.log(`数据库已升级到版本 ${this.db.version}`);
            
            // 显示升级成功消息
            if (typeof showToast === 'function') {
                showToast(`数据库已升级到版本 ${this.db.version}`);
            }
            
            return { upgraded: true, toVersion: this.db.version };
            
        } catch (error) {
            console.error('自动升级数据库时出错:', error);
            throw error;
        }
    }


    /**
     * 获取当前数据库版本（不进行升级）
     */
    async getCurrentDatabaseVersion() {
        return new Promise((resolve, reject) => {
            // 打开数据库，不指定版本（这会打开现有版本，不会触发升级）
            const request = indexedDB.open(this.dbName);
            
            request.onsuccess = () => {
                const db = request.result;
                const version = db.version;
                db.close();
                resolve(version);
            };
            
            request.onerror = () => {
                resolve(0); // 数据库不存在，返回版本0
            };
            
            request.onupgradeneeded = (event) => {
                // 这种情况不应该发生，因为我们没有指定版本
                const db = event.target.result;
                db.close();
                resolve(event.oldVersion);
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
        // 如果已经有现有的db实例，直接使用（但不要修改目标版本）
        if (window.db && window.isIndexedDBReady && window.db.version === this.dbVersion) {
            this.db = window.db;
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
                
                // 同时更新全局变量
                window.db = this.db;
                window.isIndexedDBReady = true;
                
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                const newVersion = event.newVersion;
                
                console.log(`数据库升级: 版本${oldVersion} -> 版本${newVersion}`);
                
                try {
                    // 处理废弃存储的删除
                    if (newVersion >= 12) {
                        // 版本12及以上移除了bubbleDesignerStickers
                        if (db.objectStoreNames.contains('bubbleDesignerStickers')) {
                            db.deleteObjectStore('bubbleDesignerStickers');
                            console.log('删除废弃的 bubbleDesignerStickers 存储');
                        }
                    }
                    
                    // 创建所有对象存储（如果不存在）
                    Object.entries(this.stores).forEach(([storeName, config]) => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            try {
                                const store = db.createObjectStore(storeName, config);
                                console.log(`创建 ${storeName} 存储成功`);
                            } catch (storeError) {
                                console.error(`创建存储 ${storeName} 失败:`, storeError);
                                throw storeError;
                            }
                        }
                    });
                    
                    console.log('数据库结构升级完成');
                    
                } catch (upgradeError) {
                    console.error('数据库升级过程中出错:', upgradeError);
                    throw upgradeError;
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
            version: this.db.version,  // 这里使用实际数据库版本，不是目标版本
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
                        if (sanitized.minimaxApiKey) {
                            delete sanitized.minimaxApiKey;
                        }
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
        const fromVersion = _metadata ? _metadata.version : 1;
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
        
        if (fromVersion <= 7 && toVersion >= 8) {
            // 版本7到8的迁移：添加文件存储系统
            this.migrateFrom7To8(migratedData);
        }
        
        if (fromVersion <= 8 && toVersion >= 9) {
            // 版本8到9的迁移：完善文件存储系统
            this.migrateFrom8To9(migratedData);
        }
        
        if (fromVersion <= 9 && toVersion >= 10) {
            // 版本9到10的迁移：添加主题配置系统
            this.migrateFrom9To10(migratedData);
        }
        
        if (fromVersion <= 10 && toVersion >= 11) {
            // 版本10到11的迁移：添加气泡设计器贴图库
            this.migrateFrom10To11(migratedData);
        }
        
        if (fromVersion <= 11 && toVersion >= 12) {
            // 版本11到12的迁移：修复可能缺失的存储表
            this.migrateFrom11To12(migratedData);
        }
        
        if (fromVersion <= 12 && toVersion >= 13) {
            // 版本12到13的迁移：确保themeConfig存在
            this.migrateFrom12To13(migratedData);
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
     * 从版本7迁移到版本8
     * @param {Object} data - 数据对象
     */
    migrateFrom7To8(data) {
        console.log('执行版本7到8的迁移：添加文件存储系统');
        
        // 版本8新增：文件存储系统
        if (!data.fileStorage) {
            data.fileStorage = [];
            console.log('添加 fileStorage 存储');
        }
        
        if (!data.fileReferences) {
            data.fileReferences = [];
            console.log('添加 fileReferences 存储');
        }
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            const newStores = ['fileStorage', 'fileReferences'];
            for (const store of newStores) {
                if (!data._metadata.stores.includes(store)) {
                    data._metadata.stores.push(store);
                }
            }
        }
        
        console.log('文件存储系统迁移完成');
    }
    
    /**
     * 从版本8迁移到版本9
     * @param {Object} data - 数据对象
     */
    migrateFrom8To9(data) {
        console.log('执行版本8到9的迁移：完善文件存储系统');
        
        // 版本9：确保文件存储系统完整
        if (!data.fileStorage) {
            data.fileStorage = [];
            console.log('确保 fileStorage 存储存在');
        }
        
        if (!data.fileReferences) {
            data.fileReferences = [];
            console.log('确保 fileReferences 存储存在');
        }
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            const newStores = ['fileStorage', 'fileReferences'];
            for (const store of newStores) {
                if (!data._metadata.stores.includes(store)) {
                    data._metadata.stores.push(store);
                }
            }
        }
        
        // 标记需要进行数据迁移（在运行时UI中完成实际的文件存储迁移）
        if (data._metadata) {
            data._metadata.needsFileStorageMigration = true;
            data._metadata.migrationSource = 'v8_to_v9';
        }
        
        console.log('版本8到9迁移完成：文件存储系统已完善，已标记需要运行时数据迁移');
    }
    
    /**
     * 从版本9迁移到版本10
     * @param {Object} data - 数据对象
     */
    migrateFrom9To10(data) {
        console.log('执行版本9到10的迁移：添加主题配置系统');
        
        // 版本10新增：主题配置系统
        if (!data.themeConfig) {
            data.themeConfig = [];
            console.log('添加 themeConfig 存储');
        }
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            const newStores = ['themeConfig'];
            for (const store of newStores) {
                if (!data._metadata.stores.includes(store)) {
                    data._metadata.stores.push(store);
                }
            }
        }
        
        console.log('版本9到10迁移完成：主题配置系统已添加');
    }
    
    /**
     * 从版本10迁移到版本11
     * @param {Object} data - 数据对象
     */
    migrateFrom10To11(data) {
        console.log('执行版本10到11的迁移：添加气泡设计器贴图库');
        
        // 版本11新增：气泡设计器贴图库
        if (!data.bubbleDesignerStickers) {
            data.bubbleDesignerStickers = [];
            console.log('添加 bubbleDesignerStickers 存储');
        }
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            const newStores = ['bubbleDesignerStickers'];
            for (const store of newStores) {
                if (!data._metadata.stores.includes(store)) {
                    data._metadata.stores.push(store);
                }
            }
        }
        
        console.log('版本10到11迁移完成：气泡设计器贴图库已添加');
    }
    
    /**
     * 从版本11迁移到版本12
     * @param {Object} data - 数据对象
     */
    migrateFrom11To12(data) {
        console.log('执行版本11到12的迁移：清理废弃存储并确保themeConfig存在');
        
        // 版本12：确保themeConfig存在
        if (!data.themeConfig) {
            data.themeConfig = [];
            console.log('确保 themeConfig 存储存在');
        }
        
        // 删除废弃的bubbleDesignerStickers存储
        if (data.bubbleDesignerStickers) {
            delete data.bubbleDesignerStickers;
            console.log('删除废弃的 bubbleDesignerStickers 存储');
        }
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            // 确保themeConfig在列表中
            if (!data._metadata.stores.includes('themeConfig')) {
                data._metadata.stores.push('themeConfig');
            }
            
            // 从元数据中移除bubbleDesignerStickers
            const index = data._metadata.stores.indexOf('bubbleDesignerStickers');
            if (index > -1) {
                data._metadata.stores.splice(index, 1);
                console.log('从元数据中移除 bubbleDesignerStickers');
            }
        }
        
        console.log('版本11到12迁移完成：已清理废弃存储并确保themeConfig存在');
    }

    /**
     * 从版本12迁移到版本13
     * @param {Object} data - 数据对象
     */
    migrateFrom12To13(data) {
        console.log('执行版本12到13的迁移：确保themeConfig存在');
        
        // 版本13：确保themeConfig存在（修复版本12升级时可能缺失的问题）
        if (!data.themeConfig) {
            data.themeConfig = [];
            console.log('确保 themeConfig 存储存在');
        }
        
        // 更新元数据中的存储列表
        if (data._metadata && data._metadata.stores) {
            // 确保themeConfig在列表中
            if (!data._metadata.stores.includes('themeConfig')) {
                data._metadata.stores.push('themeConfig');
            }
        }
        
        console.log('版本12到13迁移完成：已确保themeConfig存在');
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

            // 检查数据库连接状态
            if (!this.db || this.db.readyState === 'done') {
                console.warn(`数据库连接已关闭，跳过导入存储 ${storeName}`);
                resolve({ successCount: 0, errorCount: 0, totalCount: data.length });
                return;
            }

            try {
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
            
            } catch (error) {
                console.error(`创建导入存储 ${storeName} 的事务时出错:`, error);
                if (error.name === 'InvalidStateError') {
                    console.warn('数据库连接状态无效，跳过导入操作');
                    resolve({ successCount: 0, errorCount: data.length, totalCount: data.length });
                } else {
                    reject(error);
                }
            }
        });
    }

    /**
     * 清空指定存储
     * @param {string} storeName - 存储名称
     */
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            // 检查数据库连接状态
            if (!this.db || this.db.readyState === 'done') {
                console.warn(`数据库连接已关闭，跳过清空存储 ${storeName}`);
                resolve();
                return;
            }
            
            // 验证存储是否存在
            if (!this.db.objectStoreNames.contains(storeName)) {
                console.log(`存储 ${storeName} 不存在，跳过清空操作`);
                resolve();
                return;
            }
            
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                
                request.onsuccess = () => {
                    console.log(`存储 ${storeName} 清空成功`);
                    resolve();
                };
                
                request.onerror = () => {
                    console.error(`清空存储 ${storeName} 失败:`, request.error);
                    // 不抛出错误，继续执行
                    resolve();
                };
                
                transaction.onerror = () => {
                    console.error(`清空存储 ${storeName} 的事务失败:`, transaction.error);
                    // 不抛出错误，继续执行
                    resolve();
                };
                
                transaction.onabort = () => {
                    console.warn(`清空存储 ${storeName} 的事务被中止`);
                    resolve(); // 被中止时也算成功，避免阻塞整个流程
                };
            } catch (error) {
                console.error(`创建清空存储 ${storeName} 的事务时出错:`, error);
                // 所有错误都不阻塞流程，继续执行
                resolve();
            }
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

// 导出到全局作用域以便其他模块使用
if (typeof window !== 'undefined') {
    window.dbManager = dbManager;
}

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
    const persistentIndicator = document.getElementById('persistentStatusIndicator');
    
    if (!statsContent) return;
    
    try {
        if (refreshBtn) {
            refreshBtn.textContent = '刷新中...';
            refreshBtn.disabled = true;
        }
        
        // 同时检查persistent状态和数据库统计
        const [result, persistentResult] = await Promise.all([
            window.DatabaseManager.getStats(),
            window.StorageManager.checkPersistentStorage()
        ]);
        
        // 更新persistent状态指示器 - 使用CSS驱动的状态管理
        window.StorageManager.updatePersistentStatusIndicator(persistentResult);
        
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
                'themeConfig': '主题配置',
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
     * 自动诊断和修复数据库异常状态
     */
    async autoRepairDatabase() {
        const REPAIR_LOG_KEY = 'freeapp_db_repair_log';
        const MAX_REPAIR_ATTEMPTS = 3;
        
        try {
            // 1. 检查修复历史记录
            const repairLog = JSON.parse(localStorage.getItem(REPAIR_LOG_KEY) || '{}');
            const today = new Date().toDateString();
            const todayAttempts = repairLog[today] || 0;
            
            if (todayAttempts >= MAX_REPAIR_ATTEMPTS) {
                console.warn('今日数据库修复次数已达上限，跳过自动修复');
                return { success: false, reason: '达到修复次数上限', attempts: todayAttempts };
            }
            
            // 2. 诊断数据库状态
            const diagnosis = await this.diagnoseDatabaseState();
            
            if (!diagnosis.needsRepair) {
                console.log('数据库状态正常，无需修复');
                return { success: true, diagnosis, repaired: false };
            }
            
            console.log('检测到数据库异常状态，开始自动修复...', diagnosis);
            
            // 3. 记录修复尝试
            repairLog[today] = (repairLog[today] || 0) + 1;
            localStorage.setItem(REPAIR_LOG_KEY, JSON.stringify(repairLog));
            
            // 4. 执行修复步骤
            const repairResult = await this.performDatabaseRepair(diagnosis);
            
            if (repairResult.success) {
                console.log('数据库自动修复成功');
                // 显示用户友好的提示
                if (typeof showToast === 'function') {
                    showToast('检测到数据库异常，已自动修复完成', 'success');
                }
            }
            
            return { 
                success: repairResult.success, 
                diagnosis, 
                repaired: true, 
                attempts: repairLog[today],
                details: repairResult
            };
            
        } catch (error) {
            console.error('自动修复过程中发生错误:', error);
            return { 
                success: false, 
                error: error.message, 
                attempts: (JSON.parse(localStorage.getItem(REPAIR_LOG_KEY) || '{}')[new Date().toDateString()] || 0)
            };
        }
    },
    
    /**
     * 诊断数据库状态
     */
    async diagnoseDatabaseState() {
        const issues = [];
        let needsRepair = false;
        
        try {
            // 检查1：window.db是否存在且有效
            if (!window.db) {
                issues.push('window.db为空');
                needsRepair = true;
            } else if (window.db.readyState === 'done') {
                issues.push('数据库连接已关闭');
                needsRepair = true;
            }
            
            // 检查2：isIndexedDBReady状态
            if (!window.isIndexedDBReady) {
                issues.push('isIndexedDBReady为false');
                needsRepair = true;
            }
            
            // 检查3：dbManager状态
            if (!dbManager.db && window.db) {
                issues.push('dbManager.db与window.db不同步');
                // 注意：这个问题通常可以通过简单的同步解决，不一定需要复杂修复
                // needsRepair = true; // 暂时注释，只在确实有功能性问题时才修复
            }
            
            // 检查4：尝试简单的数据库操作
            if (window.db && window.db.readyState !== 'done') {
                try {
                    // 使用数据库中实际存在的第一个存储进行测试
                    const storeNames = Array.from(window.db.objectStoreNames);
                    if (storeNames.length > 0) {
                        const testStoreName = storeNames[0]; // 使用第一个存储
                        const transaction = window.db.transaction([testStoreName], 'readonly');
                        const store = transaction.objectStore(testStoreName);
                        await new Promise((resolve, reject) => {
                            const request = store.count();
                            request.onsuccess = () => resolve(request.result);
                            request.onerror = () => reject(request.error);
                        });
                    } else {
                        issues.push('数据库中没有对象存储');
                        needsRepair = true;
                    }
                } catch (dbError) {
                    issues.push(`数据库操作测试失败: ${dbError.message}`);
                    needsRepair = true;
                }
            }
            
            // 检查5：数据库版本一致性
            if (window.db && window.db.version !== dbManager.dbVersion) {
                issues.push(`数据库版本不匹配: 实际=${window.db.version}, 期望=${dbManager.dbVersion}`);
                needsRepair = true;
            }
            
            return {
                needsRepair,
                issues,
                currentState: {
                    hasWindowDb: !!window.db,
                    windowDbState: window.db ? window.db.readyState : 'null',
                    isIndexedDBReady: window.isIndexedDBReady,
                    hasManagerDb: !!dbManager.db,
                    dbVersion: window.db ? window.db.version : 'unknown'
                }
            };
            
        } catch (error) {
            return {
                needsRepair: true,
                issues: [`诊断过程异常: ${error.message}`],
                currentState: { error: error.message }
            };
        }
    },
    
    /**
     * 执行数据库修复
     */
    async performDatabaseRepair(diagnosis) {
        const repairSteps = [];
        
        try {
            // 修复步骤0：尝试简单同步（针对状态不同步问题）
            if (window.db && window.db.readyState !== 'done' && !dbManager.db) {
                console.log('修复步骤0：同步dbManager状态');
                dbManager.db = window.db;
                dbManager.dbVersion = window.db.version;
                repairSteps.push('同步dbManager状态');
                
                // 再次验证，可能只是状态同步问题
                const quickTest = await this.diagnoseDatabaseState();
                if (!quickTest.needsRepair) {
                    console.log('简单同步已解决问题，无需进一步修复');
                    return {
                        success: true,
                        repairSteps,
                        finalState: {
                            hasWindowDb: !!window.db,
                            windowDbState: window.db ? window.db.readyState : 'null',
                            isIndexedDBReady: window.isIndexedDBReady,
                            dbVersion: window.db ? window.db.version : 'unknown'
                        }
                    };
                }
            }
            
            // 修复步骤1：清理异常状态
            if (window.db && window.db.readyState === 'done') {
                console.log('修复步骤1：清理已关闭的数据库连接');
                window.db = null;
                window.isIndexedDBReady = false;
                dbManager.db = null;
                repairSteps.push('清理异常连接状态');
            }
            
            // 修复步骤2：重新初始化数据库
            console.log('修复步骤2：重新初始化数据库');
            try {
                await dbManager.initDB();
                repairSteps.push('重新初始化数据库');
            } catch (initError) {
                console.warn('标准初始化失败，无法修复数据库:', initError);
                throw new Error(`数据库初始化失败: ${initError.message}`);
            }
            
            // 修复步骤3：验证修复结果
            console.log('修复步骤3：验证修复结果');
            await new Promise(resolve => setTimeout(resolve, 200)); // 等待连接稳定
            
            if (!window.db || window.db.readyState === 'done') {
                throw new Error('修复后数据库状态仍然异常');
            }
            
            // 测试基本操作
            const storeNames = Array.from(window.db.objectStoreNames);
            if (storeNames.length === 0) {
                throw new Error('修复后数据库中没有对象存储');
            }
            
            const testStoreName = storeNames[0]; // 使用第一个存储进行测试
            const transaction = window.db.transaction([testStoreName], 'readonly');
            const store = transaction.objectStore(testStoreName);
            await new Promise((resolve, reject) => {
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            repairSteps.push('验证数据库功能正常');
            
            return {
                success: true,
                repairSteps,
                finalState: {
                    hasWindowDb: !!window.db,
                    windowDbState: window.db ? window.db.readyState : 'null',
                    isIndexedDBReady: window.isIndexedDBReady,
                    dbVersion: window.db ? window.db.version : 'unknown'
                }
            };
            
        } catch (error) {
            console.error('数据库修复失败:', error);
            
            // 修复失败时，尝试强制导出备份
            console.log('所有修复方法都失败了，尝试强制导出数据备份...');
            try {
                const backupResult = await this.forceExportBackup();
                if (backupResult.success) {
                    console.log(`紧急备份已导出: ${backupResult.fileName}`);
                    console.log(`备份包含 ${backupResult.totalRecords} 条记录，${backupResult.exportedStores} 个存储`);
                    
                    return {
                        success: false,
                        error: error.message,
                        repairSteps,
                        attemptedSteps: repairSteps.length,
                        emergencyBackup: {
                            exported: true,
                            fileName: backupResult.fileName,
                            totalRecords: backupResult.totalRecords,
                            exportedStores: backupResult.exportedStores
                        }
                    };
                } else {
                    console.error('紧急备份导出也失败了:', backupResult.error);
                    return {
                        success: false,
                        error: error.message,
                        repairSteps,
                        attemptedSteps: repairSteps.length,
                        emergencyBackup: {
                            exported: false,
                            error: backupResult.error
                        }
                    };
                }
            } catch (backupError) {
                console.error('执行紧急备份时出错:', backupError);
                return {
                    success: false,
                    error: error.message,
                    repairSteps,
                    attemptedSteps: repairSteps.length,
                    emergencyBackup: {
                        exported: false,
                        error: backupError.message
                    }
                };
            }
        }
    },
    
    /**
     * 强制导出数据库备份（即使数据库状态异常）
     * 用于修复失败时的最后备份手段
     */
    async forceExportBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `WhaleLLTDB-emergency-backup-${timestamp}.json`;
        
        try {
            console.log('开始强制导出数据库备份...');
            
            // 尝试多种方式获取数据库连接
            let dbConnection = null;
            
            // 方法1：使用现有连接
            if (window.db && window.db.readyState !== 'done') {
                dbConnection = window.db;
                console.log('使用现有window.db连接');
            }
            // 方法2：使用dbManager连接
            else if (this.db && this.db.readyState !== 'done') {
                dbConnection = this.db;
                console.log('使用dbManager.db连接');
            }
            // 方法3：尝试重新打开数据库（只读）
            else {
                console.log('尝试重新打开数据库进行备份...');
                try {
                    dbConnection = await new Promise((resolve, reject) => {
                        // 不指定版本，让浏览器使用现有版本
                        const request = indexedDB.open(this.dbName);
                        
                        request.onsuccess = () => {
                            resolve(request.result);
                        };
                        
                        request.onerror = () => {
                            reject(new Error(`无法打开数据库进行备份: ${request.error}`));
                        };
                        
                        request.onupgradeneeded = () => {
                            // 如果触发升级，立即关闭，避免影响数据库结构
                            request.result.close();
                            reject(new Error('数据库需要升级，无法进行只读备份'));
                        };
                    });
                } catch (openError) {
                    console.error('重新打开数据库失败:', openError);
                    throw new Error(`无法获取数据库连接进行备份: ${openError.message}`);
                }
            }
            
            if (!dbConnection || dbConnection.readyState === 'done') {
                throw new Error('无法获取有效的数据库连接');
            }
            
            // 开始导出数据
            const backupData = {
                _metadata: {
                    name: dbConnection.name,
                    version: dbConnection.version,
                    exportTime: new Date().toISOString(),
                    exportType: 'emergency_backup',
                    stores: Array.from(dbConnection.objectStoreNames),
                    reason: '自动修复失败后的紧急备份',
                    privacyProtection: '已移除API密钥等敏感信息'
                },
                _exportInfo: {
                    totalStores: dbConnection.objectStoreNames.length,
                    timestamp: timestamp
                }
            };
            
            console.log(`发现 ${dbConnection.objectStoreNames.length} 个数据存储，开始导出...`);
            
            // 导出每个对象存储的数据
            for (const storeName of dbConnection.objectStoreNames) {
                try {
                    console.log(`正在导出存储: ${storeName}`);
                    
                    const storeData = await new Promise((resolve, reject) => {
                        const transaction = dbConnection.transaction([storeName], 'readonly');
                        const store = transaction.objectStore(storeName);
                        const request = store.getAll();
                        
                        request.onsuccess = () => {
                            let result = request.result;
                            
                            if (storeName === 'apiSettings') {
                                result = result.map(item => {
                                    const sanitized = { ...item };
                                    // 移除Key
                                    if (sanitized.key) {
                                        delete sanitized.key;
                                    }
                                    if (sanitized.elevenLabsApiKey) {
                                        delete sanitized.elevenLabsApiKey;
                                    }
                                    if (sanitized.geminiKey) {
                                        delete sanitized.geminiKey;
                                    }
                                    if (sanitized.minimaxApiKey) {
                                        delete sanitized.minimaxApiKey;
                                    }
                                    return sanitized;
                                });
                            }
                            
                            resolve(result);
                        };
                        
                        request.onerror = () => {
                            console.warn(`导出存储 ${storeName} 失败:`, request.error);
                            resolve([]); // 失败时返回空数组，继续导出其他存储
                        };
                        
                        transaction.onerror = () => {
                            console.warn(`存储 ${storeName} 事务失败:`, transaction.error);
                            resolve([]);
                        };
                    });
                    
                    backupData[storeName] = storeData;
                    console.log(`存储 ${storeName} 导出完成，共 ${storeData.length} 条记录`);
                    
                } catch (storeError) {
                    console.warn(`导出存储 ${storeName} 时出错:`, storeError);
                    backupData[storeName] = [];
                    backupData._metadata.errors = backupData._metadata.errors || [];
                    backupData._metadata.errors.push(`${storeName}: ${storeError.message}`);
                }
            }
            
            // 计算备份统计信息
            let totalRecords = 0;
            for (const storeName of dbConnection.objectStoreNames) {
                if (backupData[storeName]) {
                    totalRecords += backupData[storeName].length;
                }
            }
            
            backupData._exportInfo.totalRecords = totalRecords;
            backupData._exportInfo.exportedStores = Object.keys(backupData).filter(key => !key.startsWith('_')).length;
            
            // 如果使用临时连接，需要关闭
            if (dbConnection !== window.db && dbConnection !== this.db) {
                dbConnection.close();
            }
            
            // 创建并下载备份文件
            const dataStr = JSON.stringify(backupData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(dataBlob);
            downloadLink.download = backupFileName;
            downloadLink.style.display = 'none';
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            URL.revokeObjectURL(downloadLink.href);
            
            console.log(`紧急备份导出成功: ${backupFileName}`);
            console.log(`备份统计: ${totalRecords} 条记录，${backupData._exportInfo.exportedStores} 个存储`);
            
            return {
                success: true,
                fileName: backupFileName,
                totalRecords: totalRecords,
                exportedStores: backupData._exportInfo.exportedStores,
                metadata: backupData._metadata
            };
            
        } catch (error) {
            console.error('强制导出备份失败:', error);
            
            // 即使导出失败，也尝试保存一个最小备份（只包含元数据）
            try {
                const minimalBackup = {
                    _metadata: {
                        name: this.dbName,
                        exportTime: new Date().toISOString(),
                        exportType: 'minimal_emergency_backup',
                        error: error.message,
                        reason: '强制备份失败，仅保存元数据'
                    },
                    _error: {
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    }
                };
                
                const errorBackupName = `WhaleLLTDB-error-log-${timestamp}.json`;
                const dataStr = JSON.stringify(minimalBackup, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                
                const downloadLink = document.createElement('a');
                downloadLink.href = URL.createObjectURL(dataBlob);
                downloadLink.download = errorBackupName;
                downloadLink.style.display = 'none';
                
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                URL.revokeObjectURL(downloadLink.href);
                
                console.log(`错误日志已保存: ${errorBackupName}`);
            } catch (logError) {
                console.error('连错误日志都无法保存:', logError);
            }
            
            return {
                success: false,
                error: error.message,
                fileName: null
            };
        }
    },
    
    /**
     * 提供用户友好的修复选项
     */
    async offerUserRepairOptions() {
        const MANUAL_REPAIR_KEY = 'freeapp_manual_repair_offered';
        const lastOffered = localStorage.getItem(MANUAL_REPAIR_KEY);
        const today = new Date().toDateString();
        
        // 每天最多提示一次
        if (lastOffered === today) {
            return { offered: false, reason: '今日已提示过' };
        }
        
        try {
            const diagnosis = await this.diagnoseDatabaseState();
            
            if (!diagnosis.needsRepair) {
                return { offered: false, reason: '数据库状态正常' };
            }
            
            // 记录已提示
            localStorage.setItem(MANUAL_REPAIR_KEY, today);
            
            const message = `检测到数据库可能存在以下问题：\n${diagnosis.issues.join('\n')}\n\n是否要自动修复？这不会丢失您的数据。`;
            
            if (confirm(message)) {
                const repairResult = await this.autoRepairDatabase();
                
                if (repairResult.success) {
                    alert('数据库修复成功！页面将自动刷新以确保所有功能正常。');
                    setTimeout(() => window.location.reload(), 1500);
                    return { offered: true, accepted: true, success: true };
                } else {
                    let errorMsg = `自动修复失败：${repairResult.error || '未知错误'}\n\n`;
                    
                    // 如果有紧急备份信息，添加到错误消息中
                    if (repairResult.details && repairResult.details.emergencyBackup) {
                        const backup = repairResult.details.emergencyBackup;
                        if (backup.exported) {
                            errorMsg += `✅ 好消息：您的数据已自动备份到文件：${backup.fileName}\n`;
                            errorMsg += `📊 备份包含：${backup.totalRecords} 条记录，${backup.exportedStores} 个数据存储\n`;
                            errorMsg += `💾 备份文件已下载到您的下载文件夹，请妥善保管\n\n`;
                            errorMsg += `建议您：\n1. 保存好备份文件\n2. 刷新页面重试\n3. 如仍有问题，可用备份文件手动恢复数据\n4. 联系技术支持并提供备份文件`;
                        } else {
                            errorMsg += `⚠️ 数据备份也失败了：${backup.error}\n\n`;
                            errorMsg += `建议您：\n1. 立即尝试手动导出数据\n2. 刷新页面重试\n3. 清除浏览器缓存\n4. 如果问题持续，请联系技术支持`;
                        }
                    } else {
                        errorMsg += `建议您：\n1. 刷新页面重试\n2. 清除浏览器缓存\n3. 如果问题持续，请联系技术支持`;
                    }
                    
                    alert(errorMsg);
                    return { 
                        offered: true, 
                        accepted: true, 
                        success: false, 
                        error: repairResult.error,
                        emergencyBackup: repairResult.details?.emergencyBackup
                    };
                }
            } else {
                // 用户拒绝修复，提供其他选项
                const alternatives = `如果您继续遇到问题，可以尝试：\n1. 刷新页面\n2. 清除浏览器缓存\n3. 重新启动浏览器\n\n注意：如果问题持续存在，建议接受自动修复。`;
                alert(alternatives);
                return { offered: true, accepted: false };
            }
            
        } catch (error) {
            console.error('提供修复选项时出错:', error);
            return { offered: false, error: error.message };
        }
    },
    
    /**
     * 检查是否需要主动提供修复选项
     */
    async checkAndOfferRepair() {
        // 延迟检查，避免影响正常初始化
        setTimeout(async () => {
            try {
                const diagnosis = await this.diagnoseDatabaseState();
                if (diagnosis.needsRepair) {
                    console.log('检测到数据库异常，准备提供修复选项...');
                    await this.offerUserRepairOptions();
                }
            } catch (error) {
                console.error('检查修复需求时出错:', error);
            }
        }, 2000); // 延迟2秒执行
    },
    
    /**
     * 初始化数据库 - 使用现有的db实例并检查版本升级
     */
    async init() {
        try {
            console.log('=== DatabaseManager.init() [全新简化版] ===');
            
            // 如果已经有连接，并且版本正确，直接复用
            if (window.db && window.isIndexedDBReady && window.db.version === dbManager.dbVersion) {
                console.log('复用现有连接');
                dbManager.db = window.db; // 确保内部实例同步
                return { success: true };
            }

            // 如果有任何旧的或无效的连接，先彻底清理
            if (window.db) {
                window.db.close();
                console.log('已关闭现有的数据库连接');
            }
            // 重置所有状态，确保一个干净的环境
            window.db = null;
            window.isIndexedDBReady = false;
            dbManager.db = null;
            console.log('已重置所有数据库状态，准备全新初始化...');

            // 直接调用核心的 initDB 方法，它本身就包含了升级逻辑
            // 这里的 dbManager 是在文件顶部创建的实例，所以 this 指向绝对正确
            await dbManager.initDB();

            // 最终检查：升级后，我们期望的表必须存在！
            if (!dbManager.db || !dbManager.db.objectStoreNames.contains('themeConfig')) {
                 console.error('数据库升级流程执行完毕，但关键的 themeConfig 表仍然不存在！');
                 throw new Error('数据库升级后结构不完整！');
            }

            console.log('数据库初始化/升级成功！所有检查通过。');
            return { success: true };

        } catch (error) {
            console.error('数据库初始化/升级过程中发生致命错误:', error);
            // 这里可以触发紧急备份等操作
            if (window.DatabaseManager && window.DatabaseManager.forceExportBackup) {
                console.log('尝试进行紧急备份...');
                await window.DatabaseManager.forceExportBackup();
            }
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

// 页面加载完成后初始化 - 智能协调机制，基于事件而非固定延迟
// 与 script.js 中的 initializeDatabaseOnce() 协调工作
if (typeof document !== 'undefined') {
    
    // 智能等待主应用初始化完成 - 事件+轮询混合机制
    const waitForMainAppInit = async (maxWait = 10000) => {
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            let resolved = false;
            
            // 方式1：监听数据库就绪事件（最快响应）
            const eventListener = (event) => {
                if (!resolved) {
                    resolved = true;
                    const waitTime = Date.now() - startTime;
                    console.log(`[智能协调] 通过事件检测到主应用初始化完成，等待时间: ${waitTime}ms`);
                    window.removeEventListener('databaseReady', eventListener);
                    resolve(true);
                }
            };
            window.addEventListener('databaseReady', eventListener);
            
            // 方式2：轮询检查（兜底机制）
            const checkInterval = 100; // 降低频率，节省资源
            const checkReady = () => {
                if (resolved) return;
                
                // 检查主应用是否已完成初始化
                if (window.isIndexedDBReady && window.db && window.db.version >= 13) {
                    resolved = true;
                    const waitTime = Date.now() - startTime;
                    console.log(`[智能协调] 通过轮询检测到主应用初始化完成，等待时间: ${waitTime}ms`);
                    window.removeEventListener('databaseReady', eventListener);
                    resolve(true);
                    return;
                }
                
                // 超时保护
                if (Date.now() - startTime > maxWait) {
                    if (!resolved) {
                        resolved = true;
                        console.warn(`[智能协调] 主应用初始化超时 (${maxWait}ms)，继续执行扩展初始化`);
                        window.removeEventListener('databaseReady', eventListener);
                        resolve(false);
                    }
                    return;
                }
                
                setTimeout(checkReady, checkInterval);
            };
            
            // 立即检查一次，以防事件已经错过
            checkReady();
        });
    };

    // 等待主应用初始化完成后再初始化数据库管理器
    const initializeDatabaseManager = async () => {
        try {
            // 智能等待主应用完成初始化
            const mainAppReady = await waitForMainAppInit();
            
            if (!mainAppReady) {
                console.warn('[智能协调] 主应用初始化可能未完成，但继续执行扩展初始化');
            }
            
            const result = await window.DatabaseManager.init();
            if (result.success) {
                // 增强API设置模态框
                if (typeof window.enhanceApiSettingsModal === 'function') {
                    window.enhanceApiSettingsModal();
                }
            } else {
                console.error('数据库管理器初始化失败:', result.error);
            }
        } catch (error) {
            console.error('[智能协调] 扩展初始化过程出错:', error);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // 给主应用一个最小启动时间
            setTimeout(initializeDatabaseManager, 100);
        });
    } else {
        // 页面已加载，立即开始智能等待
        setTimeout(initializeDatabaseManager, 100);
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

// === 文件存储导入导出功能 ===

/**
 * 导出文件存储数据
 */
window.exportFileStorage = function() {
    // 显示选项面板
    const optionsPanel = document.getElementById('fileExportOptions');
    if (optionsPanel) {
        optionsPanel.style.display = optionsPanel.style.display === 'none' ? 'block' : 'none';
    }
};

/**
 * 确认文件导出
 */
window.confirmFileExport = async function() {
    try {
        if (typeof showToast === 'function') {
            showToast('正在导出文件存储数据...');
        }

        // 获取选项
        const includeAvatars = document.getElementById('exportAvatars')?.checked ?? true;
        const includeBackgrounds = document.getElementById('exportBackgrounds')?.checked ?? true;
        const includeEmojis = document.getElementById('exportEmojis')?.checked ?? true;
        const includeMoments = document.getElementById('exportMoments')?.checked ?? true;

        const options = {
            includeAvatars,
            includeBackgrounds,
            includeEmojis,
            includeMoments
        };

        // 执行导出
        const result = await window.FileStorageExporter.downloadFileStorageAsZip(options);

        if (result.success) {
            if (typeof showToast === 'function') {
                showToast(result.message);
            } else {
                alert(result.message);
            }
        } else {
            throw new Error(result.error || '导出失败');
        }

        // 隐藏选项面板
        document.getElementById('fileExportOptions').style.display = 'none';

    } catch (error) {
        console.error('文件存储导出失败:', error);
        if (typeof showToast === 'function') {
            showToast('导出失败: ' + error.message);
        } else {
            alert('导出失败: ' + error.message);
        }
    }
};

/**
 * 取消文件导出
 */
window.cancelFileExport = function() {
    document.getElementById('fileExportOptions').style.display = 'none';
};

/**
 * 触发文件存储导入
 */
window.triggerFileStorageImport = function() {
    const fileInput = document.getElementById('fileStorageImportInput');
    if (fileInput) {
        fileInput.click();
    } else {
        console.error('未找到文件存储导入元素！');
        if (typeof showToast === 'function') {
            showToast('导入功能不可用，请刷新页面');
        } else {
            alert('导入功能不可用，请刷新页面');
        }
    }
};

/**
 * 处理文件存储导入
 */
window.handleFileStorageImport = async function(event) {
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }

    try {
        if (typeof showToast === 'function') {
            showToast('正在处理文件存储导入...');
        }

        // 检查文件类型
        const isZipFile = file.name.toLowerCase().endsWith('.zip');
        const fileTypeText = isZipFile ? 'ZIP文件' : 'JSON文件';
        
        // 显示确认对话框
        const confirmMessage = `导入${fileTypeText}存储数据将会：\n\n` +
                              '• 自动匹配现有的联系人、表情包等\n' +
                              '• 对于匹配的项目，可选择覆盖或跳过\n' +
                              '• 对于未匹配的项目，可选择创建新项\n\n' +
                              '是否继续导入？';

        if (!confirm(confirmMessage)) {
            // 重置文件输入
            event.target.value = '';
            return;
        }

        // 显示导入选项对话框
        const overwrite = confirm('对于已存在的文件，是否要覆盖？\n\n' +
                                 '选择"确定"覆盖现有文件\n' +
                                 '选择"取消"跳过已存在的文件');

        const createMissing = confirm('对于无法匹配的文件，是否要创建新项？\n\n' +
                                    '选择"确定"创建新的引用项\n' +
                                    '选择"取消"跳过无法匹配的文件');

        // 执行导入
        await performFileStorageImport(file, {
            overwrite,
            createMissing,
            autoMatch: true,
            isZipFile: isZipFile
        });

    } catch (error) {
        console.error('文件存储导入失败:', error);
        if (typeof showToast === 'function') {
            showToast('导入失败: ' + error.message);
        } else {
            alert('导入失败: ' + error.message);
        }
    } finally {
        // 重置文件输入
        event.target.value = '';
    }
};

/**
 * 执行文件存储导入
 */
async function performFileStorageImport(file, options) {
    try {
        if (typeof showToast === 'function') {
            showToast('正在分析文件存储数据...');
        }

        let result;
        
        if (options.isZipFile) {
            // ZIP文件导入
            if (typeof showToast === 'function') {
                showToast('正在解析ZIP文件...');
            }

            // 直接执行ZIP导入（已包含预览功能）
            result = await window.FileStorageImporter.importFromZipFile(file, {
                ...options,
                progressCallback: (progress) => {
                    if (progress.phase === 'importing') {
                        const message = `正在导入 ${getCategoryDisplayName(progress.folderName)}: ${progress.current}/${progress.total}`;
                        if (typeof showToast === 'function') {
                            showToast(message);
                        }
                    }
                }
            });
        } else {
            // JSON文件导入（原有逻辑）
            const importData = await window.FileStorageExporter.readImportFile(file);
            const preview = await window.FileStorageImporter.generateImportPreview(importData);

            // 显示预览信息
            const previewMessage = `文件存储导入预览：\n\n` +
                                  `总文件数：${preview.totalFiles} 个\n` +
                                  `分类情况：\n` +
                                  Object.entries(preview.categories).map(([category, info]) => 
                                      `• ${getCategoryDisplayName(category)}: ${info.fileCount} 个文件`
                                  ).join('\n') + '\n\n' +
                                  '是否继续导入？';

            if (!confirm(previewMessage)) {
                return;
            }

            if (typeof showToast === 'function') {
                showToast('正在执行智能导入...');
            }

            // 执行智能导入
            result = await window.FileStorageImporter.smartImport(importData, {
                ...options,
                progressCallback: (progress) => {
                    if (progress.phase === 'importing') {
                        const message = `正在导入 ${getCategoryDisplayName(progress.groupKey)}: ${progress.current}/${progress.total}`;
                        if (typeof showToast === 'function') {
                            showToast(message);
                        }
                    }
                }
            });
        }

        if (result.success) {
            const results = result.results;
            const successMessage = `文件存储导入完成！\n\n` +
                                  `处理文件：${results.processed} 个\n` +
                                  `成功匹配：${results.matched} 个\n` +
                                  `新建项目：${results.created} 个\n` +
                                  `跳过文件：${results.skipped} 个\n` +
                                  `失败文件：${results.failed} 个`;

            if (typeof showToast === 'function') {
                showToast('导入成功！刷新页面以查看效果');
            }

            alert(successMessage + '\n\n页面将自动刷新以更新显示');

            // 刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            throw new Error(result.error || '导入失败');
        }

    } catch (error) {
        console.error('performFileStorageImport 失败:', error);
        throw error;
    }
}

/**
 * 获取分类显示名称
 */
function getCategoryDisplayName(category) {
    const displayNames = {
        'avatars': '头像图片',
        'user_avatars': '用户头像',
        'backgrounds': '聊天背景',
        'emojis': '表情包',
        'moments': '朋友圈图片'
    };
    return displayNames[category] || category;
}

/**
 * 获取文件存储统计信息
 */
window.getFileStorageStats = async function() {
    try {
        const stats = await window.FileStorageExporter.getStorageStatistics();
        return {
            success: true,
            stats: stats
        };
    } catch (error) {
        console.error('获取文件存储统计失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// === 从 script.js 提取的数据库管理增强功能 ===

// 数据库重试配置
const DB_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    connectionRetries: 10,
    connectionRetryInterval: 5000
};

// 数据库状态跟踪
let dbConnectionAttempts = 0;
let dbConnectionTimer = null;
let dbReadinessCheckInterval = null;

/**
 * 用户友好的错误对话框
 */
function showDatabaseErrorDialog(error, isRetrying = false) {
    const title = isRetrying ? '数据库重试中...' : '数据库连接失败';
    const message = isRetrying 
        ? `数据库连接异常，正在自动重试... (${dbConnectionAttempts}/${DB_RETRY_CONFIG.connectionRetries})\n\n错误信息: ${error.message}`
        : `数据库连接失败，所有重试都已用尽。\n\n错误信息: ${error.message}\n\n建议:\n1. 刷新页面重试\n2. 清除浏览器缓存\n3. 检查浏览器是否支持IndexedDB`;
    
    // 创建自定义对话框
    if (!document.getElementById('db-error-dialog')) {
        const dialog = document.createElement('div');
        dialog.id = 'db-error-dialog';
        dialog.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.8); display: flex; align-items: center; 
            justify-content: center; z-index: 10000; font-family: Arial, sans-serif;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: white; padding: 30px; border-radius: 12px; 
            max-width: 500px; margin: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
    }
    
    const dialog = document.getElementById('db-error-dialog');
    const content = dialog.querySelector('div');
    content.innerHTML = `
        <h3 style="color: ${isRetrying ? '#ffa500' : '#dc3545'}; margin-top: 0;">${title}</h3>
        <p style="margin: 15px 0; line-height: 1.6; white-space: pre-line;">${message}</p>
        ${!isRetrying ? `
            <div style="text-align: right; margin-top: 20px;">
                <button onclick="location.reload()" style="
                    background: #007bff; color: white; border: none; 
                    padding: 10px 20px; border-radius: 6px; cursor: pointer;
                ">刷新页面</button>
            </div>
        ` : ''}
    `;
    
    dialog.style.display = 'flex';
    
    if (isRetrying) {
        setTimeout(() => {
            if (dialog && dialog.parentNode) {
                dialog.style.display = 'none';
            }
        }, 3000);
    }
}

/**
 * 带递增等待时间的重试机制
 */
async function retryWithBackoff(operation, context = '', retries = DB_RETRY_CONFIG.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`${context} - 尝试第 ${attempt}/${retries} 次`);
            const result = await operation();
            if (attempt > 1) {
                console.log(`${context} - 第 ${attempt} 次尝试成功`);
                if (typeof showToast === 'function') showToast('数据库连接已恢复', 'success');
            }
            return result;
        } catch (error) {
            console.error(`${context} - 第 ${attempt}/${retries} 次尝试失败:`, error);
            
            if (attempt === retries) {
                console.error(`${context} - 所有重试都已失败，抛出最终错误`);
                throw error;
            }
            
            // 计算递增等待时间
            const delay = Math.min(
                DB_RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
                DB_RETRY_CONFIG.maxDelay
            );
            
            console.log(`${context} - 等待 ${delay}ms 后重试...`);
            if (typeof showToast === 'function') showToast(`${context}失败，${delay/1000}秒后重试 (${attempt}/${retries})`, 'warning');
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * IndexedDB就绪状态检查
 */
function waitForIndexedDBReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        function checkReady() {
            console.log(`[DEBUG-FIXED] checkReady检查: window.isIndexedDBReady=${window.isIndexedDBReady}, window.db=${!!window.db}`);
            if (window.isIndexedDBReady && window.db) {
                console.log('IndexedDB就绪状态检查: 已就绪 [FIXED]');
                resolve(true);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                console.error('IndexedDB就绪状态检查: 超时');
                reject(new Error(`IndexedDB就绪检查超时 (${timeout}ms)`));
                return;
            }
            
            setTimeout(checkReady, 100);
        }
        
        checkReady();
    });
}

/**
 * 增强版数据库连接监控
 */
function startConnectionMonitoring() {
    if (dbReadinessCheckInterval) {
        clearInterval(dbReadinessCheckInterval);
    }
    
    dbReadinessCheckInterval = setInterval(() => {
        if (!window.isIndexedDBReady || !window.db) {
            console.warn('检测到数据库连接断开，准备自动重连...');
            clearInterval(dbReadinessCheckInterval);
            handleConnectionLoss();
        }
    }, 30000); // 每30秒检查一次连接状态
}

/**
 * 数据库连接断开处理
 */
async function handleConnectionLoss() {
    dbConnectionAttempts = 0;
    
    const attemptReconnection = async () => {
        dbConnectionAttempts++;
        console.log(`数据库自动重连 - 第 ${dbConnectionAttempts}/${DB_RETRY_CONFIG.connectionRetries} 次尝试`);
        
        try {
            const result = await window.DatabaseManager.init();
            if (!result.success) {
            // 如果标准的初始化流程都失败了，那重连也就失败了
            throw new Error(result.error || 'DatabaseManager 重新初始化失败');
        }

        console.log('数据库自动重连成功');
        if (typeof showToast === 'function') showToast('数据库连接已自动恢复', 'success');
        startConnectionMonitoring();

        } catch (error) {
            console.error(`数据库重连第 ${dbConnectionAttempts} 次失败:`, error);
            
            if (dbConnectionAttempts >= DB_RETRY_CONFIG.connectionRetries) {
                console.error('数据库自动重连失败，所有重试都已用尽');
                showDatabaseErrorDialog(new Error('数据库连接失败，请手动刷新页面'), false);
                return;
            }
            
            // 继续重试
            dbConnectionTimer = setTimeout(
                attemptReconnection, 
                DB_RETRY_CONFIG.connectionRetryInterval
            );
        }
    };
    
    // 开始重连
    attemptReconnection();
}

/**
 * 增强版IndexedDB请求辅助函数 - 带重试机制
 */
function promisifyRequest(request, context = '数据库操作') {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            console.log(`${context} - 请求成功`);
            resolve(request.result);
        };
        
        request.onerror = () => {
            const error = request.error || new Error(`${context}失败`);
            console.error(`${context} - 请求失败:`, {
                errorName: error.name,
                errorMessage: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString()
            });
            reject(error);
        };
        
        request.onblocked = () => {
            const error = new Error(`${context} - 请求被阻塞，可能有其他标签页正在使用数据库`);
            console.warn(error.message);
            reject(error);
        };
    });
}

/**
 * 增强版IndexedDB事务辅助函数 - 带重试机制
 */
function promisifyTransaction(transaction, context = '数据库事务') {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            console.log(`${context} - 事务完成`);
            resolve();
        };
        
        transaction.onerror = () => {
            const error = transaction.error || new Error(`${context}失败`);
            console.error(`${context} - 事务失败:`, {
                errorName: error.name,
                errorMessage: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString()
            });
            reject(error);
        };
        
        transaction.onabort = () => {
            const error = new Error(`${context} - 事务被中止`);
            console.error(error.message);
            reject(error);
        };
    });
}

/**
 * 带重试的数据库操作包装器
 */
async function executeWithRetry(operation, context = '数据库操作') {
    return await retryWithBackoff(operation, context);
}

/**
 * 增强版数据库就绪检查 - 在执行操作前确保数据库可用
 */
async function ensureDBReady(operation, context = '数据库操作') {
    try {
        // 首先等待数据库就绪
        await waitForIndexedDBReady();
        
        // 然后执行操作，带重试机制
        return await executeWithRetry(operation, context);
        
    } catch (error) {
        console.error(`${context} - 确保数据库就绪失败:`, error);
        
        // 如果是连接问题，尝试重新连接
        if (error.message.includes('超时') || error.message.includes('连接')) {
            console.log(`${context} - 检测到连接问题，触发重连...`);
            handleConnectionLoss();
        }
        
        throw error;
    }
}

/**
 * 时间格式化函数
 */
function formatTime(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const postTime = new Date(timestamp);
    const diff = now.getTime() - postTime.getTime();

    const diffMinutes = Math.floor(diff / (1000 * 60));
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays < 1) {
        if (diffHours < 1) {
            return `${Math.max(1, diffMinutes)}分钟前`;
        }
        return `${diffHours}小时前`;
    } else if (diffDays < 2) {
        return '1天前';
    } else {
        const isSameYear = now.getFullYear() === postTime.getFullYear();
        const month = (postTime.getMonth() + 1).toString().padStart(2, '0');
        const day = postTime.getDate().toString().padStart(2, '0');
        
        if (isSameYear) {
            const hours = postTime.getHours().toString().padStart(2, '0');
            const minutes = postTime.getMinutes().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        } else {
            return `${postTime.getFullYear()}-${month}-${day}`;
        }
    }
}

// 创建数据库工具命名空间 - 核心辅助函数
window.DatabaseUtils = {
    showDatabaseErrorDialog,
    retryWithBackoff,
    waitForIndexedDBReady,
    startConnectionMonitoring,
    handleConnectionLoss,
    promisifyRequest,
    promisifyTransaction,
    executeWithRetry,
    ensureDBReady,
    formatTime
};

// 为了向后兼容，保留一些关键的全局引用
// TODO: Remove these global assignments once all code is updated to use DatabaseUtils.
window.ensureDBReady = ensureDBReady;
window.promisifyRequest = promisifyRequest;
window.executeWithRetry = executeWithRetry;
window.waitForIndexedDBReady = waitForIndexedDBReady;

// 自动启动连接监控
if (typeof window !== 'undefined' && window.isIndexedDBReady) {
    startConnectionMonitoring();
}

// ==== 持久化存储管理功能 ====

/**
 * 持久化存储管理器 - 统一管理所有与持久化存储相关的功能
 * 避免全局命名空间污染，提供清晰的功能分组
 */
window.StorageManager = {
    /**
     * 检查IndexedDB是否为持久化存储
     */
    async checkPersistentStorage() {
        try {
            if ('storage' in navigator && 'persisted' in navigator.storage) {
                const isPersistent = await navigator.storage.persisted();
                const estimate = await navigator.storage.estimate();
                
                return {
                    success: true,
                    isPersistent: isPersistent,
                    estimate: estimate
                };
            } else {
                return {
                    success: false,
                    error: '浏览器不支持Storage API',
                    isPersistent: false
                };
            }
        } catch (error) {
            console.error('检查持久化存储状态失败:', error);
            return {
                success: false,
                error: error.message,
                isPersistent: false
            };
        }
    },

    /**
     * 申请持久化存储权限
     */
    async requestPersistentStorage() {
        try {
            if ('storage' in navigator && 'persist' in navigator.storage) {
                const granted = await navigator.storage.persist();
                const estimate = await navigator.storage.estimate();
                
                return {
                    success: true,
                    granted: granted,
                    estimate: estimate,
                    message: granted ? '持久化存储申请成功！数据现在更安全了。' : '持久化存储申请未通过，建议多访问网页、等几天再尝试。'
                };
            } else {
                return {
                    success: false,
                    error: '浏览器不支持Storage API',
                    granted: false
                };
            }
        } catch (error) {
            console.error('申请持久化存储失败:', error);
            return {
                success: false,
                error: error.message,
                granted: false
            };
        }
    },

    /**
     * 更新持久化状态指示器 - 使用CSS驱动的状态管理
     */
    updatePersistentStatusIndicator(persistentResult) {
        const persistentIndicator = document.getElementById('persistentStatusIndicator');
        if (!persistentIndicator) return;

        let status = 'unknown';
        let content = '❓状态未知';
        
        if (persistentResult.success) {
            if (persistentResult.isPersistent) {
                status = 'persistent';
                content = '🎉🟢数据已持久存储';
            } else {
                status = 'not-persistent';
                content = '❤️‍🩹🟡数据未持久存储';
            }
        }
        
        // 使用 data-* 属性控制样式，实现关注点分离
        persistentIndicator.dataset.status = status;
        persistentIndicator.innerHTML = content;
    },

    /**
     * 申请持久化存储并刷新状态
     */
    async requestPersistentStorageAndRefresh() {
        const requestBtn = document.querySelector('.request-persistent-btn');
        const persistentIndicator = document.getElementById('persistentStatusIndicator');
        
        try {
            if (requestBtn) {
                requestBtn.textContent = '申请中...';
                requestBtn.disabled = true;
            }
            
            if (persistentIndicator) {
                persistentIndicator.innerHTML = '⏳ 申请中...';
                persistentIndicator.dataset.status = 'requesting';
            }
            
            const result = await this.requestPersistentStorage();
            
            if (result.success) {
                if (typeof showToast === 'function') {
                    showToast(result.message);
                } else {
                    alert(result.message);
                }
                
                // 刷新状态显示
                setTimeout(() => {
                    if (typeof window.refreshDatabaseStats === 'function') {
                        window.refreshDatabaseStats();
                    }
                }, 500);
                
            } else {
                if (typeof showToast === 'function') {
                    showToast('申请失败: ' + result.error);
                } else {
                    alert('申请失败: ' + result.error);
                }
                
                if (persistentIndicator) {
                    persistentIndicator.innerHTML = '❌ 申请失败';
                    persistentIndicator.dataset.status = 'error';
                }
            }
        } catch (error) {
            console.error('申请持久化存储出错:', error);
            
            if (typeof showToast === 'function') {
                showToast('申请出错: ' + error.message);
            } else {
                alert('申请出错: ' + error.message);
            }
            
            if (persistentIndicator) {
                persistentIndicator.innerHTML = '❌ 申请出错';
                persistentIndicator.dataset.status = 'error';
            }
        } finally {
            if (requestBtn) {
                requestBtn.textContent = '💾 申请持久化数据库';
                requestBtn.disabled = false;
            }
        }
    },

    /**
     * 显示持久化存储说明弹窗 - 使用预定义HTML结构
     */
    showPersistentStorageInfo() {
        const modal = document.getElementById('persistentStorageInfoModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    /**
     * 关闭持久化存储说明弹窗
     */
    closePersistentStorageInfo() {
        const modal = document.getElementById('persistentStorageInfoModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
};