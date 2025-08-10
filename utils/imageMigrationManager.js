/**
 * 图片数据迁移管理器
 * 负责将现有的base64图片数据迁移到新的文件存储系统
 */

class ImageMigrationManager {
    constructor() {
        this.imageAPI = null;
        this.isInitialized = false;
    }

    /**
     * 初始化迁移管理器
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        try {
            // 确保图片存储API已加载
            if (!window.ImageStorageAPI) {
                throw new Error('ImageStorageAPI未加载');
            }

            this.imageAPI = window.ImageStorageAPI;
            await this.imageAPI.init();
            
            this.isInitialized = true;
            // 图片迁移管理器初始化完成
        } catch (error) {
            console.error('图片迁移管理器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 检查是否需要进行图片数据迁移
     */
    async checkMigrationNeeded() {
        if (!window.db || !window.isIndexedDBReady) {
            return {
                needed: false,
                reason: '数据库未准备就绪'
            };
        }

        try {
            const migrationStatus = {
                needed: false,
                details: {
                    contacts: { count: 0, needsMigration: 0 },
                    userProfile: { count: 0, needsMigration: 0 },
                    emojiImages: { count: 0, needsMigration: 0 },
                    backgrounds: { count: 0, needsMigration: 0 },
                    moments: { count: 0, needsMigration: 0 }
                },
                totalFiles: 0
            };

            // 检查联系人头像
            const contactsData = await this.getDataFromStore('contacts');
            migrationStatus.details.contacts.count = contactsData.length;
            migrationStatus.details.contacts.needsMigration = contactsData.filter(
                contact => contact.avatar && contact.avatar.startsWith('data:') && !contact.avatarFileId
            ).length;

            // 检查用户资料头像
            const userProfileData = await this.getDataFromStore('userProfile');
            migrationStatus.details.userProfile.count = userProfileData.length;
            migrationStatus.details.userProfile.needsMigration = userProfileData.filter(
                profile => profile.avatar && profile.avatar.startsWith('data:') && !profile.avatarFileId
            ).length;

            // 检查表情包图片
            const emojiImagesData = await this.getDataFromStore('emojiImages');
            migrationStatus.details.emojiImages.count = emojiImagesData.length;
            migrationStatus.details.emojiImages.needsMigration = emojiImagesData.filter(
                emoji => emoji.data && emoji.data.startsWith('data:') && !emoji.fileId
            ).length;

            // 检查背景图片 - backgrounds以特殊方式存储为单个记录
            const backgroundsRecord = await this.getBackgroundsRecord();
            let backgroundsCount = 0;
            let backgroundsNeedsMigration = 0;
            
            if (backgroundsRecord && backgroundsRecord.id === 'backgroundsMap') {
                // 检查每个联系人的背景图片
                for (const [contactId, backgroundUrl] of Object.entries(backgroundsRecord)) {
                    if (contactId === 'id') continue; // 跳过id字段
                    backgroundsCount++;
                    if (backgroundUrl && backgroundUrl.startsWith('data:')) {
                        backgroundsNeedsMigration++;
                    }
                }
            }
            
            migrationStatus.details.backgrounds.count = backgroundsCount;
            migrationStatus.details.backgrounds.needsMigration = backgroundsNeedsMigration;

            // 检查朋友圈图片
            const momentsData = await this.getDataFromStore('moments');
            migrationStatus.details.moments.count = momentsData.length;
            migrationStatus.details.moments.needsMigration = momentsData.filter(
                moment => moment.image && moment.image.startsWith('data:') && !moment.imageFileId
            ).length;

            // 计算总计
            migrationStatus.totalFiles = Object.values(migrationStatus.details)
                .reduce((sum, detail) => sum + detail.needsMigration, 0);

            migrationStatus.needed = migrationStatus.totalFiles > 0;

            return migrationStatus;

        } catch (error) {
            console.error('检查迁移状态失败:', error);
            return {
                needed: false,
                error: error.message
            };
        }
    }

