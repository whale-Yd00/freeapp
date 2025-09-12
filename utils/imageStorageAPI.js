/**
 * 详细错误类 - 提供错误类型和用户友好的错误消息
 */
class DetailedError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DetailedError';
        this.code = code;
    }
}

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
            // 确保UnifiedDBManager已加载（通过FileStorageManager兼容性映射）
            if (!window.FileStorageManager) {
                throw new Error('UnifiedDBManager未加载或FileStorageManager映射未设置');
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
            // 验证输入参数
            if (!imageData) {
                throw new DetailedError('FILE_MISSING', '没有选择文件');
            }
            
            if (!entityType || !entityId) {
                throw new DetailedError('PARAM_MISSING', '缺少必要的参数');
            }

            // 检查文件大小（如果是File或Blob对象）
            if (imageData instanceof File || imageData instanceof Blob) {
                const maxSize = 10 * 1024 * 1024; // 10MB
                if (imageData.size > maxSize) {
                    throw new DetailedError('FILE_TOO_LARGE', '文件大小超过10MB限制');
                }
                if (!imageData.type.startsWith('image/')) {
                    throw new DetailedError('INVALID_FILE_TYPE', '请选择图片文件');
                }
            }

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
            console.error('详细错误信息:', {
                errorName: error.name,
                errorCode: error.code,
                errorMessage: error.message,
                originalError: error.originalError,
                stackTrace: error.stack,
                entityType: entityType,
                entityId: entityId,
                fileType: imageData instanceof File ? imageData.type : 'unknown',
                fileSize: imageData instanceof File ? imageData.size : 'unknown'
            });
            
            // 如果是我们自定义的DetailedError或者已经有code属性，直接抛出
            if (error instanceof DetailedError || error.name === 'DetailedError' || error.code) {
                throw error;
            }
            
            // 处理其他类型的错误
            if (error.name === 'QuotaExceededError') {
                throw new DetailedError('STORAGE_FULL', '存储空间不足，请清理数据后重试');
            }
            
            if (error.name === 'InvalidStateError' || (error.message && error.message.includes('database'))) {
                throw new DetailedError('DATABASE_ERROR', '数据库操作失败，请刷新页面后重试');
            }
            
            if (error.message && error.message.includes('未加载')) {
                throw new DetailedError('SYSTEM_ERROR', '文件存储系统未就绪，请刷新页面');
            }
            
            if (error.message && error.message.includes('表不存在')) {
                throw new DetailedError('DATABASE_SCHEMA_ERROR', '数据库表结构不完整，请刷新页面重新初始化');
            }
            
            // 默认错误 - 提供更多调试信息
            const errorMsg = error.message || error.toString() || '未知错误';
            throw new DetailedError('UNKNOWN_ERROR', `头像上传失败: ${errorMsg}`);
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
            // 验证输入参数
            if (!imageData) {
                throw new DetailedError('FILE_MISSING', '没有选择背景图片');
            }
            
            if (!backgroundId) {
                throw new DetailedError('PARAM_MISSING', '背景ID不能为空');
            }

            // 检查文件大小和类型
            if (imageData instanceof File || imageData instanceof Blob) {
                const maxSize = 15 * 1024 * 1024; // 15MB（背景图片可以稍大）
                if (imageData.size > maxSize) {
                    throw new DetailedError('FILE_TOO_LARGE', '背景图片大小超过15MB限制');
                }
                if (!imageData.type.startsWith('image/')) {
                    throw new DetailedError('INVALID_FILE_TYPE', '请选择图片文件作为背景');
                }
            }

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
            
            // 如果是我们自定义的DetailedError，直接抛出
            if (error instanceof DetailedError) {
                throw error;
            }
            
            // 处理其他类型的错误
            if (error.name === 'QuotaExceededError') {
                throw new DetailedError('STORAGE_FULL', '存储空间不足，请清理数据后重试');
            }
            
            if (error.name === 'InvalidStateError' || error.message && error.message.includes('database')) {
                throw new DetailedError('DATABASE_ERROR', '数据库操作失败，请刷新页面后重试');
            }
            
            if (error.message && error.message.includes('未加载')) {
                throw new DetailedError('SYSTEM_ERROR', '文件存储系统未就绪，请刷新页面');
            }
            
            // 默认错误
            throw new DetailedError('UNKNOWN_ERROR', `背景图片上传失败: ${error.message || '未知错误'}`);
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
            // 验证输入参数
            if (!imageData) {
                throw new DetailedError('FILE_MISSING', '没有选择表情包图片');
            }
            
            if (!emojiTag) {
                throw new DetailedError('PARAM_MISSING', '表情包标签不能为空');
            }

            // 检查文件大小和类型
            if (imageData instanceof File || imageData instanceof Blob) {
                const maxSize = 5 * 1024 * 1024; // 5MB（表情包通常较小）
                if (imageData.size > maxSize) {
                    throw new DetailedError('FILE_TOO_LARGE', '表情包大小超过5MB限制');
                }
                if (!imageData.type.startsWith('image/')) {
                    throw new DetailedError('INVALID_FILE_TYPE', '请选择图片文件作为表情包');
                }
            }

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
            
            // 如果是我们自定义的DetailedError，直接抛出
            if (error instanceof DetailedError) {
                throw error;
            }
            
            // 处理其他类型的错误
            if (error.name === 'QuotaExceededError') {
                throw new DetailedError('STORAGE_FULL', '存储空间不足，请清理数据后重试');
            }
            
            if (error.name === 'InvalidStateError' || error.message && error.message.includes('database')) {
                throw new DetailedError('DATABASE_ERROR', '数据库操作失败，请刷新页面后重试');
            }
            
            if (error.message && error.message.includes('未加载')) {
                throw new DetailedError('SYSTEM_ERROR', '文件存储系统未就绪，请刷新页面');
            }
            
            // 默认错误
            throw new DetailedError('UNKNOWN_ERROR', `表情包上传失败: ${error.message || '未知错误'}`);
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
     * 清理临时头像引用
     * 清理所有以 'temp_' 开头的头像引用
     */
    async cleanupTempAvatarReferences() {
        await this.init();
        
        try {
            // 获取所有头像引用
            const transaction = window.db.transaction(['fileReferences'], 'readwrite');
            const store = transaction.objectStore('fileReferences');
            const index = store.index('category');
            const request = index.getAll('avatar_contact');
            
            request.onsuccess = async () => {
                const references = request.result;
                const tempReferences = references.filter(ref => 
                    ref.referenceKey && ref.referenceKey.startsWith('temp_')
                );
                
                console.log(`找到 ${tempReferences.length} 个临时头像引用，开始清理...`);
                
                for (const ref of tempReferences) {
                    try {
                        // 删除文件引用
                        await this.fileManager.deleteFileReference('avatar_contact', ref.referenceKey);
                        // 尝试删除对应的文件
                        if (ref.fileId) {
                            await this.fileManager.deleteFile(ref.fileId);
                        }
                        console.log(`清理临时引用: ${ref.referenceId}`);
                    } catch (error) {
                        console.warn(`清理临时引用失败: ${ref.referenceId}`, error);
                    }
                }
                
                console.log('临时头像引用清理完成');
            };
            
            request.onerror = () => {
                console.error('获取头像引用失败:', request.error);
            };
            
        } catch (error) {
            console.error('清理临时头像引用失败:', error);
        }
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

    /**
     * 将base64转换为Blob
     * @private
     */
    async _base64ToBlob(base64) {
        try {
            const [header, data] = base64.split(',');
            const mimeType = header.match(/data:(.+?);/)[1];
            const byteCharacters = atob(data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        } catch (error) {
            console.error('base64转Blob失败:', error);
            throw new Error('base64数据格式错误');
        }
    }
}

// === 文件上传处理函数 ===

/**
 * 通用文件上传函数
 */
async function handleFileUpload(inputId, targetUrlInputId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);
    const targetUrlInput = document.getElementById(targetUrlInputId);

    if (!file) {
        if (typeof showToast === 'function') showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('请上传图片文件');
        fileInput.value = '';
        return;
    }

    if (statusElement) statusElement.textContent = '上传中...';
    
    // 使用 FileReader 将图片转为 Base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        targetUrlInput.value = reader.result;
        if (statusElement) statusElement.textContent = '上传成功！';
        if (typeof showToast === 'function') showToast('图片已加载');
    };
    reader.onerror = (error) => {
        console.error('文件读取失败:', error);
        if (statusElement) statusElement.textContent = '读取失败';
        if (typeof showToast === 'function') showToast(`读取失败: ${error.message}`);
    };
}

