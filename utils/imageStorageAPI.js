/**
 * 图片存储API - 高级接口
 * 提供简单易用的图片存储和获取接口，封装底层的文件存储管理器
 */

class ImageStorageAPI {
    constructor() {
        this.fileManager = null;
        this.isInitialized = false;
        this.initPromise = null;
    }

    /**
     * 初始化图片存储API
     */
    async init() {
        if (this.isInitialized) {
            return this.fileManager;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._initInternal();
        return this.initPromise;
    }

    async _initInternal() {
        try {
            // 确保FileStorageManager已加载
            if (!window.FileStorageManager) {
                throw new Error('FileStorageManager未加载');
            }

            this.fileManager = window.FileStorageManager;
            await this.fileManager.init();
            
            this.isInitialized = true;
            // 图片存储API初始化完成
            return this.fileManager;
        } catch (error) {
            console.error('图片存储API初始化失败:', error);
            throw error;
        }
    }

    /**
     * 存储头像图片
     * @param {string|File|Blob} imageData - 图片数据（base64字符串、File对象或Blob对象）
     * @param {string} entityType - 实体类型（'user' 或 'contact'）
     * @param {string} entityId - 实体ID（用户ID或联系人ID）
     * @returns {Promise<string>} 返回fileId
     */
    async storeAvatar(imageData, entityType, entityId) {
        await this.init();

        try {
            // 存储文件
            const result = await this.fileManager.storeFile(imageData, {
                type: 'avatar',
                entityType: entityType,
                entityId: entityId
            });

            // 创建引用关系
            await this.fileManager.createFileReference(
                result.fileId,
                `avatar_${entityType}`,
                entityId,
                {
                    originalType: entityType,
                    storedAt: new Date().toISOString()
                }
            );

            // 头像存储成功
            return result.fileId;

        } catch (error) {
            console.error(`存储${entityType}头像失败:`, error);
            throw error;
        }
    }

    /**
     * 获取头像图片URL
     * @param {string} entityType - 实体类型（'user' 或 'contact'）
     * @param {string} entityId - 实体ID
     * @returns {Promise<string>} 返回图片URL，如果不存在返回空字符串
     */
    async getAvatarURL(entityType, entityId) {
        await this.init();

        try {
            const reference = await this.fileManager.getFileReference(`avatar_${entityType}`, entityId);
            if (!reference) {
                return '';
            }

            return await this.fileManager.createFileURL(reference.fileId);
        } catch (error) {
            console.error(`获取${entityType}头像失败:`, error);
            return '';
        }
    }

    /**
     * 存储背景图片
     * @param {string|File|Blob} imageData - 图片数据
     * @param {string} backgroundId - 背景ID
     * @returns {Promise<string>} 返回fileId
     */
    async storeBackground(imageData, backgroundId) {
        await this.init();

        try {
            const result = await this.fileManager.storeFile(imageData, {
                type: 'background',
                backgroundId: backgroundId
            });

            await this.fileManager.createFileReference(
                result.fileId,
                'background',
                backgroundId,
                {
                    storedAt: new Date().toISOString()
                }
            );

            // 背景图片存储成功
            return result.fileId;

        } catch (error) {
            console.error('存储背景图片失败:', error);
            throw error;
        }
    }

    /**
     * 获取背景图片URL
     * @param {string} backgroundId - 背景ID
     * @returns {Promise<string>} 返回图片URL
     */
    async getBackgroundURL(backgroundId) {
        await this.init();

        try {
            const reference = await this.fileManager.getFileReference('background', backgroundId);
            if (!reference) {
                return '';
            }

            return await this.fileManager.createFileURL(reference.fileId);
        } catch (error) {
            console.error('获取背景图片失败:', error);
            return '';
        }
    }

    /**
     * 存储表情包图片
     * @param {string|File|Blob} imageData - 图片数据
     * @param {string} emojiTag - 表情标签
     * @returns {Promise<string>} 返回fileId
     */
    async storeEmoji(imageData, emojiTag) {
        await this.init();

        try {
            const result = await this.fileManager.storeFile(imageData, {
                type: 'emoji',
                tag: emojiTag
            });

            await this.fileManager.createFileReference(
                result.fileId,
                'emoji',
                emojiTag,
                {
                    storedAt: new Date().toISOString()
                }
            );

            // 表情包存储成功
            return result.fileId;

        } catch (error) {
            console.error('存储表情包失败:', error);
            throw error;
        }
    }

    /**
     * 获取表情包图片URL
     * @param {string} emojiTag - 表情标签
     * @returns {Promise<string>} 返回图片URL
     */
    async getEmojiURL(emojiTag) {
        await this.init();

        try {
            const reference = await this.fileManager.getFileReference('emoji', emojiTag);
            if (!reference) {
                return '';
            }

            return await this.fileManager.createFileURL(reference.fileId);
        } catch (error) {
            console.error('获取表情包失败:', error);
            return '';
        }
    }

    /**
     * 存储朋友圈图片
     * @param {string|File|Blob} imageData - 图片数据
     * @param {string} momentId - 朋友圈动态ID
     * @returns {Promise<string>} 返回fileId
     */
    async storeMomentImage(imageData, momentId) {
        await this.init();

        try {
            const result = await this.fileManager.storeFile(imageData, {
                type: 'moment',
                momentId: momentId
            });

            await this.fileManager.createFileReference(
                result.fileId,
                'moment_image',
                momentId,
                {
                    storedAt: new Date().toISOString()
                }
            );

            // 朋友圈图片存储成功
            return result.fileId;

        } catch (error) {
            console.error('存储朋友圈图片失败:', error);
            throw error;
        }
    }

    /**
     * 获取朋友圈图片URL
     * @param {string} momentId - 朋友圈动态ID
     * @returns {Promise<string>} 返回图片URL
     */
    async getMomentImageURL(momentId) {
        await this.init();

        try {
            const reference = await this.fileManager.getFileReference('moment_image', momentId);
            if (!reference) {
                return '';
            }

            return await this.fileManager.createFileURL(reference.fileId);
        } catch (error) {
            console.error('获取朋友圈图片失败:', error);
            return '';
        }
    }

    /**
     * 存储朋友圈多图片
     * @param {Array} imageDataArray - 图片数据数组
     * @param {string} momentId - 朋友圈动态ID
     * @returns {Promise<Array>} 返回fileId数组
     */
    async storeMomentImages(imageDataArray, momentId) {
        await this.init();

        try {
            const fileIds = [];
            for (let i = 0; i < imageDataArray.length; i++) {
                const imageData = imageDataArray[i];
                const result = await this.fileManager.storeFile(imageData, {
                    type: 'moment',
                    momentId: momentId,
                    imageIndex: i
                });

                await this.fileManager.createFileReference(
                    result.fileId,
                    'moment_image',
                    `${momentId}_${i}`, // 使用索引区分多张图片
                    {
                        storedAt: new Date().toISOString(),
                        imageIndex: i,
                        momentId: momentId
                    }
                );

                fileIds.push(result.fileId);
            }

            console.log(`朋友圈多图片存储成功: ${fileIds.length}张图片`);
            return fileIds;

        } catch (error) {
            console.error('存储朋友圈多图片失败:', error);
            throw error;
        }
    }

    /**
     * 获取朋友圈多图片URLs
     * @param {string} momentId - 朋友圈动态ID
     * @param {number} imageCount - 图片数量
     * @returns {Promise<Array>} 返回图片URL数组
     */
    async getMomentImagesURLs(momentId, imageCount) {
        await this.init();

        try {
            const urls = [];
            for (let i = 0; i < imageCount; i++) {
                const referenceKey = `${momentId}_${i}`;
                const reference = await this.fileManager.getFileReference('moment_image', referenceKey);
                if (reference) {
                    const url = await this.fileManager.createFileURL(reference.fileId);
                    urls.push(url);
                } else {
                    console.warn(`朋友圈图片不存在: ${referenceKey}`);
                }
            }
            return urls;
        } catch (error) {
            console.error('获取朋友圈多图片失败:', error);
            return [];
        }
    }

    /**
     * 删除朋友圈所有图片
     * @param {string} momentId - 朋友圈动态ID
     * @param {number} imageCount - 图片数量
     */
    async deleteMomentImages(momentId, imageCount) {
        await this.init();

        try {
            for (let i = 0; i < imageCount; i++) {
                const referenceKey = `${momentId}_${i}`;
                await this.deleteImage('moment_image', referenceKey);
            }
            console.log(`朋友圈图片删除成功: ${momentId}`);
        } catch (error) {
            console.error('删除朋友圈图片失败:', error);
            throw error;
        }
    }

    /**
     * 删除图片
     * @param {string} referenceType - 引用类型
     * @param {string} referenceKey - 引用键
     */
    async deleteImage(referenceType, referenceKey) {
        await this.init();

        try {
            const reference = await this.fileManager.getFileReference(referenceType, referenceKey);
            if (reference) {
                // 删除文件
                await this.fileManager.deleteFile(reference.fileId);
                // 删除引用
                await this.fileManager.deleteFileReference(referenceType, referenceKey);
                console.log(`图片删除成功: ${referenceType}/${referenceKey}`);
            }
        } catch (error) {
            console.error('删除图片失败:', error);
            throw error;
        }
    }

    /**
     * 批量迁移base64数据到Blob存储
     * @param {string} sourceType - 源数据类型（'avatars', 'backgrounds', 'emojis'）
     * @param {Array} dataArray - 要迁移的数据数组
     * @param {Function} progressCallback - 进度回调函数
     */
    async migrateBulkData(sourceType, dataArray, progressCallback = null) {
        await this.init();

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < dataArray.length; i++) {
            const item = dataArray[i];
            
            try {
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: dataArray.length,
                        item: item,
                        type: sourceType
                    });
                }

