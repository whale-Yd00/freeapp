/**
 * 字体按需加载管理器
 * 根据用户自定义气泡配置中的字体设置，动态加载对应的字体文件
 */

class FontLoader {
    constructor() {
        // 字体名称到CDN URL的映射
        this.fontUrlMapping = {
            'Inter': null, // 默认字体，无需加载额外CSS
            'Source Han Serif CN VF': 'https://chinese-fonts-cdn.deno.dev/packages/syst/dist/SourceHanSerifCN/result.css',
            'LXGW WenKai': 'https://chinese-fonts-cdn.deno.dev/packages/lxgwwenkaibright/dist/LXGWBright-Regular/result.css',
            'DouyinSansBold': 'https://chinese-fonts-cdn.deno.dev/packages/dymh/dist/DouyinSansBold/result.css',
            '汇文明朝体': 'https://chinese-fonts-cdn.deno.dev/packages/hwmct/dist/汇文明朝体/result.css',
            'ToneOZ-PinyinW-Kai-Simplified': 'https://chinese-fonts-cdn.deno.dev/packages/ToneOZ-Pinyin-Kai/dist/ToneOZ-PinyinW-Kai-Simplified/result.css',
            'ChillRoundFBold': 'https://chinese-fonts-cdn.deno.dev/packages/hcqyt/dist/ChillRoundFBold/result.css',
            '峄山碑篆体': 'https://chinese-fonts-cdn.deno.dev/packages/ysbzt/dist/峄山碑篆体/result.css',
            'YuFanXinYu-Medium': 'https://chinese-fonts-cdn.deno.dev/packages/yfxy/dist/YuFanXinYu-Medium/result.css'
        };
        
        // 记录已加载的字体，避免重复加载
        this.loadedFonts = new Set();
        
        // 记录加载中的字体，避免并发加载同一字体
        this.loadingFonts = new Map();
    }

    /**
     * 根据字体名称获取对应的CDN URL
     * @param {string} fontFamily - 字体名称
     * @returns {string|null} CDN URL或null（对于默认字体）
     */
    getFontUrl(fontFamily) {
        return this.fontUrlMapping[fontFamily] || null;
    }

    /**
     * 动态加载字体CSS文件
     * @param {string} fontFamily - 字体名称
     * @returns {Promise<boolean>} 是否加载成功
     */
    async loadFont(fontFamily) {
        // 如果是默认字体或已经加载过，直接返回成功
        if (!fontFamily || fontFamily === 'Inter' || this.loadedFonts.has(fontFamily)) {
            return true;
        }

        // 如果正在加载中，等待加载完成
        if (this.loadingFonts.has(fontFamily)) {
            return await this.loadingFonts.get(fontFamily);
        }

        const fontUrl = this.getFontUrl(fontFamily);
        if (!fontUrl) {
            console.warn(`未找到字体 ${fontFamily} 的CDN映射`);
            return false;
        }

        // 创建加载Promise
        const loadingPromise = this._loadFontStylesheet(fontUrl, fontFamily);
        this.loadingFonts.set(fontFamily, loadingPromise);

        try {
            const success = await loadingPromise;
            if (success) {
                this.loadedFonts.add(fontFamily);
                console.log(`字体加载成功: ${fontFamily}`);
            }
            return success;
        } finally {
            // 清理加载状态
            this.loadingFonts.delete(fontFamily);
        }
    }

    /**
     * 实际加载字体样式表的私有方法
     * @param {string} url - CSS文件URL
     * @param {string} fontFamily - 字体名称（用于日志）
     * @returns {Promise<boolean>} 是否加载成功
     */
    _loadFontStylesheet(url, fontFamily) {
        return new Promise((resolve) => {
            // 检查是否已经存在相同URL的链接
            const existingLink = document.querySelector(`link[href="${url}"]`);
            if (existingLink) {
                console.log(`字体样式表已存在: ${fontFamily}`);
                resolve(true);
                return;
            }

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.crossOrigin = 'anonymous'; // 添加跨域支持

            link.onerror = () => {
                console.error(`字体样式表加载失败: ${fontFamily} (${url})`);
                resolve(false);
            };

            // 设置超时，避免长时间等待
            const timeout = setTimeout(() => {
                console.warn(`字体加载超时: ${fontFamily}`);
                resolve(false);
            }, 10000); // 10秒超时

            link.onload = () => {
                clearTimeout(timeout);
                console.log(`字体样式表加载完成: ${fontFamily}`);
                resolve(true);
            };

            // 插入到head中
            document.head.appendChild(link);
        });
    }

