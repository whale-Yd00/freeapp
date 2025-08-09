/**
 * 图片存储系统升级器
 * 负责将旧的base64存储方式升级为新的虚拟文件系统
 */

class ImageUpgrader {
    constructor() {
        this.storageKey = 'imageSystemVersion';
        this.currentVersion = '2.0';
        this.upgradeInProgress = false;
    }

    /**
     * 检查是否需要升级
     */
    async needsUpgrade() {
        try {
            const storedVersion = localStorage.getItem(this.storageKey);
            const needsUpgrade = !storedVersion || storedVersion < this.currentVersion;
            
            if (needsUpgrade) {
                console.log(`检测到需要升级图片存储系统: ${storedVersion || '未知'} -> ${this.currentVersion}`);
            }
            
            return needsUpgrade;
        } catch (error) {
            console.error('检查升级状态失败:', error);
            return false;
        }
    }

    /**
     * 执行完整的升级流程
     */
    async performUpgrade() {
        if (this.upgradeInProgress) {
            console.log('升级已在进行中...');
            return false;
        }

        this.upgradeInProgress = true;
        let upgradedCount = 0;
        
        try {
            console.log('🚀 开始图片存储系统升级...');
            
            // 显示升级提示
            this.showUpgradeNotification('正在升级图片存储系统，请稍候...');

            // 步骤1: 升级表情包
            const emojiCount = await this.upgradeEmojis();
            upgradedCount += emojiCount;
            console.log(`✅ 表情包升级完成: ${emojiCount} 个`);

            // 步骤2: 升级聊天记录中的图片引用
            const messageCount = await this.upgradeMessageImages();
            console.log(`✅ 聊天记录升级完成: ${messageCount} 条`);

            // 步骤3: 升级头像
            const avatarCount = await this.upgradeAvatars();
            upgradedCount += avatarCount;
            console.log(`✅ 头像升级完成: ${avatarCount} 个`);

            // 步骤4: 升级背景
            const backgroundCount = await this.upgradeBackgrounds();
            upgradedCount += backgroundCount;
            console.log(`✅ 背景升级完成: ${backgroundCount} 个`);

            // 步骤5: 保存数据
            if (typeof saveDataToDB === 'function') {
                await saveDataToDB();
                console.log('✅ 数据已保存');
            }

            // 步骤6: 标记升级完成
            localStorage.setItem(this.storageKey, this.currentVersion);
            
            console.log(`🎉 图片存储系统升级完成！共处理 ${upgradedCount} 个图片文件`);
            
            // 显示成功提示
            this.showUpgradeNotification(
                `图片存储系统升级完成！\n共处理了 ${upgradedCount} 个图片文件\n系统性能已优化`, 
                'success'
            );

            return true;
        } catch (error) {
            console.error('❌ 图片存储系统升级失败:', error);
            this.showUpgradeNotification('图片存储系统升级失败，将继续使用旧版本', 'error');
            return false;
        } finally {
            this.upgradeInProgress = false;
        }
    }

