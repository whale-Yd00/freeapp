/**
 * 图片显示帮助工具
 * 提供向后兼容的图片URL获取功能，支持新的文件存储系统和旧的base64格式
 */

class ImageDisplayHelper {
    constructor() {
        this.urlCache = new Map();
        this.imageAPI = null;
    }

    /**
     * 初始化
     */
    async init() {
        if (!this.imageAPI && window.ImageStorageAPI) {
            this.imageAPI = window.ImageStorageAPI;
            await this.imageAPI.init();
        }
    }

    /**
     * 获取头像URL（支持联系人和用户）
     * @param {Object} entity - 联系人或用户对象
     * @param {string} entityType - 'contact' 或 'user'
     * @returns {Promise<string>} 返回图片URL或空字符串
     */
    async getAvatarURL(entity, entityType = 'contact') {
        if (!entity) return '';
        
        try {
            await this.init();
            
            // 检查是否有新的文件引用
            if (entity.avatarFileId && this.imageAPI) {
                // 为用户类型使用固定的id，因为用户对象通常没有id字段
                const entityId = entityType === 'user' ? 'profile' : entity.id;
                const cacheKey = `avatar_${entityType}_${entityId}`;
                
                if (this.urlCache.has(cacheKey)) {
                    return this.urlCache.get(cacheKey);
                }
                
                const url = await this.imageAPI.getAvatarURL(entityType, entityId);
                this.urlCache.set(cacheKey, url);
                return url;
            }
            
            // 回退到旧的base64格式
            if (entity.avatar && entity.avatar.startsWith('data:')) {
                return entity.avatar;
            }
            
            return '';
            
        } catch (error) {
            console.warn(`获取${entityType}头像失败:`, error);
            // 回退到旧格式
            return entity.avatar || '';
        }
    }

    /**
     * 获取背景图片URL
     * @param {Object} background - 背景对象
     * @returns {Promise<string>} 返回图片URL或空字符串
     */
    async getBackgroundURL(background) {
        if (!background) return '';
        
        try {
            await this.init();
            
            // 检查是否有新的文件引用
            if (background.fileId && this.imageAPI) {
                const cacheKey = `background_${background.id}`;
                
                if (this.urlCache.has(cacheKey)) {
                    return this.urlCache.get(cacheKey);
                }
                
                const url = await this.imageAPI.getBackgroundURL(background.id);
                this.urlCache.set(cacheKey, url);
                return url;
            }
            
            // 回退到旧格式
            if (background.data && background.data.startsWith('data:')) {
                return background.data;
            }
            
            return background.url || '';
            
        } catch (error) {
            console.warn('获取背景图片失败:', error);
            return background.data || background.url || '';
        }
    }

    /**
     * 获取表情包URL
     * @param {Object} emoji - 表情包对象
     * @returns {Promise<string>} 返回图片URL或空字符串
     */
    async getEmojiURL(emoji) {
        if (!emoji) return '';
        
        try {
            await this.init();
            
            // 检查是否有新的文件引用
            if (emoji.fileId && this.imageAPI) {
                const cacheKey = `emoji_${emoji.tag}`;
                
                if (this.urlCache.has(cacheKey)) {
                    return this.urlCache.get(cacheKey);
                }
                
                const url = await this.imageAPI.getEmojiURL(emoji.tag);
                this.urlCache.set(cacheKey, url);
                return url;
            }
            
            // 回退到旧格式
            if (emoji.data && emoji.data.startsWith('data:')) {
                return emoji.data;
            }
            
            return emoji.url || '';
            
        } catch (error) {
            console.warn('获取表情包失败:', error);
            return emoji.data || emoji.url || '';
        }
    }

    /**
     * 获取朋友圈图片URL
     * @param {Object} moment - 朋友圈动态对象
     * @returns {Promise<string>} 返回图片URL或空字符串
     */
    async getMomentImageURL(moment) {
        if (!moment) return '';
        
        try {
            await this.init();
            
            // 检查是否有新的文件引用
            if (moment.imageFileId && this.imageAPI) {
                const cacheKey = `moment_${moment.id}`;
                
                if (this.urlCache.has(cacheKey)) {
                    return this.urlCache.get(cacheKey);
                }
                
                const url = await this.imageAPI.getMomentImageURL(moment.id);
                this.urlCache.set(cacheKey, url);
                return url;
            }
            
            // 回退到旧格式
            if (moment.image && moment.image.startsWith('data:')) {
                return moment.image;
            }
            
            return moment.imageUrl || '';
            
        } catch (error) {
            console.warn('获取朋友圈图片失败:', error);
            return moment.image || moment.imageUrl || '';
        }
    }

    /**
     * 创建头像HTML元素（向后兼容）
     * @param {Object} entity - 联系人或用户对象  
     * @param {string} entityType - 'contact' 或 'user'
     * @param {string} className - CSS类名（可选）
     * @returns {Promise<string>} 返回HTML字符串
     */
    async createAvatarHTML(entity, entityType = 'contact', className = '') {
        if (!entity) return '';
        
        const avatarURL = await this.getAvatarURL(entity, entityType);
        const classAttr = className ? ` class="${className}"` : '';
        
        if (avatarURL) {
            return `<img src="${avatarURL}"${classAttr}>`;
        } else {
            // 使用首字符作为默认头像
            const firstChar = entity.name ? entity.name[0] : (entityType === 'user' ? '我' : '?');
            return `<span${classAttr}>${firstChar}</span>`;
        }
    }

    /**
     * 清理URL缓存
     */
    clearCache() {
        this.urlCache.clear();
    }

    /**
     * 清理特定类型的缓存
     * @param {string} type - 缓存类型前缀（如 'avatar_', 'background_'）
     */
    clearCacheByType(type) {
        for (const [key] of this.urlCache) {
            if (key.startsWith(type)) {
                this.urlCache.delete(key);
            }
        }
    }
}

// 创建全局实例
const imageDisplayHelper = new ImageDisplayHelper();

// 导出到window对象
window.ImageDisplayHelper = imageDisplayHelper;

// 图片显示帮助工具已加载