/**
 * 文件存储管理器
 * 用于优化IndexedDB中的图片存储，将base64转换为Blob存储
 */

class FileStorageManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.dbVersion = 11; // 与主应用保持一致的版本号
        this.db = null;
        this.urlCache = new Map(); // 缓存已创建的Object URLs
        
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
    }

    /**
     * 初始化文件存储管理器
     */
    async init() {
        if (window.db && window.isIndexedDBReady) {
            // 检查是否需要升级数据库版本
            if (window.db.version < this.dbVersion) {
                console.log('检测到需要升级数据库版本以支持文件存储');
                // 关闭现有连接，准备升级
                window.db.close();
                window.db = null;
                window.isIndexedDBReady = false;
            } else {
                this.db = window.db;
                return this.db;
            }
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('文件存储数据库打开失败:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                window.db = this.db;
                window.isIndexedDBReady = true;
                // 文件存储数据库初始化完成
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                    
                // 创建所有必需的对象存储（如果不存在）
                const stores = {
                    'songs': { keyPath: 'id', autoIncrement: true },
                    'contacts': { keyPath: 'id' },
                    'apiSettings': { keyPath: 'id' },
                    'emojis': { keyPath: 'id' },
                    'emojiImages': { keyPath: 'tag' },
                    'backgrounds': { keyPath: 'id' },
                    'userProfile': { keyPath: 'id' },
                    'moments': { keyPath: 'id' },
                    'weiboPosts': { keyPath: 'id', autoIncrement: true },
                    'hashtagCache': { keyPath: 'id' },
                    'characterMemories': { keyPath: 'contactId' },
                    'conversationCounters': { keyPath: 'id' },
                    'globalMemory': { keyPath: 'id' },
                    'memoryProcessedIndex': { keyPath: 'contactId' }
                };

                // 创建现有的对象存储
                Object.entries(stores).forEach(([storeName, config]) => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, config);
                    }
                });

                // 创建新的文件存储相关表
                if (!db.objectStoreNames.contains('fileStorage')) {
                    const fileStore = db.createObjectStore('fileStorage', { keyPath: 'fileId' });
                    fileStore.createIndex('type', 'type', { unique: false });
                    fileStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                if (!db.objectStoreNames.contains('fileReferences')) {
                    const refStore = db.createObjectStore('fileReferences', { keyPath: 'referenceId' });
                    refStore.createIndex('fileId', 'fileId', { unique: false });
                    refStore.createIndex('category', 'category', { unique: false });
                }
            };
        });
    }

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
        return match ? match[1] : 'image/jpeg'; // 默认为jpeg
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
            console.error('base64转换Blob失败:', error);
            return null;
        }
    }

    /**
     * 将File对象转换为Blob（如果需要）
     */
    fileToBlob(file) {
        if (file instanceof Blob) {
            return file;
        }
        return new Blob([file], { type: file.type || 'image/jpeg' });
    }

    /**
     * 存储文件到IndexedDB
     */
    async storeFile(fileData, metadata = {}) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileStorage'], 'readwrite');
            const store = transaction.objectStore('fileStorage');
            
            let blob;
            if (typeof fileData === 'string' && fileData.startsWith('data:')) {
                // base64字符串
                blob = this.base64ToBlob(fileData);
                if (!blob) {
                    reject(new Error('无法转换base64数据'));
                    return;
                }
            } else if (fileData instanceof File || fileData instanceof Blob) {
                // File或Blob对象
                blob = this.fileToBlob(fileData);
            } else {
                reject(new Error('不支持的文件数据类型'));
                return;
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

            const request = store.put(fileRecord);

            request.onsuccess = () => {
                // 文件存储成功
                resolve({
                    fileId: fileId,
                    type: blob.type,
                    size: blob.size
                });
            };

            request.onerror = () => {
                console.error('文件存储失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 根据fileId获取文件
     */
    async getFile(fileId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileStorage'], 'readonly');
            const store = transaction.objectStore('fileStorage');
            const request = store.get(fileId);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve(result);
                } else {
                    reject(new Error(`文件不存在: ${fileId}`));
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
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
            const url = URL.createObjectURL(fileRecord.blob);
            
            // 缓存URL
            this.urlCache.set(fileId, url);
            
            return url;
        } catch (error) {
            console.error(`创建文件URL失败 (${fileId}):`, error);
            // 返回一个默认图片或空字符串
            return '';
        }
    }

    /**
     * 清理单个文件的URL
     */
    revokeFileURL(fileId) {
        if (this.urlCache.has(fileId)) {
            const url = this.urlCache.get(fileId);
            URL.revokeObjectURL(url);
            this.urlCache.delete(fileId);
        }
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

    /**
     * 删除文件
     */
    async deleteFile(fileId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileStorage'], 'readwrite');
            const store = transaction.objectStore('fileStorage');
            const request = store.delete(fileId);

            request.onsuccess = () => {
                // 清理URL缓存
                this.revokeFileURL(fileId);
                console.log(`文件删除成功: ${fileId}`);
                resolve();
            };

            request.onerror = () => {
                console.error(`文件删除失败 (${fileId}):`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 创建文件引用关系
     */
    async createFileReference(fileId, referenceType, referenceKey, metadata = {}) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileReferences'], 'readwrite');
            const store = transaction.objectStore('fileReferences');
            
            const referenceId = `${referenceType}_${referenceKey}`;
            const reference = {
                referenceId: referenceId,
                fileId: fileId,
                category: referenceType,
                referenceKey: referenceKey,
                createdAt: new Date().toISOString(),
                metadata: metadata
            };

            console.log('准备存储文件引用:', reference);
            const request = store.put(reference);

            request.onsuccess = () => {
                console.log('文件引用存储成功:', reference);
                resolve(reference);
            };

            request.onerror = () => {
                console.error('文件引用存储失败:', request.error);
                reject(request.error);
            };

            transaction.oncomplete = () => {
                console.log('文件引用事务完成');
            };

            transaction.onerror = () => {
                console.error('文件引用事务失败:', transaction.error);
            };
        });
    }

    /**
     * 获取文件引用
     */
    async getFileReference(referenceType, referenceKey) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileReferences'], 'readonly');
            const store = transaction.objectStore('fileReferences');
            const referenceId = `${referenceType}_${referenceKey}`;
            console.log('查找文件引用，引用ID:', referenceId);
            const request = store.get(referenceId);

            request.onsuccess = () => {
                const result = request.result;
                console.log('文件引用查找结果:', result);
                resolve(result || null);
            };

            request.onerror = () => {
                console.error('文件引用查找失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 删除文件引用
     */
    async deleteFileReference(referenceType, referenceKey) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileReferences'], 'readwrite');
            const store = transaction.objectStore('fileReferences');
            const referenceId = `${referenceType}_${referenceKey}`;
            const request = store.delete(referenceId);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * 获取文件存储统计信息
     */
    async getStorageStats() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileStorage'], 'readonly');
            const store = transaction.objectStore('fileStorage');
            const request = store.getAll();

            request.onsuccess = () => {
                const files = request.result;
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

                resolve(stats);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * 清理未使用的文件（垃圾回收）
     */
    async cleanupUnusedFiles() {
        if (!this.db) {
            await this.init();
        }

        const transaction = this.db.transaction(['fileStorage', 'fileReferences'], 'readwrite');
        const fileStore = transaction.objectStore('fileStorage');
        const refStore = transaction.objectStore('fileReferences');

        // 获取所有文件
        const allFilesRequest = fileStore.getAll();
        // 获取所有引用
        const allReferencesRequest = refStore.getAll();

        return new Promise((resolve, reject) => {
            let filesResult, referencesResult;
            let completedRequests = 0;

            const checkComplete = () => {
                if (completedRequests === 2) {
                    const referencedFileIds = new Set(referencesResult.map(ref => ref.fileId));
                    const filesToDelete = filesResult.filter(file => !referencedFileIds.has(file.fileId));
                    
                    if (filesToDelete.length === 0) {
                        resolve({ deletedCount: 0, message: '没有发现未使用的文件' });
                        return;
                    }

                    // 删除未引用的文件
                    let deletedCount = 0;
                    let deleteErrors = 0;

                    filesToDelete.forEach(file => {
                        const deleteRequest = fileStore.delete(file.fileId);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            this.revokeFileURL(file.fileId);
                            
                            if (deletedCount + deleteErrors === filesToDelete.length) {
                                resolve({ 
                                    deletedCount: deletedCount, 
                                    errors: deleteErrors,
                                    message: `清理完成，删除了 ${deletedCount} 个未使用的文件` 
                                });
                            }
                        };

                        deleteRequest.onerror = () => {
                            deleteErrors++;
                            console.error(`删除未使用文件失败: ${file.fileId}`);
                            
                            if (deletedCount + deleteErrors === filesToDelete.length) {
                                resolve({ 
                                    deletedCount: deletedCount, 
                                    errors: deleteErrors,
                                    message: `清理完成，删除了 ${deletedCount} 个文件，${deleteErrors} 个删除失败` 
                                });
                            }
                        };
                    });
                }
            };

            allFilesRequest.onsuccess = () => {
                filesResult = allFilesRequest.result;
                completedRequests++;
                checkComplete();
            };

            allReferencesRequest.onsuccess = () => {
                referencesResult = allReferencesRequest.result;
                completedRequests++;
                checkComplete();
            };

            allFilesRequest.onerror = allReferencesRequest.onerror = () => {
                reject(new Error('获取数据失败'));
            };
        });
    }
}

// 创建全局实例
const fileStorageManager = new FileStorageManager();

// 导出到window对象供其他模块使用
window.FileStorageManager = fileStorageManager;

// 文件存储管理器已加载