    /**
     * 从IndexedDB加载用户配置并加载对应字体
     * @returns {Promise<void>}
     */
    async loadFontsFromUserConfig() {
        try {
            // 确保数据库已就绪
            if (!window.isIndexedDBReady || !window.db) {
                console.warn('数据库未就绪，跳过字体加载');
                return;
            }

            // 读取用户的气泡配置
            const [bubbleStyleSelf, bubbleStyleKare] = await Promise.all([
                this._loadConfigFromDB('bubbleStyleSelf'),
                this._loadConfigFromDB('bubbleStyle')
            ]);

            // 收集需要加载的字体
            const fontsToLoad = new Set();
            
            if (bubbleStyleSelf?.fontFamily) {
                fontsToLoad.add(bubbleStyleSelf.fontFamily);
            }
            
            if (bubbleStyleKare?.fontFamily) {
                fontsToLoad.add(bubbleStyleKare.fontFamily);
            }

            // 如果没有配置，使用默认字体
            if (fontsToLoad.size === 0) {
                console.log('未找到字体配置，使用默认字体');
                return;
            }

            console.log('开始加载用户配置的字体:', Array.from(fontsToLoad));

            // 并行加载所有需要的字体
            const loadPromises = Array.from(fontsToLoad).map(font => this.loadFont(font));
            const results = await Promise.all(loadPromises);
            
            const successCount = results.filter(Boolean).length;
            console.log(`字体加载完成: ${successCount}/${fontsToLoad.size} 成功`);

        } catch (error) {
            console.error('从用户配置加载字体失败:', error);
        }
    }

    /**
     * 从IndexedDB加载配置的私有方法
     * @param {string} configKey - 配置键名
     * @returns {Promise<Object|null>} 配置对象或null
     */
    _loadConfigFromDB(configKey) {
        return new Promise((resolve) => {
            try {
                const transaction = window.db.transaction(['themeConfig'], 'readonly');
                const store = transaction.objectStore('themeConfig');
                const request = store.get(configKey);

                request.onsuccess = () => {
                    const result = request.result;
                    if (result && result.enabled !== false) {
                        resolve(result);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.warn(`读取配置失败: ${configKey}`, request.error);
                    resolve(null);
                };

                transaction.onerror = () => {
                    console.warn(`事务失败: ${configKey}`, transaction.error);
                    resolve(null);
                };
            } catch (error) {
                console.warn(`数据库操作异常: ${configKey}`, error);
                resolve(null);
            }
        });
    }

    /**
     * 预加载指定的字体
     * @param {string|string[]} fonts - 字体名称或字体数组
     * @returns {Promise<boolean[]>} 加载结果数组
     */
    async preloadFonts(fonts) {
        const fontArray = Array.isArray(fonts) ? fonts : [fonts];
        const loadPromises = fontArray.map(font => this.loadFont(font));
        return await Promise.all(loadPromises);
    }

    /**
     * 获取已加载的字体列表
     * @returns {string[]} 已加载的字体名称数组
     */
    getLoadedFonts() {
        return Array.from(this.loadedFonts);
    }

    /**
     * 清理加载状态（用于调试）
     */
    reset() {
        this.loadedFonts.clear();
        this.loadingFonts.clear();
    }
}

// 创建全局实例
window.fontLoader = new FontLoader();

// 在数据库就绪后自动加载字体
document.addEventListener('DOMContentLoaded', async () => {
    // 使用 ensureDBReady 确保数据库已就绪
    if (typeof ensureDBReady === 'function') {
        try {
            await ensureDBReady(async () => {
                await window.fontLoader.loadFontsFromUserConfig();
            }, '按需加载字体');
        } catch (error) {
            console.error('按需字体加载失败:', error);
        }
    } else {
        // 降级方案：直接尝试加载
        setTimeout(async () => {
            await window.fontLoader.loadFontsFromUserConfig();
        }, 2000);
    }
});

// 导出到全局作用域，方便其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FontLoader;
}