/**
 * 处理头像上传
 */
async function handleAvatarUpload(inputId, entityType, entityId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);

    if (!file) {
        if (typeof showToast === 'function') showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('请上传图片文件');
        fileInput.value = '';
        return;
    }

    if (statusElement) statusElement.textContent = '上传中...';
    
    try {
        // 使用新的文件系统存储头像
        if (!window.ImageStorageAPI) {
            throw new Error('ImageStorageAPI 未初始化');
        }
        
        await window.ImageStorageAPI.init();
        const fileId = await window.ImageStorageAPI.storeAvatar(file, entityType, entityId);
        
        if (statusElement) statusElement.textContent = '上传成功！';
        if (typeof showToast === 'function') showToast('头像已保存', 'success');
        
        // 返回文件ID用于后续处理
        return fileId;
    } catch (error) {
        console.error('头像上传失败:', error);
        if (statusElement) statusElement.textContent = '上传失败';
        if (typeof showUploadError === 'function') showUploadError(error);
        throw error;
    }
}

/**
 * 处理背景图片上传
 */
async function handleBackgroundUpload(inputId, contactId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);

    if (!file) {
        if (typeof showToast === 'function') showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('请上传图片文件');
        fileInput.value = '';
        return;
    }

    if (statusElement) statusElement.textContent = '上传中...';
    
    try {
        // 使用新的文件系统存储背景图片
        if (!window.ImageStorageAPI) {
            throw new Error('ImageStorageAPI 未初始化');
        }
        
        await window.ImageStorageAPI.init();
        const fileId = await window.ImageStorageAPI.storeBackground(file, contactId);
        
        if (statusElement) statusElement.textContent = '上传成功！';
        if (typeof showToast === 'function') showToast('背景图片已保存', 'success');
        
        // 返回文件ID用于后续处理
        return fileId;
    } catch (error) {
        console.error('背景图片上传失败:', error);
        if (statusElement) statusElement.textContent = '上传失败';
        if (typeof showUploadError === 'function') showUploadError(error);
        throw error;
    }
}