    /**
     * 从指定存储获取数据
     */
    async getDataFromStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = window.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取backgrounds记录（特殊存储结构）
     */
    async getBackgroundsRecord() {
        return new Promise((resolve, reject) => {
            const transaction = window.db.transaction(['backgrounds'], 'readonly');
            const store = transaction.objectStore('backgrounds');
            const request = store.get('backgroundsMap');

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新backgrounds记录（特殊存储结构）
     */
    async updateBackgroundsRecord(backgroundsRecord) {
        return new Promise((resolve, reject) => {
            const transaction = window.db.transaction(['backgrounds'], 'readwrite');
            const store = transaction.objectStore('backgrounds');
            const request = store.put(backgroundsRecord);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新存储中的数据
     */
    async updateDataInStore(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = window.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const updatePromises = data.map(item => {
                return new Promise((resolveItem, rejectItem) => {
                    const request = store.put(item);
                    request.onsuccess = () => resolveItem();
                    request.onerror = () => rejectItem(request.error);
                });
            });

            Promise.all(updatePromises)
                .then(() => resolve())
                .catch(error => reject(error));
        });
    }

    /**
     * 执行完整的数据迁移
     */
    async performFullMigration(progressCallback = null) {
        await this.init();

        const migrationStatus = await this.checkMigrationNeeded();
        if (!migrationStatus.needed) {
            return {
                success: true,
                message: '无需迁移，所有图片数据已是最新格式',
                results: {}
            };
        }

        const results = {
            contacts: { success: 0, failed: 0, errors: [] },
            userProfile: { success: 0, failed: 0, errors: [] },
            emojiImages: { success: 0, failed: 0, errors: [] },
            backgrounds: { success: 0, failed: 0, errors: [] },
            moments: { success: 0, failed: 0, errors: [] }
        };

        let totalProcessed = 0;
        const totalFiles = migrationStatus.totalFiles;

        try {
            // 迁移联系人头像
            if (migrationStatus.details.contacts.needsMigration > 0) {
                const contactsData = await this.getDataFromStore('contacts');
                const contactsToMigrate = contactsData.filter(
                    contact => contact.avatar && contact.avatar.startsWith('data:') && !contact.avatarFileId
                );

                for (const contact of contactsToMigrate) {
                    try {
                        if (progressCallback) {
                            progressCallback({
                                type: '联系人头像',
                                current: totalProcessed + 1,
                                total: totalFiles,
                                item: contact.name || contact.id
                            });
                        }

                        const fileId = await this.imageAPI.storeAvatar(contact.avatar, 'contact', contact.id);
                        contact.avatar = ''; // 清除base64数据
                        contact.avatarFileId = fileId; // 保存文件引用
                        
                        results.contacts.success++;
                        totalProcessed++;
                    } catch (error) {
                        results.contacts.failed++;
                        results.contacts.errors.push({
                            item: contact,
                            error: error.message
                        });
                        console.error('迁移联系人头像失败:', error);
                    }
                }

                // 更新联系人数据
                await this.updateDataInStore('contacts', contactsData);
            }

            // 迁移用户资料头像
            if (migrationStatus.details.userProfile.needsMigration > 0) {
                const userProfileData = await this.getDataFromStore('userProfile');
                const profilesToMigrate = userProfileData.filter(
                    profile => profile.avatar && profile.avatar.startsWith('data:') && !profile.avatarFileId
                );

                for (const profile of profilesToMigrate) {
                    try {
                        if (progressCallback) {
                            progressCallback({
                                type: '用户头像',
                                current: totalProcessed + 1,
                                total: totalFiles,
                                item: profile.name || '用户资料'
                            });
                        }

                        const fileId = await this.imageAPI.storeAvatar(profile.avatar, 'user', profile.id);
                        profile.avatar = '';
                        profile.avatarFileId = fileId;
                        
                        results.userProfile.success++;
                        totalProcessed++;
                    } catch (error) {
                        results.userProfile.failed++;
                        results.userProfile.errors.push({
                            item: profile,
                            error: error.message
                        });
                        console.error('迁移用户头像失败:', error);
                    }
                }

                await this.updateDataInStore('userProfile', userProfileData);
            }

            // 迁移表情包图片
            if (migrationStatus.details.emojiImages.needsMigration > 0) {
                const emojiImagesData = await this.getDataFromStore('emojiImages');
                const emojisToMigrate = emojiImagesData.filter(
                    emoji => emoji.data && emoji.data.startsWith('data:') && !emoji.fileId
                );

                for (const emoji of emojisToMigrate) {
                    try {
                        if (progressCallback) {
                            progressCallback({
                                type: '表情包',
                                current: totalProcessed + 1,
                                total: totalFiles,
                                item: emoji.tag
                            });
                        }

                        const fileId = await this.imageAPI.storeEmoji(emoji.data, emoji.tag);
                        emoji.data = '';
                        emoji.fileId = fileId;
                        
                        results.emojiImages.success++;
                        totalProcessed++;
                    } catch (error) {
                        results.emojiImages.failed++;
                        results.emojiImages.errors.push({
                            item: emoji,
                            error: error.message
                        });
                        console.error('迁移表情包失败:', error);
                    }
                }

                await this.updateDataInStore('emojiImages', emojiImagesData);
            }

            // 迁移背景图片 - 特殊处理backgrounds的存储结构
            if (migrationStatus.details.backgrounds.needsMigration > 0) {
                const backgroundsRecord = await this.getBackgroundsRecord();
                
                if (backgroundsRecord && backgroundsRecord.id === 'backgroundsMap') {
                    for (const [contactId, backgroundUrl] of Object.entries(backgroundsRecord)) {
                        if (contactId === 'id') continue; // 跳过id字段
                        
                        if (backgroundUrl && backgroundUrl.startsWith('data:')) {
                            try {
                                if (progressCallback) {
                                    progressCallback({
                                        type: '背景图片',
                                        current: totalProcessed + 1,
                                        total: totalFiles,
                                        item: `联系人 ${contactId}`
                                    });
                                }

                                const fileId = await this.imageAPI.storeBackground(backgroundUrl, contactId);
                                
                                // 清空base64数据，标记为已迁移
                                // 迁移后的背景将通过getBackgroundImageURL函数动态获取
                                backgroundsRecord[contactId] = `file:${fileId}`;
                                
                                results.backgrounds.success++;
                                totalProcessed++;
                            } catch (error) {
                                results.backgrounds.failed++;
                                results.backgrounds.errors.push({
                                    item: { contactId, backgroundUrl },
                                    error: error.message
                                });
                                console.error(`迁移背景图片失败 (联系人 ${contactId}):`, error);
                            }
                        }
                    }

                    await this.updateBackgroundsRecord(backgroundsRecord);
                }
            }

            // 迁移朋友圈图片
            if (migrationStatus.details.moments.needsMigration > 0) {
                const momentsData = await this.getDataFromStore('moments');
                const momentsToMigrate = momentsData.filter(
                    moment => moment.image && moment.image.startsWith('data:') && !moment.imageFileId
                );

                for (const moment of momentsToMigrate) {
                    try {
                        if (progressCallback) {
                            progressCallback({
                                type: '朋友圈图片',
                                current: totalProcessed + 1,
                                total: totalFiles,
                                item: moment.authorName || '动态'
                            });
                        }

                        const fileId = await this.imageAPI.storeMomentImage(moment.image, moment.id);
                        moment.image = '';
                        moment.imageFileId = fileId;
                        
                        results.moments.success++;
                        totalProcessed++;
                    } catch (error) {
                        results.moments.failed++;
                        results.moments.errors.push({
                            item: moment,
                            error: error.message
                        });
                        console.error('迁移朋友圈图片失败:', error);
                    }
                }

                await this.updateDataInStore('moments', momentsData);
            }

            // 汇总结果
            const totalSuccess = Object.values(results).reduce((sum, result) => sum + result.success, 0);
            const totalFailed = Object.values(results).reduce((sum, result) => sum + result.failed, 0);

            return {
                success: true,
                message: `迁移完成！成功: ${totalSuccess}, 失败: ${totalFailed}`,
                results: results,
                summary: {
                    totalProcessed: totalSuccess + totalFailed,
                    totalSuccess: totalSuccess,
                    totalFailed: totalFailed
                }
            };

        } catch (error) {
            console.error('数据迁移过程出错:', error);
            return {
                success: false,
                error: error.message,
                results: results
            };
        }
    }

    /**
     * 估算迁移后的存储空间节省
     */
    async estimateStorageSavings(migrationStatus) {
        if (!migrationStatus || !migrationStatus.needed) {
            return {
                estimatedSavings: 0,
                details: {}
            };
        }

        // base64比原始二进制数据大约多33%
        const base64Overhead = 0.33;
        
        // 这里只是一个粗略估算，实际节省取决于具体的图片大小
        const estimatedSavingsPerFile = 50 * 1024; // 假设平均每个文件节省50KB
        const totalEstimatedSavings = migrationStatus.totalFiles * estimatedSavingsPerFile;

        return {
            estimatedSavings: totalEstimatedSavings,
            formattedSavings: this.formatBytes(totalEstimatedSavings),
            details: {
                filesToMigrate: migrationStatus.totalFiles,
                averageSavingsPerFile: estimatedSavingsPerFile,
                base64Overhead: base64Overhead
            }
        };
    }

    /**
     * 格式化字节数
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 创建全局实例
const imageMigrationManager = new ImageMigrationManager();

// 导出到window对象
window.ImageMigrationManager = imageMigrationManager;

// 图片迁移管理器已加载