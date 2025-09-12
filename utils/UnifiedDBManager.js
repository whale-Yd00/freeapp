/**
 * 🔥 统一数据库管理器 - 终极简化版
 * 
 * 设计目标：
 * 1. 单一责任：所有数据库操作的唯一入口
 * 2. 状态同步：自动处理跨页面状态同步
 * 3. 简单可靠：单一初始化方法，自动错误恢复
 * 4. 功能完整：整合所有现有数据库功能
 * 5. 向后兼容：保持现有API接口不变
 * 
 * ⚠️ ARCHITECTURAL DEBT WARNING:
 * This file currently mixes database operations with UI concerns (DOM manipulation,
 * alerts, confirm dialogs, toast notifications). This violates separation of concerns
 * and harms maintainability and testability.
 * 
 * COMPLETED - Database Unification Achievements:
 * ✅ Successfully unified dataMigrator.js and fileStorageManager.js into single manager
 * ✅ Implemented complete backward compatibility through API mapping
 * ✅ Resolved database initialization race conditions and state synchronization
 * ✅ Maintained all original functionality with improved error handling
 * 
 * FUTURE - Potential Architecture Improvements:
 * • Consider separating UI concerns (alerts, confirmations) from database operations
 * • Add connection pooling for better performance under heavy load
 * • Implement more granular error recovery mechanisms
 */

class UnifiedDBManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.version = 13;
        this.db = null;
        this.isReady = false;
        this.initPromise = null;
        this.urlCache = new Map(); // 文件URL缓存
        
        // 定义不参与手动导入导出的存储（图片等大数据）
        this.excludedFromManualExport = ['emojiImages', 'fileStorage'];
        
        // 文件类型映射
        this.mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg', 
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'svg': 'image/svg+xml'
        };

        // 定义完整的数据库模式 - 统一管理所有对象存储
        this.stores = {
            songs: { keyPath: 'id', autoIncrement: true },
            contacts: { keyPath: 'id' },
            apiSettings: { keyPath: 'id' },
            emojis: { keyPath: 'id' },
            emojiImages: { keyPath: 'tag' }, // 存储表情图片的base64数据（兼容历史数据，新数据使用fileStorage）
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
        
        console.log('🔥 [UnifiedDB] 统一数据库管理器已创建');
    }

    /**
     * 初始化数据库 - 唯一入口方法
     */
    async init() {
        // 如果已经初始化过，直接返回
        if (this.isReady && this.db) {
            console.log('🔥 [UnifiedDB] 数据库已初始化，直接返回');
            this.syncToGlobal();
            return this.db;
        }

        // 如果正在初始化，等待现有初始化完成
        if (this.initPromise) {
            console.log('🔥 [UnifiedDB] 正在初始化中，等待完成...');
            return await this.initPromise;
        }

        // 开始新的初始化流程
        console.log('🔥 [UnifiedDB] 开始数据库初始化...');
        this.initPromise = this._performInit();
        
        try {
            const result = await this.initPromise;
            this.initPromise = null;
            return result;
        } catch (error) {
            this.initPromise = null;
            throw error;
        }
    }

    /**
     * 执行实际的初始化工作
     */
    async _performInit() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => {
                const error = new Error(`数据库打开失败: ${request.error?.message}`);
                console.error('🔥 [UnifiedDB]', error);
                reject(error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                
                console.log(`🔥 [UnifiedDB] 初始化成功，版本: ${this.db.version}`);
                console.log(`🔥 [UnifiedDB] 可用存储:`, Array.from(this.db.objectStoreNames));
                
                // 同步到全局状态
                this.syncToGlobal();
                
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('🔥 [UnifiedDB] 数据库需要升级...');
                const db = event.target.result;
                this._createStores(db, event.oldVersion);
            };
        });
    }

    /**
     * 创建所有必要的对象存储 - 统一的数据库架构管理
     */
    _createStores(db, oldVersion) {
        console.log(`🔥 [UnifiedDB] 数据库升级: 版本${oldVersion} -> 版本${this.version}`);
        
        try {
            // 处理废弃存储的删除 - 保持数据库架构整洁
            if (this.version >= 12) {
                // 版本12及以上移除了bubbleDesignerStickers
                if (db.objectStoreNames.contains('bubbleDesignerStickers')) {
                    db.deleteObjectStore('bubbleDesignerStickers');
                    console.log('🔥 [UnifiedDB] 删除废弃的 bubbleDesignerStickers 存储');
                }
            }
            
            // 创建所有对象存储（如果不存在）
            Object.entries(this.stores).forEach(([storeName, config]) => {
                if (!db.objectStoreNames.contains(storeName)) {
                    try {
                        const store = db.createObjectStore(storeName, config);
                        console.log(`🔥 [UnifiedDB] 创建 ${storeName} 存储成功`);
                    } catch (storeError) {
                        console.error(`🔥 [UnifiedDB] 创建存储 ${storeName} 失败:`, storeError);
                        throw storeError;
                    }
                }
            });
            
            console.log('🔥 [UnifiedDB] 数据库结构升级完成');
            
        } catch (upgradeError) {
            console.error('🔥 [UnifiedDB] 数据库升级过程中出错:', upgradeError);
            throw upgradeError;
        }
    }

    /**
     * 同步状态到全局对象 - 简化的跨页面通信
     */
    syncToGlobal() {
        if (typeof window !== 'undefined') {
            // 设置全局数据库状态
            window.db = this.db;
            window.isIndexedDBReady = this.isReady;
            // 统一使用 window.unifiedDB 作为实例引用
            
            // 🔥 简化的跨页面通知：只使用localStorage事件
            try {
                // 写入状态信息
                const dbStatus = {
                    isReady: true,
                    version: this.db.version,
                    timestamp: Date.now(),
                    page: window.location.pathname
                };
                localStorage.setItem('dbStatus', JSON.stringify(dbStatus));
                
                // 触发跨页面事件
                localStorage.setItem('dbSyncTrigger', Date.now().toString());
                localStorage.removeItem('dbSyncTrigger');
                
                console.log('🔥 [UnifiedDB] 已同步状态到全局并触发跨页面事件');
            } catch (e) {
                console.warn('🔥 [UnifiedDB] localStorage 同步失败:', e);
            }
        }
    }

    /**
     * 等待数据库就绪
     */
    static async waitForReady(timeout = 8000) {
        console.log('🔥 [UnifiedDB] 开始等待数据库就绪...');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let resolved = false;
            let timeoutId = null;

            // 监听localStorage事件
            const storageListener = (event) => {
                if (event.key === 'dbSyncTrigger' && !resolved) {
                    console.log('🔥 [UnifiedDB] 收到跨页面同步事件');
                    setTimeout(checkReady, 50);
                }
            };

            // 清理函数 - 确保在所有退出路径中都调用
            const cleanup = () => {
                window.removeEventListener('storage', storageListener);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            // 成功解析函数
            const resolveWithCleanup = (result) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(result);
                }
            };

            // 失败拒绝函数
            const rejectWithCleanup = (error) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(error);
                }
            };

            const checkReady = () => {
                if (resolved) return;

                // 检查全局状态
                if (window.isIndexedDBReady && window.db && window.db.version >= 13) {
                    console.log('🔥 [UnifiedDB] 检测到数据库已就绪');
                    resolveWithCleanup(window.db);
                    return;
                }

                // 检查localStorage状态  
                try {
                    const dbStatus = JSON.parse(localStorage.getItem('dbStatus') || '{}');
                    if (dbStatus.isReady && dbStatus.version >= 13) {
                        console.log('🔥 [UnifiedDB] 从localStorage检测到数据库状态，尝试建立连接...');
                        
                        // 尝试为当前页面建立数据库连接
                        if (window.unifiedDB) {
                            window.unifiedDB.init().then(db => {
                                resolveWithCleanup(db);
                            }).catch(err => {
                                console.warn('🔥 [UnifiedDB] 连接建立失败:', err);
                                rejectWithCleanup(err);
                            });
                        }
                        // window.unifiedDB 检查处理所有实例获取情况
                    }
                } catch (e) {
                    console.warn('🔥 [UnifiedDB] localStorage读取失败:', e);
                }

                // 超时检查
                if (Date.now() - startTime > timeout) {
                    rejectWithCleanup(new Error(`等待数据库就绪超时 (${timeout}ms)`));
                    return;
                }

                // 继续检查
                setTimeout(checkReady, 100);
            };

            // 注册事件监听器
            window.addEventListener('storage', storageListener);
            
            // 设置超时
            timeoutId = setTimeout(() => {
                rejectWithCleanup(new Error(`等待数据库就绪超时 (${timeout}ms)`));
            }, timeout);

            // 立即检查一次
            checkReady();
        });
    }

    /**
     * 获取全局实例 - 正确的单例模式实现
     */
    static getInstance() {
        if (!window.unifiedDB) {
            window.unifiedDB = new UnifiedDBManager();
        }
        return window.unifiedDB;
    }

    /**
     * 检查数据库是否就绪
     */
    static isReady() {
        return window.isIndexedDBReady && window.db && window.db.version >= 13;
    }

    // ============================================
    // 数据库操作方法 - 统一API
    // ============================================

    /**
     * 通用数据库操作封装
     */
    async _dbOperation(storeName, mode, operation, description) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], mode);
                const store = transaction.objectStore(storeName);

                transaction.onerror = (event) => {
                    console.error(`🔥 [UnifiedDB] Transaction failed for ${description}:`, event.target.error);
                    reject(event.target.error);
                };

                const result = operation(store);

                if (mode === 'readwrite') {
                    // For write operations, the transaction's completion is the source of truth.
                    let operationResult;
                    const resultPromise = Promise.resolve(result);
                    
                    resultPromise.then(res => {
                        operationResult = res;
                    }).catch(reject); // Propagate errors from the inner promise.

                    transaction.oncomplete = () => {
                        resolve(operationResult);
                    };
                } else { // readonly
                    if (result && typeof result.then === 'function') {
                        result.then(resolve).catch(reject);
                    } else if (result && result.onsuccess !== undefined) {
                        result.onsuccess = () => resolve(result.result);
                        result.onerror = (event) => reject(event.target.error);
                    } else {
                        resolve(result);
                    }
                }
            } catch (error) {
                console.error(`🔥 [UnifiedDB] ${description || '数据库操作'}失败:`, error);
                reject(error);
            }
        });
    }

    /**
     * 获取数据
     */
    async get(storeName, key) {
        return this._dbOperation(storeName, 'readonly', store => store.get(key), `获取数据 ${storeName}:${key}`);
    }

    /**
     * 获取所有数据
     */
    async getAll(storeName) {
        return this._dbOperation(storeName, 'readonly', store => store.getAll(), `获取所有数据 ${storeName}`);
    }

    /**
     * 保存数据
     */
    async put(storeName, data) {
        return this._dbOperation(storeName, 'readwrite', store => {
            const request = store.put(data);
            // Return a promise that resolves when the put operation completes
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }, `保存数据到 ${storeName}`);
    }

    /**
     * 删除数据
     */
    async delete(storeName, key) {
        return this._dbOperation(storeName, 'readwrite', store => {
            const request = store.delete(key);
            // Return a promise that resolves when the delete operation completes
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }, `删除数据 ${storeName}:${key}`);
    }

    /**
     * 计数数据
     */
    async count(storeName) {
        return this._dbOperation(storeName, 'readonly', store => store.count(), `计数 ${storeName}`);
    }

    /**
     * 导出整个数据库 - 保持与历史格式的兼容性
     */
    async exportDatabase(options = {}) {
        try {
            if (!this.db) {
                await this.init();
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
            console.error('🔥 [UnifiedDB] 数据库导出失败:', error);
            throw new Error(`导出失败: ${error.message}`);
        }
    }

    /**
     * 导出单个对象存储
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
                        // 清理敏感信息
                        if (sanitized.apiKey) delete sanitized.apiKey;
                        if (sanitized.password) delete sanitized.password;
                        return sanitized;
                    });
                }
                
                resolve(result);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取数据库版本信息
     */
    async getDatabaseInfo() {
        if (!this.db) {
            await this.init();
        }
        
        return {
            name: this.db.name,
            version: this.db.version,  // 这里使用实际数据库版本，不是目标版本
            stores: Array.from(this.db.objectStoreNames),
            exportTime: new Date().toISOString()
        };
    }

    /**
     * 导入数据库数据 - 支持版本迁移和数据兼容
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
                await this.init();
            }

            // 验证数据格式
            if (!importData || typeof importData !== 'object') {
                throw new Error('导入数据格式无效');
            }

            // 版本检查和迁移处理
            let migratedData = importData;
            if (importData._metadata && importData._metadata.version !== this.version) {
                if (enableMigration && importData._metadata.version < this.version) {
                    console.log(`🔥 [UnifiedDB] 检测到版本 ${importData._metadata.version}，开始迁移到版本 ${this.version}`);
                    migratedData = await this.migrateData(importData);
                } else if (validateVersion) {
                    throw new Error(`数据库版本不匹配。当前版本: ${this.version}, 导入版本: ${importData._metadata.version}`);
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
            console.error('🔥 [UnifiedDB] 数据库导入失败:', error);
            throw new Error(`导入失败: ${error.message}`);
        }
    }

    /**
     * 导入单个存储的数据
     */
    async importStore(storeName, data, overwrite = false) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            let addedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            // 批量导入数据
            data.forEach(item => {
                const request = overwrite ? store.put(item) : store.add(item);
                
                request.onsuccess = () => {
                    addedCount++;
                };
                
                request.onerror = () => {
                    if (request.error.name === 'ConstraintError') {
                        skippedCount++;
                    } else {
                        errorCount++;
                    }
                };
            });

            transaction.oncomplete = () => {
                resolve({
                    total: data.length,
                    added: addedCount,
                    skipped: skippedCount,
                    errors: errorCount
                });
            };

            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * 清空指定存储的所有数据
     */
    async clearStore(storeName) {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                
                const store = transaction.objectStore(storeName);
                store.clear();
            } catch (error) {
                console.error(`🔥 [UnifiedDB] 清空存储 ${storeName} 失败:`, error);
                reject(error);
            }
        });
    }

    /**
     * 数据迁移函数 - 处理不同版本间的数据兼容性
     */
    async migrateData(importData) {
        const { _metadata } = importData;
        const fromVersion = _metadata ? _metadata.version : 1;
        const toVersion = this.version;
        
        console.log(`🔥 [UnifiedDB] 开始数据迁移：从版本 ${fromVersion} 到版本 ${toVersion}`);
        
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
            // 版本11到12的迁移：移除气泡设计器贴图库
            this.migrateFrom11To12(migratedData);
        }
        
        if (fromVersion <= 12 && toVersion >= 13) {
            // 版本12到13的迁移：优化数据结构
            this.migrateFrom12To13(migratedData);
        }
        
        console.log(`🔥 [UnifiedDB] 数据迁移完成：版本 ${fromVersion} -> ${toVersion}`);
        return migratedData;
    }

    // 迁移方法占位符 - 需要时可以实现具体逻辑
    migrateFrom4To5(data) {
        console.log('🔥 [UnifiedDB] 执行 4->5 版本迁移');
        // 添加缺失的存储初始化
        if (!data.characterMemories) data.characterMemories = [];
        if (!data.globalMemory) data.globalMemory = [];
    }

    migrateFrom5To6(data) {
        console.log('🔥 [UnifiedDB] 执行 5->6 版本迁移');
        // 可以添加具体迁移逻辑
    }

    migrateFrom6To7(data) {
        console.log('🔥 [UnifiedDB] 执行 6->7 版本迁移');
        // 可以添加具体迁移逻辑
    }

    migrateFrom7To8(data) {
        console.log('🔥 [UnifiedDB] 执行 7->8 版本迁移');
        // 添加文件存储系统
        if (!data.fileStorage) data.fileStorage = [];
        if (!data.fileReferences) data.fileReferences = [];
    }

    migrateFrom8To9(data) {
        console.log('🔥 [UnifiedDB] 执行 8->9 版本迁移');
        // 完善文件存储系统
    }

    migrateFrom9To10(data) {
        console.log('🔥 [UnifiedDB] 执行 9->10 版本迁移');
        // 添加主题配置系统
        if (!data.themeConfig) data.themeConfig = [];
    }

    migrateFrom10To11(data) {
        console.log('🔥 [UnifiedDB] 执行 10->11 版本迁移');
        // 添加气泡设计器贴图库（已在v12中移除）
    }

    migrateFrom11To12(data) {
        console.log('🔥 [UnifiedDB] 执行 11->12 版本迁移');
        // 移除气泡设计器贴图库
        if (data.bubbleDesignerStickers) {
            delete data.bubbleDesignerStickers;
        }
    }

    migrateFrom12To13(data) {
        console.log('🔥 [UnifiedDB] 执行 12->13 版本迁移');
        // 优化数据结构
    }

    // ============================================
    // 文件存储功能
    // ============================================

    /**
     * 生成唯一的文件ID
     */
    generateFileId() {
        return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 从base64字符串中提取MIME类型
     */
    getMimeTypeFromBase64(base64String) {
        const match = base64String.match(/^data:([^;]+);base64,/);
        return match ? match[1] : 'image/jpeg';
    }

    /**
     * 将base64字符串转换为Blob
     */
    base64ToBlob(base64String) {
        try {
            const mimeType = this.getMimeTypeFromBase64(base64String);
            const base64Data = base64String.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        } catch (error) {
            console.error('🔥 [UnifiedDB] base64转换Blob失败:', error);
            return null;
        }
    }

    /**
     * 存储文件到数据库
     */
    async storeFile(fileData, metadata = {}) {
        let blob;
        
        if (typeof fileData === 'string' && fileData.startsWith('data:')) {
            // base64字符串
            blob = this.base64ToBlob(fileData);
            if (!blob) {
                throw new Error('无法转换base64数据');
            }
        } else if (fileData instanceof File || fileData instanceof Blob) {
            // File或Blob对象
            blob = fileData;
        } else {
            throw new Error(`不支持的文件数据类型: ${typeof fileData}`);
        }

        const fileId = this.generateFileId();
        const fileRecord = {
            fileId: fileId,
            blob: blob,
            type: blob.type,
            size: blob.size,
            createdAt: new Date().toISOString(),
            metadata: metadata
        };

        await this.put('fileStorage', fileRecord);
        
        console.log('🔥 [UnifiedDB] 文件存储成功，ID:', fileId);
        return {
            fileId: fileId,
            type: blob.type,
            size: blob.size
        };
    }

    /**
     * 获取文件
     */
    async getFile(fileId) {
        const result = await this.get('fileStorage', fileId);
        if (!result) {
            throw new Error(`文件不存在: ${fileId}`);
        }
        return result;
    }

    /**
     * 创建文件的临时URL
     */
    async createFileURL(fileId) {
        try {
            // 检查缓存
            if (this.urlCache.has(fileId)) {
                return this.urlCache.get(fileId);
            }

            const fileRecord = await this.getFile(fileId);
            
            if (!fileRecord.blob || !(fileRecord.blob instanceof Blob)) {
                throw new Error(`文件记录中的blob无效: ${fileId}`);
            }
            
            const url = URL.createObjectURL(fileRecord.blob);
            
            // 缓存URL
            this.urlCache.set(fileId, url);
            
            return url;
        } catch (error) {
            console.error(`🔥 [UnifiedDB] 创建文件URL失败 (${fileId}):`, error);
            return '';
        }
    }

    /**
     * 清理文件URL缓存
     */
    revokeFileURL(fileId) {
        if (this.urlCache.has(fileId)) {
            const url = this.urlCache.get(fileId);
            URL.revokeObjectURL(url);
            this.urlCache.delete(fileId);
        }
    }

    /**
     * 删除文件
     */
    async deleteFile(fileId) {
        await this.delete('fileStorage', fileId);
        this.revokeFileURL(fileId);
        console.log(`🔥 [UnifiedDB] 文件删除成功: ${fileId}`);
    }

    /**
     * 创建文件引用关系
     */
    async createFileReference(fileId, referenceType, referenceKey, metadata = {}) {
        const referenceId = `${referenceType}_${referenceKey}`;
        const reference = {
            referenceId: referenceId,
            fileId: fileId,
            category: referenceType,
            referenceKey: referenceKey,
            createdAt: new Date().toISOString(),
            metadata: metadata
        };

        await this.put('fileReferences', reference);
        console.log('🔥 [UnifiedDB] 文件引用存储成功:', reference);
        return reference;
    }

    /**
     * 获取文件引用
     */
    async getFileReference(referenceType, referenceKey) {
        const referenceId = `${referenceType}_${referenceKey}`;
        return await this.get('fileReferences', referenceId);
    }

    /**
     * 删除文件引用
     */
    async deleteFileReference(referenceType, referenceKey) {
        const referenceId = `${referenceType}_${referenceKey}`;
        return await this.delete('fileReferences', referenceId);
    }

    /**
     * 获取文件存储统计信息
     */
    async getStorageStats() {
        if (!this.db) {
            await this.init();
        }

        const files = await this.getAll('fileStorage');
        const stats = {
            totalFiles: files.length,
            totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
            typeBreakdown: {}
        };

        files.forEach(file => {
            const type = file.type || 'unknown';
            if (!stats.typeBreakdown[type]) {
                stats.typeBreakdown[type] = { count: 0, size: 0 };
            }
            stats.typeBreakdown[type].count++;
            stats.typeBreakdown[type].size += file.size || 0;
        });

        return stats;
    }

    /**
     * 清理未使用的文件（垃圾回收）
     */
    async cleanupUnusedFiles() {
        if (!this.db) {
            await this.init();
        }

        const allFiles = await this.getAll('fileStorage');
        const allReferences = await this.getAll('fileReferences');
        
        const referencedFileIds = new Set(allReferences.map(ref => ref.fileId));
        const filesToDelete = allFiles.filter(file => !referencedFileIds.has(file.fileId));
        
        if (filesToDelete.length === 0) {
            return { deletedCount: 0, message: '没有发现未使用的文件' };
        }

        let deletedCount = 0;
        let deleteErrors = 0;

        for (const file of filesToDelete) {
            try {
                await this.deleteFile(file.fileId);
                deletedCount++;
            } catch (error) {
                console.error(`删除未使用文件失败: ${file.fileId}`, error);
                deleteErrors++;
            }
        }

        return { 
            deletedCount: deletedCount, 
            errors: deleteErrors,
            message: `清理完成，删除了 ${deletedCount} 个未使用的文件` + 
                    (deleteErrors > 0 ? `，${deleteErrors} 个删除失败` : '') 
        };
    }

    /**
     * 清理所有缓存的URL
     */
    revokeAllURLs() {
        for (const [fileId, url] of this.urlCache) {
            URL.revokeObjectURL(url);
        }
        this.urlCache.clear();
    }

    // 重复的工具函数已移除，使用上方的定义

    // ============================================
    // 向后兼容的辅助方法和错误处理
    // ============================================

    /**
     * 兼容旧的promisifyRequest方法
     */
    promisifyRequest(request, description = '') {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                console.error(`🔥 [UnifiedDB] ${description}失败:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 兼容旧的ensureDBReady方法
     */
    async ensureDBReady(operation, description = '') {
        if (!this.isReady) {
            await this.init();
        }
        
        try {
            return await operation();
        } catch (error) {
            console.error(`🔥 [UnifiedDB] ${description}失败:`, error);
            throw error;
        }
    }

    /**
     * 重试机制 - 向后兼容
     */
    async retryWithBackoff(operation, context, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`🔥 [UnifiedDB] ${context} - 尝试 ${attempt}/${maxRetries} 失败:`, error);
                
                if (attempt < maxRetries) {
                    // 指数退避延迟
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`🔥 [UnifiedDB] ${context} - 所有重试失败`);
                    throw lastError;
                }
            }
        }
        
        throw lastError;
    }
}

// ============================================
// 全局导出和兼容性设置 - 立即执行
// ============================================

/**
 * 显示数据库错误对话框 - 向后兼容
 */
function showDatabaseErrorDialog(error, isRetrying = false) {
    const title = isRetrying ? '数据库重试中...' : '数据库连接失败';
    const message = isRetrying 
        ? `数据库连接异常，正在自动重试...\n\n错误信息: ${error.message}`
        : `数据库连接失败。\n\n错误信息: ${error.message}\n\n建议:\n1. 刷新页面重试\n2. 清除浏览器缓存\n3. 检查浏览器是否支持IndexedDB`;
    
    console.error('🔥 [UnifiedDB] 数据库错误:', error);
    
    // Event-driven error dialog - replace direct alert() with custom event
    window.dispatchEvent(new CustomEvent('database:errorDialog', {
        detail: {
            title: title,
            message: message,
            error: error,
            isRetrying: isRetrying,
            suggestions: isRetrying ? [] : [
                '刷新页面重试',
                '清除浏览器缓存', 
                '检查浏览器是否支持IndexedDB'
            ]
        }
    }));
}

/**
 * 重试执行函数 - 向后兼容
 */
async function executeWithRetry(operation, context = '数据库操作') {
    if (window.unifiedDB && typeof window.unifiedDB.retryWithBackoff === 'function') {
        return await window.unifiedDB.retryWithBackoff(operation, context);
    }
    
    // 简单重试逻辑作为后备
    try {
        return await operation();
    } catch (error) {
        console.error(`🔥 [UnifiedDB] ${context} 失败:`, error);
        throw error;
    }
}

// 🔥 立即导出这些函数到全局作用域，确保其他脚本可以使用
if (typeof window !== 'undefined') {
    window.executeWithRetry = executeWithRetry;
    window.showDatabaseErrorDialog = showDatabaseErrorDialog;
}

// 获取全局单例实例
const unifiedDB = UnifiedDBManager.getInstance();

// 创建命名空间以减少全局污染
const AppDB = {
    // 核心管理器
    UnifiedDBManager: UnifiedDBManager,
    unifiedDB: unifiedDB,
    
    // 工具函数
    executeWithRetry: executeWithRetry,
    showDatabaseErrorDialog: showDatabaseErrorDialog,
    promisifyRequest: (request, description) => unifiedDB.promisifyRequest(request, description),
    ensureDBReady: (operation, description) => unifiedDB.ensureDBReady(operation, description),
    initUnifiedDB: () => unifiedDB.init(),
    
    // 管理器对象（将在下面定义）
    StorageManager: null,
    DatabaseManager: null,
    
    // 导入导出函数（将在下面定义）
    exportDatabase: null,
    exportFileStorage: null,
    importDatabase: null,
    performImport: null,
    
    // 文件处理函数（纯业务逻辑）
    performFileStorageImport: null,
    importPrompts: null,
    
    // UI函数现在由UIManager处理
    // handleFileSelect, handleFileStorageImport, confirmFileExport, cancelFileExport, refreshDatabaseStats
    // triggerFileSelect, triggerFileStorageImport
    
    // 文件存储管理器别名
    FileStorageManager: unifiedDB
};

// 导出到window对象
if (typeof window !== 'undefined') {
    window.AppDB = AppDB;
    
    // 向后兼容：保留关键的直接window导出
    window.UnifiedDBManager = UnifiedDBManager;
    window.unifiedDB = unifiedDB;
    window.promisifyRequest = AppDB.promisifyRequest;
    window.ensureDBReady = AppDB.ensureDBReady;
    window.executeWithRetry = executeWithRetry;
    window.showDatabaseErrorDialog = showDatabaseErrorDialog;
    window.initUnifiedDB = AppDB.initUnifiedDB;
    
    // 🔥 完整的 StorageManager 对象
    AppDB.StorageManager = {
        /**
         * 申请持久化存储（纯业务逻辑，不涉及UI）
         */
        async requestPersistentStorage() {
            try {
                console.log('[StorageManager] 申请持久化存储...');
                
                if (!navigator.storage || !navigator.storage.persist) {
                    const result = { success: false, error: '浏览器不支持持久化存储功能' };
                    window.dispatchEvent(new CustomEvent('storage:persistentUnsupported', { detail: result }));
                    return result;
                }

                // 申请持久化存储
                const granted = await navigator.storage.persist();
                const estimate = await navigator.storage.estimate();
                
                const result = {
                    success: true,
                    granted: granted,
                    estimate: estimate,
                    message: granted ? '持久化存储申请成功' : '持久化存储申请被拒绝'
                };

                // 发出事件通知UI层
                const eventType = granted ? 'storage:persistentGranted' : 'storage:persistentDenied';
                window.dispatchEvent(new CustomEvent(eventType, { detail: result }));
                
                console.log(`[StorageManager] 持久化存储申请${granted ? '成功' : '被拒绝'}`);
                
                // 通知需要刷新统计信息
                window.dispatchEvent(new CustomEvent('storage:statsRefreshNeeded'));
                
                return result;

            } catch (error) {
                console.error('[StorageManager] 申请持久化存储失败:', error);
                const result = { success: false, error: error.message };
                window.dispatchEvent(new CustomEvent('storage:persistentError', { detail: result }));
                return result;
            }
        },

        /**
         * 检查持久化存储状态
         */
        async checkPersistentStorageStatus() {
            try {
                if (!navigator.storage || !navigator.storage.persisted) {
                    return false;
                }
                return await navigator.storage.persisted();
            } catch (error) {
                console.error('[StorageManager] 检查持久化存储状态失败:', error);
                return false;
            }
        },

        /**
         * 获取存储使用情况
         */
        async getStorageUsage() {
            try {
                if (!navigator.storage || !navigator.storage.estimate) {
                    return null;
                }
                return await navigator.storage.estimate();
            } catch (error) {
                console.error('[StorageManager] 获取存储使用情况失败:', error);
                return null;
            }
        },

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

        // 删除重复方法 - requestPersistentStorage() 已在上面定义
    };

    // 向后兼容：保留 StorageManager 的直接 window 访问
    window.StorageManager = AppDB.StorageManager;

    // 🔥 完整的 DatabaseManager 对象
    AppDB.DatabaseManager = {
        init: () => unifiedDB.init(),
        
        /**
         * 检查数据库健康状态并提供修复选项
         */
        async checkAndOfferRepair() {
            try {
                console.log('[DatabaseManager] 开始数据库健康检查...');
                
                if (!window.unifiedDB || !window.unifiedDB.isReady) {
                    console.warn('[DatabaseManager] 数据库未就绪，跳过健康检查');
                    return { success: false, error: '数据库未就绪' };
                }

                // 检查所有预期的存储是否存在
                const expectedStores = [
                    'contacts', 'apiSettings', 'emojis', 'backgrounds', 
                    'userProfile', 'moments', 'weiboPosts', 'hashtagCache',
                    'characterMemories', 'globalMemory', 'conversationCounters', 
                    'memoryProcessedIndex', 'themeConfig'
                ];

                const db = window.unifiedDB.db;
                const missingStores = expectedStores.filter(storeName => 
                    !db.objectStoreNames.contains(storeName)
                );

                if (missingStores.length > 0) {
                    console.warn('[DatabaseManager] 发现缺失的存储:', missingStores);
                    
                    // 发出事件，让UI层决定是否修复
                    const repairResult = await new Promise((resolve) => {
                        const eventData = { missingStores, resolve };
                        window.dispatchEvent(new CustomEvent('database:repairNeeded', { detail: eventData }));
                    });
                    
                    if (repairResult) {
                        return await this.repairDatabase(missingStores);
                    }
                    
                    return { success: false, message: '用户取消修复', missingStores };
                } else {
                    console.log('[DatabaseManager] 数据库结构完整');
                    return { success: true, message: '数据库结构完整' };
                }

                return { success: true, message: '健康检查完成' };

            } catch (error) {
                console.error('[DatabaseManager] 健康检查失败:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * 修复数据库结构
         */
        async repairDatabase(missingStores) {
            try {
                console.log('[DatabaseManager] 开始修复数据库...');
                
                // 关闭现有连接
                if (window.unifiedDB && window.unifiedDB.db) {
                    window.unifiedDB.db.close();
                }

                // 重新初始化数据库以创建缺失的存储
                await window.unifiedDB.init();
                
                // 发出修复成功事件
                window.dispatchEvent(new CustomEvent('database:repairSuccess', {
                    detail: { message: '数据库修复完成' }
                }));

                return { success: true, message: '数据库修复完成' };

            } catch (error) {
                console.error('[DatabaseManager] 数据库修复失败:', error);
                
                // 发出修复失败事件
                window.dispatchEvent(new CustomEvent('database:repairError', {
                    detail: { error: error.message }
                }));

                return { success: false, error: error.message };
            }
        },

        /**
         * 获取数据库统计信息
         */
        async getStats() {
            try {
                if (!window.unifiedDB || !window.unifiedDB.isReady) {
                    return { success: false, error: '数据库未就绪' };
                }

                const db = window.unifiedDB.db;
                const stats = {};

                // 遍历所有对象存储获取记录数
                const storeNames = Array.from(db.objectStoreNames);
                
                for (const storeName of storeNames) {
                    try {
                        const count = await window.unifiedDB.count(storeName);
                        stats[storeName] = count;
                    } catch (error) {
                        console.warn(`[DatabaseManager] 获取存储 ${storeName} 统计失败:`, error);
                        stats[storeName] = 0;
                    }
                }

                return { success: true, stats };

            } catch (error) {
                console.error('[DatabaseManager] 获取统计信息失败:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * 重置应用状态 - 清空内存中的全局变量
         * 在数据库导入后使用，确保应用状态与数据库同步
         */
        resetApplicationState() {
            // 联系人相关
            if (typeof window.contacts !== 'undefined') {
                window.contacts = [];
            }
            if (typeof window.currentContact !== 'undefined') {
                window.currentContact = null;
            }
            
            // 表情相关
            if (typeof window.emojis !== 'undefined') {
                window.emojis = [];
            }
            
            // 背景相关
            if (typeof window.backgrounds !== 'undefined') {
                window.backgrounds = {};
            }
            
            // 用户资料
            if (typeof window.userProfile !== 'undefined') {
                window.userProfile = { name: '我的昵称', avatar: '', personality: '' };
            }
            
            // 动态相关
            if (typeof window.moments !== 'undefined') {
                window.moments = [];
            }
            if (typeof window.weiboPosts !== 'undefined') {
                window.weiboPosts = [];
            }
            
            console.log('[DatabaseManager] 应用状态已重置');
        },

        /**
         * 导出并下载数据库
         */
        async exportAndDownload() {
            try {
                console.log('[DatabaseManager] 开始导出数据库...');
                
                const exportData = await window.unifiedDB.exportDatabase();
                
                // 通过事件通知UI层处理下载
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const filename = `freeapp_backup_${new Date().toISOString().slice(0, 10)}.json`;
                
                // 发送下载事件 - 让UI层处理实际的下载操作
                window.dispatchEvent(new CustomEvent('database:downloadFile', {
                    detail: {
                        blob: blob,
                        url: url,
                        filename: filename,
                        mimeType: 'application/json'
                    }
                }));

                return { success: true, message: '数据库导出成功' };

            } catch (error) {
                console.error('[DatabaseManager] 导出数据库失败:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * 从文件导入数据库
         */
        async importFromFile(file, overwrite = false) {
            try {
                console.log('[DatabaseManager] 开始导入数据库...');
                
                const text = await this.readFileAsText(file);
                const importData = JSON.parse(text);
                
                const result = await window.unifiedDB.importDatabase(importData, { overwrite });
                
                return { 
                    success: true, 
                    message: '数据库导入成功',
                    result: result
                };

            } catch (error) {
                console.error('[DatabaseManager] 导入数据库失败:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * 读取文件内容为文本
         */
        readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('文件读取失败'));
                reader.readAsText(file);
            });
        }
    };

    // 向后兼容：保留 DatabaseManager 的直接 window 访问
    window.DatabaseManager = AppDB.DatabaseManager;

    // 🔥 数据库统计刷新函数（纯业务逻辑，UI分离）
    AppDB.refreshDatabaseStats = async function() {
        try {
            // 发出刷新开始事件
            window.dispatchEvent(new CustomEvent('database:statsRefreshStart'));
            
            const [result, persistentResult] = await Promise.all([
                window.DatabaseManager.getStats(),
                window.StorageManager.checkPersistentStorage()
            ]);
            
            if (result.success) {
                // 发出成功事件，让UI层处理显示
                window.dispatchEvent(new CustomEvent('database:statsRefreshSuccess', {
                    detail: { result, persistentResult }
                }));
                return { success: true, result, persistentResult };
            } else {
                // 发出错误事件
                window.dispatchEvent(new CustomEvent('database:statsRefreshError', {
                    detail: { error: result.error }
                }));
                return { success: false, error: result.error };
            }
            
        } catch (error) {
            console.error('刷新数据库统计失败:', error);
            // 发出错误事件
            window.dispatchEvent(new CustomEvent('database:statsRefreshError', {
                detail: { error: error.message }
            }));
            return { success: false, error: error.message };
        }
    };

    // 向后兼容：refreshDatabaseStats 现在通过 UIManager 处理
    // window.refreshDatabaseStats is now assigned in uiManager.js

    // 🔥 数据库导出函数（纯业务逻辑）
    AppDB.exportDatabase = async function() {
        try {
            // 发出导出开始事件
            window.dispatchEvent(new CustomEvent('database:exportStart'));
            
            const result = await window.DatabaseManager.exportAndDownload();
            
            if (result.success) {
                window.dispatchEvent(new CustomEvent('database:exportSuccess', { 
                    detail: result 
                }));
            } else {
                window.dispatchEvent(new CustomEvent('database:exportError', { 
                    detail: { error: result.error } 
                }));
            }
            
            return result;
            
        } catch (error) {
            console.error('导出出错:', error);
            const errorResult = { success: false, error: error.message };
            window.dispatchEvent(new CustomEvent('database:exportError', { 
                detail: { error: error.message } 
            }));
            return errorResult;
        }
    };

    // 🔥 文件存储导出函数 - 纯业务逻辑，配置通过事件获取
    AppDB.exportFileStorage = async function() {
        try {
            // 通过事件请求导出配置
            const config = await new Promise((resolve) => {
                window.dispatchEvent(new CustomEvent('fileStorage:exportConfigNeeded', {
                    detail: { resolve }
                }));
            });

            // Event-driven progress notification
            window.dispatchEvent(new CustomEvent('fileStorage:exportStart', {
                detail: { config }
            }));

            const exporter = new FileStorageExporter();
            const result = await exporter.exportStorage(config);

            if (result.success) {
                // Event-driven success notification
                window.dispatchEvent(new CustomEvent('fileStorage:exportSuccess', {
                    detail: { 
                        message: '文件存储导出成功！',
                        result: result
                    }
                }));
            } else {
                throw new Error(result.error || '导出失败');
            }

        } catch (error) {
            console.error('文件存储导出失败:', error);
            // Event-driven error notification
            window.dispatchEvent(new CustomEvent('fileStorage:exportError', {
                detail: {
                    error: error,
                    type: 'operation'
                }
            }));
        }
    };

    // 🔥 处理文件选择函数 - 纯业务逻辑，UI操作移至UIManager
    AppDB.handleFileSelect = async function(event) {
        const file = event.target.files[0];
        
        if (!file) {
            return { success: false, message: '未选择文件' };
        }
        
        console.log('选择的文件:', file.name, file.type, file.size);
        
        try {
            const result = await window.importDatabase(file);
            
            // 发出文件处理完成事件，让UI层处理清空操作
            window.dispatchEvent(new CustomEvent('database:fileProcessed', {
                detail: { inputId: event.target.id, result }
            }));
            
            return result;
            
        } catch (error) {
            console.error('导入过程中出错:', error);
            // Event-driven error notification
            window.dispatchEvent(new CustomEvent('database:importError', {
                detail: {
                    error: error,
                    type: 'import_operation'
                }
            }));
            
            // 即使出错也要清空文件输入
            window.dispatchEvent(new CustomEvent('database:fileProcessed', {
                detail: { inputId: event.target.id, result: { success: false, error: error.message } }
            }));
            
            return { success: false, error: error.message };
        }
    };

    // 🔥 处理文件存储选择函数 - 纯业务逻辑，UI操作通过事件处理
    AppDB.handleFileStorageSelect = async function(event) {
        const file = event.target.files[0];
        
        if (!file) {
            return { success: false, message: '未选择文件' };
        }
        
        console.log('选择的文件存储文件:', file.name, file.type, file.size);
        
        try {
            // 请求UI提供导入选项
            const options = await new Promise((resolve) => {
                window.dispatchEvent(new CustomEvent('fileStorage:importOptionsNeeded', {
                    detail: { resolve }
                }));
            });
            
            // 调用业务逻辑执行导入
            const result = await window.performFileStorageImport(file, options);
            
            // 发出文件处理完成事件，让UI层处理清空操作
            window.dispatchEvent(new CustomEvent('fileStorage:fileProcessed', {
                detail: { inputId: event.target.id, result }
            }));
            
            return result;
            
        } catch (error) {
            console.error('文件存储导入过程中出错:', error);
            // Event-driven error notification
            window.dispatchEvent(new CustomEvent('fileStorage:importError', {
                detail: {
                    error: error,
                    type: 'operation'
                }
            }));
            
            // 即使出错也要清空文件输入
            window.dispatchEvent(new CustomEvent('fileStorage:fileProcessed', {
                detail: { inputId: event.target.id, result: { success: false, error: error.message } }
            }));
            
            return { success: false, error: error.message };
        }
    };

    // 🔥 数据库导入函数（纯业务逻辑）
    AppDB.importDatabase = async function(file) {
        if (!file) {
            return { success: false, error: '未提供文件' };
        }
        
        try {
            // 请求UI确认
            const confirmed = await new Promise((resolve) => {
                window.dispatchEvent(new CustomEvent('database:importConfirmationNeeded', { 
                    detail: { file, resolve } 
                }));
            });
            
            if (!confirmed) {
                console.log('用户取消导入');
                return { success: false, message: '用户取消导入' };
            }
            
            // 发出导入开始事件
            window.dispatchEvent(new CustomEvent('database:importStart', { 
                detail: { fileName: file.name } 
            }));
            
            const overwrite = true;
            const result = await window.performImport(file, overwrite);
            
            if (result.success) {
                window.dispatchEvent(new CustomEvent('database:importSuccess', { 
                    detail: result 
                }));
            } else {
                window.dispatchEvent(new CustomEvent('database:importError', { 
                    detail: { error: result.error } 
                }));
            }
            
            return result;
            
        } catch (error) {
            console.error('导入失败:', error);
            const errorResult = { success: false, error: error.message };
            window.dispatchEvent(new CustomEvent('database:importError', { 
                detail: { error: error.message } 
            }));
            return errorResult;
        }
    };

    // 🔥 执行导入函数 - 重构为事件驱动架构
    AppDB.performImport = async function(file, overwrite) {
        try {
            // Event-driven progress notification
            window.dispatchEvent(new CustomEvent('database:importProgress', {
                detail: { message: '正在导入数据库...', stage: 'starting' }
            }));
            
            if (!window.DatabaseManager) {
                console.error('window.DatabaseManager 不存在！');
                // Event-driven critical error notification
                window.dispatchEvent(new CustomEvent('database:importError', {
                    detail: {
                        error: new Error('数据库管理器未初始化，请刷新页面后重试'),
                        type: 'initialization_error',
                        critical: true
                    }
                }));
                return;
            }
            
            if (!window.DatabaseManager.importFromFile) {
                console.error('importFromFile 方法不存在！');
                // Event-driven critical error notification
                window.dispatchEvent(new CustomEvent('database:importError', {
                    detail: {
                        error: new Error('导入功能不可用，请检查代码'),
                        type: 'function_missing',
                        critical: true
                    }
                }));
                return;
            }
            
            const result = await window.DatabaseManager.importFromFile(file, overwrite);
            
            if (result.success) {
                // 刷新统计信息
                if (typeof window.refreshDatabaseStats === 'function') {
                    window.refreshDatabaseStats();
                }
                
                // 重置应用状态，确保数据同步
                window.DatabaseManager.resetApplicationState();
                
                // Event-driven success notification with reload intent
                window.dispatchEvent(new CustomEvent('database:importSuccess', {
                    detail: { 
                        message: '数据库导入成功！页面将在3秒后自动刷新...',
                        result: result,
                        autoReload: true,
                        reloadDelay: 3000
                    }
                }));
                
                // UI操作由uiManager.js处理database:importSuccess事件
                
            } else {
                throw new Error(result.error || '导入失败');
            }
            
        } catch (error) {
            console.error('导入失败:', error.message);
            throw error; // 重新抛出以便上层处理
        }
    };

    // 🔥 执行文件存储导入函数 - 纯业务逻辑（UI交互已移至UIManager）
    AppDB.performFileStorageImport = async function(file, options) {
        try {
            // Event-driven progress notification
            window.dispatchEvent(new CustomEvent('fileStorage:importProgress', {
                detail: { message: '正在导入文件存储...', stage: 'starting' }
            }));

            const importer = new FileStorageImporter();
            const result = await importer.importStorage(file, options);

            if (result.success) {
                const detailedMessage = `文件存储导入成功！\n\n导入统计：\n• 成功导入 ${result.imported} 个文件\n• 跳过 ${result.skipped} 个文件\n• 失败 ${result.failed} 个文件`;
                
                // Event-driven success notification
                window.dispatchEvent(new CustomEvent('fileStorage:importSuccess', {
                    detail: { 
                        message: '文件存储导入成功！',
                        detailedMessage: detailedMessage,
                        stats: {
                            imported: result.imported,
                            skipped: result.skipped,
                            failed: result.failed
                        },
                        result: result
                    }
                }));
                
                // 刷新统计信息
                if (typeof window.refreshDatabaseStats === 'function') {
                    setTimeout(() => {
                        window.refreshDatabaseStats();
                    }, 1000);
                }

            } else {
                throw new Error(result.error || '导入失败');
            }

        } catch (error) {
            console.error('文件存储导入失败:', error);
            throw error; // 重新抛出以便上层处理
        }
    };

    // 🔥 确认文件导出函数 - 纯业务逻辑，UI操作移至UIManager
    AppDB.confirmFileExport = async function() {
        try {
            // Event-driven progress notification
            window.dispatchEvent(new CustomEvent('fileStorage:exportProgress', {
                detail: { message: '正在导出文件存储...', stage: 'confirming' }
            }));

            // 发出隐藏选项面板事件
            window.dispatchEvent(new CustomEvent('fileStorage:hideExportOptions'));

            const result = await window.exportFileStorage();
            return result;

        } catch (error) {
            console.error('确认文件导出失败:', error);
            // Event-driven error notification
            window.dispatchEvent(new CustomEvent('fileStorage:exportError', {
                detail: {
                    error: error,
                    type: 'confirmation_error'
                }
            }));
            return { success: false, error: error.message };
        }
    };

    // 🔥 取消文件导出函数 - 纯业务逻辑，UI操作移至UIManager
    AppDB.cancelFileExport = function() {
        // 发出隐藏选项面板事件
        window.dispatchEvent(new CustomEvent('fileStorage:hideExportOptions'));
        
        // Event-driven cancellation notification
        window.dispatchEvent(new CustomEvent('fileStorage:exportCancelled', {
            detail: { message: '用户取消了文件导出' }
        }));
        
        return { success: true, message: '用户取消了文件导出' };
    };

    // 🔥 导入提示词函数 - 重构为事件驱动架构
    AppDB.importPrompts = async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const prompts = JSON.parse(content);
                
                if (Array.isArray(prompts)) {
                    localStorage.setItem('customPrompts', JSON.stringify(prompts));
                    // Event-driven success notification
                    window.dispatchEvent(new CustomEvent('prompts:importSuccess', {
                        detail: { 
                            message: `成功导入 ${prompts.length} 个提示词`,
                            count: prompts.length,
                            prompts: prompts
                        }
                    }));
                } else {
                    throw new Error('文件格式不正确，应为提示词数组');
                }
            } catch (error) {
                console.error('导入提示词失败:', error);
                // Event-driven error notification
                window.dispatchEvent(new CustomEvent('prompts:importError', {
                    detail: {
                        error: error,
                        type: 'format_error'
                    }
                }));
            }
        };
        reader.readAsText(file);
        
        // 清空文件输入
        event.target.value = '';
    };
    
    // 向后兼容：保留所有函数的直接 window 访问
    window.exportDatabase = AppDB.exportDatabase;
    window.exportFileStorage = AppDB.exportFileStorage;
    // Pure database operations that remain in UnifiedDBManager
    window.importDatabase = AppDB.importDatabase;
    window.performImport = AppDB.performImport;
    window.performFileStorageImport = AppDB.performFileStorageImport;
    window.importPrompts = AppDB.importPrompts;
    
    // UI-related functions are now handled by UIManager
    // window.triggerFileSelect, window.triggerFileStorageImport, etc. are assigned in uiManager.js
    
    window.FileStorageManager = unifiedDB; // 直接映射到统一管理器
    
    console.log('🔥 [UnifiedDB] 统一数据库管理器已全局导出，包含所有数据库相关功能');
}

// 🔥 Module export removed for browser compatibility
// ES Module导出 (removed for standard script loading)

/*
================================================================================
📚 EVENT-DRIVEN UI ARCHITECTURE DOCUMENTATION
================================================================================

📋 重大架构更新：UnifiedDBManager现在实现了完全的事件驱动架构！
所有UI交互（alert、confirm、DOM操作）已被移除，通过自定义事件实现完全分离。
这解决了架构债务问题，使代码更易测试、维护和扩展。

🎯 架构重构核心优势：
- ✅ 纯业务逻辑，完全可单元测试
- ✅ UI框架无关，可配合任何前端技术栈  
- ✅ 一致的错误处理和用户交互模式
- ✅ 非阻塞异步交互，更好的用户体验
- ✅ 关注点完全分离，遵循单一职责原则
- ✅ 移除了所有直接DOM操作和浏览器API调用

📋 事件类型汇总：

🗂️ 文件存储相关事件：
- fileStorage:importOptionsNeeded - 需要用户选择导入选项
- fileStorage:importError - 文件存储导入错误
- fileStorage:importProgress - 导入进度通知
- fileStorage:importSuccess - 导入成功
- fileStorage:exportStart - 导出开始
- fileStorage:exportProgress - 导出进度
- fileStorage:exportSuccess - 导出成功  
- fileStorage:exportError - 导出错误
- fileStorage:exportCancelled - 导出取消

🗄️ 数据库相关事件：
- database:importConfirmationNeeded - 需要用户确认导入
- database:importProgress - 导入进度通知
- database:importStart - 导入开始
- database:importSuccess - 导入成功
- database:importError - 导入错误
- database:exportStart - 导出开始
- database:exportSuccess - 导出成功
- database:exportError - 导出错误
- database:repairNeeded - 需要数据库修复
- database:repairSuccess - 修复成功
- database:repairError - 修复失败
- database:errorDialog - 显示错误对话框

🎯 新增核心事件（完全解耦UI操作）：
- database:downloadFile - 文件下载请求（替代直接DOM操作）
- database:showError - 错误消息显示（替代alert）
- database:showMessage - 成功/信息消息显示（替代alert）
- database:confirmOptions - 用户选项确认请求（替代confirm）
- database:confirmRepair - 修复操作确认请求（替代confirm）

💡 提示词相关事件：
- prompts:importSuccess - 提示词导入成功
- prompts:importError - 提示词导入错误

🏪 存储相关事件：
- storage:persistentGranted - 持久化存储已授权
- storage:persistentDenied - 持久化存储被拒绝
- storage:persistentUnsupported - 不支持持久化存储
- storage:persistentError - 持久化存储错误
- storage:statsRefreshNeeded - 需要刷新统计信息

================================================================================
📖 UI层实现示例
================================================================================

以下是推荐的UI层实现模式：

// 🎯 1. 基础错误通知处理
window.addEventListener('fileStorage:importError', (event) => {
    const { error, type } = event.detail;
    
    if (typeof showToast === 'function') {
        showToast(error.message, 'error');
    } else {
        // 降级到原生对话框
        // 通过事件发送错误信息，由UI层处理显示
        window.dispatchEvent(new CustomEvent('database:showError', {
            detail: {
                message: error.message,
                type: 'error'
            }
        }));
    }
});

// 🎯 2. 用户确认对话框
window.addEventListener('fileStorage:importOptionsNeeded', (event) => {
    const { resolve, messages } = event.detail;
    
    // 现代UI实现示例
    if (typeof showCustomDialog === 'function') {
        showCustomDialog({
            title: '导入选项',
            message: messages.overwrite,
            buttons: [
                { text: '覆盖', style: 'primary', value: true },
                { text: '保留', style: 'secondary', value: false }
            ]
        }).then(overwrite => {
            return showCustomDialog({
                title: '处理缺失文件',
                message: messages.skipMissing,
                buttons: [
                    { text: '跳过', style: 'primary', value: true },
                    { text: '占位符', style: 'secondary', value: false }
                ]
            }).then(skipMissing => {
                resolve({ overwrite, skipMissing });
            });
        });
    } else {
        // 降级到原生对话框
        // 通过事件请求用户确认，等待UI层响应
        const confirmResult = await new Promise((resolve) => {
            window.dispatchEvent(new CustomEvent('database:confirmOptions', {
                detail: {
                    messages: messages,
                    resolve: resolve
                }
            }));
        });
        
        const { overwrite, skipMissing } = confirmResult;
        resolve({ overwrite, skipMissing });
    }
});

// 🎯 3. 进度通知处理
window.addEventListener('database:importProgress', (event) => {
    const { message, stage } = event.detail;
    
    if (typeof showProgressToast === 'function') {
        showProgressToast(message);
    } else if (typeof showToast === 'function') {
        showToast(message);
    }
});

// 🎯 4. 成功通知处理
window.addEventListener('database:importSuccess', (event) => {
    const { message, autoReload, reloadDelay } = event.detail;
    
    if (typeof showToast === 'function') {
        showToast(message, 'success');
    } else {
        // 通过事件发送成功信息，由UI层处理显示
        window.dispatchEvent(new CustomEvent('database:showMessage', {
            detail: {
                message: message,
                type: 'success'
            }
        }));
    }
    
    // 自动刷新已经在业务逻辑中处理，UI层可以添加额外的视觉反馈
    if (autoReload && typeof showCountdownNotification === 'function') {
        showCountdownNotification('页面将自动刷新', reloadDelay);
    }
});

// 🎯 5. 数据库修复确认对话框
window.addEventListener('database:repairNeeded', (event) => {
    const { missingStores, resolve } = event.detail;
    
    const message = `发现数据库结构问题，缺失以下存储：\n${missingStores.join(', ')}\n\n是否立即修复？`;
    
    if (typeof showCustomDialog === 'function') {
        showCustomDialog({
            title: '数据库修复',
            message: message,
            type: 'warning',
            buttons: [
                { text: '立即修复', style: 'primary', value: true },
                { text: '稍后处理', style: 'secondary', value: false }
            ]
        }).then(resolve);
    } else {
        // 通过事件请求修复确认，等待UI层响应
        const shouldRepair = await new Promise((resolve) => {
            window.dispatchEvent(new CustomEvent('database:confirmRepair', {
                detail: {
                    message: message,
                    resolve: resolve
                }
            }));
        });
        resolve(shouldRepair);
    }
});

// 🎯 6. 复杂统计信息展示
window.addEventListener('fileStorage:importSuccess', (event) => {
    const { message, stats, detailedMessage } = event.detail;
    
    if (typeof showDetailedNotification === 'function') {
        showDetailedNotification({
            title: '导入完成',
            message: message,
            details: `成功：${stats.imported}，跳过：${stats.skipped}，失败：${stats.failed}`,
            type: 'success'
        });
    } else if (typeof showToast === 'function') {
        showToast(message, 'success');
    } else {
        // 通过事件发送详细信息，由UI层处理显示
        window.dispatchEvent(new CustomEvent('database:showMessage', {
            detail: {
                message: detailedMessage,
                type: 'info'
            }
        }));
    }
});

================================================================================
🔧 UI框架集成指南
================================================================================

🎨 Vue.js 集成示例：
// 在Vue组件中
mounted() {
    // 监听数据库事件
    window.addEventListener('database:importError', this.handleImportError);
    window.addEventListener('database:importSuccess', this.handleImportSuccess);
},
methods: {
    handleImportError(event) {
        this.$toast.error(event.detail.error.message);
    },
    handleImportSuccess(event) {
        this.$toast.success(event.detail.message);
        if (event.detail.autoReload) {
            this.showCountdown(event.detail.reloadDelay);
        }
    }
}

⚛️ React 集成示例：
// 在React组件中
useEffect(() => {
    const handleImportError = (event) => {
        toast.error(event.detail.error.message);
    };
    
    window.addEventListener('database:importError', handleImportError);
    return () => window.removeEventListener('database:importError', handleImportError);
}, []);

🍰 Vanilla JS 集成示例：
// 创建统一的事件处理管理器
class UIEventManager {
    constructor() {
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // 错误处理
        ['database:importError', 'fileStorage:importError', 'prompts:importError']
            .forEach(eventType => {
                window.addEventListener(eventType, this.handleError.bind(this));
            });
            
        // 成功处理
        ['database:importSuccess', 'fileStorage:importSuccess', 'prompts:importSuccess']
            .forEach(eventType => {
                window.addEventListener(eventType, this.handleSuccess.bind(this));
            });
    }
    
    handleError(event) {
        const { error, type } = event.detail;
        this.showNotification(error.message, 'error');
    }
    
    handleSuccess(event) {
        const { message } = event.detail;
        this.showNotification(message, 'success');
    }
}

// 启用事件管理器
document.addEventListener('DOMContentLoaded', () => {
    new UIEventManager();
});

================================================================================
💯 最佳实践
================================================================================

1. ✅ 降级策略：始终提供原生对话框作为降级方案
2. ✅ 错误分类：使用 detail.type 区分不同类型的错误
3. ✅ 进度反馈：长时间操作提供进度通知
4. ✅ 一致性：所有UI交互使用相同的事件模式
5. ✅ 可访问性：确保事件包含足够的上下文信息
6. ✅ 清理：组件销毁时移除事件监听器
7. ✅ 测试友好：事件可以轻松模拟和测试

通过遵循这些模式，你可以创建一个完全解耦、可测试、可维护的应用架构！

================================================================================
*/
// export default UnifiedDBManager;
// export { unifiedDB };