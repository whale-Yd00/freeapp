// === Console日志捕获系统 ===
let consoleLogs = [];
const maxLogEntries = 500; // 限制日志条目数量避免内存过大

// === 输入框安全聚焦工具函数 ===
function safeFocus(element, options = {}) {
    if (!element || typeof element.focus !== 'function') return;
    
    const {
        preventScroll = false,
        delay = 0,
        smooth = true
    } = options;
    
    // 防抖机制：如果element已经是activeElement，避免重复操作
    if (document.activeElement === element) return;
    
    const focusAction = () => {
        try {
            // 如果元素不在可视区域，先聚焦但阻止滚动
            element.focus({ preventScroll: true });
            
            // 如果需要滚动到可视区域，使用viewportManager的方法
            if (!preventScroll && window.viewportManager) {
                // 延迟一下，让focus事件先完成
                setTimeout(() => {
                    window.viewportManager.scrollToActiveInput();
                }, 50);
            }
        } catch (error) {
            console.warn('Focus operation failed:', error);
        }
    };
    
    if (delay > 0) {
        setTimeout(focusAction, delay);
    } else {
        focusAction();
    }
}

// 重写console方法来捕获日志
function setupConsoleCapture() {
    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug
    };

    function captureLog(level, args) {
        const timestamp = new Date().toISOString();
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        consoleLogs.push({
            timestamp,
            level,
            message
        });
        
        // 限制日志数量
        if (consoleLogs.length > maxLogEntries) {
            consoleLogs = consoleLogs.slice(-maxLogEntries);
        }
    }

    console.log = function(...args) {
        captureLog('log', args);
        originalConsole.log.apply(console, args);
    };

    console.error = function(...args) {
        captureLog('error', args);
        originalConsole.error.apply(console, args);
    };

    console.warn = function(...args) {
        captureLog('warn', args);
        originalConsole.warn.apply(console, args);
    };

    console.info = function(...args) {
        captureLog('info', args);
        originalConsole.info.apply(console, args);
    };

    console.debug = function(...args) {
        captureLog('debug', args);
        originalConsole.debug.apply(console, args);
    };
}

// 传统下载方式的辅助函数
function fallbackDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 导出日志功能
function exportConsoleLogs() {
    try {
        if (consoleLogs.length === 0) {
            showToast('没有日志可导出');
            return;
        }

        const logContent = consoleLogs.map(log => 
            `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
        ).join('\n');
        
        const filename = `console-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        
        // 检查是否支持Web Share API（移动端分享）
        if (navigator.share && navigator.canShare) {
            const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
            const file = new File([blob], filename, { type: 'text/plain' });
            
            // 检查是否可以分享文件
            if (navigator.canShare({ files: [file] })) {
                navigator.share({
                    title: '调试日志',
                    text: '应用调试日志文件',
                    files: [file]
                }).then(() => {
                    showToast('分享成功');
                    // 关闭设置菜单
                    document.getElementById('settingsMenu').style.display = 'none';
                }).catch((error) => {
                    console.log('分享取消或失败:', error);
                    // 如果分享失败，回退到传统下载方式
                    fallbackDownload(logContent, filename);
                    showToast(`已导出 ${consoleLogs.length} 条日志`);
                    // 关闭设置菜单
                    document.getElementById('settingsMenu').style.display = 'none';
                });
                return;
            }
        }
        
        // 回退到传统下载方式（PC端或不支持分享的移动端）
        fallbackDownload(logContent, filename);
        showToast(`已导出 ${consoleLogs.length} 条日志`);
        
        // 关闭设置菜单
        document.getElementById('settingsMenu').style.display = 'none';
    } catch (error) {
        console.error('导出日志失败:', error);
        showToast('导出日志失败: ' + error.message);
    }
}

// 立即启用console捕获
setupConsoleCapture();

// === 调试日志页面功能 ===
function showDebugLogPage() {
    showPage('debugLogPage');
    updateDebugLogDisplay();
}

function updateDebugLogDisplay() {
    const logContent = document.getElementById('debugLogContent');
    const logCount = document.getElementById('logCount');
    
    if (consoleLogs.length === 0) {
        logContent.innerHTML = '<div class="debug-log-empty">暂无日志记录</div>';
        logCount.textContent = '0';
        return;
    }
    
    logCount.textContent = consoleLogs.length.toString();
    
    const logsHtml = consoleLogs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const levelClass = `debug-log-${log.level}`;
        return `
            <div class="debug-log-item ${levelClass}">
                <div class="debug-log-header">
                    <span class="debug-log-time">${time}</span>
                    <span class="debug-log-level">${log.level.toUpperCase()}</span>
                </div>
                <div class="debug-log-message">${escapeHtml(log.message)}</div>
            </div>
        `;
    }).join('');
    
    logContent.innerHTML = logsHtml;
    
    // 滚动到底部显示最新日志
    logContent.scrollTop = logContent.scrollHeight;
}

function clearDebugLogs() {
    consoleLogs.length = 0;
    updateDebugLogDisplay();
    showToast('已清空调试日志');
}

function copyDebugLogs() {
    if (consoleLogs.length === 0) {
        showToast('没有日志可复制');
        return;
    }
    
    const logText = consoleLogs.map(log => 
        `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    // 尝试使用现代的Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logText).then(() => {
            showToast(`已复制 ${consoleLogs.length} 条日志到剪贴板`);
        }).catch(err => {
            console.error('复制失败:', err);
            fallbackCopyTextToClipboard(logText);
        });
    } else {
        fallbackCopyTextToClipboard(logText);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast(`已复制 ${consoleLogs.length} 条日志到剪贴板`);
        } else {
            showToast('复制失败，请手动选择文本');
        }
    } catch (err) {
        console.error('Fallback: 复制失败', err);
        showToast('复制失败: ' + err.message);
    }
    
    document.body.removeChild(textArea);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// --- 通用文件上传函数 ---
async function handleFileUpload(inputId, targetUrlInputId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);
    const targetUrlInput = document.getElementById(targetUrlInputId);

    if (!file) {
        showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件');
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
        showToast('图片已加载');
    };
    reader.onerror = (error) => {
        console.error('文件读取失败:', error);
        if (statusElement) statusElement.textContent = '读取失败';
        showToast(`读取失败: ${error.message}`);
    };
}

// --- 新的文件系统上传函数 ---
async function handleAvatarUpload(inputId, entityType, entityId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);

    if (!file) {
        showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件');
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
        showToast('头像已保存', 'success');
        
        // 返回文件ID用于后续处理
        return fileId;
    } catch (error) {
        console.error('头像上传失败:', error);
        if (statusElement) statusElement.textContent = '上传失败';
        showUploadError(error);
        throw error;
    }
}

async function handleBackgroundUpload(inputId, contactId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);

    if (!file) {
        showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件');
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
        showToast('背景图片已保存', 'success');
        
        // 返回文件ID用于后续处理
        return fileId;
    } catch (error) {
        console.error('背景图片上传失败:', error);
        if (statusElement) statusElement.textContent = '上传失败';
        showUploadError(error);
        throw error;
    }
}

async function handleEmojiUpload(inputId, emojiTag, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);

    if (!file) {
        showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件');
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
        showToast('表情包已保存', 'success');
        
        // 返回文件ID用于后续处理
        return fileId;
    } catch (error) {
        console.error('表情包上传失败:', error);
        if (statusElement) statusElement.textContent = '上传失败';
        showUploadError(error);
        throw error;
    }
}

// --- 特定的上传处理函数 ---
async function handleContactAvatarUpload(event) {
    try {
        // 如果正在编辑联系人，使用联系人ID；否则为新联系人生成临时ID
        const contactId = editingContact ? editingContact.id : 'temp_' + Date.now();
        const fileId = await handleAvatarUpload('avatarUploadInput', 'contact', contactId, 'avatarUploadStatus');
        
        if (fileId) {
            // 更新隐藏的URL输入框为文件ID引用
            document.getElementById('contactAvatar').value = `file:${fileId}`;
        }
    } catch (error) {
        console.error('联系人头像上传失败:', error);
    }
}

async function handleProfileAvatarUpload(event) {
    try {
        const fileId = await handleAvatarUpload('profileUploadInput', 'user', 'profile', 'profileUploadStatus');
        
        if (fileId) {
            // 更新隐藏的URL输入框为文件ID引用
            document.getElementById('profileAvatarInput').value = `file:${fileId}`;
        }
    } catch (error) {
        console.error('个人头像上传失败:', error);
    }
}

async function handleBgUpload(event) {
    try {
        if (!currentContact) {
            showToast('请先选择联系人');
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

async function handleEmojiFileUpload(event) {
    try {
        // 获取表情意思/标签
        const emojiTag = document.getElementById('emojiMeaning').value.trim();
        if (!emojiTag) {
            showToast('请先填写表情意思');
            return;
        }
        
        const fileId = await handleEmojiUpload('emojiUploadInput', emojiTag, 'emojiUploadStatus');
        
        if (fileId) {
            // 更新隐藏的URL输入框为文件ID引用
            document.getElementById('emojiUrl').value = `file:${fileId}`;
        }
    } catch (error) {
        console.error('表情包上传失败:', error);
    }
}

// --- 全局状态 ---
let contacts = [];
// 确保暴露到全局对象
window.contacts = contacts;
let currentContact = null;
window.currentContact = currentContact;
let editingContact = null;

// 【修改点 1】: 更新 apiSettings 结构以适应 Minimax
let apiSettings = {
    url: '',
    key: '',
    model: '',
    secondaryModel: 'sync_with_primary',
    contextMessageCount: 10,
    timeout: 60,
    // 移除了 elevenLabsApiKey，换成 Minimax 的凭证
    minimaxGroupId: '',
    minimaxApiKey: ''
};

// --- 用户配置获取函数 ---
async function getUserProfile() {
    // 返回全局的 userProfile 对象
    return userProfile || {
        name: '我的昵称',
        avatar: null,
        personality: ''
    };
}
// 确保暴露到全局对象
window.apiSettings = apiSettings;
let emojis = [];
let backgrounds = {};
let userProfile = {
    name: '我的昵称',
    avatar: '',
    personality: '' 
};

// 将 userProfile 绑定到全局作用域
window.userProfile = userProfile;
let moments = [];
let weiboPosts = [];

const RELATION_PRESETS = {
    'CP': 'CP（两者互为情侣）',
    'CB': 'CB（友情、亲情等非恋爱的亲密关系）', 
    '好友': '好友',
    '宿敌': '宿敌（两者互为能持续永恒的较量，长期的敌人，天生的对手，命中注定的竞争者）'
};

let hashtagCache = {};

let audio = null;
let db = null; // IndexedDB 实例

// 全局错误处理 - 捕获未处理的Promise拒绝
window.addEventListener('unhandledrejection', function(event) {
    console.error('未处理的Promise拒绝:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    });
    
    // 记录到全局错误日志
    if (!window.errorLog) window.errorLog = [];
    window.errorLog.push({
        type: 'unhandledrejection',
        reason: event.reason?.toString() || 'Unknown',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    });
    
    // 防止控制台显示未处理的错误（已记录）
    event.preventDefault();
});

// === 图片处理辅助函数 ===

/**
 * 获取头像HTML（支持新的文件存储格式和旧的base64格式）
 * @param {Object} entity - 实体对象（联系人或用户）
 * @param {string} entityType - 实体类型 ('contact' 或 'user')
 * @param {string} className - CSS类名（可选）
 * @returns {Promise<string>} 返回HTML字符串
 */
async function getAvatarHTML(entity, entityType = 'contact', className = '') {
    if (!entity) return '';
    
    try {
        // 如果有新的文件引用，使用ImageDisplayHelper
        if (entity.avatarFileId && window.ImageDisplayHelper) {
            return await window.ImageDisplayHelper.createAvatarHTML(entity, entityType, className);
        }
        
        // 回退到旧的base64格式
        const classAttr = className ? ` class="${className}"` : '';
        if (entity.avatar && entity.avatar.startsWith('data:')) {
            return `<img src="${entity.avatar}"${classAttr}>`;
        } else {
            // 使用首字符作为默认头像
            const firstChar = entity.name ? entity.name[0] : (entityType === 'user' ? '我' : '?');
            return `<span${classAttr}>${firstChar}</span>`;
        }
    } catch (error) {
        console.warn(`获取${entityType}头像HTML失败:`, error);
        // 安全回退
        const classAttr = className ? ` class="${className}"` : '';
        const firstChar = entity.name ? entity.name[0] : (entityType === 'user' ? '我' : '?');
        return entity.avatar ? `<img src="${entity.avatar}"${classAttr}>` : `<span${classAttr}>${firstChar}</span>`;
    }
}

/**
 * 同步获取头像HTML（用于不能使用async的地方）
 * 注意：这个函数不支持新的文件存储格式，只用于紧急情况下的回退
 */
function getAvatarHTMLSync(entity, entityType = 'contact', className = '') {
    if (!entity) return '';
    
    const classAttr = className ? ` class="${className}"` : '';
    if (entity.avatar && entity.avatar.startsWith('data:')) {
        return `<img src="${entity.avatar}"${classAttr}>`;
    } else {
        const firstChar = entity.name ? entity.name[0] : (entityType === 'user' ? '我' : '?');
        return `<span${classAttr}>${firstChar}</span>`;
    }
}

/**
 * 获取背景图片URL
 * @param {Object} background - 背景对象
 * @returns {Promise<string>} 返回图片URL
 */
async function getBackgroundImageURL(background) {
    if (!background) return '';
    
    try {
        // 如果有新的文件引用，使用ImageDisplayHelper
        if (background.fileId && window.ImageDisplayHelper) {
            return await window.ImageDisplayHelper.getBackgroundURL(background);
        }
        
        // 回退到旧格式
        return background.data || background.url || '';
    } catch (error) {
        console.warn('获取背景图片失败:', error);
        return background.data || background.url || '';
    }
}

/**
 * 获取表情包URL
 * @param {Object} emoji - 表情包对象
 * @returns {Promise<string>} 返回图片URL
 */
async function getEmojiImageURL(emoji) {
    if (!emoji) return '';
    
    try {
        // 如果有新的文件引用，使用ImageDisplayHelper
        if (emoji.fileId && window.ImageDisplayHelper) {
            return await window.ImageDisplayHelper.getEmojiURL(emoji);
        }
        
        // 回退到旧格式
        return emoji.data || emoji.url || '';
    } catch (error) {
        console.warn('获取表情包失败:', error);
        return emoji.data || emoji.url || '';
    }
} 
let playlist = [];
let currentSongIndex = -1;
let isPlaying = false;
let lyricTimer = null;
let currentObjectUrl = null;

// --- 标志位与分页加载状态 ---
let isEmojiGridRendered = false;
let isMomentsRendered = false;
let isMusicPlayerInitialized = false;
let isIndexedDBReady = false; 
const MESSAGES_PER_PAGE = 15;
let currentlyDisplayedMessageCount = 0;
let isLoadingMoreMessages = false;

// 论坛帖子分页相关变量
const POSTS_PER_PAGE = 10;
let currentlyDisplayedPostCount = 0;
let isLoadingMorePosts = false;

// 虚拟滚动相关变量
const VIRTUAL_WINDOW_SIZE = 8; // 虚拟滚动窗口大小
const ESTIMATED_POST_HEIGHT = 300; // 估算的帖子高度（像素）
let allPosts = []; // 扁平化的所有帖子列表
let virtualScrollTop = 0;
let currentStartIndex = 0;
let currentEndIndex = 0;

// 多选模式状态
let isMultiSelectMode = false;
let selectedMessages = new Set();

// 语音播放相关全局变量
let voiceAudio = new Audio(); // 用于播放语音消息的全局Audio对象
let currentPlayingElement = null; // 跟踪当前播放的语音元素

// 浏览器兼容性检测
function checkBrowserCompatibility() {
    // 检测浏览器是否支持 :has() 选择器
    let supportsHas = false;
    
    try {
        // 尝试创建一个使用 :has() 的CSS规则来测试支持性
        const testRule = document.createElement('style');
        testRule.textContent = 'body:has(div) { color: inherit; }';
        document.head.appendChild(testRule);
        
        // 检查规则是否被正确解析
        supportsHas = testRule.sheet && testRule.sheet.cssRules.length > 0;
        
        // 清理测试元素
        document.head.removeChild(testRule);
    } catch (e) {
        // 如果出现错误，说明不支持
        supportsHas = false;
    }
    
    // 如果不支持 :has()，为body添加标识类以启用JavaScript备用方案
    if (!supportsHas) {
        document.body.classList.add('no-has-support');
        console.log('检测到浏览器不支持 :has() 选择器，已启用JavaScript备用方案');
    } else {
        console.log('浏览器支持 :has() 选择器');
    }
    
    // 将支持状态存储为全局变量，供其他函数使用
    window.browserSupportsHas = supportsHas;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('Service Worker 注册成功: ', registration);
    }).catch(registrationError => {
      console.log('Service Worker 注册失败: ', registrationError);
    });
  });
}

// --- 初始化 ---
async function init() {
    try {
        console.log('开始应用初始化...');
        
        await executeWithRetry(async () => {
            // 永远只相信 dataMigrator！
            if (window.DatabaseManager && window.DatabaseManager.init) {
                const result = await window.DatabaseManager.init();
                if (result.success) {
                    console.log('数据库通过 dataMigrator 初始化成功');
                    db = window.db; // 确保db实例被正确赋值
                    isIndexedDBReady = window.isIndexedDBReady;
                } else {
                    // 如果 dataMigrator 初始化失败，就直接抛出错误，不再尝试用旧方法
                    throw new Error('DatabaseManager 初始化失败: ' + result.error);
                }
            } else {
                // 如果 DatabaseManager 根本不存在，这也是个严重错误
                throw new Error('DatabaseManager 未加载，无法初始化数据库');
            }
            
            // 二次确认
            if (!db || !isIndexedDBReady) {
                throw new Error('数据库连接在初始化后仍未建立');
            }
            console.log('数据库连接建立成功');
            
        }, '应用初始化 - 数据库连接');
        
        // 从IndexedDB加载数据
        await loadDataFromDB();
        console.log('应用数据加载完成');
        
    } catch (error) {
        console.error('应用初始化失败:', error);
        
        // 分析错误类型并提供针对性解决方案
        let errorType = 'unknown';
        if (error.message.includes('数据库') || error.message.includes('IndexedDB') || error.message.includes('objectStoreNames')) {
            errorType = 'database';
        } else if (error.message.includes('网络') || error.message.includes('fetch')) {
            errorType = 'network';
        }
        
        // 记录详细错误信息用于调试
        window.lastInitError = {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            userAgent: navigator.userAgent,
            url: window.location.href,
            type: errorType,
            dbState: {
                hasWindow: !!window.db,
                isReady: !!window.isIndexedDBReady,
                dbVersion: window.db?.version
            }
        };
        
        showDatabaseErrorDialog(error, false);
        throw error;
    }

    await renderContactList();
    await updateUserProfileUI();
    updateContextIndicator();
    
    // 绑定基础事件
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
    
    setTimeout(() => {
        const hint = document.getElementById('featureHint');
        if (hint) {
            hint.style.display = 'block';
            setTimeout(() => {
                hint.style.display = 'none';
            }, 5000);
        }
    }, 1000);

    // 为全局voiceAudio对象绑定事件
    voiceAudio.onended = () => {
        if (currentPlayingElement) {
            currentPlayingElement.classList.remove('playing');
            const voiceIcon = currentPlayingElement.querySelector('.voice-icon');
            if (voiceIcon) voiceIcon.innerHTML = createVoiceIcon();
            currentPlayingElement = null;
        }
    };
    voiceAudio.onerror = () => {
        showToast('音频文件加载失败');
        if (currentPlayingElement) {
             currentPlayingElement.classList.remove('playing', 'loading');
             const voiceIcon = currentPlayingElement.querySelector('.voice-icon');
             if (voiceIcon) voiceIcon.innerHTML = createVoiceIcon();
             currentPlayingElement = null;
        }
    };


    // Check for update announcements
    const unreadAnnouncements = await announcementManager.getUnread();
    if (unreadAnnouncements.length > 0) {
        const modalBody = document.getElementById('updateModalBody');
        const modalFooter = document.querySelector('#updateModal .modal-footer');
        
        const combinedContent = unreadAnnouncements.reverse()
            .map(ann => ann.content)
            .join('<hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">');
        
        modalBody.innerHTML = marked.parse(combinedContent);
        showModal('updateModal');

        // Logic to show button when scrolled to bottom
        modalBody.onscroll = () => {
            // Check if the user has scrolled to the bottom
            // Adding a 5px tolerance
            if (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 5) {
                modalFooter.classList.add('visible');
            }
        };

        // Also check if the content is not long enough to scroll
        // Use a timeout to allow the DOM to render first
        setTimeout(() => {
            if (modalBody.scrollHeight <= modalBody.clientHeight) {
                modalFooter.classList.add('visible');
            }
        }, 100);


        document.getElementById('updateModalCloseBtn').onclick = () => {
            closeModal('updateModal');
            const idsToMark = unreadAnnouncements.map(ann => ann.id);
            announcementManager.markAsSeen(idsToMark);
        };
    }
}



// --- IndexedDB 核心函数 ---


// 数据库重试配置
const DB_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    connectionRetries: 10,
    connectionRetryInterval: 5000
};

// 数据库状态跟踪
let dbConnectionAttempts = 0;
let dbConnectionTimer = null;
let dbReadinessCheckInterval = null;

// 用户友好的错误对话框
function showDatabaseErrorDialog(error, isRetrying = false) {
    const title = isRetrying ? '数据库重试中...' : '数据库连接失败';
    const message = isRetrying 
        ? `数据库连接异常，正在自动重试... (${dbConnectionAttempts}/${DB_RETRY_CONFIG.connectionRetries})\n\n错误信息: ${error.message}`
        : `数据库连接失败，所有重试都已用尽。\n\n错误信息: ${error.message}\n\n建议:\n1. 刷新页面重试\n2. 清除浏览器缓存\n3. 检查浏览器是否支持IndexedDB`;
    
    // 创建自定义对话框
    if (!document.getElementById('db-error-dialog')) {
        const dialog = document.createElement('div');
        dialog.id = 'db-error-dialog';
        dialog.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.8); display: flex; align-items: center; 
            justify-content: center; z-index: 10000; font-family: Arial, sans-serif;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: white; padding: 30px; border-radius: 12px; 
            max-width: 500px; margin: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
    }
    
    const dialog = document.getElementById('db-error-dialog');
    const content = dialog.querySelector('div');
    content.innerHTML = `
        <h3 style="color: ${isRetrying ? '#ffa500' : '#dc3545'}; margin-top: 0;">${title}</h3>
        <p style="margin: 15px 0; line-height: 1.6; white-space: pre-line;">${message}</p>
        ${!isRetrying ? `
            <div style="text-align: right; margin-top: 20px;">
                <button onclick="location.reload()" style="
                    background: #007bff; color: white; border: none; 
                    padding: 10px 20px; border-radius: 6px; cursor: pointer;
                ">刷新页面</button>
            </div>
        ` : ''}
    `;
    
    dialog.style.display = 'flex';
    
    if (isRetrying) {
        setTimeout(() => {
            if (dialog && dialog.parentNode) {
                dialog.style.display = 'none';
            }
        }, 3000);
    }
}

// 带递增等待时间的重试机制
async function retryWithBackoff(operation, context = '', retries = DB_RETRY_CONFIG.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`${context} - 尝试第 ${attempt}/${retries} 次`);
            const result = await operation();
            if (attempt > 1) {
                console.log(`${context} - 第 ${attempt} 次尝试成功`);
                showToast('数据库连接已恢复', 'success');
            }
            return result;
        } catch (error) {
            console.error(`${context} - 第 ${attempt}/${retries} 次尝试失败:`, error);
            
            if (attempt === retries) {
                console.error(`${context} - 所有重试都已失败，抛出最终错误`);
                throw error;
            }
            
            // 计算递增等待时间
            const delay = Math.min(
                DB_RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
                DB_RETRY_CONFIG.maxDelay
            );
            
            console.log(`${context} - 等待 ${delay}ms 后重试...`);
            showToast(`${context}失败，${delay/1000}秒后重试 (${attempt}/${retries})`, 'warning');
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// IndexedDB就绪状态检查
function waitForIndexedDBReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        function checkReady() {
            if (isIndexedDBReady && db) {
                console.log('IndexedDB就绪状态检查: 已就绪');
                resolve(true);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                console.error('IndexedDB就绪状态检查: 超时');
                reject(new Error(`IndexedDB就绪检查超时 (${timeout}ms)`));
                return;
            }
            
            setTimeout(checkReady, 100);
        }
        
        checkReady();
    });
}

// 增强版数据库连接监控
function startConnectionMonitoring() {
    if (dbReadinessCheckInterval) {
        clearInterval(dbReadinessCheckInterval);
    }
    
    dbReadinessCheckInterval = setInterval(() => {
        if (!isIndexedDBReady || !db) {
            console.warn('检测到数据库连接断开，准备自动重连...');
            clearInterval(dbReadinessCheckInterval);
            handleConnectionLoss();
        }
    }, 30000); // 每30秒检查一次连接状态
}

// 数据库连接断开处理
async function handleConnectionLoss() {
    dbConnectionAttempts = 0;
    
    const attemptReconnection = async () => {
        dbConnectionAttempts++;
        console.log(`数据库自动重连 - 第 ${dbConnectionAttempts}/${DB_RETRY_CONFIG.connectionRetries} 次尝试`);
        
        try {
            const result = await window.DatabaseManager.init();
            if (!result.success) {
            // 如果标准的初始化流程都失败了，那重连也就失败了
            throw new Error(result.error || 'DatabaseManager 重新初始化失败');
        }

        console.log('数据库自动重连成功');
        showToast('数据库连接已自动恢复', 'success');
        startConnectionMonitoring();

        } catch (error) {
            console.error(`数据库重连第 ${dbConnectionAttempts} 次失败:`, error);
            
            if (dbConnectionAttempts >= DB_RETRY_CONFIG.connectionRetries) {
                console.error('数据库自动重连失败，所有重试都已用尽');
                showDatabaseErrorDialog(new Error('数据库连接失败，请手动刷新页面'), false);
                return;
            }
            
            // 继续重试
            dbConnectionTimer = setTimeout(
                attemptReconnection, 
                DB_RETRY_CONFIG.connectionRetryInterval
            );
        }
    };
    
    // 开始重连
    attemptReconnection();
}


// 表情数据结构优化函数（版本4、5用户升级到7时自动执行）
async function performEmojiOptimization() {
    try {
        console.log('开始执行表情数据结构优化...');
        
        if (!isIndexedDBReady) {
            console.error('数据库未准备就绪，无法执行优化');
            return;
        }
        
        // 获取当前数据
        const transaction = db.transaction(['contacts', 'emojis', 'emojiImages'], 'readonly');
        const contactsStore = transaction.objectStore('contacts');
        const emojisStore = transaction.objectStore('emojis');
        const emojiImagesStore = transaction.objectStore('emojiImages');
        
        const contacts = await promisifyRequest(contactsStore.getAll()) || [];
        const emojis = await promisifyRequest(emojisStore.getAll()) || [];
        const existingEmojiImages = await promisifyRequest(emojiImagesStore.getAll()) || [];
        
        if (contacts.length === 0 || emojis.length === 0) {
            console.log('没有数据需要优化，跳过');
            return;
        }
        
        let processedCount = 0;
        const base64UrlPattern = /data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/g;
        const newEmojiImages = [];
        const updatedEmojis = [...emojis];
        const updatedContacts = [];
        
        // 遍历所有联系人的消息
        for (const contact of contacts) {
            const updatedContact = { ...contact };
            let contactUpdated = false;
            
            if (contact.messages && Array.isArray(contact.messages)) {
                updatedContact.messages = [];
                
                for (const message of contact.messages) {
                    const updatedMessage = { ...message };
                    
                    if (message.content && typeof message.content === 'string') {
                        const matches = message.content.match(base64UrlPattern);
                        if (matches) {
                            for (const base64Url of matches) {
                                // 查找对应的表情
                                const emoji = updatedEmojis.find(e => e.url === base64Url);
                                if (emoji && emoji.meaning) {
                                    // 检查是否已存在相同的表情图片
                                    const existingImage = existingEmojiImages.find(img => img.tag === emoji.meaning) ||
                                                        newEmojiImages.find(img => img.tag === emoji.meaning);
                                    
                                    if (!existingImage) {
                                        newEmojiImages.push({
                                            tag: emoji.meaning,
                                            data: base64Url
                                        });
                                    }
                                    
                                    // 更新表情数据结构
                                    if (!emoji.tag) {
                                        emoji.tag = emoji.meaning;
                                    }
                                    if (emoji.url) {
                                        delete emoji.url;
                                    }
                                    
                                    // 替换消息中的格式
                                    updatedMessage.content = updatedMessage.content.replace(
                                        base64Url,
                                        `[emoji:${emoji.meaning}]`
                                    );
                                    
                                    processedCount++;
                                    contactUpdated = true;
                                }
                            }
                        }
                    }
                    
                    updatedContact.messages.push(updatedMessage);
                }
            }
            
            if (contactUpdated) {
                updatedContacts.push(updatedContact);
            }
        }
        
        // 保存优化后的数据
        if (processedCount > 0) {
            const writeTransaction = db.transaction(['contacts', 'emojis', 'emojiImages'], 'readwrite');
            
            // 更新表情图片数据
            if (newEmojiImages.length > 0) {
                const emojiImagesStore = writeTransaction.objectStore('emojiImages');
                for (const emojiImage of newEmojiImages) {
                    await promisifyRequest(emojiImagesStore.put(emojiImage));
                }
            }
            
            // 更新表情元数据
            const emojisStore = writeTransaction.objectStore('emojis');
            for (const emoji of updatedEmojis) {
                if (emoji.tag) { // 只更新有tag的表情
                    await promisifyRequest(emojisStore.put(emoji));
                }
            }
            
            // 更新联系人消息
            const contactsStore = writeTransaction.objectStore('contacts');
            for (const contact of updatedContacts) {
                await promisifyRequest(contactsStore.put(contact));
            }
            
            console.log(`表情数据结构优化完成！`);
            console.log(`- 处理了 ${processedCount} 个表情引用`);
            console.log(`- 创建了 ${newEmojiImages.length} 个新的表情图片记录`);
            console.log(`- 更新了 ${updatedContacts.length} 个联系人的消息`);
            
            // 显示提示
            if (typeof showToast === 'function') {
                showToast(`表情数据优化完成！处理了 ${processedCount} 个表情`, 'success');
            }
            
            // 重新加载数据以确保界面同步
            await loadDataFromDB();
        } else {
            console.log('没有需要优化的表情数据');
        }
        
    } catch (error) {
        console.error('表情数据优化失败:', error);
        if (typeof showToast === 'function') {
            showToast('表情数据优化失败: ' + error.message, 'error');
        }
    }
}

async function loadDataFromDB() {
    return await ensureDBReady(async () => {
        console.log('开始从数据库加载数据...');
        
        const storeNames = [
        'contacts', 
        'apiSettings', 
        'emojis', 
        'backgrounds', 
        'userProfile', 
        'moments', 
        'weiboPosts', 
        'hashtagCache'
        ];

        // 先检查存不存在 emojiImages
        if (db.objectStoreNames.contains('emojiImages')) {
            storeNames.push('emojiImages');
        } else {
            console.warn('数据库版本未包含 emojiImages 存储，建议更新页面以升级数据库。');
        }
        
        const transaction = db.transaction(storeNames, 'readonly');
        
        const contactsStore = transaction.objectStore('contacts');
        const apiSettingsStore = transaction.objectStore('apiSettings');
        const emojisStore = transaction.objectStore('emojis');
        const backgroundsStore = transaction.objectStore('backgrounds');
        const userProfileStore = transaction.objectStore('userProfile');
        const momentsStore = transaction.objectStore('moments');
        const weiboPostsStore = transaction.objectStore('weiboPosts');
        
        // 加载联系人数据
        contacts = (await promisifyRequest(contactsStore.getAll(), '加载联系人数据')) || [];
        console.log(`加载了 ${contacts.length} 个联系人`);
        
        // 更新全局引用
        window.contacts = contacts;
        
        // 迁移旧数据格式或添加默认值
        contacts.forEach(contact => {
            if (contact.type === undefined) contact.type = 'private';
            // 为旧联系人数据添加 voiceId 默认值
            if (contact.voiceId === undefined) contact.voiceId = '';
            window.memoryTableManager.initContactMemoryTable(contact);
            if (contact.messages) {
                contact.messages.forEach(msg => {
                    if (msg.role === 'user' && msg.senderId === undefined) msg.senderId = 'user';
                    else if (msg.role === 'assistant' && msg.senderId === undefined) msg.senderId = contact.id;
                });
            }
        });

        // 加载API设置
        const savedApiSettings = (await promisifyRequest(apiSettingsStore.get('settings'), '加载API设置')) || {};
        apiSettings = { ...apiSettings, ...savedApiSettings };
        if (apiSettings.contextMessageCount === undefined) apiSettings.contextMessageCount = 10;
        
        // 【修改点 2】: 从旧的 elevenLabsApiKey 迁移数据，并设置新字段的默认值
        if (savedApiSettings.elevenLabsApiKey && !savedApiSettings.minimaxApiKey) {
            apiSettings.minimaxApiKey = savedApiSettings.elevenLabsApiKey;
        }
        if (apiSettings.minimaxGroupId === undefined) apiSettings.minimaxGroupId = '';
        if (apiSettings.minimaxApiKey === undefined) apiSettings.minimaxApiKey = '';

        // 为旧API设置数据添加 elevenLabsApiKey 默认值
        if (apiSettings.elevenLabsApiKey === undefined) apiSettings.elevenLabsApiKey = '';
        // 更新全局引用
        window.apiSettings = apiSettings;
        console.log('API设置加载完成');

        // 加载表情数据
        emojis = (await promisifyRequest(emojisStore.getAll(), '加载表情数据')) || [];
        console.log(`加载了 ${emojis.length} 个表情`);
        
        // 加载背景数据
        backgrounds = (await promisifyRequest(backgroundsStore.get('backgroundsMap'), '加载背景数据')) || {};
        console.log(`加载了 ${Object.keys(backgrounds).length} 个背景`);
        
        // 加载用户资料
        const savedUserProfile = (await promisifyRequest(userProfileStore.get('profile'), '加载用户资料')) || {};
        userProfile = { ...userProfile, ...savedUserProfile };
        if (userProfile.personality === undefined) {
            userProfile.personality = '';
        }
        console.log('用户资料加载完成');
        
        // 加载朋友圈数据
        moments = (await promisifyRequest(momentsStore.getAll(), '加载朋友圈数据')) || [];
        console.log(`加载了 ${moments.length} 个朋友圈`);
        
        // 加载微博数据
        weiboPosts = (await promisifyRequest(weiboPostsStore.getAll(), '加载微博数据')) || [];
        console.log(`加载了 ${weiboPosts.length} 个微博帖子`);

        // 加载hashtag缓存
        const hashtagCacheStore = transaction.objectStore('hashtagCache');
        const savedHashtagCache = (await promisifyRequest(hashtagCacheStore.get('cache'), '加载标签缓存')) || {};
        hashtagCache = savedHashtagCache;
        console.log('标签缓存加载完成');

        // 重新初始化角色记忆管理器的数据（现在数据库已准备好）
        if (window.characterMemoryManager) {
            try {
                await window.characterMemoryManager.loadConversationCounters();
                await window.characterMemoryManager.getGlobalMemory();
                console.log('角色记忆管理器初始化完成');
            } catch (memoryError) {
                console.error('角色记忆管理器初始化失败:', memoryError);
            }
        }
        
        // 初始化完成后进行数据一致性检查
        if (weiboPosts && weiboPosts.length > 0) {
            const repaired = await checkAndRepairDataConsistency();
            if (repaired) {
                console.log('初始化时修复了数据不一致性');
            }
        }
        
        // 数据库健康检查和修复提示
        if (window.DatabaseManager && window.DatabaseManager.checkAndOfferRepair) {
            window.DatabaseManager.checkAndOfferRepair();
        }

        console.log('所有数据加载完成');
        showToast('数据加载完成', 'success');
        
    }, '数据库加载操作');
}

async function saveDataToDB() {
    return await ensureDBReady(async () => {
        console.log('开始保存数据到数据库...');
        
        // 检查是否存在新的emojiImages存储
        const storeNames = ['contacts', 'apiSettings', 'emojis', 'backgrounds', 'userProfile', 'moments', 'hashtagCache'];
        if (db.objectStoreNames.contains('emojiImages')) {
            storeNames.push('emojiImages');
        }
        
        const transaction = db.transaction(storeNames, 'readwrite');
        
        const contactsStore = transaction.objectStore('contacts');
        const apiSettingsStore = transaction.objectStore('apiSettings');
        const emojisStore = transaction.objectStore('emojis');
        const backgroundsStore = transaction.objectStore('backgrounds');
        const userProfileStore = transaction.objectStore('userProfile');
        const momentsStore = transaction.objectStore('moments');
        
        // 清空contacts，然后重新添加，确保数据最新
        await promisifyRequest(contactsStore.clear(), '清空联系人数据');
        console.log(`开始保存 ${contacts.length} 个联系人...`);
        for (const contact of contacts) {
            await promisifyRequest(contactsStore.put(contact), `保存联系人 ${contact.name || contact.id}`);
        }
        console.log('联系人数据保存完成');

        // 保存API设置
        await promisifyRequest(apiSettingsStore.put({ id: 'settings', ...apiSettings }), '保存API设置');
        console.log('API设置保存完成');
        
        // 保存表情数据
        await promisifyRequest(emojisStore.clear(), '清空表情数据');
        console.log(`开始保存 ${emojis.length} 个表情...`);
        for (const emoji of emojis) {
            await promisifyRequest(emojisStore.put(emoji), `保存表情 ${emoji.id}`);
        }
        console.log('表情数据保存完成');

        // 保存背景和用户资料
        await promisifyRequest(backgroundsStore.put({ id: 'backgroundsMap', ...backgrounds }), '保存背景数据');
        await promisifyRequest(userProfileStore.put({ id: 'profile', ...userProfile }), '保存用户资料');
        console.log('背景和用户资料保存完成');
        
        // 保存朋友圈数据
        await promisifyRequest(momentsStore.clear(), '清空朋友圈数据');
        console.log(`开始保存 ${moments.length} 个朋友圈...`);
        for (const moment of moments) {
            await promisifyRequest(momentsStore.put(moment), `保存朋友圈 ${moment.id}`);
        }
        console.log('朋友圈数据保存完成');

        // 保存hashtag缓存
        const hashtagCacheStore = transaction.objectStore('hashtagCache');
        await promisifyRequest(hashtagCacheStore.put({ id: 'cache', ...hashtagCache }), '保存标签缓存');
        console.log('标签缓存保存完成');

        // 等待所有操作完成
        await promisifyTransaction(transaction, '数据保存事务');
        console.log('所有数据保存完成');        
    }, '数据库保存操作');
}

// 增强版IndexedDB请求辅助函数 - 带重试机制
function promisifyRequest(request, context = '数据库操作') {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            console.log(`${context} - 请求成功`);
            resolve(request.result);
        };
        
        request.onerror = () => {
            const error = request.error || new Error(`${context}失败`);
            console.error(`${context} - 请求失败:`, {
                errorName: error.name,
                errorMessage: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString()
            });
            reject(error);
        };
        
        request.onblocked = () => {
            const error = new Error(`${context} - 请求被阻塞，可能有其他标签页正在使用数据库`);
            console.warn(error.message);
            reject(error);
        };
    });
}

// 增强版IndexedDB事务辅助函数 - 带重试机制
function promisifyTransaction(transaction, context = '数据库事务') {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            console.log(`${context} - 事务完成`);
            resolve();
        };
        
        transaction.onerror = () => {
            const error = transaction.error || new Error(`${context}失败`);
            console.error(`${context} - 事务失败:`, {
                errorName: error.name,
                errorMessage: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString()
            });
            reject(error);
        };
        
        transaction.onabort = () => {
            const error = new Error(`${context} - 事务被中止`);
            console.error(error.message);
            reject(error);
        };
    });
}

// 带重试的数据库操作包装器
async function executeWithRetry(operation, context = '数据库操作') {
    return await retryWithBackoff(operation, context);
}

// 增强版数据库就绪检查 - 在执行操作前确保数据库可用
async function ensureDBReady(operation, context = '数据库操作') {
    try {
        // 首先等待数据库就绪
        await waitForIndexedDBReady();
        
        // 然后执行操作，带重试机制
        return await executeWithRetry(operation, context);
        
    } catch (error) {
        console.error(`${context} - 确保数据库就绪失败:`, error);
        
        // 如果是连接问题，尝试重新连接
        if (error.message.includes('超时') || error.message.includes('连接')) {
            console.log(`${context} - 检测到连接问题，触发重连...`);
            handleConnectionLoss();
        }
        
        throw error;
    }
}

// --- 论坛功能 ---

function formatTime(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const postTime = new Date(timestamp);
    const diff = now.getTime() - postTime.getTime();

    const diffMinutes = Math.floor(diff / (1000 * 60));
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays < 1) {
        if (diffHours < 1) {
            return `${Math.max(1, diffMinutes)}分钟前`;
        }
        return `${diffHours}小时前`;
    } else if (diffDays < 2) {
        return '1天前';
    } else {
        const isSameYear = now.getFullYear() === postTime.getFullYear();
        const month = (postTime.getMonth() + 1).toString().padStart(2, '0');
        const day = postTime.getDate().toString().padStart(2, '0');
        
        if (isSameYear) {
            const hours = postTime.getHours().toString().padStart(2, '0');
            const minutes = postTime.getMinutes().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        } else {
            return `${postTime.getFullYear()}-${month}-${day}`;
        }
    }
}

// --- 页面导航 ---
const pageIds = ['contactListPage', 'weiboPage', 'momentsPage', 'profilePage', 'chatPage', 'dataManagementPage', 'debugLogPage', 'memoryManagementPage', 'userProfilePage', 'appearanceManagementPage'];

function showPage(pageIdToShow) {
    // 异步包装函数，用于处理包含异步操作的页面显示
    showPageAsync(pageIdToShow).catch(error => {
        console.error('页面显示错误:', error);
    });
}

async function showPageAsync(pageIdToShow) {
    // Hide all main pages and the chat page
    pageIds.forEach(pageId => {
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('active');
        }
    });

    // Show the requested page
    const pageToShow = document.getElementById(pageIdToShow);
    if (pageToShow) {
        pageToShow.classList.add('active');
    }

    // Update the active state of the bottom navigation buttons
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    const navMapping = ['contactListPage', 'weiboPage', 'momentsPage', 'profilePage'];
    navItems.forEach((item, index) => {
        // This relies on the order in the HTML, which is correct.
        if (navMapping[index] === pageIdToShow) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 兼容性适配：显式控制底部导航栏的显示/隐藏
    // 为不支持 :has() 选择器的浏览器提供JavaScript备用方案
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        if (pageIdToShow === 'chatPage') {
            // 聊天页面时隐藏导航栏
            bottomNav.style.display = 'none';
            document.body.classList.add('chat-active');
        } else {
            // 其他页面时显示导航栏
            bottomNav.style.display = 'flex';
            document.body.classList.remove('chat-active');
        }
    }

    // --- Lazy Loading/Rendering ---
    // Render Weibo posts when the page is shown
    if (pageIdToShow === 'weiboPage') {
        renderAllWeiboPosts();
    } else {
        // 离开论坛页面时清理虚拟滚动监听器
        const weiboPage = document.getElementById('weiboPage');
        if (weiboPage) {
            weiboPage.onscroll = null;
        }
    }
    // Render Moments only on the first time it's opened
    if (pageIdToShow === 'momentsPage' && !isMomentsRendered) {
        await renderMomentsList();
        isMomentsRendered = true;
    }

    if (pageIdToShow === 'dataManagementPage') {
        refreshDatabaseStats();
    }   
}

function showGeneratePostModal() {
    const select = document.getElementById('postGenCharacterSelect');
    select.innerHTML = '<option value="">请选择...</option>'; // Reset
    contacts.forEach(contact => {
        if (contact.type === 'private') {
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = contact.name;
            select.appendChild(option);
        }
    });
    
    // 重置关系选择
    const relationSelect = document.getElementById('postGenRelations');
    relationSelect.value = '';
    handleRelationChange();
    
    showModal('generatePostModal');
}

// 新增：处理关系选择变化
function handleRelationChange() {
    const relationSelect = document.getElementById('postGenRelations');
    const customRelationInput = document.getElementById('postGenCustomRelation');
    
    if (relationSelect.value === 'custom') {
        customRelationInput.parentElement.style.display = 'block'; // 显示父级 .form-group
        customRelationInput.required = true;
    } else {
        customRelationInput.parentElement.style.display = 'none'; // 隐藏父级 .form-group
        customRelationInput.required = false;
        customRelationInput.value = '';
    }
}

// 新增：处理角色选择变化，加载hashtag缓存
function handleCharacterChange() {
    const contactId = document.getElementById('postGenCharacterSelect').value;
    const hashtagInput = document.getElementById('postGenHashtag');
    
    if (contactId && hashtagCache[contactId]) {
        hashtagInput.value = hashtagCache[contactId];
    } else {
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
            // 默认hashtag为 #A & B#
            hashtagInput.value = `${contact.name} & ${userProfile.name}`;
        }
    }
}

async function handleGeneratePost(event) {
    event.preventDefault();
    const contactId = document.getElementById('postGenCharacterSelect').value;
    const relationSelect = document.getElementById('postGenRelations');
    const customRelationInput = document.getElementById('postGenCustomRelation');
    const hashtagInput = document.getElementById('postGenHashtag');
    const count = document.getElementById('postGenCount').value;

    if (!contactId) {
        showToast('请选择角色');
        return;
    }

    let relations;
    let relationDescription;
    
    if (relationSelect.value === 'custom') {
        if (!customRelationInput.value.trim()) {
            showToast('请填写自定义关系');
            return;
        }
        relations = customRelationInput.value.trim();
        relationDescription = relations; // 自定义关系直接使用用户输入
    } else {
        if (!relationSelect.value) {
            showToast('请选择关系类型');
            return;
        }
        relations = relationSelect.value;
        relationDescription = RELATION_PRESETS[relations];
    }

    const hashtag = hashtagInput.value.trim();
    if (!hashtag) {
        showToast('请填写话题标签');
        return;
    }

    // 缓存hashtag
    hashtagCache[contactId] = hashtag;
    await saveDataToDB();

    closeModal('generatePostModal');
    await generateWeiboPosts(contactId, relations, relationDescription, hashtag, count);
}

async function saveWeiboPost(postData) {
    if (!isIndexedDBReady) {
        console.error('IndexedDB not ready, cannot save post.');
        showToast('数据库错误，无法保存帖子');
        return;
    }
    try {
        const transaction = db.transaction(['weiboPosts'], 'readwrite');
        const store = transaction.objectStore('weiboPosts');
        await promisifyRequest(store.add(postData));
        await promisifyTransaction(transaction);
    } catch (error) {
        console.error('Failed to save Weibo post to DB:', error);
        showToast('保存帖子失败');
    }
}

async function generateWeiboPosts(contactId, relations, relationDescription, hashtag, count = 1) {
    
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
        console.error('未找到联系人，contactId:', contactId, '所有联系人:', contacts);
        showToast('未找到指定的聊天对象');
        return;
    }
    
    
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        console.error('API配置不完整:', apiSettings);
        showToast('请先在设置中配置API');
        return;
    }
    
    const container = document.getElementById('weiboContainer');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-text';
    loadingIndicator.textContent = '正在生成论坛内容...';
    container.prepend(loadingIndicator);

    console.log('正在构建系统提示词...');
    const systemPrompt = await window.promptBuilder.buildWeiboPrompt(
        contactId, 
        relations, 
        relationDescription,
        hashtag,
        count, 
        contact, 
        userProfile, 
        contacts,
        emojis
    );

    try {
        const payload = {
            model: apiSettings.model,
            messages: [{ role: 'user', content: systemPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.7
        };

        const apiUrl = `${apiSettings.url}/chat/completions`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiSettings.key}`
            },
            body: JSON.stringify(payload)
        });

        console.log('收到API响应:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API请求失败，错误详情:', {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText
            });
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('API完整返回:', JSON.stringify(data, null, 2));
        
        let rawText = data.choices[0].message.content;
        
        if (!rawText) {
            console.error('AI返回的内容为空');
            throw new Error("AI未返回有效内容");
        }
        
        // 使用统一的JSON提取函数清理markdown语法
        let jsonText;
        try {
            jsonText = window.apiService.extractJSON(rawText);
        } catch (extractError) {
            console.error('JSON提取失败:', extractError);
            throw new Error(`JSON提取失败: ${extractError.message}`);
        }

        // 解析JSON
        let weiboData;
        try {
            weiboData = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('JSON解析失败:', parseError);
            console.error('尝试解析的文本:', jsonText);
            throw new Error(`JSON解析失败: ${parseError.message}`);
        }

        // --- 时间戳注入 ---
        // 注入时间戳
        const now = Date.now();
        // 主楼时间设为2-5分钟前
        const postCreatedAt = new Date(now - (Math.random() * 3 + 2) * 60 * 1000);
        let lastCommentTime = postCreatedAt.getTime();
        

        if (weiboData.posts && Array.isArray(weiboData.posts)) {
            weiboData.posts.forEach((post, index) => {
                post.timestamp = postCreatedAt.toISOString(); // 给主楼加时间戳
                
                if (post.comments && Array.isArray(post.comments)) {
                    post.comments.forEach((comment, commentIndex) => {
                        // 回复时间在主楼和现在之间，且比上一条晚一点
                        const newCommentTimestamp = lastCommentTime + (Math.random() * 2 * 60 * 1000); // 0-2分钟后
                        lastCommentTime = newCommentTimestamp;
                        comment.timestamp = new Date(Math.min(newCommentTimestamp, now)).toISOString(); // 不超过当前时间
                    });
                }
            });
        } else {
            console.error('weiboData.posts不是数组或不存在:', weiboData);
        }
        // --- 时间戳注入结束 ---
        
        const newPost = {
            id: Date.now(),
            contactId: contactId,
            relations: relations,
            relationDescription: relationDescription,
            hashtag: hashtag,
            data: weiboData,
            createdAt: postCreatedAt.toISOString()
        };

        console.log('准备保存新帖子:', {
            id: newPost.id,
            contactId: newPost.contactId,
            relations: newPost.relations,
            hashtag: newPost.hashtag,
            createdAt: newPost.createdAt,
            dataStructure: {
                hasWeiboPosts: !!newPost.data.posts,
                postsCount: newPost.data.posts ? newPost.data.posts.length : 0
            }
        });

        console.log('保存帖子到数据库...');
        await saveWeiboPost(newPost);
        console.log('帖子保存成功，添加到内存数组...');
        weiboPosts.push(newPost); // Update in-memory array
        console.log('当前内存中的帖子数量:', weiboPosts.length);
        
        console.log('重新渲染所有帖子...');
        renderAllWeiboPosts();
        console.log('=== 论坛帖子生成完成 ===');
        showToast('帖子已刷新！');

    } catch (error) {
        console.error('=== 生成论坛失败 ===');
        console.error('错误类型:', error.name);
        console.error('错误消息:', error.message);
        console.error('完整错误对象:', error);
        showToast('生成论坛失败: ' + error.message);
    } finally {
        loadingIndicator.remove();
    }
}


// 扁平化帖子数据，每个帖子包含原始信息和位置信息
function flattenPosts() {
    if (!weiboPosts || weiboPosts.length === 0) {
        allPosts = [];
        return;
    }

    const sortedPosts = weiboPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    allPosts = [];
    
    sortedPosts.forEach(storedPost => {
        if (storedPost.data?.posts) {
            storedPost.data.posts.forEach((post, postIndex) => {
                allPosts.push({
                    storedPost,
                    post,
                    postIndex,
                    height: ESTIMATED_POST_HEIGHT,
                    rendered: false
                });
            });
        }
    });
}

// 计算虚拟滚动的渲染范围
function calculateRenderRange(scrollTop) {
    const containerHeight = document.getElementById('weiboContainer').clientHeight;
    
    // 使用实际高度计算可见区域
    let currentHeight = 0;
    let visibleStartIndex = 0;
    let visibleEndIndex = allPosts.length;
    
    // 找到可见区域开始的索引
    for (let i = 0; i < allPosts.length; i++) {
        const postHeight = allPosts[i].height || ESTIMATED_POST_HEIGHT;
        if (currentHeight + postHeight > scrollTop) {
            visibleStartIndex = i;
            break;
        }
        currentHeight += postHeight;
    }
    
    // 找到可见区域结束的索引
    const viewportBottom = scrollTop + containerHeight;
    let heightFromStart = currentHeight; // 从可见开始位置的累积高度
    
    for (let i = visibleStartIndex; i < allPosts.length; i++) {
        const postHeight = allPosts[i].height || ESTIMATED_POST_HEIGHT;
        heightFromStart += postHeight;
        if (heightFromStart > viewportBottom) {
            visibleEndIndex = i + 1; // 包含当前项目
            break;
        }
    }
    
    // 上下各预留4条帖子，提供适中的缓冲区
    const startIndex = Math.max(0, visibleStartIndex - 4);
    const endIndex = Math.min(allPosts.length, visibleEndIndex + 4);
    
    // 确保至少渲染一些帖子
    if (endIndex <= startIndex) {
        return { 
            startIndex: Math.max(0, Math.min(visibleStartIndex, allPosts.length - VIRTUAL_WINDOW_SIZE)), 
            endIndex: Math.min(allPosts.length, Math.max(visibleStartIndex + VIRTUAL_WINDOW_SIZE, VIRTUAL_WINDOW_SIZE))
        };
    }
    
    return { startIndex, endIndex };
}

// 数据一致性检查和修复函数
async function checkAndRepairDataConsistency() {
    if (!isIndexedDBReady || !db) {
        return false;
    }
    
    try {
        // 从数据库重新加载所有帖子
        const transaction = db.transaction(['weiboPosts'], 'readonly');
        const store = transaction.objectStore('weiboPosts');
        const allDbPosts = await promisifyRequest(store.getAll());
        
        // 检查内存中的帖子是否与数据库一致
        const memoryPostIds = new Set(weiboPosts.map(p => p.id));
        const dbPostIds = new Set(allDbPosts.map(p => p.id));
        
        // 找出不一致的数据
        const missingInMemory = allDbPosts.filter(p => !memoryPostIds.has(p.id));
        const extraInMemory = weiboPosts.filter(p => !dbPostIds.has(p.id));
        
        if (missingInMemory.length > 0 || extraInMemory.length > 0) {
            console.warn(`数据不一致: 内存缺少 ${missingInMemory.length} 个帖子，内存多余 ${extraInMemory.length} 个帖子`);
            
            // 使用数据库数据作为准确来源
            weiboPosts = allDbPosts;
            console.log('已从数据库恢复数据一致性');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('数据一致性检查失败:', error);
        return false;
    }
}

function renderAllWeiboPosts(isInitialLoad = true) {
    const container = document.getElementById('weiboContainer');
    
    if (!weiboPosts || weiboPosts.length === 0) {
        container.innerHTML = '<div class="loading-text">还没有任何帖子，点击右上角"+"来生成吧！</div>';
        allPosts = [];
        return;
    }

    // 扁平化帖子数据
    flattenPosts();
    
    // 如果帖子数量较少，直接渲染全部而不使用虚拟滚动
    if (allPosts.length <= 15) {
        renderAllPostsDirectly();
        return;
    }
    
    if (isInitialLoad) {
        currentStartIndex = 0;
        // 初始时渲染稍多一些内容，避免空白但不会太多
        const initialRenderCount = Math.min(allPosts.length, Math.max(VIRTUAL_WINDOW_SIZE, 12));
        currentEndIndex = initialRenderCount;
        renderVirtualPosts();
    }

    // 设置虚拟滚动监听器
    setupVirtualScrollListener();
}

// 直接渲染所有帖子（用于帖子数量较少的情况）
function renderAllPostsDirectly() {
    const container = document.getElementById('weiboContainer');
    container.innerHTML = '';
    
    // 清理虚拟滚动监听器
    const scrollContainer = document.getElementById('weiboContainer');
    if (scrollContainer) {
        scrollContainer.onscroll = null;
    }
    
    // 渲染所有帖子
    allPosts.forEach((postData, index) => {
        const postElement = renderSingleVirtualPost(postData, index);
        if (postElement) {
            container.appendChild(postElement);
        }
    });
}

// 虚拟滚动渲染函数
function renderVirtualPosts() {
    const container = document.getElementById('weiboContainer');
    
    // 创建虚拟容器，用于保持总高度
    container.innerHTML = '';
    
    // 计算顶部占位符高度（使用实际高度）
    let topSpacerHeight = 0;
    for (let i = 0; i < currentStartIndex; i++) {
        topSpacerHeight += allPosts[i] ? (allPosts[i].height || ESTIMATED_POST_HEIGHT) : ESTIMATED_POST_HEIGHT;
    }
    
    // 添加顶部占位符
    const topSpacer = document.createElement('div');
    topSpacer.style.height = `${topSpacerHeight}px`;
    topSpacer.className = 'virtual-spacer-top';
    container.appendChild(topSpacer);
    
    // 渲染当前窗口内的帖子
    const renderedPosts = [];
    for (let i = currentStartIndex; i < currentEndIndex; i++) {
        if (i >= allPosts.length) break;
        const postElement = renderSingleVirtualPost(allPosts[i], i);
        if (postElement) {
            renderedPosts.push(postElement);
            // 关键修复：将帖子元素添加到容器中！
            container.appendChild(postElement);
        }
    }
    
    // 计算底部占位符高度（使用实际高度）
    let bottomSpacerHeight = 0;
    for (let i = currentEndIndex; i < allPosts.length; i++) {
        bottomSpacerHeight += allPosts[i] ? (allPosts[i].height || ESTIMATED_POST_HEIGHT) : ESTIMATED_POST_HEIGHT;
    }
    
    // 添加底部占位符
    const bottomSpacer = document.createElement('div');
    bottomSpacer.style.height = `${Math.max(0, bottomSpacerHeight)}px`;
    bottomSpacer.className = 'virtual-spacer-bottom';
    container.appendChild(bottomSpacer);
    
    const containerWidth = container.offsetWidth;
    
    // 强制重排以修复布局问题
    container.offsetHeight; // 触发重排
    
    // 测量实际高度并更新估算值（延迟执行避免布局抖动）
    setTimeout(() => {
        updatePostHeights(renderedPosts);
    }, 50);
}

// 渲染单个虚拟帖子
function renderSingleVirtualPost(postData, index) {
    const container = document.getElementById('weiboContainer');
    const { storedPost, post, postIndex } = postData;
    
    const contact = contacts.find(c => c.id === storedPost.contactId);
    if (storedPost.contactId && !contact) return null;
    
    const postAuthorContact = post.author_type === 'User' ? userProfile : contact;
    const postAuthorNickname = post.author_type === 'User' ? userProfile.name : (contact ? contact.name : '未知用户');
    const postAuthorAvatar = postAuthorContact ? postAuthorContact.avatar : '';
    const otherPartyName = post.author_type === 'User' ? (contact ? contact.name : '') : userProfile.name;

    const postElement = document.createElement('div');
    postElement.className = 'post';
    // 使用与常规渲染一致的ID格式：weibo-post-{storedPostId}-{postIndex}
    const postHtmlId = `weibo-post-${storedPost.id}-${postIndex}`;
    postElement.id = postHtmlId;
    postElement.setAttribute('data-index', index);

    // 使用固定的随机数，避免每次渲染都重新生成
    const savedRandomRetweet = postData.randomRetweet || (postData.randomRetweet = Math.floor(Math.random() * 500));
    const savedRandomLike = postData.randomLike || (postData.randomLike = Math.floor(Math.random() * 5000));

    postElement.innerHTML = `
        <div class="post-header">
            <div class="avatar">
                ${postAuthorAvatar ? `<img src="${postAuthorAvatar}" alt="${postAuthorNickname[0]}">` : postAuthorNickname[0]}
            </div>
            <div class="post-info">
                <div class="user-name">
                    ${postAuthorNickname}
                    <span class="vip-badge">${post.author_type === 'User' ? '会员' : '蓝星'}</span>
                </div>
                <div class="post-time">${formatTime(post.timestamp)}</div>
                <div class="post-source">来自 ${storedPost.relations} 研究所</div>
            </div>
            <div class="post-menu" onclick="toggleWeiboMenu(event, '${storedPost.id}', ${postIndex})">
                ...
                <div class="post-menu-dropdown" id="weibo-menu-${storedPost.id}-${postIndex}">
                    <div class="menu-item" onclick="deleteWeiboPost('${storedPost.id}', ${postIndex})">删除</div>
                </div>
            </div>
        </div>
        <div class="post-content">
            <a href="#" class="hashtag">#${storedPost.hashtag || storedPost.data.relation_tag}#</a>
            ${post.post_content}
            ${otherPartyName ? `<a href="#" class="mention">@${otherPartyName}</a>` : ''}
        </div>
        <div class="post-image-desc">
            ${post.image_description}
        </div>
        <div class="post-actions">
            <a href="#" class="action-btn-weibo">
                <span class="action-icon">🔄</span>
                <span>${savedRandomRetweet}</span>
            </a>
            <a href="#" class="action-btn-weibo" onclick="showReplyBox('${postHtmlId}').catch(console.error)">
                <span class="action-icon">💬</span>
                <span>${post.comments ? post.comments.length : 0}</span>
            </a>
            <a href="#" class="action-btn-weibo">
                <span class="action-icon">👍</span>
                <span>${savedRandomLike}</span>
            </a>
        </div>
        <div class="comments-section"></div>
    `;

    container.appendChild(postElement);
    
    // 调试：检查帖子宽度
    setTimeout(() => {
        const postWidth = postElement.offsetWidth;
        if (postWidth < 500) { // 如果宽度异常小
        }
    }, 10);
    
    // 渲染评论
    const commentsSection = postElement.querySelector('.comments-section');
    
    // 添加评论区点击事件（与常规渲染保持一致）
    commentsSection.onclick = () => showReplyBox(postHtmlId).catch(console.error);
    
    if (post.comments && post.comments.length > 0) {
        post.comments.forEach(comment => {
            const commenterType = comment.commenter_type ? ` (${comment.commenter_type})` : '';
            
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment';
            
            commentDiv.innerHTML = `
                <span class="comment-user">${comment.commenter_name}${commenterType}:</span>
                <span class="comment-content">${comment.comment_content}</span>
                <span class="comment-time">${formatTime(comment.timestamp)}</span>
            `;

            commentDiv.addEventListener('click', (event) => {
                event.stopPropagation();
                replyToComment(comment.commenter_name, postHtmlId).catch(console.error);
            });
            
            commentsSection.appendChild(commentDiv);
        });
    }
    
    return postElement;
}

// 测量并更新帖子的实际高度
function updatePostHeights(renderedPosts) {
    if (!renderedPosts || renderedPosts.length === 0) return;
    
    let totalMeasuredHeight = 0;
    let measuredCount = 0;
    
    renderedPosts.forEach(postElement => {
        if (postElement && postElement.offsetHeight > 0) {
            const index = parseInt(postElement.getAttribute('data-index'));
            const actualHeight = postElement.offsetHeight + 8; // 包括margin-bottom
            
            if (allPosts[index]) {
                allPosts[index].height = actualHeight;
                totalMeasuredHeight += actualHeight;
                measuredCount++;
            }
        }
    });
    
    // 更新全局估算高度
    if (measuredCount > 0) {
        const newEstimatedHeight = Math.round(totalMeasuredHeight / measuredCount);
        if (Math.abs(newEstimatedHeight - ESTIMATED_POST_HEIGHT) > 50) {
            // 只有当差异较大时才更新全局估算值
        }
    }
}

// 虚拟滚动监听器
function setupVirtualScrollListener() {
    // 修复：使用实际的滚动容器 weiboContainer 而不是 weiboPage
    const scrollContainer = document.getElementById('weiboContainer');
    if (!scrollContainer) {
        console.error('找不到滚动容器 weiboContainer');
        return;
    }

    // 移除旧的监听器
    scrollContainer.onscroll = null;
    
    
    let ticking = false;
    let lastScrollTime = 0;
    
    scrollContainer.onscroll = () => {
        const now = performance.now();
        if (now - lastScrollTime < 16) return; // 限制到60fps
        lastScrollTime = now;
        
        if (!ticking) {
            requestAnimationFrame(() => {
                handleVirtualScroll();
                ticking = false;
            });
            ticking = true;
        }
    };
}

function handleVirtualScroll() {
    const scrollContainer = document.getElementById('weiboContainer');
    const scrollTop = scrollContainer.scrollTop;
    
    
    // 计算新的渲染范围
    const { startIndex, endIndex } = calculateRenderRange(scrollTop);
    
    // 检查是否需要更新渲染范围（减少阈值以提供更好的响应）
    const threshold = 1; // 索引变化阈值
    const startIndexChanged = Math.abs(startIndex - currentStartIndex) >= threshold;
    const endIndexChanged = Math.abs(endIndex - currentEndIndex) >= threshold;
    
    if (startIndexChanged || endIndexChanged) {
        currentStartIndex = startIndex;
        currentEndIndex = endIndex;
        
        renderVirtualPosts();
    }
}

// 加载更多帖子数据的函数
async function loadMorePostData() {
    if (isLoadingMorePosts) return;
    isLoadingMorePosts = true;
    
    // 这里可以实现加载更多帖子数据的逻辑
    // 目前只是简单的延时，实际应用中可以调用API获取更多帖子
    setTimeout(() => {
        isLoadingMorePosts = false;
    }, 1000);
}

function renderSingleWeiboPost(storedPost) {
    const container = document.getElementById('weiboContainer');
    const contact = contacts.find(c => c.id === storedPost.contactId);
    
    // 对于用户自己发的帖子，contactId为null，contact为undefined，这是正常的
    // 只有当contactId不为null但找不到对应联系人时才跳过渲染
    if (storedPost.contactId && !contact) return; // Don't render if contact should exist but is deleted

    const data = storedPost.data;

    if (!data || !data.posts || !Array.isArray(data.posts)) {
        return;
    }

    data.posts.forEach((post, index) => {
        const postAuthorContact = post.author_type === 'User' ? userProfile : contact;
        const postAuthorNickname = post.author_type === 'User' ? userProfile.name : (contact ? contact.name : '未知用户');
        const postAuthorAvatar = postAuthorContact ? postAuthorContact.avatar : '';
        // 修复otherPartyName逻辑，对于用户自己发的帖子，otherPartyName可以是空或者话题标签
        const otherPartyName = post.author_type === 'User' ? (contact ? contact.name : '') : userProfile.name;

        const postElement = document.createElement('div');
        postElement.className = 'post';
        const postHtmlId = `weibo-post-${storedPost.id}-${index}`;
        postElement.id = postHtmlId;

        // Set the main structure of the post
        postElement.innerHTML = `
            <div class="post-header">
                <div class="avatar">
                    ${postAuthorAvatar ? `<img src="${postAuthorAvatar}" alt="${postAuthorNickname[0]}">` : postAuthorNickname[0]}
                </div>
                <div class="post-info">
                    <div class="user-name">
                        ${postAuthorNickname}
                        <span class="vip-badge">${post.author_type === 'User' ? '会员' : '蓝星'}</span>
                    </div>
                    <div class="post-time">${formatTime(post.timestamp)}</div>
                    <div class="post-source">来自 ${storedPost.relations} 研究所</div>
                </div>
                <div class="post-menu" onclick="toggleWeiboMenu(event, '${storedPost.id}', ${index})">
                    ...
                    <div class="post-menu-dropdown" id="weibo-menu-${storedPost.id}-${index}">
                        <div class="menu-item" onclick="deleteWeiboPost('${storedPost.id}', ${index})">删除</div>
                    </div>
                </div>
            </div>
            <div class="post-content">
                <a href="#" class="hashtag">#${storedPost.hashtag || data.relation_tag}#</a>
                ${post.post_content}
                ${otherPartyName ? `<a href="#" class="mention">@${otherPartyName}</a>` : ''}
            </div>
            <div class="post-image-desc">
                ${post.image_description}
            </div>
            <div class="post-actions">
                <a href="#" class="action-btn-weibo">
                    <span class="action-icon">🔄</span>
                    <span>${Math.floor(Math.random() * 500)}</span>
                </a>
                <a href="#" class="action-btn-weibo" onclick="showReplyBox('${postHtmlId}').catch(console.error)">
                    <span class="action-icon">💬</span>
                    <span>${post.comments ? post.comments.length : 0}</span>
                </a>
                <a href="#" class="action-btn-weibo">
                    <span class="action-icon">👍</span>
                    <span>${Math.floor(Math.random() * 5000)}</span>
                </a>
            </div>
            <div class="comments-section"></div>
        `;

        // Programmatically create and append comments
        const commentsSection = postElement.querySelector('.comments-section');
        if (commentsSection) {
            commentsSection.onclick = () => showReplyBox(postHtmlId).catch(console.error);

            if (post.comments && Array.isArray(post.comments)) {
                post.comments.forEach(comment => {
                    const commenterType = comment.commenter_type ? ` (${comment.commenter_type})` : '';
                    
                    const commentDiv = document.createElement('div');
                    commentDiv.className = 'comment';
                    
                    commentDiv.innerHTML = `
                        <span class="comment-user">${comment.commenter_name}${commenterType}:</span>
                        <span class="comment-content">${comment.comment_content}</span>
                        <span class="comment-time">${formatTime(comment.timestamp)}</span>
                    `;

                    commentDiv.addEventListener('click', (event) => {
                        event.stopPropagation();
                        replyToComment(comment.commenter_name, postHtmlId).catch(console.error);
                    });

                    commentsSection.appendChild(commentDiv);
                });
            }
        }
        
        container.appendChild(postElement);
    });
}

async function replyToComment(commenterName, postHtmlId) {
    // First, ensure the reply box is visible for the post.
    await showReplyBox(postHtmlId);

    // Now, find the reply box and its textarea.
    const postElement = document.getElementById(postHtmlId);
    if (!postElement) return;

    const replyInput = postElement.querySelector('.reply-input');
    if (!replyInput) return;

    // Pre-fill the textarea with the @-mention.
    const currentText = replyInput.value;
    const mention = `@${commenterName} `;
    
    // Avoid adding duplicate mentions if the user clicks multiple times.
    if (!currentText.includes(mention)) {
        replyInput.value = mention + currentText;
    }
    
    // Focus the input and place the cursor at the end.
    replyInput.focus();
    replyInput.setSelectionRange(replyInput.value.length, replyInput.value.length);
}

async function showReplyBox(postHtmlId) {
    const postElement = document.getElementById(postHtmlId);
    if (!postElement) {
        console.warn(`找不到帖子元素: ${postHtmlId}`);
        return;
    }
    
    // 在显示回复框前检查数据一致性
    const storedPostId = parseInt(postHtmlId.split('-')[2], 10);
    const storedPost = weiboPosts.find(p => p.id === storedPostId);
    if (!storedPost) {
        console.warn(`数据不一致，帖子ID ${storedPostId} 不存在，尝试修复...`);
        const repaired = await checkAndRepairDataConsistency();
        if (repaired) {
            // 数据修复后重新渲染页面
            renderAllWeiboPosts();
            showToast('数据已同步，请重新点击回复');
            return;
        }
    }

    let replyBox = postElement.querySelector('.reply-box');
    if (replyBox) {
        replyBox.querySelector('textarea').focus();
        return;
    }

    const commentsSection = postElement.querySelector('.comments-section');
    
    replyBox = document.createElement('div');
    replyBox.className = 'reply-box';
    replyBox.innerHTML = `
        <textarea class="reply-input" placeholder="输入你的回复..."></textarea>
        <button class="reply-button">回复</button>
    `;
    
    commentsSection.appendChild(replyBox);
    const replyInput = replyBox.querySelector('.reply-input');
    const replyButton = replyBox.querySelector('.reply-button');

    replyInput.focus();
    
    // 确保回复框不被底部导航栏遮挡
    setTimeout(() => {
        replyBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

    replyButton.onclick = async () => {
        const replyContent = replyInput.value.trim();
        if (!replyContent) {
            showToast('回复内容不能为空');
            return;
        }

        // --- Find the target post ---
        const storedPostId = parseInt(postHtmlId.split('-')[2], 10);
        const postIndex = parseInt(postHtmlId.split('-')[3], 10);
        let storedPost = weiboPosts.find(p => p.id === storedPostId);
        
        // 容错机制：如果找不到帖子，尝试从数据库重新加载
        if (!storedPost) {
            console.warn(`找不到帖子ID ${storedPostId}，尝试从数据库重新加载...`);
            
            // 首先尝试按不同类型查找
            let foundByString = weiboPosts.find(p => p.id.toString() === storedPostId.toString());
            if (foundByString) {
                storedPost = foundByString;
            } else {
                // 尝试从数据库重新加载
                try {
                    if (isIndexedDBReady && db) {
                        const transaction = db.transaction(['weiboPosts'], 'readonly');
                        const store = transaction.objectStore('weiboPosts');
                        
                        // 尝试数字ID和字符串ID
                        let dbPost = await promisifyRequest(store.get(storedPostId));
                        if (!dbPost) {
                            dbPost = await promisifyRequest(store.get(storedPostId.toString()));
                        }
                        
                        if (dbPost) {
                            // 将从数据库找到的帖子重新添加到内存数组
                            weiboPosts.push(dbPost);
                            storedPost = dbPost;
                            console.log(`成功从数据库恢复帖子ID ${storedPostId}`);
                        } else {
                            // 数据库中也没有，检查是否是异常ID（如0、1等）
                            if (storedPostId < 1000000000000) {
                                showToast('检测到数据异常，正在重新同步...');
                                const repaired = await checkAndRepairDataConsistency();
                                if (repaired) {
                                    renderAllWeiboPosts();
                                    return;
                                }
                            }
                            
                            // 数据库中也没有，可能帖子已被删除，刷新页面
                            showToast('帖子可能已被删除，正在刷新页面...');
                            renderAllWeiboPosts();
                            return;
                        }
                    } else {
                        showToast('数据库未就绪，请刷新页面重试');
                        return;
                    }
                } catch (error) {
                    console.error('从数据库恢复帖子失败:', error);
                    showToast('数据加载失败，请刷新页面重试');
                    return;
                }
            }
        }
        
        // 检查帖子索引是否有效
        if (!storedPost.data?.posts || !storedPost.data.posts[postIndex]) {
            console.error(`帖子索引无效: storedPostId=${storedPostId}, postIndex=${postIndex}`);
            showToast('帖子数据异常，正在刷新页面...');
            renderAllWeiboPosts();
            return;
        }
        
        const postData = storedPost.data.posts[postIndex];

        // --- Create User Comment ---
        const userComment = {
            commenter_name: userProfile.name,
            commenter_type: 'User',
            comment_content: replyContent,
            timestamp: new Date().toISOString()
        };

        // --- Disable UI ---
        replyInput.disabled = true;
        replyButton.disabled = true;
        replyButton.textContent = '请稍后...';

        // --- Add user's comment to the list immediately for better UX ---
        if (!postData.comments) {
            postData.comments = [];
        }
        postData.comments.push(userComment);
        renderAllWeiboPosts(); // Re-render to show the user's comment
        await showReplyBox(postHtmlId); // Keep the reply box open

        // 检查并更新全局记忆（用户回复内容）
        if (window.characterMemoryManager) {
            const forumContent = `用户回复论坛：\n原帖：${postData.post_content}\n用户回复：${replyContent}`;
            window.characterMemoryManager.checkAndUpdateGlobalMemory(forumContent);
        }

        try {
            const mentionRegex = /@(\S+)/;
            const match = replyContent.match(mentionRegex);
            let mentionedContact = null;

            if (match) {
                const mentionedName = match[1].trim();
                mentionedContact = contacts.find(c => c.name === mentionedName && c.type === 'private');
            }

            if (match) {
                const mentionedName = match[1].trim();
                const mentionedPersonContact = mentionedContact || {
                    name: mentionedName,
                    personality: `一个被@的网友，名字叫${mentionedName}`
                };
                
                const aiReplyContent = await getMentionedAIReply(postData, userComment, mentionedPersonContact);
                const aiComment = {
                    commenter_name: mentionedName,
                    commenter_type: 'Mentioned',
                    comment_content: aiReplyContent,
                    timestamp: new Date().toISOString()
                };
                postData.comments.push(aiComment);
                await updateWeiboPost(storedPost);
                showToast('AI已回复！');
                renderAllWeiboPosts();
                return;
            }

            if (postData.author_type !== 'User') {
                const postAuthorContact = contacts.find(c => c.id === storedPost.contactId);
                if (!postAuthorContact) throw new Error('Post author not found');
                
                const aiReplyContent = await getAIReply(postData, replyContent, storedPost.contactId);
                const aiComment = {
                    commenter_name: postAuthorContact.name,
                    commenter_type: '楼主',
                    comment_content: aiReplyContent,
                    timestamp: new Date().toISOString()
                };
                postData.comments.push(aiComment);
                await updateWeiboPost(storedPost);
                showToast('AI已回复！');
                renderAllWeiboPosts();
                return;
            }

            await updateWeiboPost(storedPost);
            showToast('已回复');
            renderAllWeiboPosts();

        } catch (error) {
            showApiError(error);
            console.error('AI回复生成失败:', error);
            // On failure, remove the user's comment that was added optimistically
            postData.comments.pop();
            renderAllWeiboPosts();
        }
    };
}

async function getMentionedAIReply(postData, mentioningComment, mentionedContact) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        throw new Error('API未配置');
    }

    const systemPrompt = window.promptBuilder.buildMentionReplyPrompt(postData, mentioningComment, mentionedContact, contacts, userProfile);
    
    const data = await window.apiService.callOpenAIAPI(
        apiSettings.url,
        apiSettings.key,
        apiSettings.model,
        [{ role: 'user', content: systemPrompt }],
        { temperature: 0.75 }, // Slightly higher temp for more creative/natural replies
        (apiSettings.timeout || 60) * 1000
    );

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message.content) {
        throw new Error('AI未返回有效回复');
    }
    
    return data.choices[0].message.content;
}

async function getAIReply(postData, userReply, contactId) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        throw new Error('API未配置');
    }

    const systemPrompt = window.promptBuilder.buildReplyPrompt(postData, userReply, contactId, contacts, userProfile);
    const data = await window.apiService.callOpenAIAPI(
        apiSettings.url,
        apiSettings.key,
        apiSettings.model,
        [{ role: 'user', content: systemPrompt }],
        { temperature: 0.7 },
        (apiSettings.timeout || 60) * 1000
    );

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message.content) {
        throw new Error('AI未返回有效回复');
    }
    
    return data.choices[0].message.content;
}




function toggleWeiboMenu(event, storedPostId, postIndex) {
    event.stopPropagation();
    const menu = document.getElementById(`weibo-menu-${storedPostId}-${postIndex}`);
    
    // Close all other menus
    document.querySelectorAll('.post-menu-dropdown').forEach(m => {
        if (m.id !== menu.id) {
            m.style.display = 'none';
        }
    });

    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

// Close dropdown when clicking anywhere else
window.addEventListener('click', (event) => {
    if (!event.target.matches('.post-menu')) {
        document.querySelectorAll('.post-menu-dropdown').forEach(m => {
            m.style.display = 'none';
        });
    }
});


async function deleteWeiboPost(storedPostId, postIndex) {
    // Convert storedPostId to the correct type if necessary, assuming it's a number from the template
    const numericStoredPostId = parseInt(storedPostId, 10);

    // Find the specific post group in the in-memory weiboPosts array
    const postGroupIndex = weiboPosts.findIndex(p => p.id === numericStoredPostId);
    
    if (postGroupIndex > -1) {
        // The specific post to be deleted
        const postGroup = weiboPosts[postGroupIndex];
        
        // Remove the specific post from the 'posts' array within the group
        if (postGroup.data && postGroup.data.posts && postGroup.data.posts.length > postIndex) {
            postGroup.data.posts.splice(postIndex, 1);
        }

        // If this was the last post in the group, remove the entire group
        if (postGroup.data.posts.length === 0) {
            weiboPosts.splice(postGroupIndex, 1);
            // Also delete the entire entry from IndexedDB
            if (isIndexedDBReady) {
                try {
                    const transaction = db.transaction(['weiboPosts'], 'readwrite');
                    const store = transaction.objectStore('weiboPosts');
                    await promisifyRequest(store.delete(numericStoredPostId));
                    await promisifyTransaction(transaction);
                } catch (error) {
                    console.error('Failed to delete Weibo post group from DB:', error);
                    showToast('从数据库删除帖子失败');
                    // Optional: Add back the data to memory to maintain consistency
                    return;
                }
            }
        } else {
            // Otherwise, just update the modified group in IndexedDB
            await updateWeiboPost(postGroup);
        }
    }

    // Re-render the UI
    renderAllWeiboPosts();
    showToast('帖子已删除');
}

async function updateWeiboPost(postToUpdate) {
    if (!isIndexedDBReady) {
        console.error('IndexedDB not ready, cannot update post.');
        showToast('数据库错误，无法更新帖子');
        return;
    }
    try {
        const transaction = db.transaction(['weiboPosts'], 'readwrite');
        const store = transaction.objectStore('weiboPosts');
        await promisifyRequest(store.put(postToUpdate));
        await promisifyTransaction(transaction);
    } catch (error) {
        console.error('Failed to update Weibo post in DB:', error);
        showToast('更新帖子失败');
    }
}



// --- 朋友圈功能 ---

// 存储上传的图片数据
let momentUploadedImages = [];

// 朋友圈发布方式选择
function showPublishMomentModal() {
    // 显示朋友圈发布方式选择模态框
    showModal('momentChoiceModal');
}

function selectMomentType(type) {
    closeModal('momentChoiceModal');
    
    if (type === 'manual') {
        showManualMomentModal();
    } else if (type === 'generate') {
        showGenerateMomentModal();
    }
}

async function showManualMomentModal() {
    showModal('manualMomentModal');
    
    // 获取用户信息
    const userProfile = await getUserProfile();
    
    // 设置发布人为当前用户
    document.getElementById('manualMomentAuthor').value = userProfile.name || '我';
    
    // 清空之前的内容和图片
    document.getElementById('manualMomentContent').value = '';
    momentUploadedImages = [];
    document.getElementById('momentImagesPreview').innerHTML = '';
}

function showGenerateMomentModal() {
    showModal('generateMomentModal');
    
    // 清空表单
    document.getElementById('momentGenTopic').value = '';
    document.getElementById('momentUnsplashKey').value = localStorage.getItem('unsplashApiKey') || '';
    
    // 加载角色列表
    loadMomentCharacterOptions();
}

// 加载角色选项
async function loadMomentCharacterOptions() {
    const select = document.getElementById('momentGenCharacterSelect');
    select.innerHTML = '<option value="">请选择...</option>';
    
    // 只添加联系人选项（AI角色），不包括"我"
    if (window.contacts && window.contacts.length > 0) {
        window.contacts.forEach(contact => {
            if (contact.type === 'private') { // 只显示私聊角色
                const option = document.createElement('option');
                option.value = contact.id;
                option.textContent = contact.name;
                select.appendChild(option);
            }
        });
    }
}

// 处理生成朋友圈表单提交
async function handleGenerateMoment(event) {
    event.preventDefault();
    
    const contactId = document.getElementById('momentGenCharacterSelect').value;
    const topic = document.getElementById('momentGenTopic').value.trim();
    const unsplashKey = document.getElementById('momentUnsplashKey').value.trim();
    
    if (!contactId) {
        showToast('请选择角色');
        return;
    }
    
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先设置API');
        return;
    }
    
    // 保存Unsplash API Key
    if (unsplashKey) {
        localStorage.setItem('unsplashApiKey', unsplashKey);
    }
    
    try {
        // 找到角色信息
        const character = window.contacts?.find(c => c.id === contactId);
        if (!character) {
            showToast('未找到选中的角色');
            return;
        }
        
        showToast('正在生成朋友圈内容和评论...');
        
        // 获取用户信息
        const userProfile = await getUserProfile();
        
        // 一次性生成朋友圈内容、图片关键词和评论
        const momentData = await generateMomentAndComments(character, userProfile, topic);
        
        let imageUrl = null;
        
        // 如果提供了Unsplash API Key 且 AI返回了关键词，尝试获取配图
        if (unsplashKey && momentData.imageKeyword) {
            showToast('正在获取配图...');
            try {
                // 使用AI返回的关键词进行搜索
                imageUrl = await getUnsplashImage(momentData.imageKeyword, unsplashKey);
            } catch (imageError) {
                console.warn('获取Unsplash图片失败:', imageError);
                // 即使图片获取失败也继续发布朋友圈
            }
        }
        
        // 创建朋友圈对象
        const moment = {
            id: Date.now().toString(),
            authorName: character.name,
            authorAvatar: character.avatar,
            content: momentData.content,
            image: imageUrl, // Unsplash图片URL
            time: new Date().toISOString(),
            likes: 0,
            comments: momentData.comments
        };
        
        // 保存朋友圈
        moments.unshift(moment);
        await saveDataToDB();
        await renderMomentsList();
        
        closeModal('generateMomentModal');
        showToast('朋友圈发布成功！');
        
    } catch (error) {
        console.error('生成朋友圈失败:', error);
        showToast('生成朋友圈失败: ' + error.message);
    }
}

// 获取Unsplash图片
async function getUnsplashImage(searchQuery, apiKey) {
    // 现在此函数直接调用新的 fetchMatchingImageForPublish
    return await fetchMatchingImageForPublish(searchQuery, apiKey);
}

// 一次性生成朋友圈内容和评论
async function generateMomentAndComments(character, userProfile, topic = '') {
    try {
        
        // 检查必要的依赖
        if (!window.promptBuilder) {
            throw new Error('PromptBuilder未初始化');
        }
        
        if (!window.apiService) {
            throw new Error('APIService未初始化');
        }
        
        if (!apiSettings || !apiSettings.url || !apiSettings.key || !apiSettings.model) {
            throw new Error('API设置未完成');
        }
        
        // 使用PromptBuilder构建prompt
        const systemPrompt = await window.promptBuilder.buildMomentAndCommentsPrompt(
            character, 
            userProfile, 
            apiSettings, 
            window.contacts, 
            topic
        );
        
        
        // 使用云端API服务
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            {
                temperature: 0.9,
                max_tokens: 2000,
                // 强制要求返回JSON格式，以匹配新的提示词结构
                response_format: { type: "json_object" },
            },
            apiSettings.timeout * 1000 || 60000
        );
        
        
        const rawContent = data.choices[0]?.message?.content;
        console.log('API返回的原始内容:', rawContent);
        
        if (!rawContent) {
            throw new Error('API返回空内容');
        }
        
        // 使用统一的JSON提取函数清理markdown语法
        let cleanedJson;
        try {
            cleanedJson = window.apiService.extractJSON(rawContent);
        } catch (extractError) {
            console.error('JSON提取失败:', extractError);
            throw new Error(`JSON提取失败: ${extractError.message}`);
        }
        
        // 解析JSON结果
        let momentData;
        try {
            momentData = JSON.parse(cleanedJson);
        } catch (parseError) {
            console.error('解析JSON失败:', parseError, '原始内容:', rawContent);
            throw new Error('AI返回的数据格式不正确，无法解析为JSON。');
        }
        
        // 确保返回格式正确
        if (!momentData.content) {
            throw new Error('生成的朋友圈内容为空');
        }
        
        if (!Array.isArray(momentData.comments)) {
            momentData.comments = [];
        }

        // 获取图片关键词，可能为 null
        const imageKeyword = momentData.imageKeyword || null;
        
        // 转换评论格式以兼容现有系统
        const formattedComments = momentData.comments.map(comment => ({
            author: comment.author || '匿名',
            content: comment.content || '',
            like: comment.like || false,
            timestamp: new Date().toISOString()
        }));
        
        const result = {
            content: momentData.content,
            imageKeyword: imageKeyword, // 添加新的字段
            comments: formattedComments
        };
        
        return result;
        
    } catch (error) {
        console.error('生成朋友圈和评论失败:', error);
        throw error; // 直接抛出错误，不返回默认内容
    }
}

// === 图片AI识别相关功能 ===

// 分析上传的图片内容
async function analyzeImageContent(imageBase64, prompt = '请描述这张图片的内容') {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        throw new Error('请先设置API');
    }
    
    try {
        const response = await fetch(`${apiSettings.url}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiSettings.key}`
            },
            body: JSON.stringify({
                model: apiSettings.model,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageBase64
                            }
                        }
                    ]
                }],
                max_tokens: 300,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`图片分析失败: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0]?.message?.content || '无法识别图片内容';
        
    } catch (error) {
        console.error('图片分析失败:', error);
        return '图片分析功能暂时不可用';
    }
}

// 根据图片内容生成朋友圈文案
async function generateMomentTextFromImage(imageBase64, character) {
    const analysisPrompt = `你是${character.name}，性格特点：${character.personality}。
请看这张图片，然后以${character.name}的身份发布一条朋友圈动态。

要求：
1. 基于图片内容来写朋友圈
2. 符合${character.name}的性格特点和说话风格
3. 内容要自然真实，就像真的朋友圈一样
4. 长度控制在30-100字之间
5. 可以适当使用emoji表情
6. 不要说"这张图片"之类的话，要像是自己拍的照片一样

直接返回朋友圈内容，不要有其他说明文字。`;

    return await analyzeImageContent(imageBase64, analysisPrompt);
}

// 检查图片内容是否合适
async function checkImageContent(imageBase64) {
    const checkPrompt = `请检查这张图片是否包含以下不当内容：
1. 暴力血腥内容
2. 色情内容  
3. 政治敏感内容
4. 其他不适合在社交媒体分享的内容

如果图片内容合适，请回复"合适"；如果不合适，请简短说明原因。`;

    const result = await analyzeImageContent(imageBase64, checkPrompt);
    return {
        isAppropriate: result.includes('合适'),
        reason: result.includes('合适') ? '' : result
    };
}

// 为特定角色生成朋友圈内容
async function generateMomentForCharacter(character, topic = '') {
    const topicPrompt = topic ? `围绕"${topic}"这个主题，` : '';
    
    const prompt = `你是${character.name}，性格特点：${character.personality}。
请${topicPrompt}发布一条符合你性格的朋友圈动态。

要求：
1. 内容要符合${character.name}的性格特点
2. 语言风格要自然，就像真的朋友圈一样
3. 长度控制在50-150字之间
4. 可以包含生活感悟、日常分享、心情表达等
5. 不要使用过于正式的语言
6. 可以适当使用emoji表情

直接返回朋友圈内容，不要有其他说明文字。`;

    const response = await fetch(`${apiSettings.url}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiSettings.key}`
        },
        body: JSON.stringify({
            model: apiSettings.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.8
        })
    });

    if (!response.ok) {
        throw new Error(`生成失败: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '今天心情不错~';
}

// 处理图片上传
async function handleMomentImagesUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length + momentUploadedImages.length > 9) {
        showToast('最多只能上传9张图片');
        return;
    }
    
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            try {
                // 直接存储File对象，用于后续保存到文件系统
                momentUploadedImages.push({
                    file: file,
                    previewUrl: await fileToBase64(file) // 用于预览
                });
            } catch (error) {
                console.error('图片上传失败:', error);
                showToast(`图片上传失败: ${error.message || '未知错误'}`, 'error');
            }
        }
    }
    
    renderMomentImagesPreview();
    event.target.value = ''; // 清空input
}

// 渲染图片预览
function renderMomentImagesPreview() {
    const preview = document.getElementById('momentImagesPreview');
    preview.innerHTML = '';
    
    momentUploadedImages.forEach((imageItem, index) => {
        const item = document.createElement('div');
        item.className = 'moment-image-item';
        item.innerHTML = `
            <img src="${imageItem.previewUrl}" alt="预览图">
            <div class="moment-image-remove" onclick="removeMomentImage(${index})">×</div>
        `;
        preview.appendChild(item);
    });
}

// 删除图片
function removeMomentImage(index) {
    momentUploadedImages.splice(index, 1);
    renderMomentImagesPreview();
}

// 文件转Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 手动发布朋友圈
async function handleManualMoment(event) {
    event.preventDefault();
    
    const authorName = document.getElementById('manualMomentAuthor').value;
    const content = document.getElementById('manualMomentContent').value.trim();
    
    if (!content) {
        showToast('请填写朋友圈内容');
        return;
    }
    
    closeModal('manualMomentModal');
    
    // 发布手动朋友圈
    await publishManualMoment(authorName, content, momentUploadedImages);
}

async function publishManualMoment(authorName, content, imageItems) {
    // 使用当前时间作为发布时间，就像论坛一样
    const momentCreatedAt = new Date();
    const momentId = Date.now().toString();
    
    try {
        // 存储图片到文件系统
        let imageFileIds = [];
        let imageCount = 0;
        
        if (imageItems && imageItems.length > 0) {
            showToast('正在保存图片...');
            
            // 确保ImageStorageAPI已初始化
            if (window.ImageStorageAPI) {
                await window.ImageStorageAPI.init();
                
                // 提取File对象
                const imageFiles = imageItems.map(item => item.file);
                
                // 存储多张图片
                imageFileIds = await window.ImageStorageAPI.storeMomentImages(imageFiles, momentId);
                imageCount = imageFiles.length;
                
            } else {
                console.warn('ImageStorageAPI未初始化，跳过图片存储');
            }
        }
        
        // 创建朋友圈对象
        const moment = {
            id: momentId,
            authorName: authorName,
            authorAvatar: userProfile.avatar || '',
            content: content,
            imageFileIds: imageFileIds, // 存储fileId数组
            imageCount: imageCount, // 存储图片数量，用于后续获取
            time: momentCreatedAt.toISOString(),
            likes: 0,
            comments: [] // 先创建空评论
        };

        // 保存并立即显示朋友圈
        moments.unshift(moment);
        await saveDataToDB();
        await renderMomentsList();
        showToast('朋友圈发布成功，正在生成评论...');

        // 异步生成评论
        setTimeout(async () => {
            try {
                // 使用当前时间生成评论（就像论坛一样）
                const commentsWithTime = await generateAICommentsWithCurrentTime(content);
                // 更新朋友圈的评论
                const momentIndex = moments.findIndex(m => m.id === moment.id);
                if (momentIndex !== -1) {
                    moments[momentIndex].comments = commentsWithTime;
                    await saveDataToDB();
                    await renderMomentsList();
                }
            } catch (error) {
                console.error('评论生成失败:', error);
            }
        }, 1000);
        
        // 清空表单和图片
        document.getElementById('manualMomentContent').value = '';
        momentUploadedImages = [];
        
    } catch (error) {
        console.error('发布朋友圈失败:', error);
        showToast('发布失败: ' + error.message);
    }
}

/**
 * @description 根据聊天记录和角色信息生成朋友圈内容
 * @changes **MODIFIED**: Changed API request to be compatible with OpenAI format.
 */
async function generateMomentContent() {
    if (!currentContact) {
        showToast('请先选择一个联系人');
        return;
    }

    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先设置API');
        return;
    }

    const generateBtn = document.querySelector('.generate-moment-btn');
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';

    try {
        const systemPrompt = window.promptBuilder.buildMomentContentPrompt(currentContact, userProfile, apiSettings, contacts);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.8 },
            (apiSettings.timeout || 60) * 1000
        );

        const momentContent = data.choices[0].message.content || '';

        let imageUrl = null;
        const unsplashKey = document.getElementById('unsplashApiKey').value.trim();
        if (unsplashKey) {
            imageUrl = await fetchMatchingImageForPublish(momentContent, unsplashKey);
        }

        // 使用当前时间生成评论（就像论坛一样）
        const comments = await generateAICommentsWithCurrentTime(momentContent);

        // 生成朋友圈ID
        const momentId = Date.now().toString();
        
        // 如果有图片，存储到文件系统
        let imageFileIds = [];
        let imageCount = 0;
        
        if (imageUrl && window.ImageStorageAPI) {
            try {
                await window.ImageStorageAPI.init();
                
                // 从URL下载图片并存储
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                imageFileIds = await window.ImageStorageAPI.storeMomentImages([blob], momentId);
                imageCount = 1;
                
            } catch (error) {
                console.error('存储AI生成图片失败:', error);
            }
        }

        const moment = {
            id: momentId,
            authorName: currentContact.name,
            authorAvatar: currentContact.avatar,
            content: momentContent,
            image: imageUrl, // 保持向后兼容
            images: imageUrl ? [imageUrl] : [], // 兼容旧版本
            imageFileIds: imageFileIds, // 新的文件系统存储
            imageCount: imageCount,
            time: new Date().toISOString(),
            likes: 0,
            comments: comments
        };

        moments.unshift(moment);
        await saveDataToDB();
        await renderMomentsList();
        closeModal('generateMomentModal');
        showToast('朋友圈发布成功');

    } catch (error) {
        console.error('生成朋友圈失败:', error);
        showApiError(error);
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '生成朋友圈';
    }
}

/**
 * @description 根据内容生成图片搜索关键词，并调用 Unsplash API 获取图片
 * @changes No changes to this function itself, but its dependency `generateImageSearchQuery` is updated.
 */
async function fetchMatchingImageForPublish(content, apiKey) {
    try {
        // 暂时直接使用moment文字内容作为搜索关键词，后续需要修改
        const searchQuery = content;
        // 这是直接从浏览器向Unsplash API发起的请求
        const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=3&orientation=landscape`, {
            headers: {
                'Authorization': `Client-ID ${apiKey}`
            }
        });
        if (!response.ok) throw new Error('Unsplash API请求失败');
        const data = await response.json();
        console.log(response);
        return (data.results && data.results.length > 0) ? data.results[0].urls.regular : null;
    } catch (error) {
        console.error('获取配图失败:', error);
        return null;
    }
}

/**
 * @description 调用 API 生成图片搜索关键词
 * @changes **MODIFIED**: Changed API request to be compatible with OpenAI format.
 */
async function generateImageSearchQuery(content) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) return null;
    try {
        const systemPrompt = window.promptBuilder.buildImageSearchPrompt(content);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.5 },
            (apiSettings.timeout || 60) * 1000
        );
        return data.choices[0].message.content || null;
    } catch (error) {
        console.error('AI关键词生成失败:', error);
        return null;
    }
}


function extractImageKeywords(content) {
    const emotionMap = { '开心': 'happy sunshine joy', '难过': 'sad rain melancholy', '兴奋': 'excited celebration party', '平静': 'peaceful calm nature', '浪漫': 'romantic sunset flowers', '怀念': 'nostalgic vintage memories' };
    const sceneMap = { '咖啡': 'coffee cafe cozy', '旅行': 'travel landscape adventure', '美食': 'food delicious cooking', '工作': 'office workspace productivity', '运动': 'sports fitness outdoor', '读书': 'books reading library', '音乐': 'music instruments concert', '电影': 'cinema movie theater', '购物': 'shopping fashion style', '聚会': 'party friends celebration' };
    let keywords = [];
    for (const [chinese, english] of Object.entries(emotionMap)) { if (content.includes(chinese)) { keywords.push(english); break; } }
    for (const [chinese, english] of Object.entries(sceneMap)) { if (content.includes(chinese)) { keywords.push(english); break; } }
    if (keywords.length === 0) keywords.push('lifestyle daily life aesthetic');
    return keywords.join(' ');
}

/**
 * @description 调用 API 生成朋友圈评论
 * @changes **MODIFIED**: Changed API request to be compatible with OpenAI format.
 */
async function generateAIComments(momentContent) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        return [];
    }
    try {
        const systemPrompt = await window.promptBuilder.buildCommentsPrompt(momentContent, contacts);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { response_format: { type: "json_object" }, temperature: 0.9 },
            (apiSettings.timeout || 60) * 1000
        );
        
        const rawText = data.choices[0].message.content;
        if (!rawText) {
            throw new Error("AI未返回有效的JSON格式");
        }

        // 使用统一的JSON提取函数清理markdown语法
        let cleanedJson;
        try {
            cleanedJson = window.apiService.extractJSON(rawText);
        } catch (extractError) {
            console.error('JSON提取失败:', extractError);
            throw new Error(`JSON提取失败: ${extractError.message}`);
        }

        const commentsData = JSON.parse(cleanedJson);
        return commentsData.comments.map(comment => ({
            author: comment.author,
            content: comment.content,
            like: comment.like !== undefined ? comment.like : false, // 默认为false
            time: new Date().toISOString() // 使用当前时间，像论坛一样
        }));
    } catch (error) {
        console.error('AI评论生成失败:', error);
        return [];
    }
}

// 生成带当前时间戳的评论（像论坛一样）
async function generateAICommentsWithCurrentTime(momentContent) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        return [];
    }
    try {
        const systemPrompt = await window.promptBuilder.buildCommentsPrompt(momentContent, contacts);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { response_format: { type: "json_object" }, temperature: 0.9 },
            (apiSettings.timeout || 60) * 1000
        );
        
        const rawText = data.choices[0].message.content;
        if (!rawText) {
            throw new Error("AI未返回有效的JSON格式");
        }

        // 使用统一的JSON提取函数清理markdown语法
        let cleanedJson;
        try {
            cleanedJson = window.apiService.extractJSON(rawText);
        } catch (extractError) {
            console.error('JSON提取失败:', extractError);
            throw new Error(`JSON提取失败: ${extractError.message}`);
        }

        const commentsData = JSON.parse(cleanedJson);
        const baseComments = commentsData.comments || [];
        
        // 所有评论都使用当前时间（就像论坛一样）
        return baseComments.map((comment) => {
            return {
                author: comment.author,
                content: comment.content,
                like: comment.like !== undefined ? comment.like : false, // 保留点赞状态
                time: new Date().toISOString() // 使用当前时间
            };
        });
    } catch (error) {
        console.error('生成带时间戳评论失败:', error);
        return [];
    }
}

// 生成带时间戳的评论（基于朋友圈发布时间）
async function generateAICommentsWithTime(momentContent, momentTime) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        return [];
    }
    try {
        const systemPrompt = await window.promptBuilder.buildCommentsPrompt(momentContent, contacts);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { response_format: { type: "json_object" }, temperature: 0.9 },
            (apiSettings.timeout || 60) * 1000
        );
        
        const rawText = data.choices[0].message.content;
        if (!rawText) {
            throw new Error("AI未返回有效的JSON格式");
        }

        // 使用统一的JSON提取函数清理markdown语法
        let cleanedJson;
        try {
            cleanedJson = window.apiService.extractJSON(rawText);
        } catch (extractError) {
            console.error('JSON提取失败:', extractError);
            throw new Error(`JSON提取失败: ${extractError.message}`);
        }

        const commentsData = JSON.parse(cleanedJson);
        const baseComments = commentsData.comments || [];
        
        // 为每个评论添加时间戳（在朋友圈发布时间之后）
        const momentTimeMs = new Date(momentTime).getTime();
        return baseComments.map((comment, index) => {
            // 评论时间在朋友圈发布后的几分钟到几小时内
            const minDelayMs = (index + 1) * 2 * 60 * 1000; // 每个评论间隔至少2分钟
            const maxDelayMs = (index + 1) * 30 * 60 * 1000; // 最多30分钟后
            const randomDelay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
            const commentTime = new Date(momentTimeMs + randomDelay);
            
            const processedComment = {
                author: comment.author,
                content: comment.content,
                like: comment.like !== undefined ? comment.like : false, // 默认为false
                time: commentTime.toISOString()
            };
            return processedComment;
        });
    } catch (error) {
        console.error('生成带时间戳评论失败:', error);
        return [];
    }
}


async function publishMoment() {
    const content = document.getElementById('momentPreviewContent').textContent;
    const imageElement = document.getElementById('momentPreviewImage');
    const imageUrl = imageElement.style.display === 'block' ? imageElement.src : null;
    if (!content) {
        showToast('请先生成朋友圈内容');
        return;
    }
    const publishBtn = document.getElementById('publishMomentBtn');
    publishBtn.disabled = true;
    publishBtn.textContent = '发布中...';
    try {
        // 使用当前时间生成评论（就像论坛一样）
        const comments = await generateAICommentsWithCurrentTime(content);
        const moment = { id: Date.now().toString(), authorName: currentContact.name, authorAvatar: currentContact.avatar, content, image: imageUrl, time: new Date().toISOString(), likes: 0, comments };
        moments.unshift(moment);
        await saveDataToDB(); // 使用IndexedDB保存
        await renderMomentsList();
        closeModal('generateMomentModal');
        showToast('朋友圈发布成功');
    } catch (error) {
        console.error('发布朋友圈失败:', error);
        showToast('发布失败: ' + error.message);
    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = '发布';
    }
}

async function renderMomentsList() {
    const momentsEmpty = document.getElementById('momentsEmpty');
    const momentsList = document.getElementById('momentsList');
    if (moments.length === 0) { 
        momentsEmpty.style.display = 'block';
        momentsList.style.display = 'none';
    } else {
        momentsEmpty.style.display = 'none';
        momentsList.style.display = 'block';
        momentsList.innerHTML = '';
        
        // 按时间排序，从新到旧（最新的在前面）
        const sortedMoments = [...moments].sort((a, b) => {
            return new Date(b.time) - new Date(a.time);
        });
        
        for (const moment of sortedMoments) {
            const momentDiv = document.createElement('div');
            momentDiv.className = 'moment-item';
            
            // 处理作者头像 - 支持新的文件系统格式
            let avatarContent = '';
            const author = window.contacts ? window.contacts.find(c => c.name === moment.authorName) : null;
            
            try {
                if (author) {
                    // 使用getAvatarHTML获取联系人头像
                    const avatarHTML = await getAvatarHTML(author, 'contact', '');
                    if (avatarHTML.includes('<img')) {
                        const srcMatch = avatarHTML.match(/src="([^"]+)"/);
                        if (srcMatch) {
                            avatarContent = `<img src="${srcMatch[1]}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
                        }
                    }
                } else if (moment.authorName === userProfile.name) {
                    // 如果是当前用户的动态，使用getAvatarHTML获取用户头像
                    const avatarHTML = await getAvatarHTML(userProfile, 'user', '');
                    if (avatarHTML.includes('<img')) {
                        const srcMatch = avatarHTML.match(/src="([^"]+)"/);
                        if (srcMatch) {
                            avatarContent = `<img src="${srcMatch[1]}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
                        }
                    }
                }
                
                // 如果没有头像或头像获取失败，使用文字头像
                if (!avatarContent) {
                    avatarContent = `<div style="width: 40px; height: 40px; border-radius: 6px; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #333;">${moment.authorName.charAt(0)}</div>`;
                }
            } catch (error) {
                console.warn('获取朋友圈头像失败，使用回退逻辑:', error);
                // 回退到旧的逻辑
                if (author && author.avatar) {
                    avatarContent = `<img src="${author.avatar}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
                } else if (moment.authorName === userProfile.name && userProfile.avatar) {
                    avatarContent = `<img src="${userProfile.avatar}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
                } else {
                    avatarContent = `<div style="width: 40px; height: 40px; border-radius: 6px; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #333;">${moment.authorName.charAt(0)}</div>`;
                }
            }
            
            // 处理图片内容 - 支持多图片和文件系统
            let imageContent = '';
            
            // 新的文件系统存储方式
            if (moment.imageFileIds && moment.imageCount > 0 && window.ImageStorageAPI) {
                try {
                    await window.ImageStorageAPI.init();
                    const imageUrls = await window.ImageStorageAPI.getMomentImagesURLs(moment.id, moment.imageCount);
                    if (imageUrls.length > 0) {
                        const gridClass = `grid-${imageUrls.length}`;
                        imageContent = `<div class="moment-images-grid ${gridClass}">`;
                        imageUrls.forEach((imageSrc, imageIndex) => {
                            imageContent += `<div class="moment-image-container">
                                               <img src="${imageSrc}" class="moment-grid-image" onclick="viewImage('${imageSrc}')" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="图片${imageIndex + 1}">
                                               <div class="moment-image-error" style="display: none;">
                                                   <div class="image-error-icon">📷</div>
                                                   <div class="image-error-text">图片加载失败</div>
                                               </div>
                                             </div>`;
                        });
                        imageContent += '</div>';
                    }
                } catch (error) {
                    console.error('加载朋友圈图片失败:', error);
                }
            }
            // 兼容旧数据结构
            else {
                const images = moment.images || (moment.image ? [moment.image] : []);
                if (images.length > 0) {
                    const gridClass = `grid-${images.length}`;
                    imageContent = `<div class="moment-images-grid ${gridClass}">`;
                    images.forEach((imageSrc, imageIndex) => {
                        imageContent += `<div class="moment-image-container">
                                           <img src="${imageSrc}" class="moment-grid-image" onclick="viewImage('${imageSrc}')" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="图片${imageIndex + 1}">
                                           <div class="moment-image-error" style="display: none;">
                                               <div class="image-error-icon">📷</div>
                                               <div class="image-error-text">图片加载失败</div>
                                           </div>
                                         </div>`;
                    });
                    imageContent += '</div>';
                }
            }
            
            // 处理评论内容 - 发现页面保持简洁样式
            let commentsContent = '';
            if (moment.comments && moment.comments.length > 0) {
                const commentsList = moment.comments
                    .filter(comment => comment.content && comment.content.trim())
                    .map(comment => {
                        const safeContent = comment.content.replace(/'/g, '&#39;');
                        return `<div onclick="showMomentReplyToComment('${moment.id}', '${comment.author}')" style="font-size: 13px; color: #576b95; margin-bottom: 4px; cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='transparent'">
                            <span onclick="event.stopPropagation(); handleCommentAuthorClick('${comment.author}')" style="cursor: pointer; color: #576b95; font-weight: bold;">${comment.author}:</span>
                            <span style="color: #333; margin-left: 4px;">${safeContent}</span>
                        </div>`;
                    }).join('');
                commentsContent = `<div style="margin-top: 10px; padding-top: 10px; border-top: 0.5px solid #eee;">${commentsList}</div>`;
            }
            
            // 处理点赞信息
            const likes = moment.likes || [];
            let likedUsers = [];
            
            // 获取点赞用户列表（包括独立点赞和评论点赞）
            if (likes.length > 0) {
                likedUsers = [...likes];
            }
            
            if (moment.comments && moment.comments.length > 0) {
                const commentLikedUsers = moment.comments
                    .filter(comment => comment.like === true)
                    .map(comment => comment.author)
                    .filter(author => !likedUsers.includes(author)); // 避免重复
                
                likedUsers = [...likedUsers, ...commentLikedUsers];
            }
            
            const likesContent = likedUsers.length > 0 ? 
                `<div style="font-size: 13px; color: #576b95; margin-bottom: 4px;">❤️ ${likedUsers.join(', ')}</div>` : '';
            
            // 显示名称 - 如果是当前用户，使用最新的用户名
            const isCurrentUser = moment.authorName === userProfile.name;
            const displayName = isCurrentUser ? userProfile.name : moment.authorName;
            
            // 三点菜单按钮
            const menuButton = `<div class="moment-menu-btn" onclick="event.stopPropagation(); toggleMomentMenu('${moment.id}')" title="更多选项">⋯</div>`;
            
            // 菜单内容
            const menuContent = `
                <div class="moment-menu" id="momentMenu-${moment.id}" style="display: none;">
                    <div class="moment-menu-item" onclick="event.stopPropagation(); deleteMoment('${moment.id}')">删除</div>
                    <div class="moment-menu-item" onclick="event.stopPropagation(); regenerateComments('${moment.id}')">重新生成评论</div>
                </div>
            `;
            
            // 创建点击头像的事件处理函数
            const avatarClickHandler = `onclick="handleMomentAvatarClick('${moment.authorName.replace(/'/g, "\\'")}')"`;
            
            // 添加折叠菜单
            const actionsMenu = `
                <div class="moment-actions-container">
                    <button class="moment-collapse-btn" onclick="toggleMomentActions('${moment.id}')">❤/💬</button>
                    <div class="moment-actions-menu" id="momentActions-${moment.id}">
                        <button class="moment-action-btn" onclick="likeMoment('${moment.id}')" title="点赞">❤</button>
                        <button class="moment-action-btn" onclick="showMomentComment('${moment.id}')" title="评论">💬</button>
                    </div>
                </div>
            `;
            
            momentDiv.innerHTML = `
                <div class="moment-header" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
                    <div ${avatarClickHandler} style="cursor: pointer; margin-right: 12px; flex-shrink: 0;">${avatarContent}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div class="moment-name" style="font-weight: 600; color: #576b95; font-size: 16px; line-height: 1.2; margin: 0;">${displayName}</div>
                    </div>
                    <div style="margin-left: auto;">
                        ${menuButton}
                        ${menuContent}
                    </div>
                </div>
                <div class="moment-content">${moment.content}</div>
                ${imageContent}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0px;">
                    <div class="moment-time" style="font-size: 12px; color: #999;">${formatContactListTime(moment.time)}</div>
                    ${actionsMenu}
                </div>
                ${likesContent}
                ${commentsContent}
                <div class="moment-reply-input-container" id="momentMainReply-${moment.id}">
                    <textarea class="moment-reply-input" placeholder="写评论..."></textarea>
                    <div class="moment-reply-actions">
                        <button class="moment-reply-btn moment-reply-cancel" onclick="hideMomentComment('${moment.id}')">取消</button>
                        <button class="moment-reply-btn moment-reply-submit" onclick="submitMomentComment('${moment.id}')">发送</button>
                    </div>
                </div>
            `;
            momentsList.appendChild(momentDiv);
        }
    }
}

// 图片查看功能
function viewImage(imageSrc) {
    // 创建全屏图片查看器
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.9); z-index: 10000; 
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain;';
    
    overlay.appendChild(img);
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
}


// 删除朋友圈
async function deleteMoment(momentId) {
    showConfirmDialog('删除确认', '确定要删除这条朋友圈吗？', async () => {
        try {
            // 从数组中删除
            const momentIndex = moments.findIndex(m => m.id === momentId);
            if (momentIndex !== -1) {
                moments.splice(momentIndex, 1);
                await saveDataToDB();
                await renderMomentsList();
                showToast('朋友圈已删除');
            } else {
                showToast('未找到要删除的朋友圈');
            }
        } catch (error) {
            console.error('删除朋友圈失败:', error);
            showToast('删除失败: ' + error.message);
        }
    });
}

// --- 音乐播放器 (懒加载) ---
function lazyInitMusicPlayer() {
    // 确保只初始化一次
    if (isMusicPlayerInitialized) return;
    isMusicPlayerInitialized = true;

    initMusicPlayer();
}

async function initMusicPlayer() {
    try {
        // DB已经由init()打开，这里不需要再次打开
        await loadPlaylistFromDB();
    } catch (error) {
        console.error("Failed to initialize music player:", error);
        showToast("无法加载音乐库");
    }

    document.getElementById('closeMusicModal').addEventListener('click', closeMusicModal);
    document.getElementById('progressBar').addEventListener('click', seekMusic);
    window.addEventListener('click', (event) => { if (event.target === document.getElementById('musicModal')) closeMusicModal(); });
    
    audio = new Audio();
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', onSongEnded);
    audio.addEventListener('loadedmetadata', onMetadataLoaded);
}

async function loadPlaylistFromDB() {
    return new Promise((resolve, reject) => {
        if (!isIndexedDBReady) { // 确保DB已准备好
            reject('IndexedDB not ready');
            return;
        }
        const transaction = db.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        const request = store.getAll();

        request.onsuccess = () => {
            playlist = request.result.map(song => ({
                id: song.id,
                name: song.name,
                lyrics: song.lyrics,
            }));
            renderPlaylist();
            resolve();
        };

        request.onerror = (event) => {
            console.error('Failed to load playlist from DB:', event.target.error);
            reject('Failed to load playlist');
        };
    });
}

async function saveSong() {
    const nameInput = document.getElementById('songName');
    const musicFileInput = document.getElementById('musicFileUpload');
    const lrcFileInput = document.getElementById('lrcFile');

    const musicFile = musicFileInput.files[0];
    const lrcFile = lrcFileInput.files[0];

    if (!musicFile) {
        showToast('请选择一个音乐文件');
        return;
    }

    const songName = nameInput.value.trim() || musicFile.name.replace(/\.[^/.]+$/, "");

    let lyrics = [];
    if (lrcFile) {
        try {
            const lrcText = await lrcFile.text();
            lyrics = parseLRC(lrcText);
        } catch (e) {
            showToast('歌词文件读取失败，将不带歌词保存。');
        }
    }
    
    const songRecord = {
        name: songName,
        music: musicFile, 
        lyrics: lyrics
    };

    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法保存歌曲。');
        return;
    }

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const request = store.add(songRecord);

    request.onsuccess = async () => {
        showToast(`歌曲 "${songName}" 已成功保存到本地`);
        clearAddForm();
        await loadPlaylistFromDB(); 
    };

    request.onerror = (event) => {
        console.error('Failed to save song to DB:', event.target.error);
        showToast('保存歌曲失败');
    };
}

async function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    
    const songInfo = playlist[index];
    currentSongIndex = index;

    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }

    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法播放歌曲。');
        return;
    }

    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const request = store.get(songInfo.id);

    request.onsuccess = (event) => {
        const songRecord = event.target.result;
        if (songRecord && songRecord.music) {
            currentObjectUrl = URL.createObjectURL(songRecord.music);
            audio.src = currentObjectUrl;
            audio.play().then(() => {
                isPlaying = true;
                updatePlayButton();
                document.getElementById('currentSongInfo').style.display = 'block';
                document.getElementById('currentSongName').textContent = songRecord.name;
                currentLyrics = songRecord.lyrics || [];
                currentLyricIndex = -1;
                if (currentLyrics.length > 0) startLyricSync();
                else document.getElementById('currentLyric').textContent = '暂无歌词';
                renderPlaylist();
            }).catch(error => showToast('播放失败: ' + error.message));
        } else {
            showToast('无法从数据库中找到歌曲文件');
        }
    };

    request.onerror = (event) => {
        console.error("Error fetching song from DB:", event.target.error);
        showToast('播放歌曲时出错');
    };
}

async function deleteSong(index) {
    showConfirmDialog('删除确认', '确定要永久删除这首歌吗？', async () => {
        const songInfo = playlist[index];
        
        if (!isIndexedDBReady) {
            showToast('数据库未准备好，无法删除歌曲。');
            return;
        }

        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        const request = store.delete(songInfo.id);

        request.onsuccess = async () => {
            showToast(`歌曲 "${songInfo.name}" 已删除`);
            if (index === currentSongIndex) {
                stopMusic();
                currentSongIndex = -1;
                document.getElementById('currentSongInfo').style.display = 'none';
            }
            await loadPlaylistFromDB();
        };

        request.onerror = (event) => {
            console.error('Failed to delete song from DB:', event.target.error);
            showToast('删除歌曲失败');
        };
    });
}

function showMusicModal() {
    lazyInitMusicPlayer(); // 第一次点击时才初始化
    document.getElementById('musicModal').style.display = 'block';
    renderPlaylist();
}

function closeMusicModal() {
    document.getElementById('musicModal').style.display = 'none';
}

function renderPlaylist() {
    const container = document.getElementById('playlistContainer');
    if (!playlist || playlist.length === 0) { 
        container.innerHTML = '<p style="text-align: center; color: #999;">暂无歌曲，请从下方上传</p>'; 
        return; 
    }
    container.innerHTML = '';
    playlist.forEach((song, index) => {
        const songDiv = document.createElement('div');
        songDiv.className = 'song-item';
        if (index === currentSongIndex) songDiv.classList.add('active');
        songDiv.innerHTML = `<span onclick="playSong(${index})" style="flex: 1;">${song.name}</span><span class="delete-song" onclick="deleteSong(${index})">×</span>`;
        container.appendChild(songDiv);
    });
}

function parseLRC(lrcContent) {
    const lines = lrcContent.split(/\r?\n/);
    const lyrics = [];
    const timeRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    lines.forEach(line => {
        if (!line.trim()) return;
        let match;
        let lastIndex = 0;
        const times = [];
        while ((match = timeRegex.exec(line)) !== null) {
            const totalSeconds = parseInt(match[1]) * 60 + parseInt(match[2]) + (match[3] ? parseInt(match[3].padEnd(3, '0')) / 1000 : 0);
            times.push(totalSeconds);
            lastIndex = match.index + match[0].length;
        }
        if (times.length > 0) {
            const text = line.substring(lastIndex).trim();
            if (text) times.forEach(time => lyrics.push({ time, text }));
        }
    });
    lyrics.sort((a, b) => a.time - b.time);
    return lyrics;
}

function startLyricSync() {
    stopLyricSync();
    lyricTimer = setInterval(() => { if (!audio.paused && currentLyrics.length > 0) updateLyrics(); }, 100);
}

function stopLyricSync() {
    if (lyricTimer) clearInterval(lyricTimer);
    lyricTimer = null;
}

function updateLyrics() {
    const currentTime = audio.currentTime;
    let newIndex = -1;
    for (let i = currentLyrics.length - 1; i >= 0; i--) {
        if (currentTime >= currentLyrics[i].time) { newIndex = i; break; }
    }
    if (newIndex !== currentLyricIndex && newIndex >= 0) {
        currentLyricIndex = newIndex;
        const lyricText = currentLyrics[newIndex].text;
        document.getElementById('currentLyric').textContent = lyricText;
        sendLyricToAI(lyricText);
    }
}

function sendLyricToAI(lyricText) {
    if (currentSongIndex > -1) {
         window.currentMusicInfo = { songName: playlist[currentSongIndex]?.name || '', lyric: lyricText, isPlaying };
    }
}

function togglePlay() {
    if (audio.src) {
        if (audio.paused) { audio.play(); isPlaying = true; startLyricSync(); }
        else { audio.pause(); isPlaying = false; stopLyricSync(); }
        updatePlayButton();
    }
}

function stopMusic() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    currentLyricIndex = -1;
    stopLyricSync();
    updatePlayButton();
    document.getElementById('currentLyric').textContent = '等待歌词...';
    window.currentMusicInfo = null;
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
}

function updatePlayButton() {
    document.getElementById('playPauseBtn').textContent = isPlaying ? '⏸️ 暂停' : '▶️ 播放';
}

function updateProgress() {
    if (audio.duration) {
        document.getElementById('progressFill').style.width = (audio.currentTime / audio.duration) * 100 + '%';
        document.getElementById('currentTime').textContent = formatMusicTime(audio.currentTime);
    }
}

function onMetadataLoaded() {
    document.getElementById('totalTime').textContent = formatMusicTime(audio.duration);
}

function onSongEnded() {
    isPlaying = false;
    updatePlayButton();
    stopLyricSync();
    window.currentMusicInfo = null;
}

function seekMusic(event) {
    if (audio.duration) {
        const rect = event.currentTarget.getBoundingClientRect();
        audio.currentTime = ((event.clientX - rect.left) / rect.width) * audio.duration;
    }
}

function toggleLyricsDisplay() {
    document.getElementById('floatingLyrics').style.display = document.getElementById('showLyrics').checked ? 'block' : 'none';
}

function clearAddForm() {
    document.getElementById('songName').value = '';
    document.getElementById('musicFileUpload').value = '';
    document.getElementById('lrcFile').value = '';
}

function formatMusicTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffInSeconds = (now - postTime) / 1000;
    const diffInMinutes = diffInSeconds / 60;
    const diffInHours = diffInMinutes / 60;

    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfPostTime = new Date(postTime.getFullYear(), postTime.getMonth(), postTime.getDate());
    const diffInDays = (startOfNow - startOfPostTime) / (1000 * 60 * 60 * 24);

    if (diffInDays < 1) { // Today
        if (diffInMinutes < 1) return "刚刚";
        if (diffInMinutes < 60) return `${Math.floor(diffInMinutes)}分钟前`;
        return `${Math.floor(diffInHours)}小时前`;
    } else if (diffInDays < 2) { // Yesterday
        return "1天前";
    } else { // 2 days ago or more
        const isThisYear = now.getFullYear() === postTime.getFullYear();
        const month = (postTime.getMonth() + 1).toString().padStart(2, '0');
        const day = postTime.getDate().toString().padStart(2, '0');
        if (isThisYear) {
            const hours = postTime.getHours().toString().padStart(2, '0');
            const minutes = postTime.getMinutes().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        } else {
            return `${postTime.getFullYear()}-${month}-${day}`;
        }
    }
}

// --- UI 更新 & 交互 ---
function updateContextIndicator() {
    const indicator = document.getElementById('contextIndicator');
    if (indicator) indicator.innerHTML = `上下文: ${apiSettings.contextMessageCount}条`;
}

function updateContextValue(value) {
    document.getElementById('contextValue').textContent = value + '条';
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast元素不存在');
        return;
    }
    
    toast.textContent = message;
    
    // 移除之前的类型类
    toast.classList.remove('toast-error', 'toast-success', 'toast-warning', 'toast-info');
    
    // 添加新的类型类
    switch(type) {
        case 'error':
            toast.classList.add('toast-error');
            duration = Math.max(duration, 4000); // 错误消息显示时间稍长
            break;
        case 'success':
            toast.classList.add('toast-success');
            break;
        case 'warning':
            toast.classList.add('toast-warning');
            break;
        default:
            toast.classList.add('toast-info');
            break;
    }
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// 专门用于显示上传错误的函数
function showUploadError(error) {
    if (error && error.name === 'DetailedError') {
        // 根据错误代码显示不同类型的toast
        switch(error.code) {
            case 'FILE_MISSING':
            case 'PARAM_MISSING':
                showToast(error.message, 'warning');
                break;
            case 'FILE_TOO_LARGE':
            case 'INVALID_FILE_TYPE':
                showToast(error.message, 'error');
                break;
            case 'STORAGE_FULL':
                showToast(error.message, 'error', 5000); // 存储满显示更久
                break;
            case 'DATABASE_ERROR':
                showToast(error.message, 'error');
                break;
            case 'SYSTEM_ERROR':
                showToast(error.message, 'warning');
                break;
            default:
                showToast(error.message, 'error');
                break;
        }
    } else {
        showToast(`上传失败: ${error.message || '未知错误'}`, 'error');
    }
}

// 处理API错误的专用函数，自动检测空回复并设置合适的显示时长
function showApiError(prefix, error) {
    const errorMessage = error.message || '未知错误';
    const isEmptyResponse = errorMessage.includes('空回');
    const duration = isEmptyResponse ? 6000 : 2000;
    showToast(`${prefix}: ${errorMessage}`, duration);
}

// === 表情图片管理函数 ===
async function renderEmojiContent(emojiContent, isInline = false) {
    // 处理新格式 [emoji:tag]
    if (emojiContent.startsWith('[emoji:') && emojiContent.endsWith(']')) {
        const tag = emojiContent.slice(7, -1);
        const imageData = await getEmojiImage(tag);
        if (imageData) {
            const style = isInline ? 'max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;' : '';
            const className = isInline ? '' : 'class="message-emoji"';
            return `<img src="${imageData}" ${className} style="${style}">`;
        } else {
            // 如果找不到图片，显示标签
            return `[表情:${tag}]`;
        }
    }
    
    // 处理旧格式的base64或URL
    if (emojiContent.startsWith('data:image/') || emojiContent.startsWith('http')) {
        const style = isInline ? 'max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;' : '';
        const className = isInline ? '' : 'class="message-emoji"';
        return `<img src="${emojiContent}" ${className} style="${style}">`;
    }
    
    return emojiContent; // 返回原内容
}

// 删除AI回复中的思维链标签
function removeThinkingChain(text) {
    // 删除 <think> ... </think> 标签及其内容
    return text.replace(/<think\s*>[\s\S]*?<\/think\s*>/gi, '').trim();
}

async function processTextWithInlineEmojis(textContent) {
    const emojiTagRegex = /\[(?:emoji|发送了表情)[:：]([^\]]+)\]/g;
    const standaloneEmojiMatch = textContent.trim().match(/^\[(?:emoji|发送了表情)[:：]([^\]]+)\]$/);
    
    if (standaloneEmojiMatch) {
        // 处理独立表情消息
        const emojiName = standaloneEmojiMatch[1];
        const foundEmoji = emojis.find(e => e.tag === emojiName || e.meaning === emojiName);
        if (foundEmoji && foundEmoji.tag) {
            return await renderEmojiContent(`[emoji:${foundEmoji.tag}]`);
        } else if (foundEmoji && foundEmoji.url) {
            // 旧格式兼容
            return `<img src="${foundEmoji.url}" class="message-emoji">`;
        } else {
            return `<div class="message-content">${textContent}</div>`;
        }
    } else {
        // 处理包含内联表情的文本
        let processedContent = textContent.replace(/\n/g, '<br>');
        
        // 使用异步替换处理内联表情
        const emojiMatches = [...processedContent.matchAll(emojiTagRegex)];
        for (const match of emojiMatches) {
            const fullMatch = match[0];
            const emojiName = match[1];
            const foundEmoji = emojis.find(e => e.tag === emojiName || e.meaning === emojiName);
            
            let replacement = fullMatch; // 默认保持原样
            if (foundEmoji && foundEmoji.tag) {
                const emojiHtml = await renderEmojiContent(`[emoji:${foundEmoji.tag}]`, true);
                replacement = emojiHtml;
            } else if (foundEmoji && foundEmoji.url) {
                // 旧格式兼容
                replacement = `<img src="${foundEmoji.url}" style="max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;">`;
            }
            
            processedContent = processedContent.replace(fullMatch, replacement);
        }
        
        return `<div class="message-content">${processedContent}</div>`;
    }
}
async function saveEmojiImage(tag, base64Data) {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法保存表情图片。');
        return;
    }
    
    // 如果 emojiImages 存储不存在，提示用户刷新页面
    if (!db.objectStoreNames.contains('emojiImages')) {
        console.log('检测到 emojiImages 存储不存在，需要升级数据库');
        if (typeof showToast === 'function') {
            showToast('检测到数据库需要升级，请刷新页面');
        }
        return;
    }
    
    try {
        const transaction = db.transaction(['emojiImages'], 'readwrite');
        const store = transaction.objectStore('emojiImages');
        await promisifyRequest(store.put({ tag: tag, data: base64Data }));
    } catch (error) {
        console.error('保存表情图片失败:', error);
        throw error;
    }
}

async function getEmojiImage(tag) {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法获取表情图片。');
        return null;
    }
    
    try {
        // 首先尝试从新的文件存储系统获取
        if (window.ImageStorageAPI) {
            try {
                await window.ImageStorageAPI.init();
                const url = await window.ImageStorageAPI.getEmojiURL(tag);
                if (url) {
                    return url;
                }
            } catch (error) {
                console.warn('从新文件存储获取表情失败，回退到旧系统:', error);
            }
        }
        
        // 回退到旧的 emojiImages 存储
        if (!db.objectStoreNames.contains('emojiImages')) {
            console.log('检测到 emojiImages 存储不存在，需要升级数据库');
            if (typeof showToast === 'function') {
                showToast('检测到数据库需要升级，请刷新页面');
            }
            return null;
        }
        
        const transaction = db.transaction(['emojiImages'], 'readonly');
        const store = transaction.objectStore('emojiImages');
        const result = await promisifyRequest(store.get(tag));
        return result ? result.data : null;
        
    } catch (error) {
        console.error('获取表情图片失败:', error);
        return null;
    }
}

async function deleteEmojiImage(tag) {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法删除表情图片。');
        return;
    }
    
    // 如果 emojiImages 存储不存在，提示用户刷新页面
    if (!db.objectStoreNames.contains('emojiImages')) {
        console.log('检测到 emojiImages 存储不存在，需要升级数据库');
        if (typeof showToast === 'function') {
            showToast('检测到数据库需要升级，请刷新页面');
        }
        return;
    }
    
    try {
        const transaction = db.transaction(['emojiImages'], 'readwrite');
        const store = transaction.objectStore('emojiImages');
        await promisifyRequest(store.delete(tag));
    } catch (error) {
        console.error('删除表情图片失败:', error);
        throw error;
    }
}


// 数据库优化函数：将现有base64表情转换为标签格式
async function optimizeEmojiDatabase() {
    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法执行优化');
        return;
    }
    
    try {
        showToast('开始优化数据库...');
        let optimizedCount = 0;
        let processedContacts = 0;
        
        // 处理所有联系人的消息
        for (const contact of contacts) {
            let contactModified = false;
            
            for (const message of contact.messages) {
                // 查找包含base64图片的消息
                if (message.content && typeof message.content === 'string') {
                    const base64Regex = /data:image\/[^,\s]+,[A-Za-z0-9+/=]+/g;
                    const matches = message.content.match(base64Regex);
                    
                    if (matches) {
                        let newContent = message.content;
                        
                        for (const base64Url of matches) {
                            // 查找对应的表情
                            const emoji = emojis.find(e => e.url === base64Url || (e.url && e.url === base64Url));
                            if (emoji && emoji.meaning) {
                                // 如果还没有保存过这个表情的图片，保存到emojiImages
                                const existingImage = await getEmojiImage(emoji.meaning);
                                if (!existingImage) {
                                    await saveEmojiImage(emoji.meaning, base64Url);
                                }
                                
                                // 更新表情数据结构
                                if (!emoji.tag) {
                                    emoji.tag = emoji.meaning;
                                }
                                
                                // 替换消息中的base64为标签格式
                                newContent = newContent.replace(base64Url, `[emoji:${emoji.meaning}]`);
                                optimizedCount++;
                                contactModified = true;
                            } else {
                                // 如果找不到对应的表情，可能是独立的base64图片，创建一个临时标签
                                const tempTag = `temp_${Date.now()}`;
                                await saveEmojiImage(tempTag, base64Url);
                                newContent = newContent.replace(base64Url, `[emoji:${tempTag}]`);
                                
                                // 创建一个新的表情记录
                                emojis.push({
                                    id: Date.now().toString(),
                                    tag: tempTag,
                                    meaning: tempTag
                                });
                                optimizedCount++;
                                contactModified = true;
                            }
                        }
                        
                        // 更新消息内容
                        message.content = newContent;
                        
                        // 如果消息类型是emoji，也更新类型
                        if (message.type === 'emoji' && matches.length === 1 && newContent.trim().match(/^\[emoji:[^\]]+\]$/)) {
                            // 这是一个纯表情消息
                            message.content = newContent.trim();
                        }
                    }
                }
            }
            
            if (contactModified) {
                processedContacts++;
            }
        }
        
        // 更新表情数据结构，移除旧的url字段
        for (const emoji of emojis) {
            if (emoji.url && emoji.url.startsWith('data:image/')) {
                // 确保图片已保存到emojiImages
                if (emoji.tag || emoji.meaning) {
                    const tag = emoji.tag || emoji.meaning;
                    const existingImage = await getEmojiImage(tag);
                    if (!existingImage) {
                        await saveEmojiImage(tag, emoji.url);
                    }
                    
                    // 移除url字段
                    delete emoji.url;
                    
                    // 确保有tag字段
                    if (!emoji.tag && emoji.meaning) {
                        emoji.tag = emoji.meaning;
                    }
                }
            }
        }
        
        // 保存优化后的数据
        await saveDataToDB();
        
        showToast(`数据库优化完成！处理了 ${optimizedCount} 个表情，涉及 ${processedContacts} 个联系人`);
        
        // 刷新表情网格
        await renderEmojiGrid();
        
        // 如果当前有打开的聊天，重新渲染消息
        if (currentContact) {
            await renderMessages(true);
        }
        
    } catch (error) {
        console.error('数据库优化失败:', error);
        showToast(`优化失败: ${error.message}`);
    }
}

function showTopNotification(message) {
    const notification = document.getElementById('topNotification');
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 1500);
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
    if (modalId === 'apiSettingsModal') {
        document.getElementById('contextSlider').value = apiSettings.contextMessageCount;
        document.getElementById('contextValue').textContent = apiSettings.contextMessageCount + '条';
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (modalId === 'addContactModal') {
        editingContact = null;
        document.getElementById('contactModalTitle').textContent = '添加AI助手';
        document.getElementById('contactName').value = '';
        document.getElementById('contactAvatar').value = '';
        document.getElementById('contactPersonality').value = '';
        document.getElementById('customPrompts').value = '';
        // 重置语音ID输入框
        document.getElementById('contactVoiceId').value = '';
    }
}

function showAddContactModal() {
    editingContact = null;
    document.getElementById('contactModalTitle').textContent = '添加AI助手';
    // 清空语音ID输入框
    document.getElementById('contactVoiceId').value = '';
    showModal('addContactModal');
}

function showEditContactModal() {
    if (!currentContact) { showToast('请先选择联系人'); return; }
    editingContact = currentContact;
    document.getElementById('contactModalTitle').textContent = '编辑AI助手';
    document.getElementById('contactName').value = currentContact.name;
    document.getElementById('contactAvatar').value = currentContact.avatar || '';
    document.getElementById('contactPersonality').value = currentContact.personality;
    document.getElementById('customPrompts').value = currentContact.customPrompts || '';
    // 加载当前联系人的语音ID
    document.getElementById('contactVoiceId').value = currentContact.voiceId || '';
    showModal('addContactModal');
    toggleSettingsMenu();
}

function showApiSettingsModal() {
    // 【修改点 3】: 加载 Minimax 的设置
    document.getElementById('apiUrl').value = apiSettings.url;
    document.getElementById('apiKey').value = apiSettings.key;
    document.getElementById('apiTimeout').value = apiSettings.timeout || 60;
    // 假设你的HTML中输入框的ID是 minimaxGroupId 和 minimaxApiKey
    document.getElementById('minimaxGroupId').value = apiSettings.minimaxGroupId;
    document.getElementById('minimaxApiKey').value = apiSettings.minimaxApiKey;

    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');

    // 重置并填充
    primarySelect.innerHTML = '<option value="">请先测试连接</option>';
    secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
    
    // 如果已有设置，则自动尝试获取模型列表
    if (apiSettings.url && apiSettings.key) {
        // 临时显示已保存的选项
        if (apiSettings.model) {
            primarySelect.innerHTML = `<option value="${apiSettings.model}">${apiSettings.model}</option>`;
        }
        if (apiSettings.secondaryModel && apiSettings.secondaryModel !== 'sync_with_primary') {
             secondarySelect.innerHTML = `
                <option value="sync_with_primary">与主模型保持一致</option>
                <option value="${apiSettings.secondaryModel}">${apiSettings.secondaryModel}</option>`;
        }
        testApiConnection(); // 自动测试连接并填充列表
    }
    
    // 确保在显示模态框时绑定事件
    primarySelect.onchange = handlePrimaryModelChange;

    showModal('apiSettingsModal');
}

function showBackgroundModal() {
    // 异步包装函数
    showBackgroundModalAsync().catch(error => {
        console.error('显示背景设置界面错误:', error);
    });
}

async function showBackgroundModalAsync() {
    if (!currentContact) { showToast('请先选择联系人'); return; }
    
    // 处理背景URL显示
    let displayUrl = '';
    const backgroundUrl = backgrounds[currentContact.id];
    if (backgroundUrl) {
        if (backgroundUrl.startsWith('file:')) {
            // 如果是新的文件存储格式，显示文件存储标识
            displayUrl = '(已使用文件存储)';
        } else {
            displayUrl = backgroundUrl;
        }
    }
    
    document.getElementById('backgroundUrl').value = displayUrl;
    showModal('backgroundModal');
    toggleSettingsMenu();
}

function showAddEmojiModal() {
    showModal('addEmojiModal');
    toggleEmojiPanel(true);
}

function showRedPacketModal() {
    showModal('redPacketModal');
}

function showEditProfileModal() {
    document.getElementById('profileNameInput').value = userProfile.name;
    document.getElementById('profileAvatarInput').value = userProfile.avatar || '';
    document.getElementById('profilePersonality').value = userProfile.personality || '';
    showModal('editProfileModal');
}

function showCreateGroupModal() {
    // 异步包装函数
    showCreateGroupModalAsync().catch(error => {
        console.error('显示群聊创建界面错误:', error);
    });
}

async function showCreateGroupModalAsync() {
    const memberList = document.getElementById('groupMemberList');
    memberList.innerHTML = '';
    
    for (const contact of contacts) {
        if (contact.type !== 'group') {
            const item = document.createElement('div');
            item.className = 'group-member-item';
            
            const avatarHTML = await getAvatarHTML(contact, 'contact') || contact.name[0];
            item.innerHTML = `<div class="group-member-avatar">${avatarHTML}</div><div class="group-member-name">${contact.name}</div><div class="group-member-checkbox">✓</div>`;
            item.onclick = () => {
                item.classList.toggle('selected');
                item.querySelector('.group-member-checkbox').classList.toggle('selected');
            };
            memberList.appendChild(item);
        }
    }
    showModal('createGroupModal');
}

// --- 数据保存与处理 ---
async function saveContact(event) {
    event.preventDefault();
    const avatarValue = document.getElementById('contactAvatar').value;
    
    // 处理头像数据：如果是新的fileId格式，分别保存到avatar和avatarFileId字段
    const contactData = {
        name: document.getElementById('contactName').value,
        personality: document.getElementById('contactPersonality').value,
        customPrompts: document.getElementById('customPrompts').value,
        // 保存语音ID
        voiceId: document.getElementById('contactVoiceId').value.trim()
    };
    
    // 处理头像字段
    if (avatarValue.startsWith('file:')) {
        // 新的fileSystem格式
        contactData.avatarFileId = avatarValue.substring(5); // 移除 "file:" 前缀
        // 保留原avatar字段为空或删除，确保向后兼容
        contactData.avatar = '';
    } else {
        // 传统的URL或base64格式
        contactData.avatar = avatarValue;
        // 清除可能存在的avatarFileId
        contactData.avatarFileId = null;
    }
    if (editingContact) {
        Object.assign(editingContact, contactData);
        showToast('修改成功');
    } else {
        const contact = { id: Date.now().toString(), ...contactData, messages: [], lastMessage: '点击开始聊天', lastTime: formatContactListTime(new Date().toISOString()), type: 'private', memoryTableContent: defaultMemoryTable };
        contacts.unshift(contact);
        showToast('添加成功');
    }
    await saveDataToDB(); // 使用IndexedDB保存
    await renderContactList();
    closeModal('addContactModal');
    event.target.reset();
}

async function createGroup(event) {
    event.preventDefault();
    const groupName = document.getElementById('groupName').value;
    if (!groupName) { showToast('请输入群聊名称'); return; }
    const selectedItems = document.querySelectorAll('.group-member-item.selected');
    if (selectedItems.length < 2) { showToast('请至少选择两个成员'); return; }
    const memberIds = [];
    selectedItems.forEach(item => {
        const name = item.querySelector('.group-member-name').textContent;
        const contact = contacts.find(c => c.name === name && c.type === 'private');
        if (contact) memberIds.push(contact.id);
    });
    const group = { id: 'group_' + Date.now().toString(), name: groupName, members: memberIds, messages: [], lastMessage: '群聊已创建', lastTime: formatContactListTime(new Date().toISOString()), type: 'group', memoryTableContent: defaultMemoryTable };
    contacts.unshift(group);
    await saveDataToDB(); // 使用IndexedDB保存
    await renderContactList();
    closeModal('createGroupModal');
    showToast('群聊创建成功');
}

function importPrompts(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            document.getElementById('customPrompts').value = JSON.stringify(JSON.parse(e.target.result), null, 2);
            showToast('导入成功');
        } catch (error) {
            showToast('导入失败：文件格式错误');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function saveProfile(event) {
    event.preventDefault();
    const avatarValue = document.getElementById('profileAvatarInput').value;
    
    userProfile.name = document.getElementById('profileNameInput').value;
    userProfile.personality = document.getElementById('profilePersonality').value;
    
    // 处理头像字段
    if (avatarValue.startsWith('file:')) {
        // 新的fileSystem格式
        userProfile.avatarFileId = avatarValue.substring(5); // 移除 "file:" 前缀
        // 保留原avatar字段为空，确保向后兼容
        userProfile.avatar = '';
    } else {
        // 传统的URL或base64格式
        userProfile.avatar = avatarValue;
        // 清除可能存在的avatarFileId
        userProfile.avatarFileId = null;
    }
    
    await saveDataToDB(); // 使用IndexedDB保存
    await updateUserProfileUI();
    closeModal('editProfileModal');
    showToast('保存成功');
}

async function updateUserProfileUI() {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    userName.textContent = userProfile.name;
    
    // 使用getAvatarHTML支持文件存储
    const avatarHTML = await getAvatarHTML(userProfile, 'user');
    userAvatar.innerHTML = avatarHTML || (userProfile.name[0] || '我');
}

async function renderContactList() {
    const contactList = document.getElementById('contactList');
    contactList.innerHTML = '';
    
    for (const contact of contacts) {
        const item = document.createElement('div');
        item.className = 'contact-item';
        
        if (contact.type === 'group') {
            const groupAvatarContent = await getGroupAvatarContent(contact);
            item.innerHTML = `<div class="group-avatar"><div class="group-avatar-inner">${groupAvatarContent}</div></div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${contact.lastTime}</div>`;
        } else {
            // 使用异步版本支持文件存储
            const avatarHTML = await getAvatarHTML(contact, 'contact');
            item.innerHTML = `<div class="contact-avatar">${avatarHTML || contact.name[0]}</div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${contact.lastTime}</div>`;
        }
        item.onclick = () => openChat(contact);

        // 添加长按事件监听器来删除联系人/群聊
        let pressTimer;
        item.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                showConfirmDialog('删除确认', `确定要删除 "${contact.name}" 吗？此操作不可撤销。`, () => {
                    deleteContact(contact.id);
                });
            }, 700); // 长按700毫秒触发
        });
        item.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        item.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });
        // 对于非触摸设备，也可以添加右键菜单
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showConfirmDialog('删除确认', `确定要删除 "${contact.name}" 吗？此操作不可撤销。`, () => {
                deleteContact(contact.id);
            });
        });

        contactList.appendChild(item);
    }
}

async function getGroupAvatarContent(group) {
    const memberAvatars = group.members.slice(0, 4).map(id => contacts.find(c => c.id === id)).filter(Boolean);
    let avatarContent = '';
    
    for (let i = 0; i < 4; i++) {
        if (i < memberAvatars.length) {
            const member = memberAvatars[i];
            const avatarHTML = await getAvatarHTML(member, 'contact');
            avatarContent += `<div class="group-avatar-item">${avatarHTML || member.name[0]}</div>`;
        } else {
            avatarContent += `<div class="group-avatar-item"></div>`;
        }
    }
    return avatarContent;
}

// --- 聊天核心逻辑 ---
async function openChat(contact) {
    currentContact = contact;
    window.currentContact = contact;
    window.memoryTableManager.setCurrentContact(contact);
    document.getElementById('chatTitle').textContent = contact.name;
    showPage('chatPage');
    
    // 重置消息加载状态
    currentlyDisplayedMessageCount = 0; 
    
    // 检查并加载最新的气泡样式（每次进入聊天都检查）
    await loadCustomBubbleStyle();
    
    await renderMessages(true); // 初始加载
    
    updateContextIndicator();
    const chatMessagesEl = document.getElementById('chatMessages');
    // 处理背景图片 - 支持新的文件存储系统
    if (backgrounds[contact.id]) {
        const backgroundUrl = backgrounds[contact.id];
        if (backgroundUrl.startsWith('file:')) {
            // 新的文件存储格式: file:fileId
            const fileId = backgroundUrl.substring(5); // 移除 'file:' 前缀
            if (window.ImageStorageAPI) {
                try {
                    await window.ImageStorageAPI.init();
                    const url = await window.ImageStorageAPI.getBackgroundURL(contact.id);
                    chatMessagesEl.style.backgroundImage = `url(${url})`;
                } catch (error) {
                    console.warn('获取背景图片失败:', error);
                    chatMessagesEl.style.backgroundImage = 'none';
                }
            } else {
                chatMessagesEl.style.backgroundImage = 'none';
            }
        } else {
            // 旧格式 - 直接使用URL
            chatMessagesEl.style.backgroundImage = `url(${backgroundUrl})`;
        }
    } else {
        chatMessagesEl.style.backgroundImage = 'none';
    }
    
    // 移除旧的监听器
    chatMessagesEl.onscroll = null; 
    // 添加新的滚动监听器
    chatMessagesEl.onscroll = () => {
        if (chatMessagesEl.scrollTop === 0 && !isLoadingMoreMessages && currentContact.messages.length > currentlyDisplayedMessageCount) {
            loadMoreMessages();
        }
    };

    toggleMemoryPanel(true);
}

function closeChatPage() {
    showPage('contactListPage');
    
    // 清理工作
    const chatMessagesEl = document.getElementById('chatMessages');
    chatMessagesEl.onscroll = null; // 移除监听器
    currentContact = null;
    window.currentContact = null;
    toggleEmojiPanel(true);
    toggleSettingsMenu(true);
    toggleMemoryPanel(true);
}

async function renderMessages(isInitialLoad = false, hasNewMessage = false) {
    if (!currentContact) return;
    const chatMessages = document.getElementById('chatMessages');
    const allMessages = currentContact.messages;

    if (isInitialLoad) {
        currentlyDisplayedMessageCount = Math.min(allMessages.length, MESSAGES_PER_PAGE);
    }
    const messagesToRender = allMessages.slice(allMessages.length - currentlyDisplayedMessageCount);

    const oldScrollHeight = chatMessages.scrollHeight;
    
    chatMessages.innerHTML = '';

    if (allMessages.length > currentlyDisplayedMessageCount) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.className = 'load-more-messages';
        loadMoreDiv.textContent = '加载更早的消息...';
        loadMoreDiv.onclick = loadMoreMessages;
        chatMessages.appendChild(loadMoreDiv);
    }
    
    if (currentContact.type === 'group') {
        const hint = document.createElement('div');
        hint.className = 'group-info-hint';
        hint.textContent = `群聊成员: ${getGroupMembersText()}`;
        chatMessages.appendChild(hint);
    }

    let lastTimestamp = null;
    for (const [index, msg] of messagesToRender.entries()) {
        const originalIndex = allMessages.length - currentlyDisplayedMessageCount + index;
        const currentMsgTime = new Date(msg.time);

        if (!lastTimestamp || currentMsgTime - lastTimestamp > 5 * 60 * 1000) {
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'message-timestamp';
            timestampDiv.textContent = formatChatTimestamp(msg.time);
            chatMessages.appendChild(timestampDiv);
            lastTimestamp = currentMsgTime;
        }

        const msgDiv = document.createElement('div');
        if (msg.role === 'system') continue;
        
        const isLastMessage = index === messagesToRender.length - 1;
        const isNewMsg = hasNewMessage && isLastMessage;
        msgDiv.className = `message ${msg.role === 'user' ? 'sent' : 'received'}${isNewMsg ? ' new-message' : ''}`;
        msgDiv.dataset.messageIndex = originalIndex;

        let contentHtml = '';
        if (msg.type === 'emoji') {
            contentHtml = await renderEmojiContent(msg.content);
        } else if (msg.type === 'red_packet') {
            const packet = JSON.parse(msg.content);
            contentHtml = `<div class="message-content red-packet" onclick="showToast('红包金额: ${packet.amount}')"><div class="red-packet-body"><svg class="red-packet-icon" viewBox="0 0 1024 1024"><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32zM731.2 565.2H603.9c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8zM419.8 565.2H292.5c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8z" fill="#FEFEFE"></path><path d="M872.4 240H151.6c-17.7 0-32 14.3-32 32v64h784v-64c0-17.7-14.3-32-32-32z" fill="#FCD4B3"></path><path d="M512 432c-48.6 0-88 39.4-88 88s39.4 88 88 88 88-39.4 88-88-39.4-88-88-88z m0 152c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64-64z" fill="#FCD4B3"></path><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32z m-32 552H215.6V368h624.8v488z" fill="#F37666"></path><path d="M512 128c-112.5 0-204 91.5-204 204s91.5 204 204 204 204-91.5 204-204-91.5-204-204-204z m0 384c-99.4 0-180-80.6-180-180s80.6-180 180-180 180 80.6 180 180-80.6 180-180 180z" fill="#F37666"></path><path d="M512 456c-35.3 0-64 28.7-64 64s28.7 64 64 64 64 28.7 64 64-28.7-64-64-64z m16.4 76.4c-2.3 2.3-5.4 3.6-8.5 3.6h-15.8c-3.1 0-6.2-1.3-8.5-3.6s-3.6-5.4-3.6-8.5v-27.8c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12v27.8c0.1 3.1-1.2 6.2-3.5 8.5z" fill="#F37666"></path></svg><div class="red-packet-text"><div>${packet.message || '恭喜发财，大吉大利！'}</div><div>领取红包</div></div></div><div class="red-packet-footer">AI红包</div></div>`;
        } else {
            contentHtml = await processTextWithInlineEmojis(msg.content);
        }


        let avatarContent = '';
        if (msg.role === 'user') {
            avatarContent = await getAvatarHTML(userProfile, 'user') || (userProfile.name[0] || '我');
        } else {
            const sender = contacts.find(c => c.id === msg.senderId);
            if (sender) {
                avatarContent = await getAvatarHTML(sender, 'contact') || sender.name[0];
            } else {
                avatarContent = '?';
            }
        }

        // 检查是否有自定义气泡样式（根据消息角色选择不同样式）
        let bubbleHtml = '';
        const currentBubbleStyle = msg.role === 'user' ? 
            (window.customBubbleStyleSelf || window.customBubbleStyle) : 
            (window.customBubbleStyleOthers || window.customBubbleStyle);
            
        if (currentBubbleStyle && currentBubbleStyle.html && msg.type !== 'emoji' && msg.type !== 'red_packet') {
            // 使用自定义气泡样式 - 获取原始内容，不包装 message-content
            console.log(`应用${msg.role === 'user' ? '我的' : '对方的'}自定义气泡样式`);
            
            let rawContent = '';
            if (msg.type === 'emoji') {
                rawContent = await renderEmojiContent(msg.content);
            } else if (msg.type === 'red_packet') {
                // 红包保持原有格式
                rawContent = contentHtml;
            } else {
                // 处理文本，但不包装 message-content
                rawContent = msg.content.replace(/\n/g, '<br>');
                
                // 处理内联表情
                const emojiTagRegex = /\[emoji:([^\]]+)\]/g;
                const emojiMatches = [...rawContent.matchAll(emojiTagRegex)];
                for (const match of emojiMatches) {
                    const fullMatch = match[0];
                    const emojiName = match[1];
                    const foundEmoji = emojis.find(e => e.tag === emojiName || e.meaning === emojiName);
                    
                    if (foundEmoji && foundEmoji.tag) {
                        const emojiHtml = await renderEmojiContent(`[emoji:${foundEmoji.tag}]`, true);
                        rawContent = rawContent.replace(fullMatch, emojiHtml);
                    } else if (foundEmoji && foundEmoji.url) {
                        const replacement = `<img src="${foundEmoji.url}" style="max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;">`;
                        rawContent = rawContent.replace(fullMatch, replacement);
                    }
                }
            }
            
            bubbleHtml = currentBubbleStyle.html.replace('{{BUBBLE_TEXT}}', rawContent);
            // 清理 HTML 中的转义换行符，避免显示 \n
            bubbleHtml = bubbleHtml.replace(/\\n/g, '');
            console.log('生成的自定义气泡 HTML:', bubbleHtml);
        } else {
            // 使用默认气泡样式
            console.log('使用默认气泡样式，自定义样式状态:', {
                hasCustomStyle: !!window.customBubbleStyle,
                hasHtml: !!window.customBubbleStyle?.html
            });
            bubbleHtml = `<div class="message-bubble">${contentHtml}</div>`;
        }

        if (currentContact.type === 'group' && msg.role !== 'user') {
            const sender = contacts.find(c => c.id === msg.senderId);
            const senderName = sender ? sender.name : '未知';
            if (currentBubbleStyle && currentBubbleStyle.html && msg.type !== 'emoji' && msg.type !== 'red_packet') {
                // 对于群聊消息，在自定义气泡前添加发送者信息
                const groupHeader = `<div class="group-message-header"><div class="group-message-name">${senderName}</div></div>`;
                
                // 获取原始内容（与上面相同的逻辑）
                let rawContent = '';
                if (msg.type === 'emoji') {
                    rawContent = await renderEmojiContent(msg.content);
                } else if (msg.type === 'red_packet') {
                    rawContent = contentHtml;
                } else {
                    rawContent = msg.content.replace(/\n/g, '<br>');
                    const emojiTagRegex = /\[emoji:([^\]]+)\]/g;
                    const emojiMatches = [...rawContent.matchAll(emojiTagRegex)];
                    for (const match of emojiMatches) {
                        const fullMatch = match[0];
                        const emojiName = match[1];
                        const foundEmoji = emojis.find(e => e.tag === emojiName || e.meaning === emojiName);
                        
                        if (foundEmoji && foundEmoji.tag) {
                            const emojiHtml = await renderEmojiContent(`[emoji:${foundEmoji.tag}]`, true);
                            rawContent = rawContent.replace(fullMatch, emojiHtml);
                        } else if (foundEmoji && foundEmoji.url) {
                            const replacement = `<img src="${foundEmoji.url}" style="max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;">`;
                            rawContent = rawContent.replace(fullMatch, replacement);
                        }
                    }
                }
                
                let customBubbleWithHeader = currentBubbleStyle.html.replace('{{BUBBLE_TEXT}}', groupHeader + rawContent);
                // 清理 HTML 中的转义换行符，避免显示 \n
                customBubbleWithHeader = customBubbleWithHeader.replace(/\\n/g, '');
                msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div>${customBubbleWithHeader}`;
            } else {
                msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble"><div class="group-message-header"><div class="group-message-name">${senderName}</div></div>${contentHtml}</div>`;
            }
        } else {
            msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div>${bubbleHtml}`;
        }
        
        // 调试：输出最终的 HTML 结构
        if (currentBubbleStyle && currentBubbleStyle.html) {
            console.log('最终消息 HTML 结构:', msgDiv.innerHTML);
        }
        
        // 检查 forceVoice 标志, contact.voiceId 和 Minimax 的凭证
        if (msg.forceVoice && currentContact.voiceId && apiSettings.minimaxGroupId && apiSettings.minimaxApiKey) {
            // 兼容自定义气泡和默认气泡
            const bubble = msgDiv.querySelector('.message-bubble') || 
                          msgDiv.querySelector('.custom-bubble-container') || 
                          msgDiv.querySelector('.chat-bubble');
            if (bubble) {
                const messageUniqueId = `${currentContact.id}-${msg.time}`; // 使用时间戳保证唯一性
                
                // 给气泡添加语音消息标识
                bubble.classList.add('voice-message');
                bubble.dataset.voiceMessageId = `voice-${messageUniqueId}`;
                
                // 在消息内容前添加语音符号
                // 优先查找.message-content，如果没有则直接在气泡内添加
                const textContentDiv = bubble.querySelector('.message-content') || bubble;
                if (textContentDiv && !textContentDiv.querySelector('.voice-icon')) {
                    const voiceIcon = document.createElement('span');
                    voiceIcon.className = 'voice-icon';
                    voiceIcon.innerHTML = createVoiceIcon(); // SVG音频波形图标
                    
                    // 将语音符号插入到文本内容的最前面
                    if (textContentDiv === bubble) {
                        // 如果是直接在气泡内，需要在文本节点前插入
                        const firstTextNode = Array.from(textContentDiv.childNodes).find(node => 
                            node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
                        );
                        if (firstTextNode) {
                            textContentDiv.insertBefore(voiceIcon, firstTextNode);
                        } else {
                            textContentDiv.insertBefore(voiceIcon, textContentDiv.firstChild);
                        }
                    } else {
                        textContentDiv.insertBefore(voiceIcon, textContentDiv.firstChild);
                    }
                }
                
                // 给整个气泡添加点击事件来播放语音
                bubble.style.cursor = 'pointer';
                
                // 移除任何已存在的语音播放事件监听器
                const existingHandler = bubble._voiceClickHandler;
                if (existingHandler) {
                    bubble.removeEventListener('click', existingHandler);
                }
                
                // 创建新的事件处理器
                const voiceClickHandler = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('语音气泡被点击，开始播放:', { text: msg.content, voiceId: currentContact.voiceId });
                    playVoiceMessage(bubble, msg.content, currentContact.voiceId);
                };
                
                // 保存处理器引用并添加事件监听器
                bubble._voiceClickHandler = voiceClickHandler;
                bubble.addEventListener('click', voiceClickHandler);
            }
        }


        if (isMultiSelectMode) {
            msgDiv.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMessageSelection(originalIndex);
            });
            if (selectedMessages.has(originalIndex)) {
                msgDiv.classList.add('message-selected');
            }
        } else {
            let msgPressTimer;
            msgDiv.addEventListener('touchstart', () => { msgPressTimer = setTimeout(() => { showMessageActionMenu(originalIndex, msgDiv); }, 700); });
            msgDiv.addEventListener('touchend', () => clearTimeout(msgPressTimer));
            msgDiv.addEventListener('touchmove', () => clearTimeout(msgPressTimer));
            msgDiv.addEventListener('contextmenu', (e) => { e.preventDefault(); showMessageActionMenu(originalIndex, msgDiv); });
        }
        
        chatMessages.appendChild(msgDiv);
    }

    if (isInitialLoad) {
        // 延时滚动，让动画先开始，然后平滑滚动到底部
        setTimeout(() => {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }, hasNewMessage ? 200 : 0); // 新消息延时200ms滚动，让动画先开始并完成大部分
    } else {
        const newScrollHeight = chatMessages.scrollHeight;
        chatMessages.scrollTop = newScrollHeight - oldScrollHeight;
    }
}


async function loadMoreMessages() {
    if (isLoadingMoreMessages) return;
    isLoadingMoreMessages = true;

    const chatMessages = document.getElementById('chatMessages');
    const loadMoreButton = chatMessages.querySelector('.load-more-messages');
    if (loadMoreButton) {
        loadMoreButton.textContent = '正在加载...';
    }

    setTimeout(async () => {
        const allMessages = currentContact.messages;
        const newCount = Math.min(allMessages.length, currentlyDisplayedMessageCount + MESSAGES_PER_PAGE);
        
        if (newCount > currentlyDisplayedMessageCount) {
            currentlyDisplayedMessageCount = newCount;
            await renderMessages(false); // 重新渲染，非初始加载
        }
        
        isLoadingMoreMessages = false;
    }, 500);
}

function getGroupMembersText() {
    if (!currentContact || currentContact.type !== 'group') return '';
    return currentContact.members.map(id => contacts.find(c => c.id === id)?.name || '未知').join('、');
}

async function sendUserMessage() {
    if (!currentContact) return;
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (!content) return;
    const userMessage = { role: 'user', content, type: 'text', time: new Date().toISOString(), senderId: 'user' };
    currentContact.messages.push(userMessage);
    
    // 如果消息总数超过了当前显示的条数，增加显示条数以包含新消息
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }

    currentContact.lastMessage = content;
    currentContact.lastTime = formatContactListTime(new Date().toISOString());
    input.value = '';
    input.style.height = 'auto';
    await addSingleMessage(userMessage, true); // 单独添加用户消息，使用动画
    await renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    safeFocus(input);
}

async function sendMessage() {
    if (!currentContact) return;
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (content) await sendUserMessage();
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) { showToast('请先设置API'); return; }
    if (currentContact.messages.length === 0 && !content) return;
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    try {
        if (currentContact.type === 'group') {
            await sendGroupMessage();
        } else {
            showTypingIndicator();
            const { replies } = await callAPI(currentContact);
            hideTypingIndicator();
            
            // 异步更新记忆表格（不阻塞后续流程）
            setTimeout(async () => {
                try {
                    await window.memoryTableManager.updateMemoryTableWithSecondaryModel(currentContact);
                } catch (error) {
                    console.warn('记忆表格更新失败:', error);
                }
            }, 1000);
            if (!replies || replies.length === 0) { showTopNotification('AI没有返回有效回复'); return; }
            
            // 批量处理AI回复，避免每条消息都重新渲染
            for (let i = 0; i < replies.length; i++) {
                const response = replies[i];
                const isLastReply = i === replies.length - 1;
                
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
                
                let messageContent = removeThinkingChain(response.content);
                let forceVoice = false;

                // 检查并处理AI的语音指令
                if (messageContent.startsWith('[语音]:')) {
                    forceVoice = true;
                    // 从消息内容中移除 [语音]: 标签
                    messageContent = messageContent.substring(4).trim();
                }

                const aiMessage = { 
                    role: 'assistant', 
                    content: messageContent, // 使用处理过的内容
                    type: response.type, 
                    time: new Date().toISOString(), 
                    senderId: currentContact.id,
                    forceVoice: forceVoice // 添加新标志
                };

                currentContact.messages.push(aiMessage);
                if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                    currentlyDisplayedMessageCount++;
                }
                
                // 单独添加这条新消息，而不是重新渲染整个界面
                await addSingleMessage(aiMessage, true); // true表示这是AI回复的新消息
                
                // 只在最后一条消息时更新联系人列表和保存数据
                if (isLastReply) {
                    currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : (response.type === 'emoji' ? '[表情]' : '[红包]');
                    currentContact.lastTime = formatContactListTime(new Date().toISOString());
                    await renderContactList();
                    await saveDataToDB();
                }
            }
            // 检查是否需要更新记忆（新逻辑：用户发送2条消息就触发）
            
            if (window.characterMemoryManager && window.contacts && Array.isArray(window.contacts)) {
                try {
                    await window.characterMemoryManager.checkAndUpdateMemory(currentContact.id, currentContact);
                } catch (error) {
                    console.error('检查更新记忆失败:', error);
                }
            } else {
            }
        }
    } catch (error) {
        console.error('发送消息错误:', error);
        console.error('错误详情:', {
            name: error.name,
            message: error.message,
            timestamp: new Date().toISOString(),
            url: window.location.href
        });
        showApiError(error);
        hideTypingIndicator();
    } finally {
        sendBtn.disabled = false;
    }
}

async function sendGroupMessage() {
    if (!currentContact || currentContact.type !== 'group') return;
    
    showTypingIndicator();
    try {
        // 一次性调用API获取所有群成员的回复
        const { replies } = await callAPI(currentContact);
        hideTypingIndicator();
        
        if (!replies || replies.length === 0) {
            showTopNotification('群聊AI没有返回有效回复');
            return;
        }
        
        // 解析JSON格式的群聊回复
        let groupMessages = [];
        try {
            // 假设第一个reply包含所有群成员的回复
            const firstReply = replies[0];
            let responseText = removeThinkingChain(firstReply.content);
            
            // 尝试解析JSON格式的回复（支持纯JSON、Markdown代码块等格式）
            if (responseText.includes('{') && responseText.includes('}')) {
                try {
                    // 使用统一的JSON提取函数清理markdown语法
                    const cleanedJson = window.apiService.extractJSON(responseText);
                    const parsedResponse = JSON.parse(cleanedJson);
                    
                    if (parsedResponse.messages && Array.isArray(parsedResponse.messages)) {
                        groupMessages = parsedResponse.messages;
                    }
                } catch (jsonError) {
                    console.error('群聊JSON提取失败:', jsonError);
                    
                    // 继续使用原有逻辑作为备用
                    const jsonStart = responseText.indexOf('{');
                    const jsonEnd = responseText.lastIndexOf('}') + 1;
                    const jsonText = responseText.substring(jsonStart, jsonEnd);
                    
                    const parsedResponse = JSON.parse(jsonText);
                    if (parsedResponse.messages && Array.isArray(parsedResponse.messages)) {
                        groupMessages = parsedResponse.messages;
                    }
                }
            }
        } catch (error) {
            console.error('解析群聊JSON回复失败:', error);
            console.error('错误详情:', {
                error: error.message,
                firstReply: replies[0],
                repliesLength: replies.length
            });
            // 显示具体的错误信息而不是泛泛的"无法解析API回复"
            showTopNotification(`无法解析API回复: ${error.message}`);
            return;
        }
        
        if (groupMessages.length === 0) {
            showTopNotification('未能解析出有效的群聊回复');
            return;
        }
        
        // 逐个显示群成员的发言
        for (let i = 0; i < groupMessages.length; i++) {
            const message = groupMessages[i];
            
            // 查找对应的群成员
            const member = contacts.find(c => c.name === message.speaker && currentContact.members.includes(c.id));
            if (!member) {
                console.warn(`未找到群成员: ${message.speaker}`);
                continue;
            }
            
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
            
            let messageContent = message.content;
            let forceVoice = false;
            
            // 检查语音指令
            if (messageContent.startsWith('[语音]:')) {
                forceVoice = true;
                messageContent = messageContent.substring(4).trim();
            }
            
            const aiMessage = {
                role: 'assistant',
                content: messageContent,
                type: 'text',
                time: new Date().toISOString(),
                senderId: member.id,
                forceVoice: forceVoice
            };
            
            currentContact.messages.push(aiMessage);
            if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                currentlyDisplayedMessageCount++;
            }
            
            // 单独添加群成员消息
            await addSingleMessage(aiMessage, true);
            
            // 异步更新该成员的记忆
            if (window.characterMemoryManager) {
                setTimeout(async () => {
                    try {
                        await window.characterMemoryManager.checkAndUpdateMemory(member.id, currentContact);
                    } catch (error) {
                        console.error(`群聊成员记忆更新失败 - ${member.name}:`, error);
                    }
                }, 1000);
            }
        }
        
        // 更新群聊最后消息和时间
        if (groupMessages.length > 0) {
            const lastMessage = groupMessages[groupMessages.length - 1];
            currentContact.lastMessage = `${lastMessage.speaker}: ${lastMessage.content.substring(0, 15)}...`;
            currentContact.lastTime = formatContactListTime(new Date().toISOString());
            await renderContactList();
            await saveDataToDB();
        }
        
    } catch (error) {
        console.error('群聊消息发送错误:', error);
        console.error('群聊错误详情:', {
            groupInfo: {
                id: currentContact.id,
                name: currentContact.name,
                membersCount: currentContact.members ? currentContact.members.length : 0
            },
            errorName: error.name,
            errorMessage: error.message,
            timestamp: new Date().toISOString()
        });
        hideTypingIndicator();
        showTopNotification(`群聊回复失败: ${error.message}`);
    }
}

async function showTypingIndicator(contact = null) {
    const chatMessages = document.getElementById('chatMessages');
    let indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
    indicator = document.createElement('div');
    indicator.className = 'message received';
    indicator.id = 'typingIndicator';
    chatMessages.appendChild(indicator);
    const displayContact = contact || currentContact;
    
    let avatarContent = '';
    if (displayContact) {
        avatarContent = await getAvatarHTML(displayContact, 'contact') || displayContact.name[0];
    }
    
    indicator.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
    // 延时滚动，让打字指示器的动画先开始
    setTimeout(() => {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }, 100); // 稍微延长延时，让动画更明显
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

/**
 * 单独添加一条新消息，而不是重新渲染整个聊天界面
 */
async function addSingleMessage(message, isNewMessage = false) {
    const chatMessages = document.getElementById('chatMessages');
    
    // 创建消息元素
    const msgDiv = document.createElement('div');
    if (message.role === 'system') return;
    
    msgDiv.className = `message ${message.role === 'user' ? 'sent' : 'received'}${isNewMessage ? ' new-message' : ''}`;
    // 设置正确的消息索引
    const messageIndex = currentContact.messages.findIndex(m => m === message);
    msgDiv.dataset.messageIndex = messageIndex >= 0 ? messageIndex : currentContact.messages.length - 1;

    let contentHtml = '';
    if (message.type === 'emoji') {
        contentHtml = await renderEmojiContent(message.content);
    } else if (message.type === 'red_packet') {
        const packet = JSON.parse(message.content);
        contentHtml = `<div class="message-content red-packet" onclick="showToast('红包金额: ${packet.amount}')"><div class="red-packet-body"><svg class="red-packet-icon" viewBox="0 0 1024 1024"><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32zM731.2 565.2H603.9c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8zM419.8 565.2H292.5c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8z" fill="#FEFEFE"></path><path d="M872.4 240H151.6c-17.7 0-32 14.3-32 32v64h784v-64c0-17.7-14.3-32-32-32z" fill="#FCD4B3"></path><path d="M512 432c-48.6 0-88 39.4-88 88s39.4 88 88 88 88-39.4 88-88-39.4-88-88-88z m0 152c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64-64z" fill="#FCD4B3"></path><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32z m-32 552H215.6V368h624.8v488z" fill="#F37666"></path><path d="M512 128c-112.5 0-204 91.5-204 204s91.5 204 204 204 204-91.5 204-204-91.5-204-204-204z m0 384c-99.4 0-180-80.6-180-180s80.6-180 180-180 180 80.6 180 180-80.6 180-180 180z" fill="#F37666"></path><path d="M512 456c-35.3 0-64 28.7-64 64s28.7 64 64 64 64 28.7 64 64s28.7-64-64-64z m16.4 76.4c-2.3 2.3-5.4 3.6-8.5 3.6h-15.8c-3.1 0-6.2-1.3-8.5-3.6s-3.6-5.4-3.6-8.5v-27.8c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12v27.8c0.1 3.1-1.2 6.2-3.5 8.5z" fill="#F37666"></path></svg><div class="red-packet-text"><div>${packet.message || '恭喜发财，大吉大利！'}</div><div>领取红包</div></div></div><div class="red-packet-footer">AI红包</div></div>`;
    } else {
        contentHtml = await processTextWithInlineEmojis(message.content);
    }

    let avatarContent = '';
    if (message.role === 'assistant') {
        if (currentContact.type === 'group') {
            // 修复：从contacts数组中查找成员，而不是从members数组（members只存储ID）
            const member = contacts.find(c => c.id === message.senderId);
            avatarContent = member ? (await getAvatarHTML(member, 'contact') || member.name[0]) : '🤖';
        } else {
            avatarContent = await getAvatarHTML(currentContact, 'contact') || currentContact.name[0];
        }
    } else {
        avatarContent = await getAvatarHTML(userProfile, 'user') || userProfile?.name?.[0] || '我';
    }

    // 先移除复杂的语音处理逻辑，专注于修复基础消息样式

    if (currentContact.type === 'group' && message.role === 'assistant') {
        // 修复：从contacts数组中查找成员
        const member = contacts.find(c => c.id === message.senderId);
        const memberName = member ? member.name : '未知成员';
        msgDiv.innerHTML = `
            <div class="message-avatar">${avatarContent}</div>
            <div class="message-bubble">
                <div class="group-message-header">
                    <div class="group-message-name">${memberName}</div>
                </div>
                ${contentHtml}
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="message-avatar">${avatarContent}</div>
            <div class="message-bubble">
                ${contentHtml}
            </div>
        `;
    }

    // 添加到聊天界面
    chatMessages.appendChild(msgDiv);

    // 延时滚动，让动画先开始，与动画时间配合
    setTimeout(() => {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }, isNewMessage ? 150 : 0); // 新消息延时150ms，让滑入动画更明显

    // 先暂时移除复杂的语音生成逻辑，专注于修复消息样式问题
    // TODO: 稍后重新添加语音功能
}

/**
 * 通过我们的 Netlify Function 代理来调用 API。
 * @param {object} contact The contact object.
 * @param {array} turnContext Additional messages for group chat context.
 * @returns {object} The API response containing replies and the new memory table.
 */
async function callAPI(contact, turnContext = []) {
    try {
        // 1. 构建系统提示词
        const systemPrompt = await window.promptBuilder.buildChatPrompt(
            contact, 
            userProfile, 
            currentContact, 
            apiSettings, 
            emojis, 
            window, 
            turnContext
        );

        // 2. 构建消息数组
        const messages = [{ role: 'system', content: systemPrompt }];
        const messageHistory = window.promptBuilder.buildMessageHistory(
            currentContact, 
            apiSettings, 
            userProfile, 
            contacts, 
            contact, 
            emojis, 
            turnContext
        );

        messages.push(...messageHistory);

        // 3. 调用API
        
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            messages,
            {},
            (apiSettings.timeout || 60) * 1000
        );
        

        // 4. 处理响应
        if (!data) {
            throw new Error('API返回数据为空');
        }

        let fullResponseText;
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
            // 标准OpenAI格式
            fullResponseText = data.choices[0].message.content;
        } else if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            // Gemini API 格式
            fullResponseText = data.candidates[0].content.parts[0].text;
        } else if (data.content) {
            // 可能的替代格式
            fullResponseText = data.content;
        } else if (data.message) {
            // 另一种可能的格式
            fullResponseText = data.message;
        } else {
            // 检查是否是因为没有生成内容
            if (data.choices && data.choices[0] && data.choices[0].finish_reason === 'content_filter') {
                throw new Error('AI模型没有生成回复，可能是内容被过滤，请检查输入或稍后重试');
            }
            console.error('API响应格式不支持:', data);
            throw new Error('API响应格式不支持，无法提取回复内容');
        }

        // 检查内容是否有效
        if (!fullResponseText || fullResponseText.trim() === '') {
            throw new Error('AI回复内容为空，请稍后重试');
        }
        
        
        let chatRepliesText = fullResponseText;

        // 群聊模式：如果是群聊，直接返回完整内容，不进行分割
        let replies;
        if (currentContact && currentContact.type === 'group') {
            replies = [chatRepliesText.trim()];
        } else {
            // 处理回复分割（仅用于私聊）
            if (!chatRepliesText.includes('|||')) {
                const sentences = chatRepliesText.split(/([。！？\n])/).filter(Boolean);
                let tempReplies = [];
                for (let i = 0; i < sentences.length; i += 2) {
                    let sentence = sentences[i];
                    let punctuation = sentences[i+1] || '';
                    tempReplies.push(sentence + punctuation);
                }
                chatRepliesText = tempReplies.join('|||');
            }
            replies = chatRepliesText.split('|||').map(r => r.trim()).filter(r => r);
        }
        const processedReplies = [];
        
        // 处理特殊消息类型（表情、红包等）
        const emojiNameRegex = /^\[(?:emoji|发送了表情)[:：]([^\]]+)\]$/;
        const redPacketRegex = /^\[red_packet:({.*})\]$/;

        for (const reply of replies) {
            const emojiMatch = reply.match(emojiNameRegex);
            const redPacketMatch = reply.match(redPacketRegex);

            if (emojiMatch) {
                const emojiName = emojiMatch[1];
                const foundEmoji = emojis.find(e => e.tag === emojiName || e.meaning === emojiName);
                if (foundEmoji) {
                    const content = foundEmoji.tag ? `[emoji:${foundEmoji.tag}]` : foundEmoji.url;
                    processedReplies.push({ type: 'emoji', content: content });
                } else {
                    processedReplies.push({ type: 'text', content: reply });
                }
            } else if (redPacketMatch) {
                try {
                    const packetData = JSON.parse(redPacketMatch[1]);
                    if (typeof packetData.amount === 'number' && typeof packetData.message === 'string') {
                         processedReplies.push({ type: 'red_packet', content: JSON.stringify(packetData) });
                    } else {
                         processedReplies.push({ type: 'text', content: reply });
                    }
                } catch (e) {
                    processedReplies.push({ type: 'text', content: reply });
                }
            } else {
                processedReplies.push({ type: 'text', content: reply });
            }
        }
        
        
        return { replies: processedReplies };

    } catch (error) {
        console.error('callAPI错误详情:', {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            contact: contact ? {
                id: contact.id,
                name: contact.name,
                type: contact.type
            } : null,
            turnContextLength: turnContext ? turnContext.length : 0,
            apiSettings: {
                url: apiSettings?.url ? apiSettings.url.substring(0, 50) + '...' : 'not set',
                hasKey: !!apiSettings?.key,
                model: apiSettings?.model || 'not set'
            },
            timestamp: new Date().toISOString(),
            networkStatus: navigator.onLine ? 'online' : 'offline'
        });
        showToast("API 调用失败: " + error.message);
        throw error;
    }
}


async function testApiConnection() {
    const url = document.getElementById('apiUrl').value;
    const key = document.getElementById('apiKey').value;
    if (!url || !key) {
        showToast('请填写完整信息');
        return;
    }

    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');
    
    primarySelect.innerHTML = '<option>连接中...</option>';
    secondarySelect.innerHTML = '<option>连接中...</option>';
    primarySelect.disabled = true;
    secondarySelect.disabled = true;

    try {
        const data = await window.apiService.testConnection(url, key);
        const models = data.data ? data.data.map(m => m.id).sort() : [];

        if (models.length === 0) {
            showToast('连接成功，但未找到可用模型');
            primarySelect.innerHTML = '<option>无可用模型</option>';
            secondarySelect.innerHTML = '<option>无可用模型</option>';
            return;
        }

        // 填充主要模型
        primarySelect.innerHTML = '';
        models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            primarySelect.appendChild(option);
        });
        primarySelect.value = apiSettings.model;

        // 填充次要模型
        secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
        models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            secondarySelect.appendChild(option);
        });
        secondarySelect.value = apiSettings.secondaryModel || 'sync_with_primary';
        
        primarySelect.disabled = false;
        secondarySelect.disabled = false;
        showToast('连接成功');

    } catch (error) {
        primarySelect.innerHTML = '<option>连接失败</option>';
        secondarySelect.innerHTML = '<option>连接失败</option>';
        showToast(error.message);
    }
}

function handlePrimaryModelChange() {
    const primaryModel = document.getElementById('primaryModelSelect').value;
    const secondarySelect = document.getElementById('secondaryModelSelect');
    
    // 如果次要模型设置为“同步”，则在数据层面更新它
    if (apiSettings.secondaryModel === 'sync_with_primary') {
        // 不需要直接修改UI，保存时会处理
    }
}

async function saveApiSettings(event) {
    event.preventDefault();
    apiSettings.url = document.getElementById('apiUrl').value;
    apiSettings.key = document.getElementById('apiKey').value;
    apiSettings.model = document.getElementById('primaryModelSelect').value;
    apiSettings.secondaryModel = document.getElementById('secondaryModelSelect').value;
    apiSettings.contextMessageCount = parseInt(document.getElementById('contextSlider').value);
    apiSettings.timeout = parseInt(document.getElementById('apiTimeout').value) || 60;
    
    // 【修改点 4】: 保存 Minimax 的设置
    // 假设你的HTML中输入框的ID是 minimaxGroupId 和 minimaxApiKey
    apiSettings.minimaxGroupId = document.getElementById('minimaxGroupId').value.trim();
    apiSettings.minimaxApiKey = document.getElementById('minimaxApiKey').value.trim();
    
    await saveDataToDB();
    closeModal('apiSettingsModal');
    updateContextIndicator();
    showToast('设置已保存');
}

async function setBackground(event) {
    event.preventDefault();
    if (!currentContact) return;
    const url = document.getElementById('backgroundUrl').value;
    if (url) backgrounds[currentContact.id] = url;
    else delete backgrounds[currentContact.id];
    await saveDataToDB(); // 使用IndexedDB保存
    openChat(currentContact);
    closeModal('backgroundModal');
    showToast('背景设置成功');
}

async function addEmoji(event) {
    event.preventDefault();
    const meaning = document.getElementById('emojiMeaning').value.trim();
    if (emojis.some(e => e.tag === meaning)) {
        showToast('该表情标签已存在，请使用其他标签。');
        return;
    }
    
    const imageUrl = document.getElementById('emojiUrl').value;
    
    // 处理不同格式的图片
    let imageData = imageUrl;
    if (imageUrl.startsWith('file:')) {
        // 新的fileSystem格式 - 表情包已经在上传时保存到文件系统
        // 只需要保存emoji记录即可，不需要额外处理
        imageData = imageUrl; // 保留file:fileId格式用于引用
    } else if (imageUrl.startsWith('data:image/')) {
        // 传统的base64格式
        await saveEmojiImage(meaning, imageUrl);
        imageData = `[emoji:${meaning}]`; // 内部存储格式
    }
    
    const emoji = { 
        id: Date.now().toString(), 
        tag: meaning,  // 使用tag而不是meaning
        meaning: meaning, // 保留meaning用于显示
        // 新增：如果是fileId格式，保存fileId字段
        ...(imageUrl.startsWith('file:') ? { fileId: imageUrl.substring(5) } : {})
    };
    emojis.push(emoji);
    await saveDataToDB(); // 使用IndexedDB保存
    renderEmojiGrid();
    closeModal('addEmojiModal');
    showToast('表情添加成功');
    event.target.reset();
}

async function deleteEmoji(emojiId) {
    showConfirmDialog('删除确认', '确定要删除这个表情吗？', async () => {
        const emojiToDelete = emojis.find(e => e.id === emojiId);
        if (emojiToDelete && emojiToDelete.tag) {
            // 删除对应的图片数据
            await deleteEmojiImage(emojiToDelete.tag);
        }
        emojis = emojis.filter(e => e.id !== emojiId);
        await saveDataToDB(); // 使用IndexedDB保存
        renderEmojiGrid();
        showToast('表情已删除');
    });
}

async function renderEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    
    for (const emoji of emojis) {
        const item = document.createElement('div');
        item.className = 'emoji-item';
        
        // 获取表情图片
        let imageSrc;
        if (emoji.tag) {
            // 新格式：从emojiImages存储获取
            imageSrc = await getEmojiImage(emoji.tag);
        } else if (emoji.url) {
            // 旧格式：直接使用URL
            imageSrc = emoji.url;
        }
        
        if (imageSrc) {
            item.innerHTML = `<img src="${imageSrc}"><div class="emoji-delete-btn" onclick="event.stopPropagation(); deleteEmoji('${emoji.id}')">×</div>`;
            item.onclick = () => sendEmoji(emoji);
        } else {
            // 如果没有图片数据，显示占位符
            item.innerHTML = `<div style="background: #f0f0f0; display: flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 8px;">${emoji.meaning || emoji.tag || '?'}</div><div class="emoji-delete-btn" onclick="event.stopPropagation(); deleteEmoji('${emoji.id}')">×</div>`;
            item.onclick = () => sendEmoji(emoji);
        }
        
        grid.appendChild(item);
    }
    
    const addBtn = document.createElement('div');
    addBtn.className = 'add-emoji-btn';
    addBtn.textContent = '+ 添加表情';
    addBtn.onclick = showAddEmojiModal;
    grid.appendChild(addBtn);
}

async function sendRedPacket(event) {
    event.preventDefault();
    if (!currentContact) return;
    const amount = document.getElementById('redPacketAmount').value;
    const message = document.getElementById('redPacketMessage').value || '恭喜发财，大吉大利！';
    if (amount <= 0) { showToast('红包金额必须大于0'); return; }
    const packetData = { amount: parseFloat(amount).toFixed(2), message };
    const packetMessage = { role: 'user', content: JSON.stringify(packetData), type: 'red_packet', time: new Date().toISOString(), senderId: 'user' };
    currentContact.messages.push(packetMessage);
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }
    currentContact.lastMessage = '[红包]';
    currentContact.lastTime = formatContactListTime(new Date().toISOString());
    renderMessages(true);
    await renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    closeModal('redPacketModal');
    await sendMessage();
}

async function sendEmoji(emoji) {
    if (!currentContact) return;
    // 使用新的[emoji:tag]格式存储
    const content = emoji.tag ? `[emoji:${emoji.tag}]` : emoji.url;
    currentContact.messages.push({ role: 'user', content: content, type: 'emoji', time: new Date().toISOString(), senderId: 'user' });
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }
    currentContact.lastMessage = '[表情]';
    currentContact.lastTime = formatContactListTime(new Date().toISOString());
    renderMessages(true);
    await renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    toggleEmojiPanel(true);
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) { showToast('请先设置API'); return; }
    showTypingIndicator();
    try {
        const { replies } = await callAPI(currentContact);
        hideTypingIndicator();
        
        // 异步更新记忆表格（不阻塞后续流程）
        setTimeout(async () => {
            try {
                await window.memoryTableManager.updateMemoryTableWithSecondaryModel(currentContact);
            } catch (error) {
                console.warn('记忆表格更新失败:', error);
            }
        }, 1000);
        if (!replies || replies.length === 0) { showTopNotification('AI没有返回有效回复'); return; }
        for (const response of replies) {
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
            const aiMessage = { role: 'assistant', content: removeThinkingChain(response.content), type: response.type, time: new Date().toISOString(), senderId: currentContact.id };
            currentContact.messages.push(aiMessage);
            if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                currentlyDisplayedMessageCount++;
            }
            currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : '[表情]';
            currentContact.lastTime = formatContactListTime(new Date().toISOString());
            renderMessages(true);
            await renderContactList();
            await saveDataToDB();
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('AI回复错误:', error);
        showToast('AI回复失败');
    }
}

function toggleEmojiPanel(forceClose = false) {
    const panel = document.getElementById('emojiPanel');
    if (forceClose) {
        panel.style.display = 'none';
        return;
    }
    const isVisible = panel.style.display === 'block';
    // 懒加载：第一次打开时才渲染
    if (!isVisible && !isEmojiGridRendered) {
        renderEmojiGrid();
        isEmojiGridRendered = true;
    }
    panel.style.display = isVisible ? 'none' : 'block';
}

function toggleSettingsMenu(forceClose = false) {
    const menu = document.getElementById('settingsMenu');
    menu.style.display = forceClose ? 'none' : (menu.style.display === 'block' ? 'none' : 'block');
}


async function clearMessages() {
    if (!currentContact) {
        showToast('请先选择一个聊天');
        return;
    }
    showConfirmDialog('清空聊天记录', '确定要清空当前聊天记录吗？此操作不可撤销。', async () => {
        currentContact.messages = [];
        currentlyDisplayedMessageCount = 0; // 重置计数
        currentContact.lastMessage = '暂无消息';
        currentContact.lastTime = formatContactListTime(new Date().toISOString());
        renderMessages(true); // 重新渲染
        await renderContactList();
        await saveDataToDB();
        
        // 清空该角色的记忆数据
        if (window.clearCharacterMemory) {
            await window.clearCharacterMemory(currentContact.id);
            console.log(`[清空聊天] 已清空角色 ${currentContact.id} 的记忆数据`);
        }
        
        showToast('已清空聊天记录');
        toggleSettingsMenu(true);
    });
}

/**
 * 删除指定索引的消息
 * @param {number} messageIndex 要删除的消息的索引 (绝对索引)
 */
async function deleteMessage(messageIndex) {
    if (!currentContact || messageIndex === undefined || messageIndex < 0 || messageIndex >= currentContact.messages.length) {
        showToast('无效的消息索引或未选择聊天');
        return;
    }
    
    // 保存被删除的消息，用于记忆更新
    const deletedMessage = currentContact.messages[messageIndex];
    
    currentContact.messages.splice(messageIndex, 1);

    // 如果删除的是已显示的消息，则更新计数
    const displayedMessagesStartRange = currentContact.messages.length - currentlyDisplayedMessageCount;
    if (messageIndex >= displayedMessagesStartRange) {
        currentlyDisplayedMessageCount = Math.max(0, currentlyDisplayedMessageCount - 1);
    }
    
    if (currentContact.messages.length > 0) {
        const lastMsg = currentContact.messages[currentContact.messages.length - 1];
        currentContact.lastMessage = lastMsg.type === 'text' ? lastMsg.content.substring(0, 20) + '...' : (lastMsg.type === 'emoji' ? '[表情]' : '[红包]');
        currentContact.lastTime = formatContactListTime(lastMsg.time);
    } else {
        currentContact.lastMessage = '暂无消息';
        currentContact.lastTime = formatContactListTime(new Date().toISOString());
    }

    renderMessages(false); // 重新渲染，但不滚动到底部
    await renderContactList();
    await saveDataToDB();
    
    // 检查并更新记忆
    if (window.checkAndUpdateMemoryAfterDeletion && deletedMessage) {
        try {
            await window.checkAndUpdateMemoryAfterDeletion(currentContact.id, [deletedMessage], currentContact);
        } catch (error) {
            console.error('删除消息后更新记忆失败:', error);
        }
    }
    
    showToast('消息已删除');
}


/**
 * 删除当前聊天对象（联系人或群聊）
 */
async function deleteCurrentContact() {
    if (!currentContact) {
        showToast('没有选中任何聊天对象');
        return;
    }
    showConfirmDialog('删除聊天对象', `确定要删除 "${currentContact.name}" 吗？此操作将永久删除所有聊天记录，不可撤销。`, async () => {
        await deleteContact(currentContact.id);
        showToast('聊天对象已删除');
        closeChatPage(); // 关闭聊天页面并返回联系人列表
    });
    toggleSettingsMenu(true); // 关闭设置菜单
}

/**
 * 从contacts数组和IndexedDB中删除指定ID的联系人或群聊
 * @param {string} contactId 要删除的联系人/群聊的ID
 */
async function deleteContact(contactId) {
    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法删除。');
        return;
    }

    const initialContactsLength = contacts.length;
    contacts = contacts.filter(c => c.id !== contactId);

    if (contacts.length === initialContactsLength) {
        // 如果长度没变，说明没找到该ID的联系人
        console.warn(`未找到ID为 ${contactId} 的联系人/群聊进行删除。`);
        showToast('未找到要删除的聊天对象');
        return;
    }

    try {
        const transaction = db.transaction(['contacts'], 'readwrite');
        const store = transaction.objectStore('contacts');
        await promisifyRequest(store.delete(contactId)); // 从IndexedDB删除

        // 如果删除的是当前正在聊天的对象，需要重置currentContact
        if (currentContact && currentContact.id === contactId) {
            currentContact = null;
    window.currentContact = null;
        }

        await renderContactList(); // 重新渲染联系人列表
        await saveDataToDB(); // 重新保存contacts数组到IndexedDB，确保数据同步
        
        // 清空该角色的记忆数据
        if (window.clearCharacterMemory) {
            await window.clearCharacterMemory(contactId);
            console.log(`[删除联系人] 已清空角色 ${contactId} 的记忆数据`);
        }
        
        showToast('聊天对象已删除');
    } catch (error) {
        console.error('删除联系人/群聊失败:', error);
        showToast('删除失败：' + error.message);
    }
}

/**
 * 显示自定义确认对话框
 * @param {string} title 对话框标题
 * @param {string} message 对话框消息
 * @param {function} onConfirm 用户点击确认按钮时执行的回调
 */
function showConfirmDialog(title, message, onConfirm) {
    const dialogId = 'customConfirmDialog';
    let dialog = document.getElementById(dialogId);
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = dialogId;
        dialog.className = 'modal'; // 复用modal的样式
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title" id="confirmDialogTitle"></div>
                    <div class="modal-close" onclick="closeModal('${dialogId}')">取消</div>
                </div>
                <div class="modal-body">
                    <p id="confirmDialogMessage" style="text-align: center; margin-bottom: 20px;"></p>
                    <div style="display: flex; justify-content: space-around; gap: 10px;">
                        <button class="form-submit" style="background-color: #ccc; flex: 1;" onclick="closeModal('${dialogId}')">取消</button>
                        <button class="form-submit delete-button" style="flex: 1;" id="confirmActionButton">确定</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }

    document.getElementById('confirmDialogTitle').textContent = title;
    document.getElementById('confirmDialogMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmActionButton');
    confirmBtn.onclick = () => {
        onConfirm();
        closeModal(dialogId);
    };

    showModal(dialogId);
}

/**
 * 显示消息操作菜单（编辑/删除）
 * @param {number} messageIndex 消息索引
 * @param {HTMLElement} messageElement 消息DOM元素
 */
function showMessageActionMenu(messageIndex, messageElement) {
    const menuId = 'messageActionMenu';
    let menu = document.getElementById(menuId);
    
    if (!menu) {
        menu = document.createElement('div');
        menu.id = menuId;
        menu.className = 'modal';
        menu.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title">消息操作</div>
                    <div class="modal-close" onclick="closeModal('${menuId}')">取消</div>
                </div>
                <div class="modal-body">
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <button class="form-submit" style="background-color: #576b95;" id="editMessageBtn">编辑</button>
                        <button class="form-submit" style="background-color: #ffa500;" id="multiSelectBtn">多选</button>
                        <button class="form-submit delete-button" id="deleteMessageBtn">删除</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(menu);
    }
    
    // 设置按钮点击事件
    document.getElementById('editMessageBtn').onclick = () => {
        closeModal(menuId);
        startEditMessage(messageIndex, messageElement);
    };
    
    document.getElementById('deleteMessageBtn').onclick = () => {
        closeModal(menuId);
        showConfirmDialog('删除消息', '确定要删除这条消息吗？此操作不可撤销。', () => deleteMessage(messageIndex));
    };
    
    document.getElementById('multiSelectBtn').onclick = () => {
        closeModal(menuId);
        enterMultiSelectMode();
    };
    
    showModal(menuId);
}

/**
 * 开始编辑消息
 * @param {number} messageIndex 消息索引
 * @param {HTMLElement} messageElement 消息DOM元素
 */
function startEditMessage(messageIndex, messageElement) {
    if (!currentContact || messageIndex === undefined || messageIndex < 0 || messageIndex >= currentContact.messages.length) {
        showToast('无效的消息索引或未选择聊天');
        return;
    }
    
    const message = currentContact.messages[messageIndex];
    
    // 创建编辑界面
    const editId = 'messageEditModal';
    let editModal = document.getElementById(editId);
    
    if (!editModal) {
        editModal = document.createElement('div');
        editModal.id = editId;
        editModal.className = 'modal';
        editModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title">编辑消息</div>
                    <div class="modal-close" onclick="closeModal('${editId}')">取消</div>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">消息内容</label>
                        <textarea id="editMessageTextarea" class="form-textarea" placeholder="输入消息内容..." rows="6"></textarea>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 20px;">
                        <button class="form-submit" style="background-color: #ccc; flex: 1;" onclick="closeModal('${editId}')">取消</button>
                        <button class="form-submit" style="flex: 1;" id="saveEditedMessageBtn">保存</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(editModal);
    }
    
    // 填充当前消息内容
    document.getElementById('editMessageTextarea').value = message.content;
    
    // 设置保存按钮事件
    document.getElementById('saveEditedMessageBtn').onclick = () => {
        const newContent = document.getElementById('editMessageTextarea').value.trim();
        if (!newContent) {
            showToast('消息内容不能为空');
            return;
        }
        saveEditedMessage(messageIndex, newContent);
        closeModal(editId);
    };
    
    showModal(editId);
    
    // 聚焦到文本域并选中全部文本
    setTimeout(() => {
        const textarea = document.getElementById('editMessageTextarea');
        textarea.focus();
        textarea.select();
    }, 300);
}

/**
 * 保存编辑后的消息
 * @param {number} messageIndex 消息索引
 * @param {string} newContent 新的消息内容
 */
async function saveEditedMessage(messageIndex, newContent) {
    if (!currentContact || messageIndex === undefined || messageIndex < 0 || messageIndex >= currentContact.messages.length) {
        showToast('无效的消息索引或未选择聊天');
        return;
    }
    
    // 更新消息内容
    currentContact.messages[messageIndex].content = newContent;
    currentContact.messages[messageIndex].edited = true;
    currentContact.messages[messageIndex].editTime = new Date().toISOString();
    
    // 重新渲染消息
    renderMessages(false);
    
    // 保存到数据库
    await saveDataToDB();
    
    showToast('消息已更新');
}

function formatContactListTime(dateString) {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diff = now - d;
    
    if (diff < 3600000) {
         const minutes = Math.floor(diff / 60000);
         return minutes < 1 ? '刚刚' : `${minutes}分钟前`;
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (today.getTime() === messageDate.getTime()) {
         const hours = d.getHours().toString().padStart(2, '0');
         const minutes = d.getMinutes().toString().padStart(2, '0');
         return `${hours}:${minutes}`;
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatChatTimestamp(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const beijingTime = new Date(date.getTime());
    const hours = beijingTime.getHours().toString().padStart(2, '0');
    const minutes = beijingTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (messageDate.getTime() === today.getTime()) {
        return timeStr;
    }
    if (messageDate.getTime() === yesterday.getTime()) {
        return `昨天 ${timeStr}`;
    }
    if (now.getFullYear() === date.getFullYear()) {
        const month = (date.getMonth() + 1);
        const day = date.getDate();
        return `${month}月${day}日 ${timeStr}`;
    } else {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1);
        const day = date.getDate();
        return `${year}年${month}月${day}日 ${timeStr}`;
    }
}

// --- 事件监听 ---
document.getElementById('chatInput').addEventListener('keypress', async (e) => { // Make it async
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        await sendUserMessage(); // Await the user message
    } 
});

document.addEventListener('click', (e) => {
    const settingsMenu = document.getElementById('settingsMenu');
    // 确保点击的不是设置菜单本身或其触发按钮
    if (settingsMenu && settingsMenu.style.display === 'block' && 
        !settingsMenu.contains(e.target) && !e.target.closest('.chat-more')) {
        settingsMenu.style.display = 'none';
    }
});

// --- 1. 修改你的 DOMContentLoaded 事件监听器 ---
// 找到文件末尾的这个事件监听器，用下面的代码替换它

document.addEventListener('DOMContentLoaded', async () => {
    // 兼容性检测：检测浏览器是否支持 :has() 选择器
    checkBrowserCompatibility();

    setupServiceWorkerUpdater();
    
    // 检查URL中是否有导入ID
    const urlParams = new URLSearchParams(window.location.search);
    const importId = urlParams.get('importId');

    if (importId) {
        // 如果有ID，则执行自动导入流程
        await handleAutoImport(importId);
    } else {
        // 否则，正常初始化应用
        await init();
    }
});

// 全局错误处理器
window.addEventListener('error', (event) => {
    console.error('全局JavaScript错误:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? {
            name: event.error.name,
            message: event.error.message,
        } : null,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    });
});

// 处理Promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    });
});

// --- 新增：帖子选择和手动发帖功能 ---

function showPostChoiceModal() {
    showModal('postChoiceModal');
}

function selectPostType(type) {
    closeModal('postChoiceModal');
    
    if (type === 'manual') {
        showManualPostModal();
    } else if (type === 'generate') {
        showGeneratePostModal();
    }
}

function showManualPostModal() {
    // 设置默认发帖人为用户
    document.getElementById('manualPostAuthor').value = userProfile.name;
    document.getElementById('manualPostTag').value = '碎碎念';
    document.getElementById('manualPostContent').value = '';
    document.getElementById('manualPostImageDesc').value = '';
    
    showModal('manualPostModal');
}

async function handleManualPost(event) {
    event.preventDefault();
    
    const authorName = document.getElementById('manualPostAuthor').value;
    const relationTag = document.getElementById('manualPostTag').value.trim();
    const postContent = document.getElementById('manualPostContent').value.trim();
    const imageDescription = document.getElementById('manualPostImageDesc').value.trim();
    
    if (!postContent) {
        showToast('请填写帖子内容');
        return;
    }
    
    if (!relationTag) {
        showToast('请填写话题标签');
        return;
    }
    
    closeModal('manualPostModal');
    
    // 生成手动帖子
    await generateManualPost(authorName, relationTag, postContent, imageDescription);
}

async function generateManualPost(authorName, relationTag, postContent, imageDescription) {
    const now = Date.now();
    const postCreatedAt = new Date(now - (Math.random() * 3 + 2) * 60 * 1000);
    
    // 先创建不带评论的帖子并立即显示
    const weiboData = {
        relation_tag: relationTag,
        posts: [{
            author_type: 'User', // 用户自己发的帖子
            post_content: postContent,
            image_description: imageDescription || '暂无图片描述',
            comments: [], // 先显示空评论，后面再添加
            timestamp: postCreatedAt.toISOString()
        }]
    };
    
    const newPost = {
        id: Date.now(),
        contactId: null, // 用户自己发的帖子
        relations: relationTag,
        relationDescription: relationTag,
        hashtag: relationTag,
        data: weiboData,
        createdAt: postCreatedAt.toISOString()
    };

    // 保存并立即显示帖子
    await saveWeiboPost(newPost);
    weiboPosts.push(newPost);
    renderAllWeiboPosts();
    showToast('帖子发布成功！');

    // 检查并更新全局记忆（用户发帖内容）
    if (window.characterMemoryManager) {
        const forumContent = `用户发帖：\n标题：${relationTag}\n内容：${postContent}${imageDescription ? '\n图片描述：' + imageDescription : ''}`;
        window.characterMemoryManager.checkAndUpdateGlobalMemory(forumContent);
    }

    // 如果没有配置API，就只显示帖子，不生成评论
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('未配置API，仅发布帖子，无评论生成');
        return;
    }
    
    // 显示加载指示器
    const container = document.getElementById('weiboContainer');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-text';
    loadingIndicator.textContent = '正在生成评论...';
    loadingIndicator.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 20px; z-index: 1000;';
    document.body.appendChild(loadingIndicator);
    
    try {
        // 调用新的手动帖子提示词构建方法
        const systemPrompt = await window.promptBuilder.buildManualPostPrompt(
            authorName,
            relationTag,
            postContent,
            imageDescription,
            userProfile,
            contacts,
            emojis
        );
        
        const payload = {
            model: apiSettings.model,
            messages: [{ role: 'user', content: systemPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.8
        };

        const apiUrl = `${apiSettings.url}/chat/completions`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiSettings.key}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        let rawText = data.choices[0].message.content;
        
        if (!rawText) {
            throw new Error("AI未返回有效内容");
        }
        
        // 使用统一的JSON提取函数清理markdown语法
        let cleanedJson;
        try {
            cleanedJson = window.apiService.extractJSON(rawText);
        } catch (extractError) {
            console.error('JSON提取失败:', extractError);
            throw new Error(`JSON提取失败: ${extractError.message}`);
        }

        const commentsData = JSON.parse(cleanedJson);
        
        let lastCommentTime = postCreatedAt.getTime();
        
        // 为每个评论添加时间戳
        const comments = commentsData.comments.map(comment => {
            const newCommentTimestamp = lastCommentTime + (Math.random() * 2 * 60 * 1000);
            lastCommentTime = newCommentTimestamp;
            return {
                ...comment,
                timestamp: new Date(Math.min(newCommentTimestamp, now)).toISOString()
            };
        });

        // 更新帖子数据，添加评论
        newPost.data.posts[0].comments = comments;
        
        // 更新数据库
        await updateWeiboPost(newPost);
        
        // 也需要更新内存中的数组
        const postIndex = weiboPosts.findIndex(p => p.id === newPost.id);
        if (postIndex !== -1) {
            weiboPosts[postIndex] = newPost;
        }
        
        // 重新渲染页面
        renderAllWeiboPosts();
        showToast('评论生成完成！');

    } catch (error) {
        console.error('生成评论失败:', error);
        showToast('生成评论失败: ' + error.message);
    } finally {
        loadingIndicator.remove();
    }
}

// --- 批量删除消息功能 ---

/**
 * 进入多选模式
 */
function enterMultiSelectMode() {
    if (!currentContact) return;
    
    isMultiSelectMode = true;
    selectedMessages.clear();
    
    // 重新渲染消息以显示多选状态
    renderMessages(false);
    
    // 显示操作按钮
    showMultiSelectButtons();
    
    showToast('多选模式已开启，点击消息进行选择');
}

/**
 * 退出多选模式
 */
function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedMessages.clear();
    
    // 重新渲染消息
    renderMessages(false);
    
    // 隐藏操作按钮
    hideMultiSelectButtons();
}

/**
 * 显示多选操作按钮
 */
function showMultiSelectButtons() {
    let buttonsDiv = document.getElementById('multiSelectButtons');
    if (!buttonsDiv) {
        buttonsDiv = document.createElement('div');
        buttonsDiv.id = 'multiSelectButtons';
        buttonsDiv.className = 'multi-select-buttons';
        buttonsDiv.innerHTML = `
            <button class="multi-select-btn cancel-btn" onclick="exitMultiSelectMode()">取消</button>
            <button class="multi-select-btn delete-btn" onclick="deleteSelectedMessages()">删除</button>
        `;
        document.body.appendChild(buttonsDiv);
    }
    buttonsDiv.style.display = 'flex';
    
    // 隐藏底部导航栏
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.display = 'none';
    }
}

/**
 * 隐藏多选操作按钮
 */
function hideMultiSelectButtons() {
    const buttonsDiv = document.getElementById('multiSelectButtons');
    if (buttonsDiv) {
        buttonsDiv.style.display = 'none';
    }
    
    // 显示底部导航栏
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.display = 'flex';
    }
}

/**
 * 切换消息的选中状态
 */
function toggleMessageSelection(messageIndex) {
    if (selectedMessages.has(messageIndex)) {
        selectedMessages.delete(messageIndex);
    } else {
        selectedMessages.add(messageIndex);
    }
    
    // 更新该消息的视觉效果
    updateMessageSelectStyle(messageIndex);
}

/**
 * 更新消息的选中样式
 */
function updateMessageSelectStyle(messageIndex) {
    const messageElements = document.querySelectorAll('.message');
    const messageElement = Array.from(messageElements).find(el => 
        parseInt(el.dataset.messageIndex) === messageIndex
    );
    
    if (messageElement) {
        if (selectedMessages.has(messageIndex)) {
            messageElement.classList.add('message-selected');
        } else {
            messageElement.classList.remove('message-selected');
        }
    }
}

/**
 * 删除选中的消息
 */
function deleteSelectedMessages() {
    if (selectedMessages.size === 0) {
        showToast('请先选择要删除的消息');
        return;
    }
    
    const selectedCount = selectedMessages.size;
    showConfirmDialog('批量删除确认', `即将批量删除所选消息（${selectedCount}条），是否确认？`, async () => {
        try {
            // 将选中的索引转换为数组并排序（从大到小，避免删除时索引变化）
            const sortedIndexes = Array.from(selectedMessages).sort((a, b) => b - a);
            
            // 保存被删除的消息，用于记忆更新
            const deletedMessages = [];
            for (const messageIndex of sortedIndexes) {
                if (messageIndex < currentContact.messages.length) {
                    deletedMessages.push(currentContact.messages[messageIndex]);
                }
            }
            
            // 逐个删除消息
            for (const messageIndex of sortedIndexes) {
                if (messageIndex < currentContact.messages.length) {
                    currentContact.messages.splice(messageIndex, 1);
                }
            }
            
            // 更新联系人最后消息信息
            if (currentContact.messages.length > 0) {
                const lastMsg = currentContact.messages[currentContact.messages.length - 1];
                currentContact.lastMessage = lastMsg.type === 'text' ? lastMsg.content.substring(0, 20) + '...' : 
                                           (lastMsg.type === 'emoji' ? '[表情]' : '[红包]');
                currentContact.lastTime = formatContactListTime(lastMsg.time);
            } else {
                currentContact.lastMessage = '暂无消息';
                currentContact.lastTime = formatContactListTime(new Date().toISOString());
            }
            
            // 更新当前显示的消息数量
            if (currentlyDisplayedMessageCount > currentContact.messages.length) {
                currentlyDisplayedMessageCount = currentContact.messages.length;
            }
            
            // 退出多选模式
            exitMultiSelectMode();
            
            // 重新渲染
            await renderContactList();
            await saveDataToDB();
            
            // 检查并更新记忆
            if (window.checkAndUpdateMemoryAfterDeletion && deletedMessages.length > 0) {
                try {
                    await window.checkAndUpdateMemoryAfterDeletion(currentContact.id, deletedMessages, currentContact);
                } catch (error) {
                    console.error('批量删除消息后更新记忆失败:', error);
                }
            }
            
            showToast(`已成功删除 ${selectedCount} 条消息`);
            
        } catch (error) {
            console.error('批量删除消息失败:', error);
            showToast('删除失败：' + error.message);
        }
    });
}

// === 记忆管理系统 ===
class MemoryManager {
    constructor() {
        // 不再使用localStorage存储，直接使用indexedDB
        this.currentMemoryType = 'global';
        this.currentCharacter = null;
        this.selectedMemoryId = null;
    }

    // 获取全局记忆（从indexedDB读取）
    async getGlobalMemories() {
        if (!window.characterMemoryManager) {
            return [];
        }
        
        const globalMemory = await window.characterMemoryManager.getGlobalMemory();
        if (!globalMemory || !globalMemory.trim()) {
            return [];
        }
        
        // 将全局记忆转换为记忆数组格式
        const memoryItems = this.parseMemoryItems(globalMemory);
        return [{
            id: 'global-memory',
            content: globalMemory,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: memoryItems
        }];
    }

    // 获取角色记忆（从indexedDB读取）
    async getCharacterMemories(characterId) {
        if (!window.characterMemoryManager) {
            return [];
        }
        
        const characterMemory = await window.characterMemoryManager.getCharacterMemory(characterId);
        if (!characterMemory || !characterMemory.trim()) {
            return [];
        }
        
        // 将角色记忆转换为记忆数组格式
        const memoryItems = this.parseMemoryItems(characterMemory);
        return [{
            id: `character-memory-${characterId}`,
            content: characterMemory,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: memoryItems
        }];
    }

    // 添加全局记忆（直接保存到indexedDB）
    async addGlobalMemory(content) {
        // 清理内容，只保留有效的markdown列表项
        const cleanedContent = this.cleanAndValidateMemoryContent(content);
        
        if (!cleanedContent) {
            throw new Error('无效的记忆格式！请使用 "- 记忆内容" 的格式');
        }
        
        if (!window.characterMemoryManager) {
            throw new Error('记忆管理系统未初始化');
        }
        
        // 获取现有全局记忆
        const existingMemory = await window.characterMemoryManager.getGlobalMemory();
        let combinedMemory;
        
        if (existingMemory && existingMemory.trim()) {
            combinedMemory = existingMemory + '\n' + cleanedContent;
        } else {
            combinedMemory = cleanedContent;
        }
        
        // 直接保存到indexedDB
        const success = await window.characterMemoryManager.saveGlobalMemory(combinedMemory);
        
        if (!success) {
            throw new Error('保存全局记忆失败');
        }
        
        const memory = {
            id: Date.now().toString(),
            content: cleanedContent,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        return memory;
    }

    // 添加角色记忆（直接保存到indexedDB）
    async addCharacterMemory(characterId, content) {
        // 清理内容，只保留有效的markdown列表项
        const cleanedContent = this.cleanAndValidateMemoryContent(content);
        
        if (!cleanedContent) {
            throw new Error('无效的记忆格式！请使用 "- 记忆内容" 的格式');
        }
        
        if (!window.characterMemoryManager) {
            throw new Error('记忆管理系统未初始化');
        }
        
        // 获取现有角色记忆
        const existingMemory = await window.characterMemoryManager.getCharacterMemory(characterId);
        let combinedMemory;
        
        if (existingMemory && existingMemory.trim()) {
            combinedMemory = existingMemory + '\n' + cleanedContent;
        } else {
            combinedMemory = cleanedContent;
        }
        
        // 直接保存到indexedDB
        const success = await window.characterMemoryManager.saveCharacterMemory(characterId, combinedMemory);
        
        if (!success) {
            throw new Error('保存角色记忆失败');
        }
        
        const memory = {
            id: Date.now().toString(),
            content: cleanedContent,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        return memory;
    }

    // 更新记忆（直接更新indexedDB）
    async updateMemory(memoryId, content, isCharacter = false, characterId = null) {
        // 清理内容，只保留有效的markdown列表项
        const cleanedContent = this.cleanAndValidateMemoryContent(content);
        
        if (!cleanedContent) {
            throw new Error('无效的记忆格式！请使用 "- 记忆内容" 的格式');
        }
        
        if (!window.characterMemoryManager) {
            throw new Error('记忆管理系统未初始化');
        }
        
        let success = false;
        
        if (isCharacter && characterId) {
            // 直接替换角色记忆内容
            success = await window.characterMemoryManager.saveCharacterMemory(characterId, cleanedContent);
        } else {
            // 直接替换全局记忆内容
            success = await window.characterMemoryManager.saveGlobalMemory(cleanedContent);
        }
        
        if (!success) {
            throw new Error('更新记忆失败');
        }
        
        const memory = {
            id: memoryId,
            content: cleanedContent,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        return memory;
    }

    // 删除记忆（直接从 indexedDB 删除）
    async deleteMemory(memoryId, isCharacter = false, characterId = null) {
        if (!window.characterMemoryManager) {
            throw new Error('记忆管理系统未初始化');
        }
        
        let success = false;
        
        if (isCharacter && characterId) {
            // 清空角色记忆
            success = await window.characterMemoryManager.saveCharacterMemory(characterId, '');
        } else {
            // 清空全局记忆
            success = await window.characterMemoryManager.saveGlobalMemory('');
        }
        
        return success;
    }

    // 注意：这些同步方法已被上面的异步方法替代
    // 如果代码中有同步调用，会出现错误，需要改为异步调用

    // 清理和验证记忆内容，只保留有效的markdown列表项
    cleanAndValidateMemoryContent(content) {
        if (!content || typeof content !== 'string') {
            return '';
        }
        
        const lines = content.split('\n');
        const validLines = [];
        
        lines.forEach(line => {
            const trimmedLine = line.trim();
            // 只保留以 "- " 开头的行
            if (trimmedLine.startsWith('- ') && trimmedLine.length > 2) {
                validLines.push(trimmedLine);
            }
        });
        
        return validLines.join('\n');
    }
    
    // 将记忆内容分解为单独的记忆项列表
    parseMemoryItems(content) {
        const cleanContent = this.cleanAndValidateMemoryContent(content);
        if (!cleanContent) return [];
        
        return cleanContent.split('\n').map(line => {
            // 移除前面的 "- " 得到纯内容
            return line.replace(/^- /, '').trim();
        }).filter(item => item.length > 0);
    }
    
    // 从记忆项列表重建markdown内容
    buildMemoryContent(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return '';
        }
        
        return items.map(item => `- ${item.trim()}`).join('\n');
    }
    
    // 解析Markdown到HTML（仅支持列表）
    parseMarkdown(content) {
        const cleanContent = this.cleanAndValidateMemoryContent(content);
        if (!cleanContent) return '';
        
        const lines = cleanContent.split('\n');
        const listItems = lines.map(line => {
            const item = line.replace(/^- /, '');
            return `<li>${this.escapeHtml(item)}</li>`;
        }).join('');
        
        return listItems ? `<ul>${listItems}</ul>` : '';
    }
    
    // HTML转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化记忆管理器
const memoryManager = new MemoryManager();

// 显示添加记忆模态框
async function showAddMemoryModal() {
    const modal = document.getElementById('addMemoryModal');
    const memoryType = document.getElementById('memoryType');
    const characterSelectGroup = document.getElementById('characterSelectGroup');
    const memoryCharacterSelect = document.getElementById('memoryCharacterSelect');
    
    // 默认设置为全局记忆类型
    memoryType.value = 'global';
    
    // 如果数据还没准备好，等待一下
    if (!window.contacts || !Array.isArray(window.contacts) || window.contacts.length === 0) {
        console.log('数据未准备好，等待加载...');
        await waitForDataReady();
    }
    
    // 填充角色选择器
    memoryCharacterSelect.innerHTML = '<option value="">选择角色...</option>';
    
    // 确保contacts数组存在
    if (window.contacts && Array.isArray(window.contacts)) {
        let aiCount = 0;
        
        window.contacts.forEach(contact => {
            console.log(`检查联系人: ${contact.name}, 类型: ${contact.type}`);
            if (contact.type === 'private') {
                const option = document.createElement('option');
                option.value = contact.id;
                option.textContent = contact.name;
                memoryCharacterSelect.appendChild(option);
                aiCount++;
            }
        });
        
        if (aiCount === 0) {
            console.warn('没有找到任何AI角色，可能数据有问题');
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '暂无可用角色';
            option.disabled = true;
            memoryCharacterSelect.appendChild(option);
        }
    } else {
        console.warn('contacts数组不可用，无法填充角色选择器');
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '数据加载中...';
        option.disabled = true;
        memoryCharacterSelect.appendChild(option);
    }
    
    // 初始化时确保隐藏角色选择（因为默认是全局记忆）
    characterSelectGroup.classList.add('hidden');
    
    showModal('addMemoryModal');
}

// 处理记忆类型改变
function handleMemoryTypeChange() {
    const memoryType = document.getElementById('memoryType').value;
    const characterSelectGroup = document.getElementById('characterSelectGroup');
    
    if (memoryType === 'character') {
        characterSelectGroup.classList.remove('hidden');
    } else {
        characterSelectGroup.classList.add('hidden');
    }
}

// 处理添加记忆
async function handleAddMemory(event) {
    event.preventDefault();
    
    const memoryType = document.getElementById('memoryType').value;
    let memoryContent = document.getElementById('memoryContent').value.trim();
    const memoryCharacterSelect = document.getElementById('memoryCharacterSelect').value;
    
    // 自动为每行添加 - 前缀
    if (memoryContent) {
        const lines = memoryContent.split('\n');
        const formattedLines = lines.map(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('- ')) {
                return '- ' + trimmedLine;
            }
            return trimmedLine;
        }).filter(line => line.length > 0);
        memoryContent = formattedLines.join('\n');
    }
    
    if (!memoryContent) {
        showToast('请输入记忆内容');
        return;
    }
    
    if (memoryType === 'character' && !memoryCharacterSelect) {
        console.error('角色记忆但未选择角色:', { memoryType, memoryCharacterSelect });
        showToast('请选择角色');
        return;
    }
    
    // 验证选择的角色是否存在（角色记忆模式）
    if (memoryType === 'character') {
        const selectedContact = window.contacts && window.contacts.find(c => c.id === memoryCharacterSelect);
        if (!selectedContact) {
            console.error('选择的角色不存在:', memoryCharacterSelect);
            showToast('选择的角色不存在，请重新选择');
            return;
        }
    }
    
    try {
        if (memoryType === 'global') {
            await memoryManager.addGlobalMemory(memoryContent);
            showToast('全局记忆添加成功');
            if (memoryManager.currentMemoryType === 'global') {
                loadGlobalMemories();
            }
        } else {
            await memoryManager.addCharacterMemory(memoryCharacterSelect, memoryContent);
            showToast('角色记忆添加成功');
            if (memoryManager.currentMemoryType === 'character' && memoryManager.currentCharacter === memoryCharacterSelect) {
                loadCharacterMemories();
            }
        }
        
        closeModal('addMemoryModal');
        document.getElementById('memoryContent').value = '';
    } catch (error) {
        console.error('添加记忆失败:', error);
        showToast('添加记忆失败');
    }
}

// 切换记忆标签
function switchMemoryTab(type) {
    const globalTab = document.querySelector('.memory-tab:first-child');
    const characterTab = document.querySelector('.memory-tab:last-child');
    const globalSection = document.getElementById('globalMemorySection');
    const characterSection = document.getElementById('characterMemorySection');
    
    // 更新标签样式
    globalTab.classList.toggle('active', type === 'global');
    characterTab.classList.toggle('active', type === 'character');
    
    // 显示对应内容
    globalSection.classList.toggle('hidden', type !== 'global');
    characterSection.classList.toggle('hidden', type !== 'character');
    
    memoryManager.currentMemoryType = type;
    
    if (type === 'global') {
        loadGlobalMemories();
    } else {
        // 切换到角色记忆时重新加载角色选择器
        loadCharacterSelector();
        
        // 如果角色选择器为空，说明数据可能还没加载完成
        const characterSelector = document.getElementById('characterSelector');
        if (characterSelector && characterSelector.options.length <= 1) {
            waitForDataReady().then(() => {
                loadCharacterSelector();
            });
        }
    }
}

// 加载全局记忆
async function loadGlobalMemories() {
    const memoryList = document.getElementById('globalMemoryList');
    if (!memoryList) return;
    
    try {
        const memories = await memoryManager.getGlobalMemories();
        
        if (memories.length === 0) {
            memoryList.innerHTML = '<div class="memory-empty">暂无全局记忆</div>';
            return;
        }
        
        memoryList.innerHTML = memories.map(memory => createMemoryItem(memory, false)).join('');
    } catch (error) {
        console.error('加载全局记忆失败:', error);
        memoryList.innerHTML = '<div class="memory-empty">加载失败</div>';
    }
}

// 加载角色选择器
function loadCharacterSelector() {
    const characterSelector = document.getElementById('characterSelector');
    if (!characterSelector) {
        console.error('角色选择器元素未找到');
        return;
    }
    
    characterSelector.innerHTML = '<option value="">选择角色...</option>';
    
    // 确保contacts数组存在
    if (!window.contacts || !Array.isArray(window.contacts)) {
        console.warn('contacts数组不可用，无法加载角色');
        return;
    }
        
    let aiContactCount = 0;
    let totalContactCount = 0;
    window.contacts.forEach(contact => {
        totalContactCount++;
        if (contact.type === 'private') {
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = contact.name;
            characterSelector.appendChild(option);
            aiContactCount++;
        }
    });
    
    
    // 如果没有加载到任何角色，强制刷新一次
    if (aiContactCount === 0 && totalContactCount > 0) {
        setTimeout(() => {
            loadCharacterSelector();
        }, 1000);
    }
}

// 加载角色记忆
async function loadCharacterMemories() {
    const characterSelector = document.getElementById('characterSelector');
    const memoryList = document.getElementById('characterMemoryList');
    
    if (!characterSelector || !memoryList) {
        return;
    }
    
    const characterId = characterSelector.value;
    
    if (!characterId) {
        memoryList.innerHTML = '<div class="memory-empty">请先选择角色</div>';
        return;
    }
    
    // 验证选择的角色是否存在
    const selectedContact = window.contacts && window.contacts.find(c => c.id === characterId);
    if (!selectedContact) {
        memoryList.innerHTML = '<div class="memory-empty">选择的角色不存在，请重新选择</div>';
        return;
    }
    
    try {
        memoryManager.currentCharacter = characterId;
        const memories = await memoryManager.getCharacterMemories(characterId);
        
        if (memories.length === 0) {
            memoryList.innerHTML = '<div class="memory-empty">该角色暂无记忆</div>';
            return;
        }
        
        memoryList.innerHTML = memories.map(memory => createMemoryItem(memory, true, characterId)).join('');
    } catch (error) {
        console.error('加载角色记忆失败:', error);
        memoryList.innerHTML = '<div class="memory-empty">加载失败</div>';
    }
}

// 创建记忆项HTML - 改为单条模式
function createMemoryItem(memory, isCharacter, characterId = null) {
    const date = new Date(memory.createdAt).toLocaleDateString();
    const memoryItems = memoryManager.parseMemoryItems(memory.content);
    
    // 为每个记忆项创建单独的卡片
    return memoryItems.map((item, index) => {
        const itemId = `${memory.id}-${index}`;
        
        return `
            <div class="memory-item single-item" data-id="${itemId}" data-memory-id="${memory.id}" data-item-index="${index}">
                <div class="memory-single-content">
                    <div class="memory-text">${memoryManager.escapeHtml(item)}</div>
                    <div class="memory-meta">
                        <span class="memory-date">${date}</span>
                        <div class="memory-actions">
                            <button class="memory-edit-btn" onclick="editSingleMemoryItem('${memory.id}', ${index}, ${isCharacter}, '${characterId || ''}')">修改</button>
                            <button class="memory-edit-btn delete" onclick="deleteSingleMemoryItem('${memory.id}', ${index}, ${isCharacter}, '${characterId || ''}')">删除</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 编辑单个记忆项
async function editSingleMemoryItem(memoryId, itemIndex, isCharacter, characterId) {
    let memory;
    if (isCharacter && characterId) {
        const memories = await memoryManager.getCharacterMemories(characterId);
        if (!Array.isArray(memories)) {
            showToast('获取记忆数据失败');
            return;
        }
        memory = memories.find(m => m.id === memoryId);
    } else {
        const memories = await memoryManager.getGlobalMemories();
        if (!Array.isArray(memories)) {
            showToast('获取记忆数据失败');
            return;
        }
        memory = memories.find(m => m.id === memoryId);
    }
    
    if (!memory) {
        showToast('记忆未找到');
        return;
    }
    
    const memoryItems = memoryManager.parseMemoryItems(memory.content);
    if (itemIndex >= memoryItems.length) {
        showToast('记忆项未找到');
        return;
    }
    
    const currentItem = memoryItems[itemIndex];
    
    // 设置编辑上下文信息
    memoryManager.singleMemoryEditContext = {
        memoryId,
        itemIndex,
        isCharacter,
        characterId,
        memoryItems
    };
    
    // 使用自定义模态窗口进行编辑
    const editSingleContentTextarea = document.getElementById('editSingleMemoryContent');
    editSingleContentTextarea.value = currentItem;
    
    showModal('editSingleMemoryModal');
}

// 删除单个记忆项
async function deleteSingleMemoryItem(memoryId, itemIndex, isCharacter, characterId) {
    if (!confirm('确定要删除这条记忆吗？')) {
        return;
    }
    
    let memory;
    if (isCharacter && characterId) {
        const memories = await memoryManager.getCharacterMemories(characterId);
        if (!Array.isArray(memories)) {
            showToast('获取记忆数据失败');
            return;
        }
        memory = memories.find(m => m.id === memoryId);
    } else {
        const memories = await memoryManager.getGlobalMemories();
        if (!Array.isArray(memories)) {
            showToast('获取记忆数据失败');
            return;
        }
        memory = memories.find(m => m.id === memoryId);
    }
    
    if (!memory) {
        showToast('记忆未找到');
        return;
    }
    
    const memoryItems = memoryManager.parseMemoryItems(memory.content);
    if (itemIndex >= memoryItems.length) {
        showToast('记忆项未找到');
        return;
    }
    
    // 删除指定项
    memoryItems.splice(itemIndex, 1);
    
    if (memoryItems.length === 0) {
        // 如果没有记忆项了，删除整个记忆
        await memoryManager.deleteMemory(memoryId, isCharacter, characterId);
    } else {
        // 更新记忆内容
        const updatedContent = memoryManager.buildMemoryContent(memoryItems);
        await updateSingleMemory(memoryId, updatedContent, isCharacter, characterId);
    }
    
    // 刷新显示
    if (isCharacter) {
        loadCharacterMemories();
    } else {
        loadGlobalMemories();
    }
    
    showToast('记忆删除成功');
}

// 更新单个记忆的辅助函数
async function updateSingleMemory(memoryId, content, isCharacter, characterId) {
    try {
        const updated = await memoryManager.updateMemory(memoryId, content, isCharacter, characterId);
        if (updated) {
            // 刷新显示
            if (isCharacter) {
                loadCharacterMemories();
            } else {
                loadGlobalMemories();
            }
            showToast('记忆更新成功');
        } else {
            showToast('记忆更新失败');
        }
    } catch (error) {
        console.error('更新记忆失败:', error);
        showToast('记忆更新失败: ' + error.message);
    }
}

// 编辑记忆
async function editMemory(memoryId, isCharacter, characterId) {
    memoryManager.selectedMemoryId = memoryId;
    
    let memory;
    if (isCharacter && characterId) {
        const memories = await memoryManager.getCharacterMemories(characterId);
        if (!Array.isArray(memories)) {
            showToast('获取记忆数据失败');
            return;
        }
        memory = memories.find(m => m.id === memoryId);
    } else {
        const memories = await memoryManager.getGlobalMemories();
        if (!Array.isArray(memories)) {
            showToast('获取记忆数据失败');
            return;
        }
        memory = memories.find(m => m.id === memoryId);
    }
    
    if (!memory) {
        showToast('记忆未找到');
        return;
    }
    
    const editContentTextarea = document.getElementById('editMemoryContent');
    editContentTextarea.value = memory.content;
    
    // 存储编辑上下文
    memoryManager.editingContext = {
        isCharacter,
        characterId
    };
    
    showModal('editMemoryModal');
}

// 处理编辑记忆
async function handleEditMemory(event) {
    event.preventDefault();
    
    const newContent = document.getElementById('editMemoryContent').value.trim();
    const memoryId = memoryManager.selectedMemoryId;
    const context = memoryManager.editingContext || {};
    
    if (!newContent) {
        showToast('请输入记忆内容');
        return;
    }
    
    if (!memoryId) {
        showToast('记忆ID丢失');
        return;
    }
    
    try {
        const updated = await memoryManager.updateMemory(memoryId, newContent, context.isCharacter, context.characterId);
        if (updated) {
            showToast('记忆更新成功');
            closeModal('editMemoryModal');
            
            // 刷新显示
            if (context.isCharacter) {
                loadCharacterMemories();
            } else {
                loadGlobalMemories();
            }
        } else {
            showToast('记忆更新失败');
        }
    } catch (error) {
        console.error('更新记忆失败:', error);
        showToast('记忆更新失败');
    }
}

// 处理编辑单个记忆项
async function handleEditSingleMemory(event) {
    event.preventDefault();
    
    const newContent = document.getElementById('editSingleMemoryContent').value.trim();
    const context = memoryManager.singleMemoryEditContext;
    
    if (!newContent) {
        showToast('请输入记忆内容');
        return;
    }
    
    if (!context) {
        showToast('编辑上下文丢失');
        return;
    }
    
    try {
        // 更新记忆项
        context.memoryItems[context.itemIndex] = newContent;
        const updatedContent = memoryManager.buildMemoryContent(context.memoryItems);
        
        // 更新记忆
        await updateSingleMemory(context.memoryId, updatedContent, context.isCharacter, context.characterId);
        
        showToast('记忆项更新成功');
        closeModal('editSingleMemoryModal');
        
        // 清理上下文
        memoryManager.singleMemoryEditContext = null;
        
        // 刷新显示
        if (context.isCharacter) {
            loadCharacterMemories();
        } else {
            loadGlobalMemories();
        }
    } catch (error) {
        console.error('更新记忆项失败:', error);
        showToast('记忆项更新失败');
    }
}

// 删除记忆
async function deleteMemory(memoryId, isCharacter, characterId) {
    const confirmMessage = '确定要删除这条记忆吗？';
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const deleted = await memoryManager.deleteMemory(memoryId, isCharacter, characterId);
        if (deleted) {
            showToast('记忆删除成功');
            
            // 刷新显示
            if (isCharacter) {
                loadCharacterMemories();
            } else {
                loadGlobalMemories();
            }
        } else {
            showToast('记忆删除失败');
        }
    } catch (error) {
        console.error('删除记忆失败:', error);
        showToast('记忆删除失败');
    }
}

// 初始化记忆管理页面
async function initMemoryManagementPage() {
    
    // 确保数据已经加载
    if (!window.contacts || !Array.isArray(window.contacts) || window.contacts.length === 0) {
        console.log('数据未准备好，等待加载完成...');
        const dataReady = await waitForDataReady();
        if (!dataReady) {
            console.warn('数据加载超时，但继续初始化页面');
        }
    }
    
    try {
        // 从现有系统加载数据
        await loadExistingMemories();
        
        // 默认加载全局记忆
        await loadGlobalMemories();
        loadCharacterSelector();
        
        // 检查角色选择器是否成功加载
        setTimeout(() => {
            const characterSelector = document.getElementById('characterSelector');
            if (characterSelector && characterSelector.options.length <= 1) {
                loadCharacterSelector();
            }
        }, 500);
        
    } catch (error) {
        console.error('初始化记忆管理页面失败:', error);
        // 即使加载失败也显示界面
        await loadGlobalMemories();
        loadCharacterSelector();
    }
}

// 从现有记忆系统加载数据
async function loadExistingMemories() {
    
    try {
        // 加载全局记忆
        const existingGlobalMemory = await getExistingGlobalMemory();
        if (existingGlobalMemory && existingGlobalMemory.trim()) {
            // 清理现有记忆内容
            const cleanedGlobalMemory = memoryManager.cleanAndValidateMemoryContent(existingGlobalMemory);
            
            if (cleanedGlobalMemory) {
                // 由于现在直接使用indexedDB，不需要操作globalMemories数组
                console.log('全局记忆已存在于indexedDB中，跳过重复加载');
                
                // 如果清理后的内容与原内容不同，更新到现有系统
                if (cleanedGlobalMemory !== existingGlobalMemory) {
                    await saveExistingGlobalMemory(cleanedGlobalMemory);
                }
            }
        }
        
        // 加载角色记忆
        if (window.contacts && Array.isArray(window.contacts)) {
            for (const contact of window.contacts) {
                if (contact.type === 'private') {
                    const existingCharacterMemory = await getExistingCharacterMemory(contact.id);
                    if (existingCharacterMemory && existingCharacterMemory.trim()) {
                        // 清理现有角色记忆内容
                        const cleanedCharacterMemory = memoryManager.cleanAndValidateMemoryContent(existingCharacterMemory);
                        
                        if (cleanedCharacterMemory) {
                            // 由于现在直接使用indexedDB，不需要操作characterMemories数组
                            console.log(`角色${contact.id}的记忆已存在于indexedDB中，跳过重复加载`);
                            
                            // 如果清理后的内容与原内容不同，更新到现有系统
                            if (cleanedCharacterMemory !== existingCharacterMemory) {
                                await saveExistingCharacterMemory(contact.id, cleanedCharacterMemory);
                            }
                        }
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('加载现有记忆数据失败:', error);
    }
}

// 等待数据加载完成的函数
async function waitForDataReady() {
    let attempts = 0;
    const maxAttempts = 20; // 最多等待10秒
    
    while (attempts < maxAttempts) {
        if (window.contacts && Array.isArray(window.contacts) && window.isIndexedDBReady) {
            console.log(`数据准备完成，contacts数组长度: ${window.contacts.length}`);
            return true;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`等待数据加载中... 尝试 ${attempts}/${maxAttempts}`);
    }
    
    console.warn('等待数据加载超时，继续初始化记忆管理页面');
    return false;
}

// 页面显示时初始化记忆管理
document.addEventListener('DOMContentLoaded', function() {
    // 当显示记忆管理页面时初始化
    const originalShowPage = showPage;
    window.showPage = function(pageIdToShow) {
        originalShowPage(pageIdToShow);
        if (pageIdToShow === 'memoryManagementPage') {
            // 等待数据准备完成后再初始化
            waitForDataReady().then((dataReady) => {
                if (dataReady) {
                } else {
                    console.warn('数据准备超时，但仍尝试初始化页面');
                }
                initMemoryManagementPage();
            });
        }
    };
});

// 集成现有的记忆系统 - 添加接口函数
async function getExistingGlobalMemory() {
    if (window.characterMemoryManager) {
        return await window.characterMemoryManager.getGlobalMemory();
    }
    return '';
}

async function getExistingCharacterMemory(characterId) {
    if (window.characterMemoryManager) {
        return await window.characterMemoryManager.getCharacterMemory(characterId);
    }
    return null;
}

async function saveExistingGlobalMemory(content) {
    if (window.characterMemoryManager) {
        return await window.characterMemoryManager.saveGlobalMemory(content);
    }
    return false;
}

async function saveExistingCharacterMemory(characterId, content) {
    if (window.characterMemoryManager) {
        return await window.characterMemoryManager.saveCharacterMemory(characterId, content);
    }
    return false;
}

// 语音图标生成函数
function createVoiceIcon(state = 'default') {
    const baseProps = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
    
    switch (state) {
        case 'loading':
            return `<svg xmlns="http://www.w3.org/2000/svg" ${baseProps} stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/></svg>`;
        case 'playing':
            return `<svg xmlns="http://www.w3.org/2000/svg" ${baseProps} stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        default:
            return `<svg xmlns="http://www.w3.org/2000/svg" ${baseProps} stroke-width="2.5"><path d="M3 10v4 M7 7v10 M12 4v16 M17 7v10 M21 10v4" /></svg>`;
    }
}

// ElevenLabs 语音播放功能
/**
 * [MODIFIED] 播放或停止语音消息 - 支持缓存的 Minimax API
 * @param {HTMLElement} bubbleElement - 被点击的气泡元素
 * @param {string} text - 需要转换为语音的文本
 * @param {string} voiceId - Minimax 的声音ID
 */
async function playVoiceMessage(bubbleElement, text, voiceId) {
    // 1. 检查 Minimax API 凭证是否已在设置中配置
    if (!apiSettings.minimaxGroupId || !apiSettings.minimaxApiKey) {
        showToast('请在设置中填写 Minimax Group ID 和 API Key');
        return;
    }
    if (!voiceId) {
        showToast('该角色未设置语音ID');
        return;
    }

    // 2. 判断当前点击的气泡是否正在播放
    const wasPlaying = bubbleElement === currentPlayingElement && !voiceAudio.paused;

    // 3. 如果有任何音频正在播放，先停止它
    if (currentPlayingElement) {
        voiceAudio.pause();
        voiceAudio.currentTime = 0;
        const oldVoiceIcon = currentPlayingElement.querySelector('.voice-icon');
        if (oldVoiceIcon) oldVoiceIcon.innerHTML = createVoiceIcon();
        currentPlayingElement.classList.remove('playing', 'loading');
    }

    // 4. 如果点击的是正在播放的气泡，则仅停止，然后退出
    if (wasPlaying) {
        currentPlayingElement = null;
        return;
    }

    // 5. 设置当前气泡为活动状态并更新UI
    currentPlayingElement = bubbleElement;
    const voiceIcon = bubbleElement.querySelector('.voice-icon');

    try {
        // 显示加载状态
        bubbleElement.classList.add('loading');
        if (voiceIcon) voiceIcon.innerHTML = createVoiceIcon('loading');

        let audioUrl = null;
        let fromCache = false;

        // 6. 首先检查语音缓存
        if (window.VoiceStorageAPI) {
            try {
                audioUrl = await window.VoiceStorageAPI.getVoiceURL(text, voiceId);
                if (audioUrl) {
                    fromCache = true;
                    console.log('使用语音缓存:', { textLength: text.length, voiceId });
                }
            } catch (error) {
                console.error('检查语音缓存失败:', error);
            }
        }

        // 7. 如果缓存中没有，则调用 API 生成语音
        if (!audioUrl) {
            console.log('语音缓存未命中，调用API生成语音');
            
            const groupId = apiSettings.minimaxGroupId;
            const apiKey = apiSettings.minimaxApiKey;
            
            // Minimax API URL，将 GroupId 放在查询参数中
            const apiUrl = `https://api.minimax.chat/v1/text_to_speech?GroupId=${groupId}`;
            
            // 请求体
            const requestBody = {
                "voice_id": voiceId,
                "text": text,
                "model": "speech-01",
                "speed": 1.0,
                "vol": 1.0,
                "pitch": 0
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    // 授权头，注意这里只用 API Key
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Minimax TTS API Response Status:', response.status);
            console.log('Minimax TTS API Response Headers:', Object.fromEntries(response.headers.entries()));

            // 处理 API 响应
            const contentType = response.headers.get('content-type') || '';
            
            // 检查是否返回了JSON错误信息（即使状态码是200）
            if (!response.ok || contentType.includes('application/json')) {
                let errorMsg = `语音服务错误 (状态码: ${response.status})`;
                try {
                    const errorData = await response.json();
                    console.error('Minimax TTS API Error Response:', errorData);
                    
                    // 尝试从返回的JSON中获取更具体的错误信息
                    if (errorData && errorData.base_resp && errorData.base_resp.status_msg) {
                        errorMsg += `: ${errorData.base_resp.status_msg}`;
                    } else if (errorData && errorData.error) {
                        errorMsg += `: ${errorData.error}`;
                    } else if (errorData && errorData.message) {
                        errorMsg += `: ${errorData.message}`;
                    } else {
                        errorMsg += `: ${JSON.stringify(errorData)}`;
                    }
                } catch (e) {
                    // 如果解析JSON失败，则直接显示文本响应
                    const errorText = await response.text();
                    console.error('Minimax TTS API Error Text Response:', errorText);
                    errorMsg += `: ${errorText}`;
                }
                throw new Error(errorMsg);
            }

            // 处理成功的响应
            // 服务器返回的是音频数据流，我们将其转换为 Blob
            const audioBlob = await response.blob();
            
            if (!audioBlob || !audioBlob.type.startsWith('audio/')) {
                console.error("服务器未返回有效的音频。Content-Type:", audioBlob.type);
                throw new Error(`服务器返回了非预期的内容类型: ${audioBlob.type}`);
            }

            // 8. 保存到缓存（异步进行，不阻塞播放）
            if (window.VoiceStorageAPI) {
                window.VoiceStorageAPI.storeVoice(audioBlob, text, voiceId, {
                    model: "speech-01",
                    apiSource: "minimax",
                    generatedAt: new Date().toISOString()
                }).then(() => {
                    console.log('语音已保存到缓存:', { textLength: text.length, voiceId });
                }).catch(error => {
                    console.error('语音缓存保存失败:', error);
                });
            }

            // 创建一个临时的 URL 指向这个 Blob 数据
            audioUrl = URL.createObjectURL(audioBlob);
        }

        // 9. 播放音频
        voiceAudio.src = audioUrl;

        // 当音频元数据加载完成后，显示时长（可选，语音图标方案可以不显示时长）
        voiceAudio.onloadedmetadata = () => {
            if (isFinite(voiceAudio.duration)) {
                // 在新的设计中，我们不需要显示时长，因为没有duration元素
                console.log('语音时长:', voiceAudio.duration + '秒');
            }
        };

        // 播放音频
        await voiceAudio.play();

        // 更新UI为播放状态
        bubbleElement.classList.remove('loading');
        bubbleElement.classList.add('playing');
        if (voiceIcon) voiceIcon.innerHTML = createVoiceIcon('playing');

        // 显示缓存状态提示（可选）
        if (fromCache) {
            console.log('语音播放成功（来自缓存）');
        } else {
            console.log('语音播放成功（来自API）');
        }

    } catch (error) {
        // 10. 统一处理所有错误
        console.error('语音播放失败:', error);
        showToast(`语音播放错误: ${error.message}`);
        bubbleElement.classList.remove('loading');
        if (voiceIcon) voiceIcon.innerHTML = createVoiceIcon();
        currentPlayingElement = null; // 重置当前播放元素
    }
}

// 【【【【【这是你要在 script.js 末尾新增的函数】】】】】

async function handleShareData() {
    const shareBtn = document.getElementById('shareDataBtn');
    shareBtn.disabled = true;
    shareBtn.textContent = '生成中...';

    try {
        // 1. 使用你已有的 IndexedDBManager 导出整个数据库的数据
        const exportData = await dbManager.exportDatabase();

        // 2. 将数据发送到我们的Vercel中转站
        const response = await fetch('https://transfer.cdsv.cc/api/transfer-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exportData),
        });

        if (!response.ok) {
            throw new Error('创建分享链接失败，请稍后重试。');
        }

        const result = await response.json();
        if (!result.success || !result.id) {
            throw new Error(result.error || '服务器返回数据格式错误。');
        }

        // 3. 构造给Vercel应用使用的链接
        const vercelAppUrl = 'https://chat.whale-llt.top'; 
        const shareLink = `${vercelAppUrl}/?importId=${result.id}`;

        // 4. 显示分享链接给用户
        showShareLinkDialog(shareLink);

    } catch (error) {
        console.error('分享数据失败:', error);
        showToast('分享失败: ' + error.message);
    } finally {
        shareBtn.disabled = false;
        shareBtn.textContent = '🔗 分享到新设备';
    }
}

// 一个用于显示分享链接的对话框函数
function showShareLinkDialog(link) {
    const dialogId = 'shareLinkDialog';
    let dialog = document.getElementById(dialogId);
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = dialogId;
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title">分享链接已生成</div>
                    <div class="modal-close" onclick="closeModal('${dialogId}')">关闭</div>
                </div>
                <div class="modal-body" style="text-align: center;">
                    <p style="margin-bottom: 15px; font-size: 14px; color: #666;">请复制以下链接，在新设备或浏览器中打开即可自动导入数据。链接15分钟内有效。</p>
                    <textarea id="shareLinkTextarea" class="form-textarea" rows="3" readonly>${link}</textarea>
                    <button class="form-submit" style="margin-top: 15px;" onclick="copyShareLink()">复制链接</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    } else {
        document.getElementById('shareLinkTextarea').value = link;
    }
    showModal(dialogId);
}

/**
 * 复制链接到剪贴板的辅助函数
 */
function copyShareLink() {
    const textarea = document.getElementById('shareLinkTextarea');
    textarea.select();
    document.execCommand('copy');
    showToast('链接已复制！');
}

/**
 * 处理从URL自动导入的逻辑
 */
async function handleAutoImport(importId) {
    // 1. 清理URL，防止刷新页面时重复导入
    window.history.replaceState({}, document.title, window.location.pathname);

    // 2. 显示一个友好的加载提示
    showToast('检测到分享数据，正在导入...');

    try {
        // 3. 去Vercel中转站取回数据
        const transferUrl = `https://transfer.cdsv.cc/api/transfer-data?id=${importId}`;
        const response = await fetch(transferUrl);

        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.error || '数据获取失败，链接可能已失效。');
        }

        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error(result.error || '服务器返回数据格式错误。');
        }

        const importData = result.data;

        // 4. 使用你已有的导入逻辑 (dataMigrator.js)
        if (!window.dbManager) {
            window.dbManager = new IndexedDBManager();
        }
        await dbManager.initDB();
        
        // 5. 调用导入函数，直接覆盖
        const importResult = await dbManager.importDatabase(importData, { overwrite: true });

        if (importResult.success) {
            alert('数据导入成功！页面将自动刷新以应用新数据。');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(importResult.error || '导入数据库时发生未知错误。');
        }

    } catch (error) {
        console.error('自动导入失败:', error);
        alert('自动导入失败: ' + error.message + '\n\n即将正常加载页面。');
        // 如果导入失败，就正常初始化页面
        await init();
    }
}

// === 图片迁移功能 ===

/**
 * 检查图片迁移状态
 */
async function checkImageMigrationStatus() {
    const statusText = document.getElementById('migrationStatusText');
    const statusDetails = document.getElementById('migrationStatusDetails');
    const startMigrationBtn = document.getElementById('startMigrationBtn');
    
    try {
        statusText.textContent = '检查中...';
        statusDetails.innerHTML = '<div>正在检查图片数据状态...</div>';
        
        // 确保迁移管理器已初始化
        if (!window.ImageMigrationManager) {
            throw new Error('图片迁移管理器未加载');
        }
        
        await window.ImageMigrationManager.init();
        
        // 检查迁移状态
        const migrationStatus = await window.ImageMigrationManager.checkMigrationNeeded();
        
        if (migrationStatus.error) {
            statusText.textContent = '检查失败';
            statusDetails.innerHTML = `<div style="color: #dc3545;">错误: ${migrationStatus.error}</div>`;
            return;
        }
        
        if (!migrationStatus.needed) {
            statusText.textContent = '✅ 已优化';
            statusDetails.innerHTML = '<div style="color: #28a745;">太棒了！所有图片数据都已采用高效的存储格式。</div>';
            startMigrationBtn.disabled = true;
            startMigrationBtn.textContent = '✅ 无需优化';
            return;
        }
        
        // 需要迁移
        statusText.textContent = `${migrationStatus.totalFiles} 个文件待优化`;
        
        let detailsHtml = '<div style="margin-bottom: 8px;"><strong>发现以下数据需要优化：</strong></div>';
        
        if (migrationStatus.details.contacts.needsMigration > 0) {
            detailsHtml += `<div>• 联系人头像: ${migrationStatus.details.contacts.needsMigration} 个</div>`;
        }
        if (migrationStatus.details.userProfile.needsMigration > 0) {
            detailsHtml += `<div>• 用户头像: ${migrationStatus.details.userProfile.needsMigration} 个</div>`;
        }
        if (migrationStatus.details.emojiImages.needsMigration > 0) {
            detailsHtml += `<div>• 表情包: ${migrationStatus.details.emojiImages.needsMigration} 个</div>`;
        }
        if (migrationStatus.details.backgrounds.needsMigration > 0) {
            detailsHtml += `<div>• 背景图片: ${migrationStatus.details.backgrounds.needsMigration} 个</div>`;
        }
        if (migrationStatus.details.moments.needsMigration > 0) {
            detailsHtml += `<div>• 朋友圈图片: ${migrationStatus.details.moments.needsMigration} 个</div>`;
        }
        
        // 估算存储空间节省
        const savings = await window.ImageMigrationManager.estimateStorageSavings(migrationStatus);
        detailsHtml += `<div style="margin-top: 8px; color: #ff9500;"><strong>预计节省存储空间: ${savings.formattedSavings}</strong></div>`;
        
        statusDetails.innerHTML = detailsHtml;
        startMigrationBtn.disabled = false;
        startMigrationBtn.textContent = '🚀 开始优化';
        
    } catch (error) {
        console.error('检查迁移状态失败:', error);
        statusText.textContent = '检查失败';
        statusDetails.innerHTML = `<div style="color: #dc3545;">检查失败: ${error.message}</div>`;
    }
}

/**
 * 开始图片数据迁移
 */
async function startImageMigration() {
    const statusText = document.getElementById('migrationStatusText');
    const statusDetails = document.getElementById('migrationStatusDetails');
    const startMigrationBtn = document.getElementById('startMigrationBtn');
    const migrationProgress = document.getElementById('migrationProgress');
    const progressBar = document.getElementById('migrationProgressBar');
    const progressText = document.getElementById('migrationProgressText');
    
    try {
        // 确认操作
        const confirmed = confirm('开始图片存储优化？\n\n这个过程将：\n• 将现有base64图片转换为高效的文件存储格式\n• 显著减少存储空间占用\n• 提升应用性能\n\n优化过程中请勿关闭页面。');
        
        if (!confirmed) {
            return;
        }
        
        // 禁用按钮，显示进度
        startMigrationBtn.disabled = true;
        startMigrationBtn.textContent = '优化中...';
        migrationProgress.style.display = 'block';
        statusText.textContent = '优化中...';
        
        // 进度回调函数
        const progressCallback = (progress) => {
            const percentage = Math.round((progress.current / progress.total) * 100);
            progressBar.style.width = percentage + '%';
            progressText.textContent = `正在优化 ${progress.type}: ${progress.item} (${progress.current}/${progress.total})`;
        };
        
        // 执行迁移
        const result = await window.ImageMigrationManager.performFullMigration(progressCallback);
        
        if (result.success) {
            // 迁移成功
            statusText.textContent = '✅ 优化完成';
            progressBar.style.width = '100%';
            progressText.textContent = '优化完成！';
            
            let successHtml = `<div style="color: #28a745; margin-bottom: 8px;"><strong>${result.message}</strong></div>`;
            
            if (result.summary) {
                successHtml += `<div>• 成功优化: ${result.summary.totalSuccess} 个文件</div>`;
                if (result.summary.totalFailed > 0) {
                    successHtml += `<div style="color: #dc3545;">• 优化失败: ${result.summary.totalFailed} 个文件</div>`;
                }
            }
            
            successHtml += '<div style="margin-top: 8px; color: #666; font-size: 11px;">图片数据已优化为高效的文件存储格式，存储空间占用显著减少。</div>';
            
            statusDetails.innerHTML = successHtml;
            startMigrationBtn.textContent = '✅ 优化完成';
            
            // 显示成功消息
            if (typeof showToast === 'function') {
                showToast('图片存储优化完成！存储空间占用已显著减少。');
            } else {
                alert('图片存储优化完成！存储空间占用已显著减少。');
            }
            
        } else {
            // 迁移失败
            statusText.textContent = '优化失败';
            statusDetails.innerHTML = `<div style="color: #dc3545;">优化失败: ${result.error}</div>`;
            startMigrationBtn.disabled = false;
            startMigrationBtn.textContent = '🚀 重试优化';
            
            console.error('图片数据迁移失败:', result);
        }
        
    } catch (error) {
        console.error('执行图片迁移失败:', error);
        statusText.textContent = '优化失败';
        statusDetails.innerHTML = `<div style="color: #dc3545;">优化失败: ${error.message}</div>`;
        startMigrationBtn.disabled = false;
        startMigrationBtn.textContent = '🚀 重试优化';
        
        if (typeof showToast === 'function') {
            showToast('图片存储优化失败: ' + error.message);
        }
    } finally {
        // 隐藏进度条
        setTimeout(() => {
            migrationProgress.style.display = 'none';
        }, 3000);
    }
}

// === 聊天记录表情包迁移功能 ===

/**
 * 检查聊天记录表情包迁移状态
 */
async function checkChatEmojiMigrationStatus() {
    const statusText = document.getElementById('chatEmojiMigrationStatusText');
    const statusDetails = document.getElementById('chatEmojiMigrationStatusDetails');
    const startMigrationBtn = document.getElementById('startChatEmojiMigrationBtn');
    
    try {
        statusText.textContent = '检查中...';
        statusDetails.innerHTML = '<div>正在检查聊天记录中的表情包状态...</div>';
        
        // 确保迁移管理器已初始化
        if (!window.ChatEmojiMigrationManager) {
            throw new Error('聊天记录表情包迁移管理器未加载');
        }
        
        await window.ChatEmojiMigrationManager.init();
        
        // 检查迁移状态
        const migrationStatus = await window.ChatEmojiMigrationManager.checkChatEmojiMigrationNeeded();
        
        if (migrationStatus.error) {
            statusText.textContent = '检查失败';
            statusDetails.innerHTML = `<div style="color: #dc3545;">错误: ${migrationStatus.error}</div>`;
            return;
        }
        
        if (!migrationStatus.needed) {
            statusText.textContent = '✅ 已优化';
            statusDetails.innerHTML = '<div style="color: #28a745;">太棒了！聊天记录中的表情包都已采用高效的存储格式。</div>';
            startMigrationBtn.disabled = true;
            startMigrationBtn.textContent = '✅ 无需优化';
            return;
        }
        
        // 需要迁移
        const totalItems = migrationStatus.details.base64EmojisFound + migrationStatus.details.emojiImagesNeedingMigration;
        statusText.textContent = `${totalItems} 个表情待优化`;
        
        let detailsHtml = '<div style="margin-bottom: 8px;"><strong>发现以下数据需要优化：</strong></div>';
        
        if (migrationStatus.details.base64EmojisFound > 0) {
            detailsHtml += `<div>• 聊天记录中的表情: ${migrationStatus.details.base64EmojisFound} 个</div>`;
            detailsHtml += `<div>• 涉及联系人: ${migrationStatus.details.contactsNeedingMigration} 个</div>`;
        }
        
        if (migrationStatus.details.emojiImagesNeedingMigration > 0) {
            detailsHtml += `<div>• 表情图片库: ${migrationStatus.details.emojiImagesNeedingMigration} 个</div>`;
        }
        
        // 估算迁移效果
        const benefits = await window.ChatEmojiMigrationManager.estimateMigrationBenefits(migrationStatus);
        detailsHtml += `<div style="margin-top: 8px; color: #1890ff;"><strong>预计节省存储空间: ${benefits.formattedSavings}</strong></div>`;
        detailsHtml += '<div style="color: #666; font-size: 11px;">优化后API调用将使用[emoji:意思]格式，提升兼容性</div>';
        
        statusDetails.innerHTML = detailsHtml;
        startMigrationBtn.disabled = false;
        startMigrationBtn.textContent = '💬 开始优化';
        
    } catch (error) {
        console.error('检查聊天表情迁移状态失败:', error);
        statusText.textContent = '检查失败';
        statusDetails.innerHTML = `<div style="color: #dc3545;">检查失败: ${error.message}</div>`;
    }
}

/**
 * 开始聊天记录表情包迁移
 */
async function startChatEmojiMigration() {
    const statusText = document.getElementById('chatEmojiMigrationStatusText');
    const statusDetails = document.getElementById('chatEmojiMigrationStatusDetails');
    const startMigrationBtn = document.getElementById('startChatEmojiMigrationBtn');
    const migrationProgress = document.getElementById('chatEmojiMigrationProgress');
    const progressBar = document.getElementById('chatEmojiMigrationProgressBar');
    const progressText = document.getElementById('chatEmojiMigrationProgressText');
    
    try {
        // 确认操作
        const confirmed = confirm('开始聊天记录表情包优化？\n\n这个过程将：\n• 将聊天记录中的base64表情转换为高效的文件存储格式\n• 保持API调用兼容性（使用[emoji:意思]格式）\n• 显著减少存储空间占用\n• 提升聊天记录加载性能\n\n优化过程中请勿关闭页面。');
        
        if (!confirmed) {
            return;
        }
        
        // 禁用按钮，显示进度
        startMigrationBtn.disabled = true;
        startMigrationBtn.textContent = '优化中...';
        migrationProgress.style.display = 'block';
        statusText.textContent = '优化中...';
        
        // 进度回调函数
        const progressCallback = (progress) => {
            const percentage = Math.round((progress.current / progress.total) * 100);
            progressBar.style.width = percentage + '%';
            progressText.textContent = `正在优化 ${progress.type}: ${progress.item} (${progress.current}/${progress.total})`;
        };
        
        // 执行迁移
        const result = await window.ChatEmojiMigrationManager.performChatEmojiMigration(progressCallback);
        
        if (result.success) {
            // 迁移成功
            statusText.textContent = '✅ 优化完成';
            progressBar.style.width = '100%';
            progressText.textContent = '优化完成！';
            
            let successHtml = `<div style="color: #28a745; margin-bottom: 8px;"><strong>${result.message}</strong></div>`;
            
            if (result.results) {
                successHtml += `<div>• 优化联系人: ${result.results.contactsMigrated} 个</div>`;
                successHtml += `<div>• 优化表情: ${result.results.base64EmojisMigrated} 个</div>`;
                successHtml += `<div>• 优化表情图片: ${result.results.emojiImagesMigrated} 个</div>`;
                
                if (result.results.errors.length > 0) {
                    successHtml += `<div style="color: #ffc107;">• 优化失败: ${result.results.errors.length} 个</div>`;
                }
            }
            
            successHtml += '<div style="margin-top: 8px; color: #666; font-size: 11px;">聊天记录表情包已优化完成，API调用将使用[emoji:意思]格式。</div>';
            
            statusDetails.innerHTML = successHtml;
            startMigrationBtn.textContent = '✅ 优化完成';
            
            // 显示成功消息
            if (typeof showToast === 'function') {
                showToast('聊天记录表情包优化完成！存储格式已统一。');
            } else {
                alert('聊天记录表情包优化完成！存储格式已统一。');
            }
            
            // 刷新当前聊天显示
            if (window.currentContact) {
                await renderMessages();
            }
            
        } else {
            // 迁移失败
            statusText.textContent = '优化失败';
            statusDetails.innerHTML = `<div style="color: #dc3545;">优化失败: ${result.error}</div>`;
            startMigrationBtn.disabled = false;
            startMigrationBtn.textContent = '💬 重试优化';
            
            console.error('聊天表情迁移失败:', result);
        }
        
    } catch (error) {
        console.error('执行聊天表情迁移失败:', error);
        statusText.textContent = '优化失败';
        statusDetails.innerHTML = `<div style="color: #dc3545;">优化失败: ${error.message}</div>`;
        startMigrationBtn.disabled = false;
        startMigrationBtn.textContent = '💬 重试优化';
        
        if (typeof showToast === 'function') {
            showToast('聊天记录表情包优化失败: ' + error.message);
        }
    } finally {
        // 隐藏进度条
        setTimeout(() => {
            migrationProgress.style.display = 'none';
        }, 3000);
    }
}

// === 自动文件存储迁移功能（版本8→9） ===

/**
 * 执行文件存储迁移（版本8→9升级时自动调用）
 */
async function performFileStorageMigration() {
    try {
        console.log('开始执行文件存储自动迁移...');
        
        if (!isIndexedDBReady) {
            console.error('数据库未准备就绪，无法执行迁移');
            return;
        }
        
        // 等待所有管理器初始化完成
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            if (window.ImageMigrationManager && window.ChatEmojiMigrationManager) {
                break;
            }
            console.log(`等待迁移管理器初始化... (${attempts + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!window.ImageMigrationManager || !window.ChatEmojiMigrationManager) {
            console.error('迁移管理器未加载，跳过自动迁移');
            return;
        }
        
        console.log('开始自动迁移步骤1：基础图片数据迁移');
        
        // 步骤1：首先执行基础图片迁移（头像、背景、表情包图片）
        try {
            await window.ImageMigrationManager.init();
            const imageMigrationStatus = await window.ImageMigrationManager.checkMigrationNeeded();
            
            if (imageMigrationStatus.needed) {
                console.log(`发现 ${imageMigrationStatus.totalFiles} 个图片文件需要迁移`);
                
                const imageResult = await window.ImageMigrationManager.performFullMigration((progress) => {
                    console.log(`迁移进度: ${progress.type} - ${progress.item} (${progress.current}/${progress.total})`);
                });
                
                if (imageResult.success) {
                    console.log('基础图片数据迁移完成:', imageResult.summary);
                } else {
                    console.error('基础图片数据迁移失败:', imageResult.error);
                }
            } else {
                console.log('无需进行基础图片数据迁移');
            }
        } catch (error) {
            console.error('基础图片迁移过程出错:', error);
        }
        
        console.log('开始自动迁移步骤2：聊天记录表情包迁移');
        
        // 步骤2：然后执行聊天记录表情包迁移
        try {
            await window.ChatEmojiMigrationManager.init();
            const chatEmojiStatus = await window.ChatEmojiMigrationManager.checkChatEmojiMigrationNeeded();
            
            if (chatEmojiStatus.needed) {
                const totalEmojis = chatEmojiStatus.details.base64EmojisFound + chatEmojiStatus.details.emojiImagesNeedingMigration;
                console.log(`发现 ${totalEmojis} 个聊天表情需要迁移`);
                
                const chatResult = await window.ChatEmojiMigrationManager.performChatEmojiMigration((progress) => {
                    console.log(`聊天表情迁移进度: ${progress.type} - ${progress.item} (${progress.current}/${progress.total})`);
                });
                
                if (chatResult.success) {
                    console.log('聊天记录表情包迁移完成:', chatResult.results);
                } else {
                    console.error('聊天记录表情包迁移失败:', chatResult.error);
                }
            } else {
                console.log('无需进行聊天记录表情包迁移');
            }
        } catch (error) {
            console.error('聊天表情迁移过程出错:', error);
        }
        
        console.log('文件存储自动迁移流程完成');
        
        // 刷新当前聊天显示（如果有的话）
        if (window.currentContact) {
            try {
                await renderMessages();
                console.log('聊天界面已刷新');
            } catch (error) {
                console.warn('刷新聊天界面失败:', error);
            }
        }
        
    } catch (error) {
        console.error('文件存储自动迁移失败:', error);
    }
}

// --- 个人主页功能 ---
let currentUserProfileContact = null;
let userProfilePreviousPage = 'profilePage'; // 记录从哪个页面进入的个人主页

// 显示用户个人主页（自己的主页）
async function showUserProfile() {
    currentUserProfileContact = null; // 表示是自己的主页
    userProfilePreviousPage = 'profilePage'; // 从个人信息页面进入
    showPage('userProfilePage');
    
    // 确保数据已加载
    await waitForDataReady();
    await loadUserProfileData();
}

// 显示其他用户的个人主页
async function showContactProfile(contact) {
    currentUserProfileContact = contact;
    userProfilePreviousPage = 'momentsPage'; // 从朋友圈进入
    showPage('userProfilePage');
    
    // 确保数据已加载
    await waitForDataReady();
    await loadUserProfileData();
}

// 从个人主页返回
function goBackFromUserProfile() {
    showPage(userProfilePreviousPage);
}

// 加载个人主页数据
async function loadUserProfileData() {
    try {
        const userProfileBanner = document.getElementById('userProfileBanner');
        const userProfileAvatar = document.getElementById('userProfileAvatar');
        const userProfileName = document.getElementById('userProfileName');
        const userProfileMomentsList = document.getElementById('userProfileMomentsList');
        const userProfileMomentsEmpty = document.querySelector('.user-profile-moments-empty');
        
        
        if (currentUserProfileContact) {
            // 显示联系人的主页
            const contact = currentUserProfileContact;
            
            // 设置头像 - 使用getAvatarHTML获取头像内容
            try {
                const avatarHTML = await getAvatarHTML(contact, 'contact', 'user-profile-avatar-inner');
                if (avatarHTML.includes('<img')) {
                    // 如果是图片，提取src并设置为背景图片
                    const srcMatch = avatarHTML.match(/src="([^"]+)"/);
                    if (srcMatch) {
                        userProfileAvatar.style.backgroundImage = `url(${srcMatch[1]})`;
                        userProfileAvatar.textContent = '';
                    } else {
                        // 回退到旧逻辑
                        userProfileAvatar.style.backgroundImage = '';
                        userProfileAvatar.textContent = contact.name?.charAt(0) || '?';
                    }
                } else {
                    // 如果是文字头像
                    userProfileAvatar.style.backgroundImage = '';
                    userProfileAvatar.textContent = contact.name?.charAt(0) || '?';
                }
            } catch (error) {
                console.warn('获取联系人头像失败，使用回退逻辑:', error);
                if (contact.avatar) {
                    userProfileAvatar.style.backgroundImage = `url(${contact.avatar})`;
                    userProfileAvatar.textContent = '';
                } else {
                    userProfileAvatar.style.backgroundImage = '';
                    userProfileAvatar.textContent = contact.name?.charAt(0) || '?';
                }
            }
            
            // 设置用户名，如果是临时联系人则显示特殊样式
            userProfileName.textContent = contact.name || '未知用户';
            if (contact.isTemporary) {
                userProfileName.style.color = '#ff6b6b';
                userProfileName.style.fontSize = '18px';
            } else {
                userProfileName.style.color = '#fff';
                userProfileName.style.fontSize = '20px';
            }
            
            // 设置banner背景（临时联系人使用不同颜色）
            if (contact.isTemporary) {
                userProfileBanner.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)';
            } else {
                userProfileBanner.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            }
            
        } else {
            // 显示自己的主页
            const userProfile = await getUserProfile();
            
            // 设置头像 - 使用getAvatarHTML获取头像内容，支持新的文件系统
            try {
                const avatarHTML = await getAvatarHTML(userProfile, 'user', 'user-profile-avatar-inner');
                if (avatarHTML.includes('<img')) {
                    // 如果是图片，提取src并设置为背景图片
                    const srcMatch = avatarHTML.match(/src="([^"]+)"/);
                    if (srcMatch) {
                        userProfileAvatar.style.backgroundImage = `url(${srcMatch[1]})`;
                        userProfileAvatar.textContent = '';
                    } else {
                        // 回退到旧逻辑
                        userProfileAvatar.style.backgroundImage = '';
                        userProfileAvatar.textContent = userProfile.name?.charAt(0) || '我';
                        console.log('设置头像文字（解析失败）:', userProfile.name?.charAt(0) || '我');
                    }
                } else {
                    // 如果是文字头像
                    userProfileAvatar.style.backgroundImage = '';
                    userProfileAvatar.textContent = userProfile.name?.charAt(0) || '我';
                }
            } catch (error) {
                console.warn('获取用户头像失败，使用回退逻辑:', error);
                if (userProfile.avatar) {
                    userProfileAvatar.style.backgroundImage = `url(${userProfile.avatar})`;
                    userProfileAvatar.textContent = '';
                    console.log('设置头像图片（回退）:', userProfile.avatar);
                } else {
                    userProfileAvatar.style.backgroundImage = '';
                    userProfileAvatar.textContent = userProfile.name?.charAt(0) || '我';
                    console.log('设置头像文字（回退）:', userProfile.name?.charAt(0) || '我');
                }
            }
            
            // 设置用户名
            userProfileName.textContent = userProfile.name || '我的昵称';
            
            // 设置banner背景
            userProfileBanner.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
        
        // 加载朋友圈动态
        await loadUserProfileMoments();
        
    } catch (error) {
        console.error('加载个人主页数据失败:', error);
    }
}

// 获取所有朋友圈动态
async function getAllMoments() {
    
    // 确保数据已加载
    if (!window.moments && (!moments || moments.length === 0)) {
        await waitForDataReady();
    }
    
    return window.moments || moments || [];
}

// 加载用户的朋友圈动态
async function loadUserProfileMoments() {
    try {
        const userProfileMomentsList = document.getElementById('userProfileMomentsList');
        const userProfileMomentsEmpty = document.querySelector('.user-profile-moments-empty');
        
        // 获取朋友圈数据
        const moments = await getAllMoments();
        
        // 过滤出当前用户的动态
        let userMoments = [];
        
        if (currentUserProfileContact) {
            // 显示联系人的动态
            console.log('筛选联系人动态，联系人姓名:', currentUserProfileContact.name);
            userMoments = moments.filter(moment => 
                moment.authorName === currentUserProfileContact.name
            );
        } else {
            // 显示自己的动态（作者是"我"或用户设置的昵称）
            const userProfile = await getUserProfile();
            const userName = userProfile.name || '我的昵称';
            userMoments = moments.filter(moment => 
                moment.authorName === '我' || moment.authorName === userName
            );
            
            // 如果没有找到，也尝试匹配所有动态的作者名
            if (userMoments.length === 0) {
                moments.forEach((moment, index) => {
                });
            }
        }
        
        if (userMoments.length === 0) {
            userProfileMomentsEmpty.style.display = 'block';
            userProfileMomentsList.style.display = 'none';
        } else {
            userProfileMomentsEmpty.style.display = 'none';
            userProfileMomentsList.style.display = 'block';
            
            // 清空现有内容
            userProfileMomentsList.innerHTML = '';
            
            // 渲染朋友圈动态
            for (const moment of userMoments) {
                const momentElement = await createUserProfileMomentElement(moment);
                userProfileMomentsList.appendChild(momentElement);
            }
        }
        
    } catch (error) {
        console.error('加载用户朋友圈动态失败:', error);
    }
}

// 切换朋友圈菜单显示/隐藏
function toggleMomentMenu(momentId) {
    const menu = document.getElementById(`momentMenu-${momentId}`);
    const allMenus = document.querySelectorAll('.moment-menu');
    
    // 关闭所有其他菜单
    allMenus.forEach(m => {
        if (m !== menu) {
            m.style.display = 'none';
        }
    });
    
    // 切换当前菜单
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// 重新生成评论
async function regenerateComments(momentId) {
    try {
        // 关闭菜单
        const menu = document.getElementById(`momentMenu-${momentId}`);
        if (menu) menu.style.display = 'none';
        
        // 找到对应的朋友圈
        const momentIndex = moments.findIndex(m => m.id === momentId);
        if (momentIndex === -1) {
            showToast('未找到要重新生成评论的朋友圈');
            return;
        }
        
        const moment = moments[momentIndex];
        showToast('正在重新生成评论...');
        
        // 清空现有评论和点赞
        moment.comments = [];
        moment.likes = 0;
        
        // 重新生成评论
        const newComments = await generateAICommentsWithCurrentTime(moment.content);
        moment.comments = newComments;
        
        // 保存并重新渲染
        await saveDataToDB();
        await renderMomentsList();
        
        showToast('评论重新生成完成！');
        
    } catch (error) {
        console.error('重新生成评论失败:', error);
        showToast('重新生成评论失败: ' + error.message);
    }
}

// 点击页面其他地方关闭所有菜单
document.addEventListener('click', function(event) {
    if (!event.target.closest('.moment-menu-btn') && !event.target.closest('.moment-menu')) {
        const allMenus = document.querySelectorAll('.moment-menu');
        allMenus.forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

// 处理朋友圈头像点击事件

function toggleMomentActions(momentId) {
    const menu = document.getElementById(`momentActions-${momentId}`);
    if (!menu) {
        console.error('Menu not found for moment:', momentId);
        return;
    }

    const allMenus = document.querySelectorAll('.moment-actions-menu');
    const isActive = menu.classList.contains('active');

    // 统一先关闭所有菜单
    allMenus.forEach(m => {
        m.classList.remove('active');
    });

    if (!isActive) {
        menu.classList.add('active');
    }

    // 点击外部关闭菜单的逻辑（保留，但可以简化）
    if (!isActive) {
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!e.target.closest('.moment-collapse-btn')) {
                     menu.classList.remove('active');
                     document.removeEventListener('click', closeHandler, true);
                }
            };
            document.addEventListener('click', closeHandler, true);
        }, 0);
    }
}

// 点赞朋友圈
async function likeMoment(momentId) {
    try {
        const userProfile = await getUserProfile();
        const userName = userProfile.name || '我';
        
        const momentIndex = moments.findIndex(m => m.id === momentId);
        if (momentIndex === -1) return;
        
        const moment = moments[momentIndex];
        
        // 初始化点赞列表
        if (!moment.likes) {
            moment.likes = [];
        }
        
        // 检查是否已点赞
        const hasLiked = moment.likes.includes(userName);
        
        if (hasLiked) {
            // 取消点赞
            moment.likes = moment.likes.filter(name => name !== userName);
            showToast('已取消点赞');
        } else {
            // 添加点赞
            moment.likes.push(userName);
            showToast('点赞成功');
        }
        
        // 保存并重新渲染
        await saveDataToDB();
        
        // 检测当前在哪个页面
        const userProfilePage = document.getElementById('userProfilePage');
        const isInUserProfile = userProfilePage && userProfilePage.classList.contains('active');
        
        if (isInUserProfile) {
            // 如果在个人主页，重新加载个人主页的朋友圈
            await loadUserProfileMoments();
        } else {
            // 如果在发现页面，重新渲染发现页面
            await renderMomentsList();
        }
        
        // 关闭菜单
        const menu = document.getElementById(`momentActions-${momentId}`);
        if (menu) menu.classList.remove('active');
        
    } catch (error) {
        console.error('点赞失败:', error);
        showToast('点赞失败');
    }
}

// 显示朋友圈评论框
function showMomentComment(momentId) {
    // 检测当前在哪个页面
    const userProfilePage = document.getElementById('userProfilePage');
    const isInUserProfile = userProfilePage && userProfilePage.classList.contains('active');
    
    let replyContainer;
    if (isInUserProfile) {
        // 在个人主页，查找个人主页的回复容器
        replyContainer = userProfilePage.querySelector(`#momentMainReply-${momentId}`);
    } else {
        // 在发现页面，查找发现页面的回复容器
        replyContainer = document.getElementById(`momentMainReply-${momentId}`);
    }
    
    if (!replyContainer) {
        console.error('Reply container not found for moment:', momentId);
        return;
    }
    
    const textarea = replyContainer.querySelector('.moment-reply-input');
    
    replyContainer.classList.add('active');
    replyContainer.style.display = 'block'; // 确保显示
    safeFocus(textarea, { delay: 100 });
    
    // 关闭菜单（发现页面才有菜单）
    if (!isInUserProfile) {
        const menu = document.getElementById(`momentActions-${momentId}`);
        if (menu) menu.classList.remove('active');
    }
}

// 隐藏朋友圈评论框
function hideMomentComment(momentId) {
    // 检测当前在哪个页面
    const userProfilePage = document.getElementById('userProfilePage');
    const isInUserProfile = userProfilePage && userProfilePage.classList.contains('active');
    
    let replyContainer;
    if (isInUserProfile) {
        // 在个人主页，查找个人主页的回复容器
        replyContainer = userProfilePage.querySelector(`#momentMainReply-${momentId}`);
    } else {
        // 在发现页面，查找发现页面的回复容器
        replyContainer = document.getElementById(`momentMainReply-${momentId}`);
    }
    
    if (!replyContainer) {
        console.error('Reply container not found for moment:', momentId);
        return;
    }
    
    const textarea = replyContainer.querySelector('.moment-reply-input');
    
    replyContainer.classList.remove('active');
    replyContainer.style.display = 'none'; // 确保隐藏
    textarea.value = '';
}

// 提交朋友圈评论
async function submitMomentComment(momentId) {
    try {
        const userProfile = await getUserProfile();
        const userName = userProfile.name || '我';
        
        // 检测当前在哪个页面
        const userProfilePage = document.getElementById('userProfilePage');
        const isInUserProfile = userProfilePage && userProfilePage.classList.contains('active');
        
        let replyContainer;
        if (isInUserProfile) {
            // 在个人主页，查找个人主页的回复容器
            replyContainer = userProfilePage.querySelector(`#momentMainReply-${momentId}`);
        } else {
            // 在发现页面，查找发现页面的回复容器
            replyContainer = document.getElementById(`momentMainReply-${momentId}`);
        }
        
        if (!replyContainer) {
            console.error('Reply container not found for moment:', momentId);
            return;
        }
        
        const textarea = replyContainer.querySelector('.moment-reply-input');
        const content = textarea.value.trim();
        
        if (!content) {
            showToast('请输入评论内容');
            return;
        }
        
        const momentIndex = moments.findIndex(m => m.id === momentId);
        if (momentIndex === -1) return;
        
        const moment = moments[momentIndex];
        
        // 添加用户评论
        const newComment = {
            author: userName,
            content: content,
            like: false,
            timestamp: new Date().toISOString()
        };
        
        if (!moment.comments) {
            moment.comments = [];
        }
        
        moment.comments.push(newComment);
        
        // 保存并重新渲染
        await saveDataToDB();
        
        if (isInUserProfile) {
            // 如果在个人主页，重新加载个人主页的朋友圈
            await loadUserProfileMoments();
        } else {
            // 如果在发现页面，重新渲染发现页面
            await renderMomentsList();
        }
        
        showToast('评论成功');
        
        // 触发楼主回复
        setTimeout(() => {
            generateMomentAuthorReply(momentId, userName, content);
        }, 1000);
        
    } catch (error) {
        console.error('评论失败:', error);
        showToast('评论失败');
    }
}

// 显示评论回复框
function showCommentReply(commentId, authorName, momentId) {
    const replyContainer = document.getElementById(`${commentId}-reply`);
    const textarea = replyContainer.querySelector('.moment-reply-input');
    
    replyContainer.classList.add('active');
    safeFocus(textarea, { delay: 100 });
    textarea.setAttribute('placeholder', `回复${authorName}...`);
}

// 隐藏评论回复框
function hideCommentReply(commentId) {
    const replyContainer = document.getElementById(`${commentId}-reply`);
    const textarea = replyContainer.querySelector('.moment-reply-input');
    
    replyContainer.classList.remove('active');
    textarea.value = '';
}

// 提交评论回复
async function submitCommentReply(commentId, replyToAuthor, momentId) {
    try {
        const userProfile = await getUserProfile();
        const userName = userProfile.name || '我';
        
        const replyContainer = document.getElementById(`${commentId}-reply`);
        const textarea = replyContainer.querySelector('.moment-reply-input');
        const content = textarea.value.trim();
        
        if (!content) {
            showToast('请输入回复内容');
            return;
        }
        
        const momentIndex = moments.findIndex(m => m.id === momentId);
        if (momentIndex === -1) return;
        
        const moment = moments[momentIndex];
        
        // 添加用户回复
        const newComment = {
            author: userName,
            content: `回复${replyToAuthor}: ${content}`,
            like: false,
            timestamp: new Date().toISOString()
        };
        
        if (!moment.comments) {
            moment.comments = [];
        }
        
        moment.comments.push(newComment);
        
        // 保存并重新渲染
        await saveDataToDB();
        await renderMomentsList();
        
        showToast('回复成功');
        
        // 触发被回复人的回复
        setTimeout(() => {
            generateCommentReply(momentId, replyToAuthor, userName, content);
        }, 1000);
        
    } catch (error) {
        console.error('回复失败:', error);
        showToast('回复失败');
    }
}

// 点击评论作者头像
function handleCommentAuthorClick(authorName) {
    // 复用朋友圈头像点击逻辑
    handleMomentAvatarClick(authorName);
}

// 显示朋友圈评论回复框（发现页面点击评论行）
function showMomentReplyToComment(momentId, commentAuthor) {
    // 显示回复框
    showMomentComment(momentId);
    
    // 预填充@用户名
    const replyInput = document.querySelector(`#momentMainReply-${momentId} .moment-reply-input`);
    if (replyInput) {
        const mention = `@${commentAuthor} `;
        const currentText = replyInput.value;
        
        // 避免重复添加@提及
        if (!currentText.includes(mention)) {
            replyInput.value = mention + currentText;
        }
        
        // 聚焦输入框并设置光标位置
        replyInput.focus();
        replyInput.setSelectionRange(replyInput.value.length, replyInput.value.length);
        
        // 确保回复框滚动到可见位置
        setTimeout(() => {
            replyInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

// 生成楼主回复用户评论
async function generateMomentAuthorReply(momentId, commenterName, commentContent) {
    try {
        const momentIndex = moments.findIndex(m => m.id === momentId);
        if (momentIndex === -1) return;
        
        const moment = moments[momentIndex];
        const authorName = moment.authorName;
        
        // 如果楼主就是用户，不生成回复
        const userProfile = await getUserProfile();
        if (authorName === userProfile.name) return;
        
        // 查找角色
        const character = window.contacts?.find(c => c.name === authorName);
        if (!character) return;
        
        // 生成回复内容
        const replyContent = await generateCharacterReply(character, commenterName, commentContent, moment.content);
        
        // 添加角色回复
        const authorReply = {
            author: authorName,
            content: `回复${commenterName}: ${replyContent}`,
            like: false,
            timestamp: new Date().toISOString()
        };
        
        moments[momentIndex].comments.push(authorReply);
        
        // 保存并重新渲染
        await saveDataToDB();
        await renderMomentsList();
        
    } catch (error) {
        console.error('生成楼主回复失败:', error);
    }
}

// 生成被回复人的回复
async function generateCommentReply(momentId, repliedAuthor, replierName, replyContent) {
    try {
        const momentIndex = moments.findIndex(m => m.id === momentId);
        if (momentIndex === -1) return;
        
        const moment = moments[momentIndex];
        
        // 如果被回复的是用户，不生成回复
        const userProfile = await getUserProfile();
        if (repliedAuthor === userProfile.name) return;
        
        // 查找被回复的角色
        const character = window.contacts?.find(c => c.name === repliedAuthor);
        if (!character) return;
        
        // 生成回复内容
        const responseContent = await generateCharacterReply(character, replierName, replyContent, moment.content);
        
        // 添加角色回复
        const characterReply = {
            author: repliedAuthor,
            content: responseContent,
            like: false,
            timestamp: new Date().toISOString()
        };
        
        moments[momentIndex].comments.push(characterReply);
        
        // 保存并重新渲染
        await saveDataToDB();
        await renderMomentsList();
        
    } catch (error) {
        console.error('生成角色回复失败:', error);
    }
}

// 生成角色回复内容
async function generateCharacterReply(character, replierName, replyContent, momentContent) {
    try {
        const userProfile = await getUserProfile();
        
        const prompt = window.promptBuilder.buildMomentReplyPrompt(character, replierName, replyContent, momentContent);

        const response = await fetch(apiSettings.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiSettings.key}`
            },
            body: JSON.stringify({
                model: apiSettings.model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                max_tokens: 100
            })
        });
        
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || '哈哈哈';
        
    } catch (error) {
        console.error('生成角色回复失败:', error);
        return '😄';
    }
}

async function handleMomentAvatarClick(authorName) {
    try {
        // 获取用户配置
        const userProfile = await getUserProfile();
        
        // 如果是自己，显示自己的主页
        if (authorName === '我' || authorName === userProfile.name) {
            await showUserProfile();
            return;
        }
        
        // 查找对应的联系人
        const contact = window.contacts?.find(c => c.name === authorName);
        if (contact) {
            await showContactProfile(contact);
        } else {
            console.error('联系人不存在 - 详细信息:');
            console.error('- 查找的联系人姓名:', authorName);
            console.error('- 当前联系人列表:', window.contacts);
            console.error('- 联系人列表长度:', window.contacts ? window.contacts.length : '联系人列表为空');
            if (window.contacts && window.contacts.length > 0) {
                console.error('- 现有联系人姓名列表:', window.contacts.map(c => c.name));
            }
            
            // 显示错误提示
            showToast(`联系人不存在: ${authorName}`);
            
            // 仍然创建临时联系人对象用于显示，但标记为不存在
            const tempContact = {
                name: `${authorName} (联系人不存在)`,
                avatar: null,
                isTemporary: true
            };
            await showContactProfile(tempContact);
        }
    } catch (error) {
        console.error('处理头像点击事件失败:', error);
    }
}

// 创建个人主页朋友圈动态元素
async function createUserProfileMomentElement(moment) {
    const momentDiv = document.createElement('div');
    momentDiv.className = 'user-profile-moment-item';
    
    // 获取当前用户资料用于头像显示
    const userProfile = await getUserProfile();
    
    let imagesHtml = '';
    
    // 处理图片 - 支持新的文件系统和旧的base64格式
    if (moment.imageFileIds && moment.imageCount > 0 && window.ImageStorageAPI) {
        // 新的文件系统存储方式
        const imageUrls = [];
        for (let i = 0; i < moment.imageCount; i++) {
            imageUrls.push(`data:image/jpeg;base64,loading...`); // 占位符，后续异步加载
        }
        imagesHtml = `
            <div class="user-profile-moment-images">
                ${imageUrls.map((image, index) => `
                    <img src="${image}" alt="朋友圈图片" class="user-profile-moment-image" data-moment-id="${moment.id}" data-image-index="${index}">
                `).join('')}
            </div>
        `;
    } else if (moment.image) {
        // 旧的单图片格式
        imagesHtml = `
            <div class="user-profile-moment-images">
                <img src="${moment.image}" alt="朋友圈图片" class="user-profile-moment-image" onclick="showImagePreview('${moment.image}')">
            </div>
        `;
    } else if (moment.images && moment.images.length > 0) {
        // 多图片格式
        imagesHtml = `
            <div class="user-profile-moment-images">
                ${moment.images.map(image => `
                    <img src="${image}" alt="朋友圈图片" class="user-profile-moment-image" onclick="showImagePreview('${image}')">
                `).join('')}
            </div>
        `;
    }
    
    // 使用正确的时间字段
    const timeStr = moment.time || moment.timestamp || new Date().toISOString();
    
    // 处理点赞信息
    const likes = moment.likes || [];
    let likedUsers = [];
    
    // 获取点赞用户列表（包括独立点赞和评论点赞）
    if (likes.length > 0) {
        likedUsers = [...likes];
    }
    
    if (moment.comments && moment.comments.length > 0) {
        const commentLikedUsers = moment.comments
            .filter(comment => comment.like === true)
            .map(comment => comment.author)
            .filter(author => !likedUsers.includes(author)); // 避免重复
        
        likedUsers = [...likedUsers, ...commentLikedUsers];
    }
    
    const likesContent = likedUsers.length > 0 ? 
        `<div class="moment-likes">❤️ ${likedUsers.join(', ')}</div>` : '';
    
    // 处理评论内容 - 个人主页使用完整交互样式
    let commentsContent = '';
    if (moment.comments && moment.comments.length > 0) {
        const commentsList = moment.comments
            .filter(comment => comment.content && comment.content.trim())
            .map((comment, index) => {
                const safeContent = comment.content.replace(/'/g, '&#39;');
                const commentTimeStr = comment.time || new Date().toISOString();
                const isLiked = comment.like === true ? 'liked' : '';
                
                const commentAuthorContact = contacts.find(c => c.name === comment.author);
                const commentAvatarContent = commentAuthorContact && commentAuthorContact.avatar ? 
                    `<img src="${commentAuthorContact.avatar}" alt="头像" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;">` : 
                    `<div style="width: 32px; height: 32px; border-radius: 4px; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 14px;">${comment.author.charAt(0)}</div>`;
                
                return `
                    <div class="moment-comment-item" data-comment-index="${index}" style="display: flex; margin-bottom: 12px;">
                        <div style="margin-right: 10px;">${commentAvatarContent}</div>
                        <div style="flex: 1;">
                            <div class="moment-comment-author" onclick="handleCommentAuthorClick('${comment.author}')" style="font-weight: 600; color: #576b95; cursor: pointer; line-height: 16px;">${comment.author}</div>
                            <div class="moment-comment-text" style="color: #333; line-height: 16px;">${safeContent}</div>
                            <div class="moment-comment-actions" style="margin-top: 4px; font-size: 12px; color: #999;">
                                <span class="moment-comment-time">${formatContactListTime(commentTimeStr)}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        commentsContent = `<div class="moment-comments">${commentsList}</div>`;
    }
    
    // 个人主页使用独立按钮
    const actionsMenu = `
        <div style="display: flex; gap: 8px;">
            <button onclick="likeMoment('${moment.id}')" style="padding: 4px 8px; background: #f0f0f0; border: none; border-radius: 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="点赞">
                ❤ 点赞
            </button>
            <button onclick="showMomentComment('${moment.id}')" style="padding: 4px 8px; background: #f0f0f0; border: none; border-radius: 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="评论">
                💬 评论
            </button>
        </div>
    `;
    
    // 处理作者头像 - 支持新的文件系统格式
    let avatarContent = '';
    const author = window.contacts ? window.contacts.find(c => c.name === moment.authorName) : null;
    
    try {
        if (author) {
            // 使用getAvatarHTML获取联系人头像
            const avatarHTML = await getAvatarHTML(author, 'contact', '');
            if (avatarHTML.includes('<img')) {
                const srcMatch = avatarHTML.match(/src="([^"]+)"/);
                if (srcMatch) {
                    avatarContent = `<img src="${srcMatch[1]}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
                }
            }
        } else if (moment.authorName === userProfile.name) {
            // 如果是当前用户的动态，使用getAvatarHTML获取用户头像
            const avatarHTML = await getAvatarHTML(userProfile, 'user', '');
            if (avatarHTML.includes('<img')) {
                const srcMatch = avatarHTML.match(/src="([^"]+)"/);
                if (srcMatch) {
                    avatarContent = `<img src="${srcMatch[1]}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
                }
            }
        }
        
        // 如果没有头像或头像获取失败，使用文字头像
        if (!avatarContent) {
            avatarContent = `<div style="width: 40px; height: 40px; border-radius: 6px; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #333;">${moment.authorName.charAt(0)}</div>`;
        }
    } catch (error) {
        console.warn('获取个人主页朋友圈头像失败，使用回退逻辑:', error);
        // 回退到旧的逻辑
        if (author && author.avatar) {
            avatarContent = `<img src="${author.avatar}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
        } else if (moment.authorName === userProfile.name && userProfile.avatar) {
            avatarContent = `<img src="${userProfile.avatar}" alt="头像" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
        } else {
            avatarContent = `<div style="width: 40px; height: 40px; border-radius: 6px; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #333;">${moment.authorName.charAt(0)}</div>`;
        }
    }
    
    momentDiv.innerHTML = `
        <div class="moment-header" style="display: flex; margin-bottom: 8px; align-items: flex-start;">
            <div class="moment-avatar" style="margin-right: 12px; flex-shrink: 0;">${avatarContent}</div>
            <div class="moment-info" style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 40px;">
                <div class="moment-name" style="font-weight: 600; color: #576b95; font-size: 15px; line-height: 1.2; margin: 0;">${moment.authorName}</div>
                <div class="user-profile-moment-content" style="font-size: 16px; line-height: 1.4; color: #333; margin: 0; flex-grow: 1; display: flex; align-items: flex-end;">${moment.content}</div>
            </div>
        </div>
        ${imagesHtml}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
            <div class="user-profile-moment-time" style="font-size: 12px; color: #999;">${formatContactListTime(timeStr)}</div>
            ${actionsMenu}
        </div>
        ${likesContent}
        ${commentsContent}
        <div class="moment-reply-input-container" id="momentMainReply-${moment.id}" style="display: none;">
            <textarea class="moment-reply-input" placeholder="写评论..."></textarea>
            <div class="moment-reply-actions">
                <button class="moment-reply-btn moment-reply-cancel" onclick="hideMomentComment('${moment.id}')">取消</button>
                <button class="moment-reply-btn moment-reply-submit" onclick="submitMomentComment('${moment.id}')">发送</button>
            </div>
        </div>
    `;
    
    // 异步加载文件系统中的图片
    if (moment.imageFileIds && moment.imageCount > 0 && window.ImageStorageAPI) {
        setTimeout(async () => {
            try {
                await window.ImageStorageAPI.init();
                const imageUrls = await window.ImageStorageAPI.getMomentImagesURLs(moment.id, moment.imageCount);
                const imgElements = momentDiv.querySelectorAll('[data-moment-id="' + moment.id + '"]');
                imgElements.forEach((img, index) => {
                    if (imageUrls[index]) {
                        img.src = imageUrls[index];
                        img.onclick = () => showImagePreview(imageUrls[index]);
                    }
                });
            } catch (error) {
                console.error('加载个人主页朋友圈图片失败:', error);
            }
        }, 100);
    }
    
    return momentDiv;
}

// 页面加载后自动检查迁移状态 - 延迟至数据库初始化完成后
document.addEventListener('DOMContentLoaded', () => {
    // 等待数据库完全初始化后再检查迁移状态
    const checkMigrationWhenReady = async () => {
        // 等待数据库就绪
        let attempts = 0;
        while ((!window.db || !window.isIndexedDBReady) && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!window.db) {
            console.warn('数据库初始化超时，跳过迁移检查');
            return;
        }
        
        // 数据库就绪后执行迁移检查
        if (window.ImageMigrationManager && document.getElementById('migrationStatusText')) {
            try {
                await checkImageMigrationStatus();
            } catch (error) {
                console.error('检查图片迁移状态失败:', error);
            }
        }
        
        // 检查聊天表情迁移状态
        if (window.ChatEmojiMigrationManager && document.getElementById('chatEmojiMigrationStatusText')) {
            try {
                await checkChatEmojiMigrationStatus();
            } catch (error) {
                console.error('检查聊天表情迁移状态失败:', error);
            }
        }
    };
    
    // 异步执行，不阻塞其他初始化
    checkMigrationWhenReady().catch(console.error);
});

// === Banner上传功能 ===

// 全局变量用于存储当前选择的图片
let currentBannerImage = null;
let currentBannerCanvas = null;

// 打开banner上传模态框
function openBannerUploadModal() {
    
    // 检查模态框元素是否存在
    const modal = document.getElementById('bannerUploadModal');
    if (!modal) {
        console.error('Banner上传模态框元素不存在');
        showToast('无法打开上传界面，请刷新页面重试');
        return;
    }
    
    console.log('找到模态框元素，准备显示');
    showModal('bannerUploadModal');
    resetBannerUpload();
}

// 触发文件选择
function triggerBannerFileInput() {
    document.getElementById('bannerFileInput').click();
}

// 处理文件选择
async function handleBannerFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 验证文件类型
    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
        showToast('请选择 JPG 或 PNG 格式的图片');
        return;
    }
    
    // 验证文件大小（限制为 10MB）
    if (file.size > 10 * 1024 * 1024) {
        showToast('图片文件不能超过 10MB');
        return;
    }
    
    try {
        // 读取图片
        const imageUrl = await readFileAsDataURL(file);
        const img = new Image();
        
        img.onload = () => {
            currentBannerImage = img;
            setupBannerPreview();
        };
        
        img.onerror = () => {
            showToast('图片加载失败，请选择其他图片');
        };
        
        img.src = imageUrl;
        
    } catch (error) {
        console.error('图片处理失败:', error);
        showToast('图片处理失败: ' + error.message);
    }
}

// 设置banner预览
function setupBannerPreview() {
    if (!currentBannerImage) return;
    
    // 显示预览容器
    const uploadArea = document.getElementById('bannerUploadArea');
    const previewContainer = document.getElementById('bannerPreviewContainer');
    
    uploadArea.style.display = 'none';
    previewContainer.style.display = 'block';
    
    // 设置canvas和slider
    currentBannerCanvas = document.getElementById('bannerPreviewCanvas');
    const slider = document.getElementById('bannerCropSlider');
    
    // 重置slider
    slider.value = 50;
    
    // 初始渲染
    updateBannerPreview();
}

// 更新banner预览
function updateBannerPreview() {
    if (!currentBannerImage || !currentBannerCanvas) return;
    
    const canvas = currentBannerCanvas;
    const ctx = canvas.getContext('2d');
    const slider = document.getElementById('bannerCropSlider');
    
    // Canvas尺寸 (保持2.5:1的banner比例)
    const canvasWidth = 400;
    const canvasHeight = 160;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // 计算图片尺寸和位置
    const imgWidth = currentBannerImage.width;
    const imgHeight = currentBannerImage.height;
    
    // 计算缩放比例，确保图片宽度完全覆盖canvas
    const scaleX = canvasWidth / imgWidth;
    const scaleY = canvasHeight / imgHeight;
    const scale = Math.max(scaleX, scaleY);
    
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;
    
    // 根据slider值计算垂直位置
    const cropOffset = (slider.value / 100) * (scaledHeight - canvasHeight);
    
    // 清空canvas并绘制图片
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(
        currentBannerImage,
        (canvasWidth - scaledWidth) / 2, // 水平居中
        -cropOffset, // 根据slider调整垂直位置
        scaledWidth,
        scaledHeight
    );
}

// 重置banner上传
function resetBannerUpload() {
    currentBannerImage = null;
    currentBannerCanvas = null;
    
    const uploadArea = document.getElementById('bannerUploadArea');
    const previewContainer = document.getElementById('bannerPreviewContainer');
    const fileInput = document.getElementById('bannerFileInput');
    
    if (uploadArea) {
        uploadArea.style.display = 'block';
    } else {
        console.error('上传区域元素不存在');
    }
    
    if (previewContainer) {
        previewContainer.style.display = 'none';
    } else {
        console.error('预览容器元素不存在');
    }
    
    if (fileInput) {
        fileInput.value = '';
    } else {
        console.error('文件输入元素不存在');
    }
}

// 保存banner图片
async function saveBannerImage() {
    if (!currentBannerCanvas || !window.ImageStorageAPI) {
        showToast('无法保存图片，请重试');
        return;
    }
    
    try {
        // 将canvas转换为blob
        const blob = await canvasToBlob(currentBannerCanvas);
        
        // 确保 ImageStorageAPI 已初始化
        await window.ImageStorageAPI.init();
        
        // 存储banner图片
        const fileId = await window.ImageStorageAPI.storeBanner(blob, 'user_profile');
        console.log('Banner图片已保存，文件ID:', fileId);
        
        // 更新用户资料中的banner字段
        const profile = await getUserProfile();
        profile.bannerFileId = fileId; // 这里fileId现在应该是字符串了
        await saveDataToDB(); // 保存到IndexedDB
        
        // 应用新的banner背景
        await applyBannerBackground(fileId);
        
        // 关闭模态框
        closeModal('bannerUploadModal');
        showToast('背景图片已更新');
        
        // 尝试重新加载banner
        setTimeout(() => {
            loadUserBanner();
        }, 1000);
        
    } catch (error) {
        console.error('保存banner失败:', error);
        showToast('保存失败: ' + error.message);
    }
}

// 应用banner背景
async function applyBannerBackground(fileId) {
    try {
        
        if (!window.ImageStorageAPI) {
            console.error('ImageStorageAPI 未加载');
            return;
        }
        
        await window.ImageStorageAPI.init();
        const bannerUrl = await window.ImageStorageAPI.getBannerURL('user_profile');
        
        const bannerElement = document.getElementById('userProfileBanner');
        
        // 尝试其他方式查找元素
        const allBanners = document.querySelectorAll('.user-profile-banner');
        
        if (bannerUrl && bannerElement) {
            // 清除原有的渐变背景
            bannerElement.style.background = 'none';
            bannerElement.style.backgroundImage = `url(${bannerUrl})`;
            bannerElement.style.backgroundSize = 'cover';
            bannerElement.style.backgroundPosition = 'center';
            bannerElement.style.backgroundRepeat = 'no-repeat';
        } else {
            console.error('Banner URL或元素为空:', { bannerUrl, bannerElement });
        }
    } catch (error) {
        console.error('应用banner背景失败:', error);
    }
}

// 加载用户banner背景
async function loadUserBanner() {
    try {
        const userProfile = await getUserProfile();
        console.log('用户资料:', userProfile);
        
        if (userProfile.bannerFileId && window.ImageStorageAPI) {
            await applyBannerBackground(userProfile.bannerFileId);
        } else {
        }
    } catch (error) {
        console.error('加载用户banner失败:', error);
    }
}

// 工具函数：读取文件为DataURL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

// 工具函数：Canvas转Blob
function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Canvas转换失败'));
            }
        }, 'image/jpeg', 0.9);
    });
}

// 在显示个人主页时加载banner
const originalShowUserProfile = showUserProfile;
showUserProfile = async function() {
    if (originalShowUserProfile) {
        await originalShowUserProfile();
    }
    // 加载banner背景
    setTimeout(loadUserBanner, 100);
};

// ========== 主题色管理功能 ==========

// 默认主题色配置
const defaultThemeColors = [
    { color: '#07c160', name: '鲜绿' },
    { color: '#1890ff', name: '天空蓝' },
    { color: '#722ed1', name: '深紫' },
    { color: '#f5222d', name: '火红' },
    { color: '#fa8c16', name: '橙' },
    { color: '#13c2c2', name: '清新青' },
    { color: '#eb2f96', name: '亮粉' },
    { color: '#2f54eb', name: '海蓝' }
];

// 默认渐变配置
const defaultGradientConfig = {
    enabled: false,
    primaryColor: '#07c160',
    secondaryColor: '#1890ff',
    direction: 'to right'
};

// IndexedDB 主题配置管理器
class ThemeConfigManager {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.db = null;
        this.storeName = 'themeConfig';
    }

    async init() {
        // 使用已有的数据库连接
        if (window.db && window.isIndexedDBReady) {
            this.db = window.db;
            return this.db;
        }
        
        // 等待数据库就绪
        return this.waitForDatabase();
    }

    async waitForDatabase() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (window.db && window.isIndexedDBReady) {
                    this.db = window.db;
                    clearInterval(checkInterval);
                    resolve(this.db);
                }
            }, 100);
        });
    }


    async saveThemeConfig(type, data) {
        try {
            await this.init();
            
            // 检查存储是否存在
            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn('themeConfig存储不存在，无法保存配置');
                throw new Error('themeConfig存储不存在');
            }
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                const config = {
                    type: type,
                    data: data,
                    updatedAt: new Date().toISOString()
                };
                
                const request = store.put(config);
                
                request.onsuccess = () => {
                    console.log(`主题配置已保存到IndexedDB (${type}):`, data);
                    resolve(true);
                };
                
                request.onerror = () => {
                    console.error('保存主题配置失败:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('保存主题配置时出错:', error);
            return false;
        }
    }

    async getThemeConfig(type) {
        try {
            await this.init();
            
            // 检查存储是否存在
            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn('themeConfig存储不存在，返回null');
                return null;
            }
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(type);
                
                request.onsuccess = () => {
                    const result = request.result;
                    resolve(result ? result.data : null);
                };
                
                request.onerror = () => {
                    console.error('获取主题配置失败:', request.error);
                    resolve(null);
                };
            });
        } catch (error) {
            console.error('获取主题配置时出错:', error);
            return null;
        }
    }

    async getAllThemeConfigs() {
        try {
            await this.init();
            
            // 检查存储是否存在
            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.warn('themeConfig存储不存在，返回空配置');
                return {};
            }
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    const configs = {};
                    request.result.forEach(item => {
                        configs[item.type] = item.data;
                    });
                    resolve(configs);
                };
                
                request.onerror = () => {
                    console.error('获取所有主题配置失败:', request.error);
                    resolve({});
                };
            });
        } catch (error) {
            console.error('获取所有主题配置时出错:', error);
            return {};
        }
    }

    async ensureDefaultConfigs() {
        try {
            await this.init();
            
            // 检查themeConfig存储是否存在
            if (!this.db.objectStoreNames.contains(this.storeName)) {
                console.log('themeConfig存储不存在，需要数据库升级');
                // 返回false表示存储不存在，让调用者决定如何处理
                return { success: false, reason: 'storage_not_exists' };
            }
            
            const configs = await this.getAllThemeConfigs();
            let hasChanges = false;
            
            // 如果没有主题配置，创建默认配置
            if (!configs.theme) {
                await this.saveThemeConfig('theme', { color: '#07c160', name: '鲜绿' });
                console.log('已创建默认主题配置');
                hasChanges = true;
            }
            
            if (!configs.gradient) {
                await this.saveThemeConfig('gradient', defaultGradientConfig);
                console.log('已创建默认渐变配置');
                hasChanges = true;
            }
            
            // 如果从旧格式localStorage迁移数据
            const migrationResult = this.migrateFromOldLocalStorage();
            if (migrationResult && Object.keys(configs).length === 0) {
                await this.saveThemeConfig('theme', migrationResult.theme);
                await this.saveThemeConfig('gradient', migrationResult.gradient);
                console.log('已从localStorage迁移主题配置到IndexedDB');
                hasChanges = true;
            }
            
            if (hasChanges) {
                console.log('主题配置初始化完成');
            }
            
            return true;
        } catch (error) {
            console.error('确保默认配置时出错:', error);
            return false;
        }
    }


    // 从旧格式localStorage迁移数据（同步方法）
    migrateFromOldLocalStorage() {
        try {
            const savedTheme = localStorage.getItem('user-theme-color');
            const savedGradient = localStorage.getItem('user-gradient-config');
            
            if (!savedTheme && !savedGradient) {
                return null;
            }
            
            let themeData = { color: '#07c160', name: '鲜绿' };
            let gradientData = defaultGradientConfig;
            
            if (savedTheme) {
                themeData = JSON.parse(savedTheme);
                console.log('检测到旧格式主题配置:', themeData);
                // 迁移后清理旧数据
                localStorage.removeItem('user-theme-color');
            }
            
            if (savedGradient) {
                gradientData = JSON.parse(savedGradient);
                console.log('检测到旧格式渐变配置:', gradientData);
                // 迁移后清理旧数据
                localStorage.removeItem('user-gradient-config');
            }
            
            return { theme: themeData, gradient: gradientData };
        } catch (error) {
            console.error('迁移旧格式配置失败:', error);
            return null;
        }
    }
}

// 创建全局主题配置管理器实例
const themeConfigManager = new ThemeConfigManager();

// 通用的数据库存储安全检查函数
function safeCreateTransaction(db, storeNames, mode = 'readonly') {
    if (!db) {
        throw new Error('数据库连接不可用');
    }
    
    // 检查所有存储是否存在
    const missingStores = storeNames.filter(storeName => 
        !db.objectStoreNames.contains(storeName)
    );
    
    if (missingStores.length > 0) {
        throw new Error(`存储不存在: ${missingStores.join(', ')}`);
    }
    
    return db.transaction(storeNames, mode);
}




// 从IndexedDB加载保存的主题配置
async function loadThemeConfig() {
    try {
        // 确保默认配置存在（包含从localStorage的自动迁移）
        await themeConfigManager.ensureDefaultConfigs();
        
        // 从IndexedDB加载配置
        const configs = await themeConfigManager.getAllThemeConfigs();
        
        let themeData = configs.theme || { color: '#07c160', name: '鲜绿' };
        let gradientData = configs.gradient || defaultGradientConfig;
        
        // 应用主题配置
        if (gradientData.enabled) {
            applyGradientTheme(gradientData.primaryColor, gradientData.secondaryColor, gradientData.direction);
        } else {
            applyThemeColor(themeData.color);
        }
        
        return { theme: themeData, gradient: gradientData };
    } catch (error) {
        console.error('加载主题配置失败:', error);
        // 使用默认配置
        const themeData = { color: '#07c160', name: '鲜绿' };
        const gradientData = defaultGradientConfig;
        applyThemeColor(themeData.color);
        return { theme: themeData, gradient: gradientData };
    }
}



// 兼容旧的函数名
function loadThemeColor() {
    return loadThemeConfig().then(config => config.theme);
}

// 应用主题色到页面
function applyThemeColor(color) {
    // 禁用渐变模式
    document.body.classList.remove('gradient-mode');
    
    // 计算辅助颜色
    const lightColor = hexToRgba(color, 0.1);
    const hoverColor = darkenColor(color, 0.1);
    
    // 更新CSS变量
    document.documentElement.style.setProperty('--theme-primary', color);
    document.documentElement.style.setProperty('--theme-primary-light', lightColor);
    document.documentElement.style.setProperty('--theme-primary-hover', hoverColor);
    document.documentElement.style.setProperty('--use-gradient', '0');
    
    // 更新meta标签中的主题色（影响系统状态栏）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', color);
    }
    
    // 更新manifest相关的meta标签
    const tileMeta = document.querySelector('meta[name="msapplication-TileColor"]');
    if (tileMeta) {
        tileMeta.setAttribute('content', color);
    }
    
    console.log('主题色已应用:', color);
}

// 应用渐变主题
function applyGradientTheme(primaryColor, secondaryColor, direction) {
    // 启用渐变模式
    document.body.classList.add('gradient-mode');
    
    // 计算辅助颜色
    const lightColor = hexToRgba(primaryColor, 0.1);
    const hoverColor = darkenColor(primaryColor, 0.1);
    
    // 更新CSS变量
    document.documentElement.style.setProperty('--theme-primary', primaryColor);
    document.documentElement.style.setProperty('--theme-secondary', secondaryColor);
    document.documentElement.style.setProperty('--theme-primary-light', lightColor);
    document.documentElement.style.setProperty('--theme-primary-hover', hoverColor);
    document.documentElement.style.setProperty('--theme-gradient-direction', direction);
    document.documentElement.style.setProperty('--theme-gradient', `linear-gradient(${direction}, ${primaryColor}, ${secondaryColor})`);
    document.documentElement.style.setProperty('--use-gradient', '1');
    
    // 更新meta标签中的主题色（使用主色）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', primaryColor);
    }
    
    // 更新manifest相关的meta标签
    const tileMeta = document.querySelector('meta[name="msapplication-TileColor"]');
    if (tileMeta) {
        tileMeta.setAttribute('content', primaryColor);
    }
    
    console.log('渐变主题已应用:', { primaryColor, secondaryColor, direction });
}

// 保存主题色到IndexedDB
async function saveThemeColor(color, name) {
    try {
        const themeData = { color, name };
        
        await themeConfigManager.saveThemeConfig('theme', themeData);
        
        // 禁用渐变模式
        const gradientConfig = { ...defaultGradientConfig, enabled: false };
        await themeConfigManager.saveThemeConfig('gradient', gradientConfig);
        
        console.log('主题色已保存:', themeData);
    } catch (error) {
        console.error('保存主题色失败:', error);
    }
}

// 保存渐变配置到IndexedDB
async function saveGradientConfig(primaryColor, secondaryColor, direction, enabled = true) {
    try {
        const gradientData = { 
            enabled, 
            primaryColor, 
            secondaryColor, 
            direction 
        };
        
        await themeConfigManager.saveThemeConfig('gradient', gradientData);
        console.log('渐变配置已保存:', gradientData);
    } catch (error) {
        console.error('保存渐变配置失败:', error);
    }
}

// 初始化外观管理页面
async function initAppearanceManagement() {
    // 获取当前主题配置
    const config = await loadThemeConfig();
    const currentTheme = config.theme;
    const currentGradient = config.gradient;
    
    // 设置主题色选项的点击事件
    document.querySelectorAll('.theme-color-option').forEach(option => {
        option.addEventListener('click', function() {
            const color = this.getAttribute('data-color');
            const name = this.getAttribute('data-name');
            
            // 移除其他选项的active状态
            document.querySelectorAll('.theme-color-option').forEach(opt => {
                opt.classList.remove('active');
            });
            
            // 添加当前选项的active状态
            this.classList.add('active');
            
            // 应用并保存主题色
            applyThemeColor(color);
            saveThemeColor(color, name);
            
            // 更新自定义颜色选择器
            updateCustomColorInputs(color);
            
            // 禁用渐变开关
            const gradientToggle = document.getElementById('gradientToggle');
            if (gradientToggle) {
                gradientToggle.checked = false;
                toggleGradientSettings(false);
            }
            
            // 显示提示
            showToast(`已切换到${name}`);
        });
        
        // 设置当前选中的主题色
        if (option.getAttribute('data-color') === currentTheme.color && !currentGradient.enabled) {
            option.classList.add('active');
        }
    });
    
    // 设置自定义颜色选择器
    initCustomColorPicker(currentTheme.color);
    
    // 初始化渐变设置
    initGradientSettings(currentGradient);
}

// 初始化自定义颜色选择器
function initCustomColorPicker(initialColor) {
    const colorPicker = document.getElementById('customColorPicker');
    const colorText = document.getElementById('customColorText');
    const colorPreview = document.getElementById('customColorPreview');
    const applyBtn = document.querySelector('.apply-custom-color-btn');
    
    if (!colorPicker || !colorText || !colorPreview) return;
    
    // 设置初始值
    colorPicker.value = initialColor;
    colorText.value = initialColor.toUpperCase();
    colorPreview.style.backgroundColor = initialColor;
    
    // 颜色选择器变化事件
    colorPicker.addEventListener('input', function() {
        const color = this.value.toUpperCase();
        colorText.value = color;
        colorPreview.style.backgroundColor = color;
        validateColorInput(colorText, applyBtn);
    });
    
    // 文本输入框变化事件
    colorText.addEventListener('input', function() {
        let color = this.value.trim();
        
        // 自动添加#前缀
        if (color && !color.startsWith('#')) {
            color = '#' + color;
            this.value = color;
        }
        
        // 验证颜色格式
        if (isValidHexColor(color)) {
            colorPicker.value = color;
            colorPreview.style.backgroundColor = color;
            this.classList.remove('invalid');
        } else {
            this.classList.add('invalid');
        }
        
        validateColorInput(this, applyBtn);
    });
    
    // 文本框失焦时格式化
    colorText.addEventListener('blur', function() {
        if (this.value && isValidHexColor(this.value)) {
            this.value = this.value.toUpperCase();
        }
    });
    
    // 按回车键应用颜色
    colorText.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && isValidHexColor(this.value)) {
            applyCustomColor();
        }
    });
    
    // 点击预览圆圈触发颜色选择器
    colorPreview.addEventListener('click', function() {
        colorPicker.click();
    });
}

// 更新自定义颜色输入框
function updateCustomColorInputs(color) {
    const colorPicker = document.getElementById('customColorPicker');
    const colorText = document.getElementById('customColorText');
    const colorPreview = document.getElementById('customColorPreview');
    const applyBtn = document.querySelector('.apply-custom-color-btn');
    
    if (colorPicker) colorPicker.value = color;
    if (colorText) {
        colorText.value = color.toUpperCase();
        colorText.classList.remove('invalid');
    }
    if (colorPreview) colorPreview.style.backgroundColor = color;
    if (applyBtn) applyBtn.disabled = false;
}

// 验证颜色输入
function validateColorInput(input, button) {
    const isValid = isValidHexColor(input.value);
    button.disabled = !isValid;
    
    if (isValid) {
        input.classList.remove('invalid');
    } else {
        input.classList.add('invalid');
    }
}

// 应用自定义颜色
function applyCustomColor() {
    const colorText = document.getElementById('customColorText');
    const color = colorText.value.trim();
    
    if (!color) {
        showToast('请输入颜色代码');
        return;
    }
    
    if (!isValidHexColor(color)) {
        showToast('请输入有效的颜色代码（例如：#FF0000）');
        colorText.focus();
        return;
    }
    
    // 移除预设选项的active状态
    document.querySelectorAll('.theme-color-option').forEach(opt => {
        opt.classList.remove('active');
    });
    
    // 应用并保存主题色
    applyThemeColor(color);
    saveThemeColor(color, '自定义颜色');
    
    // 更新预览
    const colorPreview = document.getElementById('customColorPreview');
    if (colorPreview) {
        colorPreview.style.backgroundColor = color;
    }
    
    showToast('自定义颜色已应用：' + color.toUpperCase());
}

// 工具函数：验证十六进制颜色代码
function isValidHexColor(color) {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// 工具函数：十六进制转RGBA
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 工具函数：加深颜色
function darkenColor(hex, percent) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    const newR = Math.round(r * (1 - percent));
    const newG = Math.round(g * (1 - percent));
    const newB = Math.round(b * (1 - percent));
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// 初始化渐变设置
function initGradientSettings(gradientConfig) {
    const gradientToggle = document.getElementById('gradientToggle');
    const gradientSettings = document.getElementById('gradientSettings');
    
    if (!gradientToggle) return;
    
    // 设置开关状态
    gradientToggle.checked = gradientConfig.enabled;
    toggleGradientSettings(gradientConfig.enabled);
    
    // 设置渐变开关事件
    gradientToggle.addEventListener('change', function() {
        toggleGradientSettings(this.checked);
    });
    
    // 初始化渐变颜色选择器
    initGradientColorPickers(gradientConfig);
    
    // 初始化渐变方向选择
    initGradientDirectionPickers(gradientConfig.direction);
}

// 切换渐变设置显示/隐藏
function toggleGradientSettings(show) {
    const gradientSettings = document.getElementById('gradientSettings');
    if (gradientSettings) {
        gradientSettings.style.display = show ? 'block' : 'none';
    }
}

// 初始化渐变颜色选择器
function initGradientColorPickers(gradientConfig) {
    // 主色选择器
    initSingleGradientColorPicker('Primary', gradientConfig.primaryColor, updateGradientPreview);
    // 副色选择器
    initSingleGradientColorPicker('Secondary', gradientConfig.secondaryColor, updateGradientPreview);
    
    // 更新预览
    updateGradientPreview();
}

// 初始化单个渐变颜色选择器
function initSingleGradientColorPicker(type, initialColor, callback) {
    const picker = document.getElementById(`gradient${type}Picker`);
    const text = document.getElementById(`gradient${type}Text`);
    const preview = document.getElementById(`gradient${type}Preview`);
    
    if (!picker || !text || !preview) return;
    
    // 设置初始值
    picker.value = initialColor;
    text.value = initialColor.toUpperCase();
    preview.style.backgroundColor = initialColor;
    
    // 颜色选择器变化事件
    picker.addEventListener('input', function() {
        const color = this.value.toUpperCase();
        text.value = color;
        preview.style.backgroundColor = color;
        if (callback) callback();
    });
    
    // 文本输入框变化事件
    text.addEventListener('input', function() {
        let color = this.value.trim();
        
        if (color && !color.startsWith('#')) {
            color = '#' + color;
            this.value = color;
        }
        
        if (isValidHexColor(color)) {
            picker.value = color;
            preview.style.backgroundColor = color;
            this.classList.remove('invalid');
            if (callback) callback();
        } else {
            this.classList.add('invalid');
        }
    });
    
    // 点击预览触发颜色选择器
    preview.addEventListener('click', function() {
        picker.click();
    });
}

// 初始化渐变方向选择器
function initGradientDirectionPickers(initialDirection) {
    const directionInputs = document.querySelectorAll('input[name="gradientDirection"]');
    
    directionInputs.forEach(input => {
        if (input.value === initialDirection) {
            input.checked = true;
        }
        
        input.addEventListener('change', function() {
            if (this.checked) {
                updateGradientPreview();
            }
        });
    });
}

// 更新渐变预览
function updateGradientPreview() {
    const primaryColor = document.getElementById('gradientPrimaryText').value;
    const secondaryColor = document.getElementById('gradientSecondaryText').value;
    const direction = document.querySelector('input[name="gradientDirection"]:checked')?.value || 'to right';
    
    const previewDemo = document.getElementById('gradientPreviewDemo');
    if (previewDemo && isValidHexColor(primaryColor) && isValidHexColor(secondaryColor)) {
        previewDemo.style.background = `linear-gradient(${direction}, ${primaryColor}, ${secondaryColor})`;
    }
}

// 应用渐变主题（从UI调用）
function applyGradientThemeFromUI() {
    const primaryColor = document.getElementById('gradientPrimaryText').value;
    const secondaryColor = document.getElementById('gradientSecondaryText').value;
    const direction = document.querySelector('input[name="gradientDirection"]:checked')?.value || 'to right';
    
    if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) {
        showToast('请输入有效的颜色代码');
        return;
    }
    
    // 应用渐变
    applyGradientTheme(primaryColor, secondaryColor, direction);
    
    // 保存配置
    saveGradientConfig(primaryColor, secondaryColor, direction, true);
    
    // 移除预设主题色的选中状态
    document.querySelectorAll('.theme-color-option').forEach(opt => {
        opt.classList.remove('active');
    });
    
    showToast('渐变主题已应用');
}

// 打开气泡设计器
function openBubbleDesigner() {
    try {
        // 在新窗口中打开气泡设计器
        const bubbleWindow = window.open('bubble.html', 'bubbleDesigner', 'width=1200,height=800,scrollbars=yes,resizable=yes');
        
        if (!bubbleWindow) {
            showToast('无法打开气泡设计器，请检查浏览器弹窗设置');
            return;
        }
        
        // 聚焦到新窗口
        bubbleWindow.focus();
        
    } catch (error) {
        console.error('打开气泡设计器时出错:', error);
        showToast('打开气泡设计器失败，请重试');
    }
}

// 在页面加载完成后初始化主题色
document.addEventListener('DOMContentLoaded', async function() {
    // 等待数据库完全初始化后再加载主题配置
    const waitForDatabase = async () => {
        let attempts = 0;
        while ((!window.db || !window.isIndexedDBReady) && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!window.db || !window.isIndexedDBReady) {
            console.warn('数据库初始化超时，使用默认主题配置');
            return false;
        }
        
        // 再次检查themeConfig表是否存在
        if (!window.db.objectStoreNames.contains('themeConfig')) {
            console.warn('themeConfig存储不存在，等待数据库升级');
            // 触发数据库升级
            if (window.dbManager && window.dbManager.autoUpgradeDatabase) {
                try {
                    await window.dbManager.autoUpgradeDatabase();
                    // 重新检查
                    if (window.db && window.db.objectStoreNames.contains('themeConfig')) {
                        console.log('数据库升级完成，themeConfig表已创建');
                        return true;
                    }
                } catch (error) {
                    console.error('数据库升级失败:', error);
                }
            }
            return false;
        }
        
        return true;
    };
    
    const databaseReady = await waitForDatabase();
    
    if (databaseReady) {
        // 加载保存的主题配置
        await loadThemeConfig();
        
        // 加载自定义气泡样式
        await loadCustomBubbleStyle();
    } else {
        // 如果数据库未就绪，应用默认主题
        console.log('数据库未就绪，应用默认主题');
        applyThemeColor('#07c160');
    }
    
    // 当切换到外观管理页面时初始化
    const originalShowPageAsync = showPageAsync;
    window.showPageAsync = async function(pageIdToShow) {
        const result = await originalShowPageAsync(pageIdToShow);
        
        if (pageIdToShow === 'appearanceManagementPage') {
            setTimeout(async () => {
                await initAppearanceManagement();
            }, 100);
        }
        
        return result;
    };
});

// 监听来自气泡设计器的样式应用消息
window.addEventListener('message', async function(event) {
    // 检查消息类型
    if (event.data && event.data.type === 'apply-bubble-style') {
        try {
            const bubbleStyleData = event.data.payload;
            const bubbleType = event.data.bubbleType || 'others'; // 默认为别人的气泡
            
            // 根据气泡类型存储到不同的键
            const storageKey = bubbleType === 'self' ? 'bubbleStyleSelf' : 'bubbleStyle';
            
            // 存储气泡样式到 IndexedDB
            saveBubbleStyleToStorage(bubbleStyleData, storageKey).then(() => {
                console.log(`${bubbleType === 'self' ? '我的' : '对方的'}气泡样式已保存到存储`);
                
                // 如果当前在聊天页面，立即应用样式
                if (document.getElementById('chatPage').classList.contains('active')) {
                    applyBubbleStyleToCurrentChat();
                }
                
                // 显示成功提示
                if (typeof showToast === 'function') {
                    showToast(`${bubbleType === 'self' ? '我的' : '对方的'}气泡样式已应用！`);
                }
            }).catch(error => {
                console.error('保存气泡样式失败:', error);
                if (typeof showToast === 'function') {
                    showToast('样式保存失败: ' + error.message);
                }
            });
            
        } catch (error) {
            console.error('处理气泡样式消息失败:', error);
        }
    } else if (event.data && event.data.type === 'reset-bubble-style') {
        try {
            // 恢复默认气泡样式
            await resetBubbleStyleToDefault();
            
            // 显示成功提示
            if (typeof showToast === 'function') {
                showToast('已恢复默认气泡样式！');
            }
            
        } catch (error) {
            console.error('恢复默认气泡样式失败:', error);
            if (typeof showToast === 'function') {
                showToast('恢复默认样式失败: ' + error.message);
            }
        }
    }
});

/**
 * 保存气泡样式到存储
 */
async function saveBubbleStyleToStorage(styleData, storageKey = 'bubbleStyle') {
    try {
        // 保存完整的气泡样式数据（包含所有配置）
        const bubbleStyleConfig = {
            ...styleData,  // 包含所有样式配置
            enabled: true,  // 每次保存都自动启用
            lastModified: new Date().toISOString()  // 添加时间戳以跟踪更新
        };
        
        await themeConfigManager.saveThemeConfig(storageKey, bubbleStyleConfig);
        console.log(`${storageKey}已保存到 themeConfig 并自动启用`);
        
    } catch (error) {
        console.error(`保存${storageKey}失败:`, error);
        throw error;
    }
}

/**
 * 应用气泡样式到当前聊天
 */
async function applyBubbleStyleToCurrentChat() {
    try {
        // 同时读取两种气泡样式
        await themeConfigManager.init();
        const bubbleStyleOthers = await themeConfigManager.getThemeConfig('bubbleStyle');
        const bubbleStyleSelf = await themeConfigManager.getThemeConfig('bubbleStyleSelf');
        
        // 如果通过 themeConfigManager 获取不到，直接从数据库读取
        let directBubbleStyleOthers = null;
        let directBubbleStyleSelf = null;
        
        if (!bubbleStyleOthers || !bubbleStyleSelf) {
            const results = await new Promise((resolve) => {
                const transaction = themeConfigManager.db.transaction(['themeConfig'], 'readonly');
                const store = transaction.objectStore('themeConfig');
                let others = null, self = null, completed = 0;
                
                const checkComplete = () => {
                    completed++;
                    if (completed === 2) {
                        resolve({ others, self });
                    }
                };
                
                const requestOthers = store.get('bubbleStyle');
                requestOthers.onsuccess = () => {
                    others = requestOthers.result;
                    checkComplete();
                };
                requestOthers.onerror = () => checkComplete();
                
                const requestSelf = store.get('bubbleStyleSelf');
                requestSelf.onsuccess = () => {
                    self = requestSelf.result;
                    checkComplete();
                };
                requestSelf.onerror = () => checkComplete();
            });
            
            directBubbleStyleOthers = results.others;
            directBubbleStyleSelf = results.self;
        }
        
        // 使用找到的数据
        const styleDataOthers = bubbleStyleOthers || directBubbleStyleOthers;
        const styleDataSelf = bubbleStyleSelf || directBubbleStyleSelf;
        
        // 处理别人的气泡样式
        const isEnabledOthers = styleDataOthers?.enabled || styleDataOthers?.data?.enabled;
        const actualStyleDataOthers = styleDataOthers?.data || styleDataOthers;
        
        const shouldEnableOthers = isEnabledOthers || 
                                 (styleDataOthers && actualStyleDataOthers?.html) || 
                                 (styleDataOthers && actualStyleDataOthers?.borderWidth !== undefined && !('enabled' in styleDataOthers));
        
        // 处理自己的气泡样式
        const isEnabledSelf = styleDataSelf?.enabled || styleDataSelf?.data?.enabled;
        const actualStyleDataSelf = styleDataSelf?.data || styleDataSelf;
        
        const shouldEnableSelf = isEnabledSelf || 
                               (styleDataSelf && actualStyleDataSelf?.html) || 
                               (styleDataSelf && actualStyleDataSelf?.borderWidth !== undefined && !('enabled' in styleDataSelf));
        
        // 将自定义样式应用到全局样式变量
        if (styleDataOthers && shouldEnableOthers && actualStyleDataOthers?.html) {
            window.customBubbleStyleOthers = actualStyleDataOthers;
            console.log('应用对方气泡样式到当前聊天');
        } else {
            window.customBubbleStyleOthers = null;
        }
        
        if (styleDataSelf && shouldEnableSelf && actualStyleDataSelf?.html) {
            window.customBubbleStyleSelf = actualStyleDataSelf;
            console.log('应用我的气泡样式到当前聊天');
        } else {
            window.customBubbleStyleSelf = null;
        }
        
        // 兼容旧版本：如果有旧的customBubbleStyle，保持向后兼容
        if (window.customBubbleStyleOthers && !window.customBubbleStyle) {
            window.customBubbleStyle = window.customBubbleStyleOthers;
        }
        
        // 重新渲染当前聊天消息以应用新样式
        if (window.currentContact && (window.customBubbleStyleOthers || window.customBubbleStyleSelf)) {
            await renderMessages();
            console.log('气泡样式已应用到当前聊天');
        } else if (!window.customBubbleStyleOthers && !window.customBubbleStyleSelf) {
            // 清除自定义样式，使用默认样式
            window.customBubbleStyle = null;
            console.log('未找到启用的气泡样式，使用默认样式');
        }
        
    } catch (error) {
        console.error('应用气泡样式失败:', error);
    }
}

/**
 * 获取当前联系人ID
 */
function getCurrentContactId() {
    // 从当前活动的聊天页面获取联系人ID
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle && chatTitle.dataset.contactId) {
        return chatTitle.dataset.contactId;
    }
    
    // 备用方法：从全局变量或当前联系人获取
    return window.currentContactId || (window.currentContact && window.currentContact.id) || null;
}

/**
 * 加载自定义气泡样式
 */
async function loadCustomBubbleStyle() {
    try {
        // 同时读取两种气泡样式
        await themeConfigManager.init();
        const bubbleStyleOthers = await themeConfigManager.getThemeConfig('bubbleStyle');
        const bubbleStyleSelf = await themeConfigManager.getThemeConfig('bubbleStyleSelf');
        
        // 如果通过 themeConfigManager 获取不到，直接从数据库读取
        let directBubbleStyleOthers = null;
        let directBubbleStyleSelf = null;
        
        if (!bubbleStyleOthers || !bubbleStyleSelf) {
            const results = await new Promise((resolve) => {
                const transaction = themeConfigManager.db.transaction(['themeConfig'], 'readonly');
                const store = transaction.objectStore('themeConfig');
                let others = null, self = null, completed = 0;
                
                const checkComplete = () => {
                    completed++;
                    if (completed === 2) {
                        resolve({ others, self });
                    }
                };
                
                const requestOthers = store.get('bubbleStyle');
                requestOthers.onsuccess = () => {
                    others = requestOthers.result;
                    checkComplete();
                };
                requestOthers.onerror = () => checkComplete();
                
                const requestSelf = store.get('bubbleStyleSelf');
                requestSelf.onsuccess = () => {
                    self = requestSelf.result;
                    checkComplete();
                };
                requestSelf.onerror = () => checkComplete();
            });
            
            directBubbleStyleOthers = results.others;
            directBubbleStyleSelf = results.self;
        }
        
        // 使用找到的数据
        const styleDataOthers = bubbleStyleOthers || directBubbleStyleOthers;
        const styleDataSelf = bubbleStyleSelf || directBubbleStyleSelf;
        
        console.log('加载的对方气泡样式配置:', styleDataOthers);
        console.log('加载的我的气泡样式配置:', styleDataSelf);
        
        // 处理对方气泡样式
        const isEnabledOthers = styleDataOthers?.enabled || styleDataOthers?.data?.enabled;
        const actualStyleDataOthers = styleDataOthers?.data || styleDataOthers;
        
        const shouldEnableOthers = isEnabledOthers || 
                                 (styleDataOthers && actualStyleDataOthers?.html) || 
                                 (styleDataOthers && actualStyleDataOthers?.borderWidth !== undefined && !('enabled' in styleDataOthers));
        
        // 处理我的气泡样式
        const isEnabledSelf = styleDataSelf?.enabled || styleDataSelf?.data?.enabled;
        const actualStyleDataSelf = styleDataSelf?.data || styleDataSelf;
        
        const shouldEnableSelf = isEnabledSelf || 
                               (styleDataSelf && actualStyleDataSelf?.html) || 
                               (styleDataSelf && actualStyleDataSelf?.borderWidth !== undefined && !('enabled' in styleDataSelf));
        
        // 应用对方气泡样式
        if (styleDataOthers && shouldEnableOthers && actualStyleDataOthers?.html) {
            window.customBubbleStyleOthers = actualStyleDataOthers;
            console.log('对方气泡样式已从 themeConfig 加载并启用');
        } else {
            window.customBubbleStyleOthers = null;
            console.log('未找到启用的对方气泡样式，使用默认样式');
        }
        
        // 应用我的气泡样式
        if (styleDataSelf && shouldEnableSelf && actualStyleDataSelf?.html) {
            window.customBubbleStyleSelf = actualStyleDataSelf;
            console.log('我的气泡样式已从 themeConfig 加载并启用');
        } else {
            window.customBubbleStyleSelf = null;
            console.log('未找到启用的我的气泡样式，使用默认样式');
        }
        
        // 兼容旧版本：如果有对方气泡样式，保持向后兼容
        if (window.customBubbleStyleOthers && !window.customBubbleStyle) {
            window.customBubbleStyle = window.customBubbleStyleOthers;
            console.log('设置向后兼容的 customBubbleStyle');
        } else if (!window.customBubbleStyleOthers && !window.customBubbleStyleSelf) {
            // 清除任何之前的自定义样式
            window.customBubbleStyle = null;
        }
        
    } catch (error) {
        console.error('加载气泡样式失败:', error);
    }
}

/**
 * 恢复默认气泡样式
 */
async function resetBubbleStyleToDefault() {
    try {
        // 从数据库删除自定义气泡样式配置
        await themeConfigManager.init();
        await themeConfigManager.deleteThemeConfig('bubbleStyle');
        
        // 清除内存中的自定义样式
        window.customBubbleStyle = null;
        
        console.log('自定义气泡样式已清除，恢复默认样式');
        
        // 如果当前在聊天页面，重新渲染消息以应用默认样式
        if (window.currentContact && document.getElementById('chatPage').classList.contains('active')) {
            await renderMessages();
        }
        
    } catch (error) {
        console.error('恢复默认气泡样式失败:', error);
        throw error;
    }
}

function setupServiceWorkerUpdater() {
    if ('serviceWorker' in navigator) {
        let newWorker;

        navigator.serviceWorker.ready.then(reg => {
            // 浏览器在后台发现新版本的 service-worker.js 文件时会触发 updatefound 事件
            reg.addEventListener('updatefound', () => {
                newWorker = reg.installing;
                
                newWorker.addEventListener('statechange', () => {
                    // newWorker.state 变为 installed，表示新 Service Worker 已安装完毕
                    if (newWorker.state === 'installed') {
                        // 检查当前是否有 Service Worker 在控制页面
                        if (navigator.serviceWorker.controller) {
                            // 这意味着页面被旧的 Service Worker 控制着，需要更新
                            showUpdateNotification();
                        }
                    }
                });
            });
        });
    }
}

// 显示更新提示的UI函数
function showUpdateNotification() {
    let notification = document.getElementById('sw-update-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'sw-update-notification';
        // 一些简单的样式
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #333;
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 15px;
            font-size: 14px;
        `;
        document.body.appendChild(notification);
    }

    notification.innerHTML = `
        <span>应用有新版本啦！</span>
        <button onclick="window.location.reload()" style="background: #07c160; color: white; border: none; padding: 6px 12px; border-radius: 15px; cursor: pointer;">立即刷新</button>
    `;
    notification.style.display = 'flex';
}