                let fileId = null;

                switch (sourceType) {
                    case 'avatars':
                        if (item.avatar && item.avatar.startsWith('data:')) {
                            const entityType = item.type || 'contact'; // 假设默认为contact
                            fileId = await this.storeAvatar(item.avatar, entityType, item.id);
                            // 清除原始base64数据
                            item.avatar = '';
                            item.avatarFileId = fileId;
                        }
                        break;

                    case 'backgrounds':
                        if (item.data && item.data.startsWith('data:')) {
                            fileId = await this.storeBackground(item.data, item.id);
                            // 清除原始base64数据
                            item.data = '';
                            item.fileId = fileId;
                        }
                        break;

                    case 'emojis':
                        if (item.data && item.data.startsWith('data:')) {
                            fileId = await this.storeEmoji(item.data, item.tag);
                            // 清除原始base64数据
                            item.data = '';
                            item.fileId = fileId;
                        }
                        break;

                    case 'moments':
                        if (item.image && item.image.startsWith('data:')) {
                            fileId = await this.storeMomentImage(item.image, item.id);
                            // 清除原始base64数据
                            item.image = '';
                            item.imageFileId = fileId;
                        }
                        break;
                }

                if (fileId) {
                    results.success++;
                } else {
                    // 没有需要迁移的数据
                }

            } catch (error) {
                results.failed++;
                results.errors.push({
                    item: item,
                    error: error.message
                });
                console.error(`迁移数据失败 (${sourceType}):`, error, item);
            }
        }

        return results;
    }

    /**
     * 获取存储统计信息
     */
    async getStorageStats() {
        await this.init();
        return await this.fileManager.getStorageStats();
    }

    /**
     * 清理未使用的文件
     */
    async cleanupUnusedFiles() {
        await this.init();
        return await this.fileManager.cleanupUnusedFiles();
    }

    /**
     * 检查是否需要数据迁移
     */
    async needsMigration() {
        try {
            // 检查是否存在旧的base64数据
            if (!window.db || !window.isIndexedDBReady) {
                return false;
            }

            const transaction = window.db.transaction(['contacts', 'emojiImages', 'backgrounds', 'userProfile', 'moments'], 'readonly');
            
            // 检查contacts中是否有avatar base64数据
            const contactsStore = transaction.objectStore('contacts');
            const contactsRequest = contactsStore.getAll();
            
            return new Promise((resolve) => {
                contactsRequest.onsuccess = () => {
                    const contacts = contactsRequest.result;
                    const hasBase64Avatars = contacts.some(contact => 
                        contact.avatar && contact.avatar.startsWith('data:')
                    );
                    
                    resolve(hasBase64Avatars);
                };
                
                contactsRequest.onerror = () => {
                    resolve(false);
                };
            });

        } catch (error) {
            console.error('检查迁移需求失败:', error);
            return false;
        }
    }

    /**
     * 存储banner图片
     * @param {string|File|Blob} imageData - 图片数据（base64字符串、File对象或Blob对象）
     * @param {string} bannerId - banner标识符
     * @returns {Promise<string>} 文件ID
     */
    async storeBanner(imageData, bannerId) {
        await this.init();
        
        try {
            console.log('开始存储banner图片，bannerId:', bannerId);
            
            // 处理不同类型的图片数据
            let blob;
            if (imageData instanceof Blob) {
                blob = imageData;
                console.log('处理Blob数据，大小:', blob.size);
            } else if (imageData instanceof File) {
                blob = imageData;
                console.log('处理File数据，大小:', blob.size);
            } else if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
                // 处理base64数据
                blob = await this._base64ToBlob(imageData);
                console.log('处理base64数据，转换后大小:', blob.size);
            } else {
                throw new Error('不支持的图片数据格式');
            }

            // 存储文件
            const fileResult = await this.fileManager.storeFile(blob, 'image/jpeg');
            console.log('文件存储完成，结果:', fileResult);
            
            const fileId = fileResult.fileId; // 提取实际的文件ID字符串
            console.log('提取的文件ID字符串:', fileId);
            
            // 创建引用
            const referenceId = `banner_${bannerId}`;
            console.log('创建文件引用，引用ID:', referenceId, '文件ID:', fileId);
            await this.fileManager.createFileReference(fileId, 'banner', bannerId);
            
            console.log(`Banner图片存储成功: ${bannerId} -> ${fileId}`);
            return fileId;
            
        } catch (error) {
            console.error('存储banner图片失败:', error);
            throw error;
        }
    }

    /**
     * 获取banner图片URL
     * @param {string} bannerId - banner标识符
     * @returns {Promise<string|null>} 图片URL，如果不存在返回null
     */
    async getBannerURL(bannerId) {
        await this.init();
        
        try {
            console.log('查找banner，bannerId:', bannerId);
            const referenceResult = await this.fileManager.getFileReference('banner', bannerId);
            console.log('获取到的引用结果:', referenceResult);
            
            if (!referenceResult || !referenceResult.fileId) {
                console.log('未找到banner文件引用或文件ID');
                return null;
            }
            
            const fileId = referenceResult.fileId;
            console.log('提取的文件ID:', fileId);
            const url = await this.fileManager.createFileURL(fileId);
            console.log('生成的banner URL:', url);
            return url;
            
        } catch (error) {
            console.error('获取banner图片URL失败:', error);
            return null;
        }
    }
}

// 创建全局实例
const imageStorageAPI = new ImageStorageAPI();

// 导出到window对象
window.ImageStorageAPI = imageStorageAPI;

// 图片存储API已加载