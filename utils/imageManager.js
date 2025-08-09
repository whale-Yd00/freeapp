/**
 * 虚拟图片文件管理系统
 * 为纯前端应用提供类似文件系统的图片管理体验
 */

class ImageManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.storeName = 'virtualFileSystem';
        this.db = null;
        
        // 虚拟文件系统路径
        this.paths = {
            emojis: '/images/emojis/',
            backgrounds: '/images/backgrounds/',
            avatars: '/images/avatars/'
        };
        
        // 内存缓存
        this.cache = new Map();
        this.urlCache = new Map(); // Blob URL缓存
    }

    /**
     * 初始化图片管理器
     */
    async init() {
        try {
            // 如果主应用已经有数据库连接，使用主应用的连接
            if (window.db && window.isIndexedDBReady) {
                this.db = window.db;
                console.log('图片管理器使用主应用数据库连接');
            } else {
                this.db = await this.openDB();
                console.log('图片管理器创建独立数据库连接');
            }
            
            // 验证虚拟文件系统存储是否存在
            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn(`虚拟文件系统存储 '${this.storeName}' 不存在，需要升级数据库`);
                return false; // 返回失败，让主应用处理数据库升级
            }
            
            console.log('图片管理器初始化成功');
            return true;
        } catch (error) {
            console.error('图片管理器初始化失败:', error);
            return false;
        }
    }

    /**
     * 打开IndexedDB数据库
     */
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 8);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('ImageManager 数据库升级中...');
                
                // 创建所有必需的存储（与主应用保持一致）
                if (!db.objectStoreNames.contains('contacts')) {
                    db.createObjectStore('contacts', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('emojis')) {
                    db.createObjectStore('emojis', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('emojiImages')) {
                    db.createObjectStore('emojiImages', { keyPath: 'tag' });
                }
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'path' });
                    console.log('ImageManager 创建虚拟文件系统存储');
                }
            };
        });
    }

    /**
     * 将base64转换为Blob
     */
    base64ToBlob(base64Data) {
        const parts = base64Data.split(',');
        const mimeMatch = parts[0].match(/data:([^;]+)/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const binaryString = atob(parts[1]);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return new Blob([bytes], { type: mime });
    }

    /**
     * 保存图片文件
     * @param {string} filePath - 虚拟文件路径
     * @param {string|Blob} data - 图片数据（base64字符串或Blob对象）
     * @param {Object} metadata - 文件元数据
     */
    async saveImage(filePath, data, metadata = {}) {
        try {
            // 检查数据库和存储是否可用
            if (!this.db) {
                console.warn('数据库未连接，无法保存图片');
                return false;
            }

            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn(`存储 '${this.storeName}' 不存在，无法保存图片`);
                return false;
            }

            let blob;
            
            if (typeof data === 'string') {
                if (data.startsWith('data:image/')) {
                    blob = this.base64ToBlob(data);
                } else {
                    throw new Error('不支持的数据格式');
                }
            } else if (data instanceof Blob) {
                blob = data;
            } else {
                throw new Error('无效的图片数据');
            }

            const fileRecord = {
                path: filePath,
                blob: blob,
                size: blob.size,
                type: blob.type,
                created: new Date().toISOString(),
                metadata: metadata
            };

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            await new Promise((resolve, reject) => {
                const request = store.put(fileRecord);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // 清理旧缓存
            this.cache.delete(filePath);
            if (this.urlCache.has(filePath)) {
                URL.revokeObjectURL(this.urlCache.get(filePath));
                this.urlCache.delete(filePath);
            }

            console.log(`图片已保存: ${filePath}`);
            return true;
        } catch (error) {
            console.error('保存图片失败:', error);
            return false;
        }
    }

    /**
     * 获取图片文件
     * @param {string} filePath - 虚拟文件路径
     * @returns {Promise<string|null>} - 返回Blob URL或null
     */
    async getImage(filePath) {
        try {
            // 检查数据库和存储是否可用
            if (!this.db) {
                console.warn('数据库未连接，无法获取图片');
                return null;
            }

            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn(`存储 '${this.storeName}' 不存在，无法获取图片`);
                return null;
            }

            // 检查URL缓存
            if (this.urlCache.has(filePath)) {
                return this.urlCache.get(filePath);
            }

            // 检查内存缓存
            if (this.cache.has(filePath)) {
                const blob = this.cache.get(filePath);
                const url = URL.createObjectURL(blob);
                this.urlCache.set(filePath, url);
                return url;
            }

            // 从数据库读取
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const fileRecord = await new Promise((resolve, reject) => {
                const request = store.get(filePath);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!fileRecord) {
                return null;
            }

            // 缓存Blob对象
            this.cache.set(filePath, fileRecord.blob);
            
            // 创建并缓存URL
            const url = URL.createObjectURL(fileRecord.blob);
            this.urlCache.set(filePath, url);
            
            return url;
        } catch (error) {
            console.error('获取图片失败:', error);
            return null;
        }
    }

    /**
     * 删除图片文件
     */
    async deleteImage(filePath) {
        try {
            // 检查数据库和存储是否可用
            if (!this.db) {
                console.warn('数据库未连接，无法删除图片');
                return false;
            }

            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn(`存储 '${this.storeName}' 不存在，无法删除图片`);
                return false;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            await new Promise((resolve, reject) => {
                const request = store.delete(filePath);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // 清理缓存
            this.cache.delete(filePath);
            if (this.urlCache.has(filePath)) {
                URL.revokeObjectURL(this.urlCache.get(filePath));
                this.urlCache.delete(filePath);
            }

            console.log(`图片已删除: ${filePath}`);
            return true;
        } catch (error) {
            console.error('删除图片失败:', error);
            return false;
        }
    }

    /**
     * 生成唯一文件名
     */
    generateFileName(meaning, extension = 'png') {
        // 使用含义作为文件名，处理特殊字符
        const safeName = meaning.replace(/[^\w\u4e00-\u9fff]/g, '_');
        return `${safeName}.${extension}`;
    }

    /**
     * 获取文件完整路径
     */
    getFilePath(type, fileName) {
        if (!this.paths[type]) {
            throw new Error(`不支持的文件类型: ${type}`);
        }
        return this.paths[type] + fileName;
    }

    /**
     * 保存表情图片
     */
    async saveEmoji(meaning, imageData) {
        const fileName = this.generateFileName(meaning);
        const filePath = this.getFilePath('emojis', fileName);
        return await this.saveImage(filePath, imageData, { 
            type: 'emoji', 
            meaning: meaning 
        });
    }

    /**
     * 获取表情图片
     */
    async getEmoji(meaning) {
        const fileName = this.generateFileName(meaning);
        const filePath = this.getFilePath('emojis', fileName);
        return await this.getImage(filePath);
    }

    /**
     * 删除表情图片
     */
    async deleteEmoji(meaning) {
        const fileName = this.generateFileName(meaning);
        const filePath = this.getFilePath('emojis', fileName);
        return await this.deleteImage(filePath);
    }

    /**
     * 保存背景图片
     */
    async saveBackground(contactId, imageData) {
        const fileName = `bg_${contactId}.png`;
        const filePath = this.getFilePath('backgrounds', fileName);
        return await this.saveImage(filePath, imageData, { 
            type: 'background', 
            contactId: contactId 
        });
    }

    /**
     * 获取背景图片
     */
    async getBackground(contactId) {
        const fileName = `bg_${contactId}.png`;
        const filePath = this.getFilePath('backgrounds', fileName);
        return await this.getImage(filePath);
    }

    /**
     * 删除背景图片
     */
    async deleteBackground(contactId) {
        const fileName = `bg_${contactId}.png`;
        const filePath = this.getFilePath('backgrounds', fileName);
        return await this.deleteImage(filePath);
    }

    /**
     * 保存头像图片
     */
    async saveAvatar(contactId, imageData) {
        const fileName = `avatar_${contactId}.png`;
        const filePath = this.getFilePath('avatars', fileName);
        return await this.saveImage(filePath, imageData, { 
            type: 'avatar', 
            contactId: contactId 
        });
    }

    /**
     * 获取头像图片
     */
    async getAvatar(contactId) {
        const fileName = `avatar_${contactId}.png`;
        const filePath = this.getFilePath('avatars', fileName);
        return await this.getImage(filePath);
    }

    /**
     * 获取文件列表
     */
    async listFiles(path = '') {
        try {
            // 检查数据库和存储是否可用
            if (!this.db) {
                console.warn('数据库未连接，无法获取文件列表');
                return [];
            }

            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn(`存储 '${this.storeName}' 不存在，无法获取文件列表`);
                return [];
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const files = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            return files
                .filter(file => file.path.startsWith(path))
                .map(file => ({
                    path: file.path,
                    size: file.size,
                    type: file.type,
                    created: file.created,
                    metadata: file.metadata
                }));
        } catch (error) {
            console.error('获取文件列表失败:', error);
            return [];
        }
    }

    /**
     * 预加载常用图片
     */
    async preloadImages(imagePaths) {
        const promises = imagePaths.map(path => 
            this.getImage(path).catch(error => {
                console.warn(`预加载图片失败: ${path}`, error);
                return null;
            })
        );
        
        const results = await Promise.all(promises);
        const successCount = results.filter(result => result !== null).length;
        console.log(`预加载完成: ${successCount}/${imagePaths.length} 个图片`);
        return successCount;
    }

    /**
     * 预加载所有表情
     */
    async preloadAllEmojis() {
        try {
            const files = await this.listFiles(this.paths.emojis);
            const paths = files.map(file => file.path);
            return await this.preloadImages(paths);
        } catch (error) {
            console.error('预加载表情失败:', error);
            return 0;
        }
    }

    /**
     * 清理过期的缓存
     */
    cleanupExpiredCache() {
        // 如果缓存超过100个项目，清理最旧的50个
        if (this.urlCache.size > 100) {
            const entries = Array.from(this.urlCache.entries());
            const toRemove = entries.slice(0, 50);
            
            for (const [path, url] of toRemove) {
                URL.revokeObjectURL(url);
                this.urlCache.delete(path);
                this.cache.delete(path);
            }
            
            console.log(`清理了 ${toRemove.length} 个过期缓存项`);
        }
    }

    /**
     * 清理未使用的Blob URL
     */
    cleanup() {
        for (const [path, url] of this.urlCache) {
            URL.revokeObjectURL(url);
        }
        this.urlCache.clear();
        this.cache.clear();
    }

    /**
     * 获取存储统计信息
     */
    async getStorageStats() {
        try {
            const files = await this.listFiles();
            const stats = {
                totalFiles: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
                byType: {}
            };

            // 按类型统计
            for (const file of files) {
                const type = file.metadata?.type || 'unknown';
                if (!stats.byType[type]) {
                    stats.byType[type] = { count: 0, size: 0 };
                }
                stats.byType[type].count++;
                stats.byType[type].size += file.size;
            }

            return stats;
        } catch (error) {
            console.error('获取存储统计失败:', error);
            return null;
        }
    }
}

// 创建全局实例
window.imageManager = new ImageManager();

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageManager;
}