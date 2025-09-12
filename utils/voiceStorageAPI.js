/**
 * 语音存储API
 * 用于缓存语音文件，避免重复请求TTS API
 */

class VoiceStorageAPI {
    constructor() {
        this.fileStorageManager = null;
        this.initPromise = this.init();
    }

    /**
     * 初始化语音存储API
     */
    async init() {
        // 等待UnifiedDBManager初始化
        if (window.unifiedDB) {
            this.fileStorageManager = window.unifiedDB;
            await this.fileStorageManager.init();
        } else if (window.FileStorageManager) {
            // 向后兼容
            this.fileStorageManager = window.FileStorageManager;
            await this.fileStorageManager.init();
        } else {
            throw new Error('UnifiedDBManager未初始化');
        }
    }

    /**
     * 生成语音缓存键
     * 基于文本内容和语音ID生成唯一标识
     */
    generateVoiceCacheKey(text, voiceId) {
        // 清理文本：去除换行、多余空格，转为小写以提高缓存命中率
        const cleanText = text.trim().toLowerCase().replace(/\s+/g, ' ');
        // 使用简单的哈希算法生成固定长度的键
        const textHash = this.simpleHash(cleanText);
        return `voice_${voiceId}_${textHash}`;
    }

    /**
     * 简单哈希函数
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转为32位整数
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 存储语音文件
     * @param {Blob} audioBlob - 音频数据
     * @param {string} text - 原始文本
     * @param {string} voiceId - 语音ID
     * @param {Object} metadata - 元数据
     * @returns {Promise<string>} fileId
     */
    async storeVoice(audioBlob, text, voiceId, metadata = {}) {
        await this.initPromise;
        
        try {
            // 存储文件到FileStorage
            const storeResult = await this.fileStorageManager.storeFile(audioBlob, {
                originalText: text,
                voiceId: voiceId,
                type: 'voice',
                ...metadata
            });

            // 创建引用关系
            const cacheKey = this.generateVoiceCacheKey(text, voiceId);
            await this.fileStorageManager.createFileReference(
                storeResult.fileId,
                'voice',
                cacheKey,
                {
                    text: text,
                    voiceId: voiceId,
                    createdAt: new Date().toISOString()
                }
            );

            console.log('语音文件存储成功:', {
                fileId: storeResult.fileId,
                cacheKey: cacheKey,
                textLength: text.length,
                voiceId: voiceId
            });

            return storeResult.fileId;
        } catch (error) {
            console.error('语音文件存储失败:', error);
            throw error;
        }
    }

    /**
     * 获取缓存的语音文件URL
     * @param {string} text - 文本内容
     * @param {string} voiceId - 语音ID
     * @returns {Promise<string|null>} 语音文件URL或null
     */
    async getVoiceURL(text, voiceId) {
        await this.initPromise;
        
        try {
            const cacheKey = this.generateVoiceCacheKey(text, voiceId);
            console.log('查找语音缓存:', { cacheKey, textLength: text.length, voiceId });
            
            // 查找文件引用
            const reference = await this.fileStorageManager.getFileReference('voice', cacheKey);
            
            if (!reference) {
                console.log('语音缓存未找到');
                return null;
            }

            // 创建文件URL
            const url = await this.fileStorageManager.createFileURL(reference.fileId);
            console.log('语音缓存命中:', { fileId: reference.fileId, url: url ? '已生成' : '生成失败' });
            
            return url;
        } catch (error) {
            console.error('获取语音缓存失败:', error);
            return null;
        }
    }

    /**
     * 检查语音是否已缓存
     * @param {string} text - 文本内容
     * @param {string} voiceId - 语音ID
     * @returns {Promise<boolean>}
     */
    async isVoiceCached(text, voiceId) {
        await this.initPromise;
        
        try {
            const cacheKey = this.generateVoiceCacheKey(text, voiceId);
            const reference = await this.fileStorageManager.getFileReference('voice', cacheKey);
            return !!reference;
        } catch (error) {
            console.error('检查语音缓存失败:', error);
            return false;
        }
    }

