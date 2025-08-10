/**
 * 聊天记录表情包迁移管理器
 * 专门处理聊天记录中表情包从base64到新文件存储系统的迁移
 */

class ChatEmojiMigrationManager {
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
            // 聊天记录表情包迁移管理器初始化完成
        } catch (error) {
            console.error('聊天记录表情包迁移管理器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 检查聊天记录中是否存在需要迁移的表情包
     */
    async checkChatEmojiMigrationNeeded() {
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
                    totalContacts: 0,
                    contactsNeedingMigration: 0,
                    totalMessages: 0,
                    messagesNeedingMigration: 0,
                    base64EmojisFound: 0,
                    emojiImagesNeedingMigration: 0
                },
                contactDetails: []
            };

            // 获取所有联系人数据
            const contactsData = await this.getDataFromStore('contacts');
            migrationStatus.details.totalContacts = contactsData.length;

            // 检查每个联系人的聊天记录
            for (const contact of contactsData) {
                if (contact.messages && Array.isArray(contact.messages)) {
                    const contactDetail = {
                        contactId: contact.id,
                        contactName: contact.name,
                        messagesCount: contact.messages.length,
                        base64EmojisCount: 0,
                        needsMigration: false
                    };

                    migrationStatus.details.totalMessages += contact.messages.length;

                    for (const message of contact.messages) {
                        if (message.content && typeof message.content === 'string') {
                            // 检查base64图片
                            const base64Matches = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/g);
                            if (base64Matches) {
                                contactDetail.base64EmojisCount += base64Matches.length;
                                migrationStatus.details.base64EmojisFound += base64Matches.length;
                                contactDetail.needsMigration = true;
                            }
                        }
                    }

                    if (contactDetail.needsMigration) {
                        migrationStatus.details.contactsNeedingMigration++;
                        migrationStatus.details.messagesNeedingMigration += contactDetail.base64EmojisCount;
                        migrationStatus.contactDetails.push(contactDetail);
                    }
                }
            }

            // 检查emojiImages表中是否有数据需要迁移到新系统
            const emojiImagesData = await this.getDataFromStore('emojiImages');
            const emojiImagesNeedingMigration = emojiImagesData.filter(img => img.data && img.data.startsWith('data:'));
            migrationStatus.details.emojiImagesNeedingMigration = emojiImagesNeedingMigration.length;

            // 判断是否需要迁移
            migrationStatus.needed = migrationStatus.details.base64EmojisFound > 0 || 
                                   migrationStatus.details.emojiImagesNeedingMigration > 0;

            return migrationStatus;

        } catch (error) {
            console.error('检查聊天记录表情包迁移状态失败:', error);
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
     * 执行聊天记录表情包迁移
     */
    async performChatEmojiMigration(progressCallback = null) {
        await this.init();

        const migrationStatus = await this.checkChatEmojiMigrationNeeded();
        if (!migrationStatus.needed) {
            return {
                success: true,
                message: '无需迁移，聊天记录中的表情包已是最新格式',
                results: {}
            };
        }

        const results = {
            contactsMigrated: 0,
            messagesMigrated: 0,
            emojiImagesMigrated: 0,
            base64EmojisMigrated: 0,
            errors: []
        };

        let totalProcessed = 0;
        const totalItems = migrationStatus.details.base64EmojisFound + 
                          migrationStatus.details.emojiImagesNeedingMigration;

        try {
            // 第一步：迁移emojiImages表中的数据到新的文件存储
            const emojiImagesData = await this.getDataFromStore('emojiImages');
            const emojiImagesNeedingMigration = emojiImagesData.filter(img => img.data && img.data.startsWith('data:'));

            for (const emojiImage of emojiImagesNeedingMigration) {
                try {
                    if (progressCallback) {
                        progressCallback({
                            type: '表情包图片',
                            current: totalProcessed + 1,
                            total: totalItems,
                            item: emojiImage.tag
                        });
                    }

                    // 将base64数据迁移到新的文件存储
                    const fileId = await this.imageAPI.storeEmoji(emojiImage.data, emojiImage.tag);
                    
                    // 更新emojiImage记录
                    emojiImage.data = ''; // 清除base64数据
                    emojiImage.fileId = fileId; // 保存文件引用
                    
                    results.emojiImagesMigrated++;
                    totalProcessed++;

                } catch (error) {
                    results.errors.push({
                        type: 'emojiImage',
                        item: emojiImage,
                        error: error.message
                    });
                    console.error('迁移表情图片失败:', error);
                }
            }

            // 更新emojiImages数据
            if (emojiImagesNeedingMigration.length > 0) {
                await this.updateDataInStore('emojiImages', emojiImagesData);
            }

            // 第二步：迁移联系人聊天记录中的base64表情包
            const contactsData = await this.getDataFromStore('contacts');
            const contactsNeedingMigration = migrationStatus.contactDetails;

            for (const contactDetail of contactsNeedingMigration) {
                const contact = contactsData.find(c => c.id === contactDetail.contactId);
                if (!contact || !contact.messages) continue;

                let contactModified = false;

                for (const message of contact.messages) {
                    if (message.content && typeof message.content === 'string') {
                        // 查找所有base64图片
                        const base64Matches = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/g);
                        if (base64Matches) {
                            let newContent = message.content;

                            for (const base64Url of base64Matches) {
                                try {
                                    if (progressCallback) {
                                        progressCallback({
                                            type: '聊天表情',
                                            current: totalProcessed + 1,
                                            total: totalItems,
                                            item: `${contact.name}的消息`
                                        });
                                    }

                                    // 查找是否存在对应的表情记录
                                    const existingEmoji = await this.findEmojiByBase64(base64Url);
                                    let emojiTag;

                                    if (existingEmoji && existingEmoji.meaning) {
                                        emojiTag = existingEmoji.meaning;
                                        
                                        // 确保该表情的图片已经迁移到新系统
                                        if (!existingEmoji.tag) {
                                            existingEmoji.tag = existingEmoji.meaning;
                                        }
                                        
                                        // 如果还没有fileId，为其创建
                                        if (!await this.hasEmojiFileId(emojiTag)) {
                                            await this.imageAPI.storeEmoji(base64Url, emojiTag);
                                        }
                                    } else {
                                        // 创建临时标签
                                        emojiTag = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                        await this.imageAPI.storeEmoji(base64Url, emojiTag);
                                        
                                        // 添加到emojis数组
                                        window.emojis.push({
                                            id: Date.now().toString(),
                                            meaning: emojiTag,
                                            tag: emojiTag,
                                            url: '' // 清空URL，使用新的文件存储
                                        });
                                    }

                                    // 替换聊天记录中的base64为标签格式
                                    newContent = newContent.replace(base64Url, `[emoji:${emojiTag}]`);
                                    
                                    results.base64EmojisMigrated++;
                                    totalProcessed++;
                                    contactModified = true;

                                } catch (error) {
                                    results.errors.push({
                                        type: 'chatEmoji',
                                        contactId: contact.id,
                                        error: error.message
                                    });
                                    console.error('迁移聊天表情失败:', error);
                                }
                            }

                            message.content = newContent;
                        }
                    }
                }

                if (contactModified) {
                    results.contactsMigrated++;
                    results.messagesMigrated += contactDetail.base64EmojisCount;
                }
            }

            // 更新联系人数据
            await this.updateDataInStore('contacts', contactsData);

            // 更新全局emojis数组
            await this.updateDataInStore('emojis', window.emojis);

            return {
                success: true,
                message: `聊天记录表情包迁移完成！迁移了${results.base64EmojisMigrated}个表情，涉及${results.contactsMigrated}个联系人`,
                results: results
            };

        } catch (error) {
            console.error('聊天记录表情包迁移过程出错:', error);
            return {
                success: false,
                error: error.message,
                results: results
            };
        }
    }

    /**
     * 通过base64 URL查找对应的表情记录
     */
    async findEmojiByBase64(base64Url) {
        if (!window.emojis || !Array.isArray(window.emojis)) {
            return null;
        }

        return window.emojis.find(emoji => emoji.url === base64Url);
    }

    /**
     * 检查表情是否已经有对应的fileId
     */
    async hasEmojiFileId(emojiTag) {
        try {
            const reference = await window.FileStorageManager.getFileReference('emoji', emojiTag);
            return !!reference;
        } catch (error) {
            return false;
        }
    }

    /**
     * 估算迁移效果
     */
    async estimateMigrationBenefits(migrationStatus) {
        if (!migrationStatus || !migrationStatus.needed) {
            return {
                spaceSavings: 0,
                performanceImprovement: '无',
                details: {}
            };
        }

        // 估算空间节省（base64比原始数据大约多33%）
        const estimatedSavingsPerEmoji = 30 * 1024; // 假设平均每个表情节省30KB
        const totalEmojis = migrationStatus.details.base64EmojisFound + 
                           migrationStatus.details.emojiImagesNeedingMigration;
        const totalSavings = totalEmojis * estimatedSavingsPerEmoji;

        return {
            spaceSavings: totalSavings,
            formattedSavings: this.formatBytes(totalSavings),
            performanceImprovement: '中等',
            details: {
                totalEmojisToMigrate: totalEmojis,
                averageSavingsPerEmoji: estimatedSavingsPerEmoji,
                contactsAffected: migrationStatus.details.contactsNeedingMigration
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
const chatEmojiMigrationManager = new ChatEmojiMigrationManager();

// 导出到window对象
window.ChatEmojiMigrationManager = chatEmojiMigrationManager;

// 聊天记录表情包迁移管理器已加载