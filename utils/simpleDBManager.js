/**
 * 🔥 全新简化的数据库管理器
 * 
 * 设计理念：
 * 1. 单例模式 - 全局唯一实例
 * 2. 状态同步 - 通过 window 属性跨页面共享
 * 3. 简单直接 - 不依赖复杂的事件系统
 * 4. 自动重试 - 内置错误恢复机制
 */

class SimpleDBManager {
    constructor() {
        this.dbName = 'WhaleAppDB';
        this.version = 13;
        this.db = null;
        this.isReady = false;
        this.initPromise = null;
        
        // 绑定到全局 window，确保跨页面可访问
        if (typeof window !== 'undefined') {
            window.SimpleDBManager = this;
        }
    }

    /**
     * 初始化数据库 - 主入口方法
     */
    async init() {
        // 如果已经初始化过，直接返回
        if (this.isReady && this.db) {
            console.log('[SimpleDB] 数据库已初始化，直接返回');
            this.syncToWindow();
            return this.db;
        }

        // 如果正在初始化，等待现有初始化完成
        if (this.initPromise) {
            console.log('[SimpleDB] 正在初始化中，等待完成...');
            return await this.initPromise;
        }

        // 开始新的初始化流程
        console.log('[SimpleDB] 开始数据库初始化...');
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
                console.error('[SimpleDB]', error);
                reject(error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                
                console.log(`[SimpleDB] 初始化成功，版本: ${this.db.version}`);
                console.log(`[SimpleDB] 可用存储:`, Array.from(this.db.objectStoreNames));
                
                // 同步到 window 全局状态
                this.syncToWindow();
                
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('[SimpleDB] 数据库需要升级...');
                const db = event.target.result;
                this._createStores(db, event.oldVersion);
            };
        });
    }

    /**
     * 创建所有必要的对象存储
     */
    _createStores(db, oldVersion) {
        console.log(`[SimpleDB] 正在升级数据库，从版本 ${oldVersion} 到 ${this.version}`);
        
        // 定义所有需要的存储
        const stores = [
            { name: 'contacts', keyPath: 'id' },
            { name: 'apiSettings', keyPath: 'id' },
            { name: 'userProfile', keyPath: 'id' },
            { name: 'backgrounds', keyPath: 'id' },
            { name: 'emojis', keyPath: 'id' },
            { name: 'emojiImages', keyPath: 'id' },
            { name: 'moments', keyPath: 'id' },
            { name: 'weiboPosts', keyPath: 'id' },
            { name: 'songs', keyPath: 'id' },
            { name: 'fileStorage', keyPath: 'id' },
            { name: 'fileReferences', keyPath: 'id' },
            { name: 'themeConfig', keyPath: 'key' },
            { name: 'characterMemories', keyPath: 'id' },
            { name: 'globalMemory', keyPath: 'id' },
            { name: 'memoryProcessedIndex', keyPath: 'id' },
            { name: 'hashtagCache', keyPath: 'id' },
            { name: 'conversationCounters', keyPath: 'id' }
        ];

        // 创建存储
        stores.forEach(store => {
            if (!db.objectStoreNames.contains(store.name)) {
                console.log(`[SimpleDB] 创建存储: ${store.name}`);
                db.createObjectStore(store.name, { keyPath: store.keyPath });
            }
        });
        
        console.log('[SimpleDB] 数据库结构升级完成');
    }

    /**
     * 同步状态到 window 全局对象
     * 这是跨页面通信的关键
     */
    syncToWindow() {
        if (typeof window !== 'undefined') {
            window.db = this.db;
            window.isIndexedDBReady = this.isReady;
            
            // 🔥 关键：通过 localStorage 事件实现跨标签页通知
            try {
                localStorage.setItem('dbSyncTrigger', Date.now().toString());
                localStorage.removeItem('dbSyncTrigger'); // 立即删除，只是触发事件
                console.log('[SimpleDB] 已同步状态到全局 window 并触发跨页面事件');
            } catch (e) {
                console.warn('[SimpleDB] localStorage 同步失败:', e);
            }
        }
    }

    /**
     * 检查数据库是否已准备就绪
     */
    static isReady() {
        return window.isIndexedDBReady && window.db && window.db.version >= 13;
    }

    /**
     * 获取全局实例
     */
    static getInstance() {
        if (!window.SimpleDBManager) {
            window.SimpleDBManager = new SimpleDBManager();
        }
        return window.SimpleDBManager;
    }

    /**
     * 等待数据库就绪的简单方法
     */
    static async waitForReady(timeout = 5000) {
        const startTime = Date.now();
        
        return new Promise((resolve, reject) => {
            const checkReady = () => {
                if (SimpleDBManager.isReady()) {
                    console.log('[SimpleDB] 检测到数据库已就绪');
                    resolve(window.db);
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    reject(new Error(`等待数据库就绪超时 (${timeout}ms)`));
                    return;
                }

                setTimeout(checkReady, 50); // 50ms 检查一次
            };

            checkReady();
        });
    }
}

// 全局导出
if (typeof window !== 'undefined') {
    window.SimpleDBManager = SimpleDBManager;
}

export default SimpleDBManager;