    /**
     * 删除语音缓存
     * @param {string} text - 文本内容
     * @param {string} voiceId - 语音ID
     * @returns {Promise<boolean>}
     */
    async deleteVoiceCache(text, voiceId) {
        await this.initPromise;
        
        try {
            const cacheKey = this.generateVoiceCacheKey(text, voiceId);
            const reference = await this.fileStorageManager.getFileReference('voice', cacheKey);
            
            if (reference) {
                // 删除文件引用
                await this.fileStorageManager.deleteFileReference('voice', cacheKey);
                // 删除文件本身
                await this.fileStorageManager.deleteFile(reference.fileId);
                console.log('语音缓存删除成功:', cacheKey);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('删除语音缓存失败:', error);
            return false;
        }
    }

    /**
     * 获取语音缓存统计信息
     * @returns {Promise<Object>}
     */
    async getVoiceCacheStats() {
        await this.initPromise;
        
        try {
            // 获取所有语音类型的引用
            const transaction = this.fileStorageManager.db.transaction(['fileReferences'], 'readonly');
            const store = transaction.objectStore('fileReferences');
            const index = store.index('category');
            const request = index.getAll('voice');

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const voiceReferences = request.result;
                    const stats = {
                        totalVoices: voiceReferences.length,
                        voiceByVoiceId: {},
                        oldestCache: null,
                        newestCache: null
                    };

                    voiceReferences.forEach(ref => {
                        const voiceId = ref.metadata?.voiceId || 'unknown';
                        if (!stats.voiceByVoiceId[voiceId]) {
                            stats.voiceByVoiceId[voiceId] = 0;
                        }
                        stats.voiceByVoiceId[voiceId]++;

                        const createdAt = new Date(ref.createdAt);
                        if (!stats.oldestCache || createdAt < new Date(stats.oldestCache)) {
                            stats.oldestCache = ref.createdAt;
                        }
                        if (!stats.newestCache || createdAt > new Date(stats.newestCache)) {
                            stats.newestCache = ref.createdAt;
                        }
                    });

                    resolve(stats);
                };

                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('获取语音缓存统计失败:', error);
            return {
                totalVoices: 0,
                voiceByVoiceId: {},
                oldestCache: null,
                newestCache: null
            };
        }
    }

    /**
     * 清理过期的语音缓存
     * @param {number} daysOld - 清理多少天前的缓存
     * @returns {Promise<Object>}
     */
    async cleanupOldVoiceCache(daysOld = 30) {
        await this.initPromise;
        
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const transaction = this.fileStorageManager.db.transaction(['fileReferences'], 'readonly');
            const store = transaction.objectStore('fileReferences');
            const index = store.index('category');
            const request = index.getAll('voice');

            return new Promise((resolve, reject) => {
                request.onsuccess = async () => {
                    const voiceReferences = request.result;
                    const oldReferences = voiceReferences.filter(ref => 
                        new Date(ref.createdAt) < cutoffDate
                    );

                    let deletedCount = 0;
                    let errors = 0;

                    for (const ref of oldReferences) {
                        try {
                            await this.fileStorageManager.deleteFileReference('voice', ref.referenceKey);
                            await this.fileStorageManager.deleteFile(ref.fileId);
                            deletedCount++;
                        } catch (error) {
                            console.error('删除过期语音缓存失败:', ref.referenceId, error);
                            errors++;
                        }
                    }

                    resolve({
                        deletedCount,
                        errors,
                        message: `清理完成，删除了 ${deletedCount} 个过期语音缓存，${errors} 个删除失败`
                    });
                };

                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('清理过期语音缓存失败:', error);
            return { deletedCount: 0, errors: 1, message: '清理失败' };
        }
    }
}

// 创建全局实例
const voiceStorageAPI = new VoiceStorageAPI();

// 导出到window对象供其他模块使用
window.VoiceStorageAPI = voiceStorageAPI;

console.log('语音存储API已加载');