/**
 * 处理表情包上传
 */
async function handleEmojiUpload(inputId, emojiTag, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);

    if (!file) {
        if (typeof showToast === 'function') showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('请上传图片文件');
        fileInput.value = '';
        return;
    }

    if (statusElement) statusElement.textContent = '上传中...';
    
    try {
        // 使用新的文件系统存储表情包
        if (!window.ImageStorageAPI) {
            throw new Error('ImageStorageAPI 未初始化');
        }
        
        await window.ImageStorageAPI.init();
        const fileId = await window.ImageStorageAPI.storeEmoji(file, emojiTag);
        
        if (statusElement) statusElement.textContent = '上传成功！';
        if (typeof showToast === 'function') showToast('表情包已保存', 'success');
        
        // 返回文件ID用于后续处理
        return fileId;
    } catch (error) {
        console.error('表情包上传失败:', error);
        if (statusElement) statusElement.textContent = '上传失败';
        if (typeof showUploadError === 'function') showUploadError(error);
        throw error;
    }
}

// 全局变量存储临时上传的表情包文件
let tempEmojiFile = null;

/**
 * 处理表情包文件上传
 */
async function handleEmojiFileUpload(event) {
    try {
        const fileInput = document.getElementById('emojiUploadInput');
        const file = fileInput.files[0];
        
        if (!file) {
            if (typeof showToast === 'function') showToast('请先选择一个文件');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            if (typeof showToast === 'function') showToast('请上传图片文件');
            return;
        }
        
        // 简单存储文件对象，等待保存时处理
        tempEmojiFile = file;
        window.ImageUploadHandlers.tempEmojiFile = file;  // 同步更新到暴露的对象中
        
        const statusElement = document.getElementById('emojiUploadStatus');
        if (statusElement) {
            statusElement.textContent = '图片已选择';
            statusElement.style.color = '#07c160';
        }
        
        // 生成临时URL用于预览
        const tempUrl = URL.createObjectURL(file);
        document.getElementById('emojiUrl').value = `temp:${tempUrl}`;
        
        if (typeof showToast === 'function') showToast('图片已选择，填写意思后点击添加');
        
    } catch (error) {
        console.error('表情包文件选择失败:', error);
        if (typeof showToast === 'function') showToast('文件选择失败，请重试');
    }
}

/**
 * 使用文件系统存储表情包的辅助函数
 */
async function storeEmojiWithMeaning(file, emojiTag, statusElement) {
    try {
        if (statusElement) statusElement.textContent = '正在存储...';
        
        // 直接传递File对象给ImageStorageAPI，让它处理数据类型转换
        const fileId = await window.ImageStorageAPI.storeEmoji(file, emojiTag);
        
        if (fileId) {
            document.getElementById('emojiUrl').value = `file:${fileId}`;
            
            if (statusElement) {
                statusElement.textContent = '存储成功';
                statusElement.style.color = '#07c160';
            }
            
            return fileId;
        } else {
            throw new Error('存储返回空的文件ID');
        }
    } catch (error) {
        console.error('表情包存储失败:', error);
        if (statusElement) {
            statusElement.textContent = '存储失败';
            statusElement.style.color = '#ff3b30';
        }
        if (typeof showToast === 'function') showToast('存储失败: ' + error.message);
        throw error;
    }
}

/**
 * 特定的上传处理函数 - 联系人头像
 */