    /**
     * 升级表情包 - 将base64数据转换为文件并更新引用
     */
    async upgradeEmojis() {
        if (!window.imageManager || !window.emojis) {
            console.log('系统未就绪，跳过表情包升级');
            return 0;
        }

        let upgradedCount = 0;

        try {
            // 处理emojis数组中的旧格式数据
            for (const emoji of window.emojis) {
                if (emoji.url && emoji.url.startsWith('data:image/')) {
                    // 旧格式：使用url字段存储base64
                    const meaning = emoji.meaning || emoji.tag || emoji.id;
                    if (meaning) {
                        const success = await window.imageManager.saveEmoji(meaning, emoji.url);
                        if (success) {
                            // 更新emoji对象
                            emoji.tag = meaning;
                            emoji.meaning = meaning;
                            delete emoji.url; // 删除旧的url字段
                            upgradedCount++;
                            console.log(`表情包已升级: ${meaning}`);
                        }
                    }
                }
            }

            // 处理IndexedDB中的emojiImages存储
            if (window.db && window.db.objectStoreNames.contains('emojiImages')) {
                const transaction = window.db.transaction(['emojiImages'], 'readonly');
                const store = transaction.objectStore('emojiImages');
                const emojiImages = await new Promise((resolve, reject) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });

                for (const emojiImage of emojiImages) {
                    if (emojiImage.tag && emojiImage.data) {
                        // 检查是否已经在新系统中
                        const existingImage = await window.imageManager.getEmoji(emojiImage.tag);
                        if (!existingImage) {
                            const success = await window.imageManager.saveEmoji(emojiImage.tag, emojiImage.data);
                            if (success) {
                                upgradedCount++;
                                console.log(`IndexedDB表情包已升级: ${emojiImage.tag}`);
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.error('升级表情包时出错:', error);
        }

        return upgradedCount;
    }

    /**
     * 升级聊天记录中的图片引用
     */
    async upgradeMessageImages() {
        if (!window.contacts) {
            console.log('联系人数据未就绪，跳过消息升级');
            return 0;
        }

        let upgradedMessageCount = 0;
        const emojiUrlToMeaning = new Map(); // 缓存URL到含义的映射

        try {
            // 建立URL到含义的映射表
            if (window.emojis) {
                for (const emoji of window.emojis) {
                    if (emoji.url && (emoji.meaning || emoji.tag)) {
                        emojiUrlToMeaning.set(emoji.url, emoji.meaning || emoji.tag);
                    }
                }
            }

            for (const contact of window.contacts) {
                if (contact.messages && Array.isArray(contact.messages)) {
                    for (const message of contact.messages) {
                        let updated = false;

                        // 处理图片类型消息
                        if (message.type === 'image' && message.content) {
                            if (message.content.startsWith('data:image/')) {
                                const meaning = emojiUrlToMeaning.get(message.content);
                                if (meaning) {
                                    message.content = `[emoji:${meaning}]`;
                                    updated = true;
                                    console.log(`消息图片引用已更新: ${meaning}`);
                                } else {
                                    // 如果没有找到匹配的表情，尝试创建一个临时标识符
                                    const tempMeaning = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    await window.imageManager?.saveEmoji(tempMeaning, message.content);
                                    message.content = `[emoji:${tempMeaning}]`;
                                    updated = true;
                                    console.log(`创建临时表情引用: ${tempMeaning}`);
                                }
                            }
                        }

                        // 处理文本消息中的内嵌图片
                        if (message.type === 'text' && message.content) {
                            let content = message.content;
                            const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/]+=*/g;
                            let hasChanges = false;
                            
                            content = content.replace(base64Pattern, (match) => {
                                const meaning = emojiUrlToMeaning.get(match);
                                if (meaning) {
                                    hasChanges = true;
                                    return `[emoji:${meaning}]`;
                                }
                                return match; // 保留原样
                            });

                            if (hasChanges) {
                                message.content = content;
                                updated = true;
                                console.log(`文本消息中的图片引用已更新`);
                            }
                        }

                        if (updated) {
                            upgradedMessageCount++;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('升级消息图片时出错:', error);
        }

        return upgradedMessageCount;
    }

    /**
     * 升级头像
     */
    async upgradeAvatars() {
        if (!window.imageManager || !window.contacts) {
            console.log('系统未就绪，跳过头像升级');
            return 0;
        }

        let upgradedCount = 0;

        try {
            for (const contact of window.contacts) {
                if (contact.avatar && contact.avatar.startsWith('data:image/')) {
                    const success = await window.imageManager.saveAvatar(contact.id, contact.avatar);
                    if (success) {
                        // 更新引用为虚拟路径
                        contact.avatar = `virtual://images/avatars/avatar_${contact.id}.png`;
                        upgradedCount++;
                        console.log(`头像已升级: ${contact.name || contact.id}`);
                    }
                }
            }

            // 处理用户头像
            if (window.userProfile && window.userProfile.avatar && window.userProfile.avatar.startsWith('data:image/')) {
                const success = await window.imageManager.saveAvatar('user', window.userProfile.avatar);
                if (success) {
                    window.userProfile.avatar = `virtual://images/avatars/avatar_user.png`;
                    upgradedCount++;
                    console.log('用户头像已升级');
                }
            }
        } catch (error) {
            console.error('升级头像时出错:', error);
        }

        return upgradedCount;
    }

    /**
     * 升级背景图片
     */
    async upgradeBackgrounds() {
        if (!window.imageManager || !window.backgrounds) {
            console.log('系统未就绪，跳过背景升级');
            return 0;
        }

        let upgradedCount = 0;

        try {
            for (const [contactId, backgroundUrl] of Object.entries(window.backgrounds)) {
                if (backgroundUrl && backgroundUrl.startsWith('data:image/')) {
                    const success = await window.imageManager.saveBackground(contactId, backgroundUrl);
                    if (success) {
                        // 更新引用为虚拟路径
                        window.backgrounds[contactId] = `virtual://images/backgrounds/bg_${contactId}.png`;
                        upgradedCount++;
                        console.log(`背景已升级: 联系人${contactId}`);
                    }
                }
            }
        } catch (error) {
            console.error('升级背景时出错:', error);
        }

        return upgradedCount;
    }

    /**
     * 显示升级通知
     */
    showUpgradeNotification(message, type = 'info') {
        console.log(`[升级通知] ${message}`);
        
        // 如果有showToast函数，使用它显示提示
        if (typeof showToast === 'function') {
            showToast(message);
        }

        // 如果有自定义通知系统，也可以在这里添加
        if (type === 'success') {
            console.log('🎉', message);
        } else if (type === 'error') {
            console.error('❌', message);
        } else {
            console.info('ℹ️', message);
        }
    }

    /**
     * 获取升级统计信息
     */
    async getUpgradeStats() {
        try {
            const stats = {
                version: localStorage.getItem(this.storageKey) || '未知',
                needsUpgrade: await this.needsUpgrade(),
                totalImages: 0,
                upgradeableImages: 0
            };

            // 统计可升级的图片数量
            if (window.emojis) {
                stats.upgradeableImages += window.emojis.filter(e => e.url && e.url.startsWith('data:image/')).length;
            }

            if (window.contacts) {
                stats.upgradeableImages += window.contacts.filter(c => c.avatar && c.avatar.startsWith('data:image/')).length;
            }

            if (window.backgrounds) {
                stats.upgradeableImages += Object.values(window.backgrounds).filter(bg => bg && bg.startsWith('data:image/')).length;
            }

            if (window.imageManager) {
                const storageStats = await window.imageManager.getStorageStats();
                stats.totalImages = storageStats ? storageStats.totalFiles : 0;
            }

            return stats;
        } catch (error) {
            console.error('获取升级统计失败:', error);
            return null;
        }
    }

    /**
     * 强制重置升级状态（调试用）
     */
    resetUpgradeStatus() {
        localStorage.removeItem(this.storageKey);
        console.log('升级状态已重置');
    }
}

// 创建全局实例
window.imageUpgrader = new ImageUpgrader();

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageUpgrader;
}