async function handleContactAvatarUpload(event, editingContact) {
    try {
        // 如果正在编辑联系人，使用联系人ID；否则为新联系人生成临时ID
        const contactId = editingContact ? editingContact.id : 'temp_' + Date.now();
        
        // 如果是编辑现有联系人且之前有头像，先删除旧的文件引用
        if (editingContact && editingContact.avatarFileId) {
            try {
                if (window.ImageStorageAPI) {
                    await window.ImageStorageAPI.deleteImage(`avatar_contact`, contactId);
                }
            } catch (deleteError) {
                console.warn('删除旧头像失败，继续上传新头像:', deleteError);
            }
        }
        
        const fileId = await handleAvatarUpload('avatarUploadInput', 'contact', contactId, 'avatarUploadStatus');
        
        if (fileId) {
            // 更新隐藏的URL输入框为文件ID引用
            document.getElementById('contactAvatar').value = `file:${fileId}`;
            
            // 清理联系人头像缓存
            if (window.ImageDisplayHelper) {
                window.ImageDisplayHelper.clearCacheByType(`avatar_contact_${contactId}`);
            }
            
            // 设置持久状态提示
            const statusElement = document.getElementById('avatarUploadStatus');
            if (statusElement) {
                statusElement.textContent = '已上传';
                statusElement.style.color = '#07c160';
            }
            
            // 立即刷新相关UI显示
            if (editingContact) {
                // 更新当前联系人对象的avatarFileId（用于保存时）
                editingContact.avatarFileId = fileId;
                editingContact.avatar = ''; // 清除旧的avatar字段
                
                // 如果当前正在聊天页面，同步更新当前联系人对象
                if (window.currentContact && window.currentContact.id === contactId) {
                    window.currentContact.avatarFileId = fileId;
                    window.currentContact.avatar = '';
                }
                
                // 立即刷新联系人列表中的头像显示
                if (typeof renderContactList === 'function') {
                    try {
                        await renderContactList();
                    } catch (error) {
                        console.warn('刷新联系人列表失败:', error);
                    }
                }
            }
        }
    } catch (error) {
        console.error('联系人头像上传失败:', error);
    }
}

/**
 * 特定的上传处理函数 - 用户头像
 */
async function handleProfileAvatarUpload(event) {
    try {
        const fileId = await handleAvatarUpload('profileUploadInput', 'user', 'profile', 'profileUploadStatus');
        
        if (fileId) {
            // 更新隐藏的URL输入框为文件ID引用
            document.getElementById('profileAvatarInput').value = `file:${fileId}`;
            
            // 清理头像缓存
            if (window.ImageDisplayHelper) {
                window.ImageDisplayHelper.clearCacheByType('avatar_user_');
            }
            
            // 设置持久状态提示
            const statusElement = document.getElementById('profileUploadStatus');
            if (statusElement) {
                statusElement.textContent = '已上传';
                statusElement.style.color = '#07c160';
            }
            
            // 立即更新UI
            if (typeof updateUserProfileUI === 'function') {
                await updateUserProfileUI();
            }
        }
    } catch (error) {
        console.error('个人头像上传失败:', error);
    }
}

/**
 * 特定的上传处理函数 - 背景图片
 */
async function handleBgUpload(event) {
    try {
        // 从全局变量获取currentContact
        const currentContact = window.currentContact;
        if (!currentContact) {
            if (typeof showToast === 'function') showToast('请先选择联系人');
            return;
        }
        
        const fileId = await handleBackgroundUpload('bgUploadInput', currentContact.id, 'bgUploadStatus');
        
        if (fileId) {
            // 更新隐藏的URL输入框为文件ID引用
            document.getElementById('backgroundUrl').value = `file:${fileId}`;
        }
    } catch (error) {
        console.error('背景图片上传失败:', error);
    }
}

// 创建全局实例
const imageStorageAPI = new ImageStorageAPI();

// 导出到window对象
window.ImageStorageAPI = imageStorageAPI;

// 创建命名空间并暴露上传处理函数
window.ImageUploadHandlers = {
    handleFileUpload,
    handleAvatarUpload,
    handleBackgroundUpload,
    handleEmojiUpload,
    handleEmojiFileUpload,
    storeEmojiWithMeaning,
    handleContactAvatarUpload,
    handleProfileAvatarUpload,
    handleBgUpload,
    tempEmojiFile
};

// 为了向后兼容，保留主要的全局引用
// TODO: Remove these global assignments once all code is updated to use ImageUploadHandlers.
window.handleContactAvatarUpload = handleContactAvatarUpload;
window.handleProfileAvatarUpload = handleProfileAvatarUpload;

// 图片存储API已加载