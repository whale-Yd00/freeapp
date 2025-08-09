// === Console日志捕获系统 ===
let consoleLogs = [];
const maxLogEntries = 1000; // 限制日志条目数量避免内存过大

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

// 多选模式状态
let isMultiSelectMode = false;
let selectedMessages = new Set();

// 语音播放相关全局变量
let voiceAudio = new Audio(); // 用于播放语音消息的全局Audio对象
let currentPlayingElement = null; // 跟踪当前播放的语音元素


// --- 初始化 ---
async function init() {
    await openDB(); // 确保IndexedDB先打开
    
    // 检查数据库版本并提示用户
    if (!db.objectStoreNames.contains('emojiImages')) {
        console.log('检测到数据库需要升级，表情包功能将使用兼容模式。');
        if (typeof showToast === 'function') {
            showToast('数据库已更新，表情包功能已优化！如需使用新功能，请点击"🚀数据库优化"按钮');
        }
    }
    
    await loadDataFromDB(); // 从IndexedDB加载数据

    renderContactList();
    updateUserProfileUI();
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
            const playButton = currentPlayingElement.querySelector('.play-button');
            if (playButton) playButton.textContent = '▶';
            currentPlayingElement = null;
        }
    };
    voiceAudio.onerror = () => {
        showToast('音频文件加载失败');
        if (currentPlayingElement) {
             currentPlayingElement.classList.remove('playing', 'loading');
             const playButton = currentPlayingElement.querySelector('.play-button');
             if (playButton) playButton.textContent = '▶';
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
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WhaleLLTDB', 7);

        request.onupgradeneeded = event => {
            const db = event.target.result;
            const oldVersion = event.oldVersion;
            const newVersion = event.newVersion;
            
            console.log(`数据库升级: 从版本 ${oldVersion} 到版本 ${newVersion}`);
            
            // 音乐播放器相关的ObjectStore
            if (!db.objectStoreNames.contains('songs')) {
                db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
            }
            // 聊天助手相关的ObjectStore
            if (!db.objectStoreNames.contains('contacts')) {
                db.createObjectStore('contacts', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('apiSettings')) {
                db.createObjectStore('apiSettings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('emojis')) {
                db.createObjectStore('emojis', { keyPath: 'id' });
            }
            // 版本5新增：表情图片分离存储
            if (!db.objectStoreNames.contains('emojiImages')) {
                db.createObjectStore('emojiImages', { keyPath: 'tag' });
            }
            if (!db.objectStoreNames.contains('backgrounds')) {
                db.createObjectStore('backgrounds', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('userProfile')) {
                db.createObjectStore('userProfile', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('moments')) {
                db.createObjectStore('moments', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('weiboPosts')) {
                db.createObjectStore('weiboPosts', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('hashtagCache')) {
                db.createObjectStore('hashtagCache', { keyPath: 'id' });
            }
            // 角色记忆相关的ObjectStore
            if (!db.objectStoreNames.contains('characterMemories')) {
                db.createObjectStore('characterMemories', { keyPath: 'contactId' });
            }
            if (!db.objectStoreNames.contains('conversationCounters')) {
                db.createObjectStore('conversationCounters', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('globalMemory')) {
                db.createObjectStore('globalMemory', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('memoryProcessedIndex')) {
                db.createObjectStore('memoryProcessedIndex', { keyPath: 'contactId' });
            }
            
            // 标记需要进行数据优化（针对版本4、5用户）
            if (oldVersion <= 5 && newVersion >= 7) {
                // 设置标记，在数据库连接成功后触发优化
                window._needsEmojiOptimization = true;
                console.log('标记需要进行表情数据优化');
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            isIndexedDBReady = true; // 标记IndexedDB已准备就绪
            
            // 确保暴露到全局对象
            window.db = db;
            window.isIndexedDBReady = isIndexedDBReady;
            
            console.log('[记忆调试] IndexedDB 成功打开', {
                version: db.version,
                objectStoreNames: Array.from(db.objectStoreNames),
                isIndexedDBReady: isIndexedDBReady,
                windowDb: !!window.db,
                windowReady: window.isIndexedDBReady
            });
            
            // 检查是否需要进行表情数据优化
            if (window._needsEmojiOptimization) {
                console.log('检测到需要进行表情数据优化，准备执行...');
                setTimeout(() => {
                    performEmojiOptimization();
                }, 1000); // 延迟1秒确保所有数据加载完成
                window._needsEmojiOptimization = false;
            }
            
            // 数据库准备好后，初始化记忆管理器数据
            if (window.characterMemoryManager && !window.characterMemoryManager.isInitialized) {
                setTimeout(async () => {
                    console.log('[记忆调试] 数据库已准备好，开始初始化记忆管理器数据');
                    await window.characterMemoryManager.loadConversationCounters();
                    await window.characterMemoryManager.loadLastProcessedMessageIndex();
                    await window.characterMemoryManager.getGlobalMemory();
                    window.characterMemoryManager.isInitialized = true;
                    console.log('[记忆调试] 记忆管理器数据初始化完成');
                }, 100); // 稍微延迟确保所有设置都完成
            }
            
            resolve(db);
        };

        request.onerror = event => {
            console.error('IndexedDB 打开失败:', event.target.errorCode);
            showToast('数据存储初始化失败');
            reject('IndexedDB error');
        };
    });
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
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法加载数据。');
        return;
    }
    try {
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
        
        contacts = (await promisifyRequest(contactsStore.getAll())) || [];
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

        const savedApiSettings = (await promisifyRequest(apiSettingsStore.get('settings'))) || {};
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

        emojis = (await promisifyRequest(emojisStore.getAll())) || [];
        backgrounds = (await promisifyRequest(backgroundsStore.get('backgroundsMap'))) || {};
        const savedUserProfile = (await promisifyRequest(userProfileStore.get('profile'))) || {};
        userProfile = { ...userProfile, ...savedUserProfile };
        if (userProfile.personality === undefined) {
            userProfile.personality = '';
        }
        moments = (await promisifyRequest(momentsStore.getAll())) || [];
        weiboPosts = (await promisifyRequest(weiboPostsStore.getAll())) || [];

        // 加载hashtag缓存
        const hashtagCacheStore = transaction.objectStore('hashtagCache');
        const savedHashtagCache = (await promisifyRequest(hashtagCacheStore.get('cache'))) || {};
        hashtagCache = savedHashtagCache;

        // 重新初始化角色记忆管理器的数据（现在数据库已准备好）
        console.log('[记忆调试] script.js 中准备加载角色记忆管理器数据', {
            hasMemoryManager: !!window.characterMemoryManager,
            isIndexedDBReady: window.isIndexedDBReady,
            hasDb: !!window.db,
            dbVersion: window.db?.version,
            contactsCount: window.contacts?.length
        });
        
        if (window.characterMemoryManager) {
            await window.characterMemoryManager.loadConversationCounters();
            await window.characterMemoryManager.getGlobalMemory();
            console.log('[记忆调试] script.js 中角色记忆管理器数据加载完成', {
                isSystemReady: window.characterMemoryManager.isSystemReady()
            });
        }

    } catch (error) {
        console.error('从IndexedDB加载数据失败:', error);
        showToast('加载数据失败');
    }
}

async function saveDataToDB() {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法保存数据。');
        return;
    }
    try {
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
        await promisifyRequest(contactsStore.clear());
        for (const contact of contacts) {
            await promisifyRequest(contactsStore.put(contact));
        }

        await promisifyRequest(apiSettingsStore.put({ id: 'settings', ...apiSettings }));
        
        await promisifyRequest(emojisStore.clear());
        for (const emoji of emojis) {
            await promisifyRequest(emojisStore.put(emoji));
        }

        await promisifyRequest(backgroundsStore.put({ id: 'backgroundsMap', ...backgrounds }));
        await promisifyRequest(userProfileStore.put({ id: 'profile', ...userProfile }));
        
        await promisifyRequest(momentsStore.clear());
        for (const moment of moments) {
            await promisifyRequest(momentsStore.put(moment));
        }

        // 保存hashtag缓存
        const hashtagCacheStore = transaction.objectStore('hashtagCache');
        await promisifyRequest(hashtagCacheStore.put({ id: 'cache', ...hashtagCache }));

        await promisifyTransaction(transaction); // 等待所有操作完成
    } catch (error) {
        console.error('保存数据到IndexedDB失败:', error);
        showToast('保存数据失败');
    }
}

// 辅助函数：将IndexedDB请求转换为Promise
function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 辅助函数：将IndexedDB事务转换为Promise
function promisifyTransaction(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
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
const pageIds = ['contactListPage', 'weiboPage', 'momentsPage', 'profilePage', 'chatPage', 'dataManagementPage', 'debugLogPage', 'memoryManagementPage'];

function showPage(pageIdToShow) {
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

    // --- Lazy Loading/Rendering ---
    // Render Weibo posts when the page is shown
    if (pageIdToShow === 'weiboPage') {
        renderAllWeiboPosts();
    }
    // Render Moments only on the first time it's opened
    if (pageIdToShow === 'momentsPage' && !isMomentsRendered) {
        renderMomentsList();
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
    console.log('=== 开始生成论坛帖子 ===');
    console.log('输入参数:', { contactId, relations, relationDescription, hashtag, count });
    
    const contact = contacts.find(c => c.id === contactId);
    console.log('找到的联系人:', contact);
    
    if (!contact) {
        console.error('未找到联系人，contactId:', contactId, '所有联系人:', contacts);
        showToast('未找到指定的聊天对象');
        return;
    }
    
    console.log('当前API设置:', { 
        url: apiSettings.url, 
        model: apiSettings.model, 
        hasKey: !!apiSettings.key 
    });
    
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
    const systemPrompt = window.promptBuilder.buildWeiboPrompt(
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
    console.log('系统提示词长度:', systemPrompt.length, '字符');
    console.log('系统提示词内容(前500字符):', systemPrompt.substring(0, 500));

    try {
        const payload = {
            model: apiSettings.model,
            messages: [{ role: 'user', content: systemPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.7
        };

        const apiUrl = `${apiSettings.url}/chat/completions`;
        console.log('准备发送API请求到:', apiUrl);
        console.log('请求载荷:', JSON.stringify(payload, null, 2));

        console.log('发送API请求...');
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

        console.log('解析API响应JSON...');
        const data = await response.json();
        console.log('API返回的完整数据:', JSON.stringify(data, null, 2));
        
        let jsonText = data.choices[0].message.content;
        console.log('提取的消息内容:', jsonText);
        
        if (!jsonText) {
            console.error('AI返回的内容为空');
            throw new Error("AI未返回有效内容");
        }
        
        console.log('原始JSON文本:', jsonText);
        
        // 自动清理AI可能返回的多余代码块
        const originalJsonText = jsonText;
        jsonText = jsonText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7).trim(); // 移除 ```json 和可能的前导空格
            console.log('移除了```json前缀');
        }
        if (jsonText.endsWith('```')) {
            jsonText = jsonText.slice(0, -3).trim(); // 移除末尾的 ``` 和可能的尾随空格
            console.log('移除了```后缀');
        }
        
        if (originalJsonText !== jsonText) {
            console.log('清理后的JSON文本:', jsonText);
        }

        console.log('尝试解析JSON...');
        let weiboData;
        try {
            weiboData = JSON.parse(jsonText);
            console.log('JSON解析成功，数据结构:', weiboData);
        } catch (parseError) {
            console.error('JSON解析失败:', parseError);
            console.error('尝试解析的文本:', jsonText);
            throw new Error(`JSON解析失败: ${parseError.message}`);
        }

        // --- 时间戳注入 ---
        console.log('开始注入时间戳...');
        const now = Date.now();
        // 主楼时间设为2-5分钟前
        const postCreatedAt = new Date(now - (Math.random() * 3 + 2) * 60 * 1000);
        let lastCommentTime = postCreatedAt.getTime();
        
        console.log('生成的帖子数量:', weiboData.posts ? weiboData.posts.length : '无posts字段');

        if (weiboData.posts && Array.isArray(weiboData.posts)) {
            weiboData.posts.forEach((post, index) => {
                post.timestamp = postCreatedAt.toISOString(); // 给主楼加时间戳
                console.log(`帖子${index + 1}:`, { 
                    content: post.content ? post.content.substring(0, 50) + '...' : '无内容',
                    timestamp: post.timestamp,
                    commentsCount: post.comments ? post.comments.length : 0
                });
                
                if (post.comments && Array.isArray(post.comments)) {
                    post.comments.forEach((comment, commentIndex) => {
                        // 回复时间在主楼和现在之间，且比上一条晚一点
                        const newCommentTimestamp = lastCommentTime + (Math.random() * 2 * 60 * 1000); // 0-2分钟后
                        lastCommentTime = newCommentTimestamp;
                        comment.timestamp = new Date(Math.min(newCommentTimestamp, now)).toISOString(); // 不超过当前时间
                        console.log(`  评论${commentIndex + 1}:`, {
                            author: comment.author,
                            content: comment.content ? comment.content.substring(0, 30) + '...' : '无内容',
                            timestamp: comment.timestamp
                        });
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
        console.error('错误堆栈:', error.stack);
        console.error('完整错误对象:', error);
        showToast('生成论坛失败: ' + error.message);
    } finally {
        console.log('清理加载指示器...');
        loadingIndicator.remove();
        console.log('=== generateWeiboPosts 函数执行结束 ===');
    }
}


function renderAllWeiboPosts() {
    const container = document.getElementById('weiboContainer');
    container.innerHTML = '';

    if (!weiboPosts || weiboPosts.length === 0) {
        container.innerHTML = '<div class="loading-text">还没有任何帖子，点击右上角“+”来生成吧！</div>';
        return;
    }

    // Sort posts by creation date, newest first
    const sortedPosts = weiboPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sortedPosts.forEach(storedPost => {
        renderSingleWeiboPost(storedPost);
    });
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
                <a href="#" class="action-btn-weibo" onclick="showReplyBox('${postHtmlId}')">
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
            commentsSection.onclick = () => showReplyBox(postHtmlId);

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
                        replyToComment(comment.commenter_name, postHtmlId);
                    });

                    commentsSection.appendChild(commentDiv);
                });
            }
        }
        
        container.appendChild(postElement);
    });
}

function replyToComment(commenterName, postHtmlId) {
    // First, ensure the reply box is visible for the post.
    showReplyBox(postHtmlId);

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

function showReplyBox(postHtmlId) {
    const postElement = document.getElementById(postHtmlId);
    if (!postElement) return;

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
        const storedPost = weiboPosts.find(p => p.id === storedPostId);
        if (!storedPost) {
            showToast('错误：找不到原始帖子');
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
        showReplyBox(postHtmlId); // Keep the reply box open

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
            showToast(`生成失败: ${error.message}`);
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
    
    return data.choices[0].message.content.trim();
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
    
    return data.choices[0].message.content.trim();
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

function showPublishMomentModal() {
    document.getElementById('publishMomentModal').style.display = 'block';
    document.getElementById('momentPreview').style.display = 'none';
    document.getElementById('publishMomentBtn').disabled = true;
}

function closePublishMomentModal() {
    document.getElementById('publishMomentModal').style.display = 'none';
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

        const momentContent = data.choices[0].message.content.trim() || '';

        let imageUrl = null;
        const unsplashKey = document.getElementById('unsplashApiKey').value.trim();
        if (unsplashKey) {
            imageUrl = await fetchMatchingImageForPublish(momentContent, unsplashKey);
        }

        const comments = await generateAIComments(momentContent);

        const moment = {
            id: Date.now().toString(),
            authorName: currentContact.name,
            authorAvatar: currentContact.avatar,
            content: momentContent,
            image: imageUrl,
            time: new Date().toISOString(),
            likes: 0,
            comments: comments
        };

        moments.unshift(moment);
        await saveDataToDB();
        renderMomentsList();
        closePublishMomentModal();
        showToast('朋友圈发布成功');

    } catch (error) {
        console.error('生成朋友圈失败:', error);
        showToast('生成失败: ' + error.message);
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
        let searchQuery = await generateImageSearchQuery(content);
        if (!searchQuery) {
            searchQuery = extractImageKeywords(content);
        }
        // 这是直接从浏览器向Unsplash API发起的请求
        const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=3&orientation=landscape`, {
            headers: {
                'Authorization': `Client-ID ${apiKey}`
            }
        });
        if (!response.ok) throw new Error('Unsplash API请求失败');
        const data = await response.json();
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
        return data.choices[0].message.content.trim() || null;
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
        const systemPrompt = window.promptBuilder.buildCommentsPrompt(momentContent);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { response_format: { type: "json_object" }, temperature: 0.9 },
            (apiSettings.timeout || 60) * 1000
        );
        
        const jsonText = data.choices[0].message.content;
        if (!jsonText) {
            throw new Error("AI未返回有效的JSON格式");
        }

        const commentsData = JSON.parse(jsonText);
        return commentsData.comments.map(comment => ({
            author: comment.author,
            content: comment.content,
            time: new Date(Date.now() - Math.floor(Math.random() * 600000)).toISOString()
        }));
    } catch (error) {
        console.error('AI评论生成失败:', error);
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
        const comments = await generateAIComments(content);
        const moment = { id: Date.now().toString(), authorName: currentContact.name, authorAvatar: currentContact.avatar, content, image: imageUrl, time: new Date().toISOString(), likes: 0, comments };
        moments.unshift(moment);
        await saveDataToDB(); // 使用IndexedDB保存
        renderMomentsList();
        closePublishMomentModal();
        showToast('朋友圈发布成功');
    } catch (error) {
        console.error('发布朋友圈失败:', error);
        showToast('发布失败: ' + error.message);
    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = '发布';
    }
}

function renderMomentsList() {
    const momentsEmpty = document.getElementById('momentsEmpty');
    const momentsList = document.getElementById('momentsList');
    if (moments.length === 0) { 
        momentsEmpty.style.display = 'block';
        momentsList.style.display = 'none';
    } else {
        momentsEmpty.style.display = 'none';
        momentsList.style.display = 'block';
        momentsList.innerHTML = '';
        moments.forEach(moment => {
            const momentDiv = document.createElement('div');
            momentDiv.className = 'moment-item';
            let avatarContent = moment.authorAvatar ? `<img src="${moment.authorAvatar}">` : moment.authorName[0];
            let imageContent = moment.image ? `<img src="${moment.image}" class="moment-image">` : '';
            let commentsContent = '';
            if (moment.comments && moment.comments.length > 0) {
                commentsContent = `<div style="margin-top: 10px; padding-top: 10px; border-top: 0.5px solid #eee;">${moment.comments.map(comment => `<div style="font-size: 13px; color: #576b95; margin-bottom: 4px;"><span>${comment.author}: </span><span style="color: #333;">${comment.content}</span></div>`).join('')}</div>`;
            }
            momentDiv.innerHTML = `<div class="moment-header"><div class="moment-avatar">${avatarContent}</div><div class="moment-info"><div class="moment-name">${moment.authorName}</div><div class="moment-time">${formatContactListTime(moment.time)}</div></div></div><div class="moment-content">${moment.content}</div>${imageContent}${commentsContent}`;
            momentsList.appendChild(momentDiv);
        });
    }
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

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
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
    if (!db.objectStoreNames.contains('emojiImages')) {
        console.warn('emojiImages存储不存在，请刷新页面升级数据库。');
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
    if (!db.objectStoreNames.contains('emojiImages')) {
        console.warn('emojiImages存储不存在，请刷新页面升级数据库。');
        return null;
    }
    try {
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
    if (!db.objectStoreNames.contains('emojiImages')) {
        console.warn('emojiImages存储不存在，请刷新页面升级数据库。');
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
    if (!currentContact) { showToast('请先选择联系人'); return; }
    document.getElementById('backgroundUrl').value = backgrounds[currentContact.id] || '';
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
    const memberList = document.getElementById('groupMemberList');
    memberList.innerHTML = '';
    contacts.forEach(contact => {
        if (contact.type !== 'group') {
            const item = document.createElement('div');
            item.className = 'group-member-item';
            item.innerHTML = `<div class="group-member-avatar">${contact.avatar ? `<img src="${contact.avatar}">` : contact.name[0]}</div><div class="group-member-name">${contact.name}</div><div class="group-member-checkbox">✓</div>`;
            item.onclick = () => {
                item.classList.toggle('selected');
                item.querySelector('.group-member-checkbox').classList.toggle('selected');
            };
            memberList.appendChild(item);
        }
    });
    showModal('createGroupModal');
}

// --- 数据保存与处理 ---
async function saveContact(event) {
    event.preventDefault();
    const contactData = {
        name: document.getElementById('contactName').value,
        avatar: document.getElementById('contactAvatar').value,
        personality: document.getElementById('contactPersonality').value,
        customPrompts: document.getElementById('customPrompts').value,
        // 保存语音ID
        voiceId: document.getElementById('contactVoiceId').value.trim()
    };
    if (editingContact) {
        Object.assign(editingContact, contactData);
        showToast('修改成功');
    } else {
        const contact = { id: Date.now().toString(), ...contactData, messages: [], lastMessage: '点击开始聊天', lastTime: formatContactListTime(new Date().toISOString()), type: 'private', memoryTableContent: defaultMemoryTable };
        contacts.unshift(contact);
        showToast('添加成功');
    }
    await saveDataToDB(); // 使用IndexedDB保存
    renderContactList();
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
    renderContactList();
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
    userProfile.name = document.getElementById('profileNameInput').value;
    userProfile.avatar = document.getElementById('profileAvatarInput').value;
    userProfile.personality = document.getElementById('profilePersonality').value;
    await saveDataToDB(); // 使用IndexedDB保存
    updateUserProfileUI();
    closeModal('editProfileModal');
    showToast('保存成功');
}

function updateUserProfileUI() {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    userName.textContent = userProfile.name;
    userAvatar.innerHTML = userProfile.avatar ? `<img src="${userProfile.avatar}">` : (userProfile.name[0] || '我');
}

function renderContactList() {
    const contactList = document.getElementById('contactList');
    contactList.innerHTML = '';
    contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        if (contact.type === 'group') {
            item.innerHTML = `<div class="group-avatar"><div class="group-avatar-inner">${getGroupAvatarContent(contact)}</div></div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${contact.lastTime}</div>`;
        } else {
            item.innerHTML = `<div class="contact-avatar">${contact.avatar ? `<img src="${contact.avatar}">` : contact.name[0]}</div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${contact.lastTime}</div>`;
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
    });
}

function getGroupAvatarContent(group) {
    const memberAvatars = group.members.slice(0, 4).map(id => contacts.find(c => c.id === id)).filter(Boolean);
    let avatarContent = '';
    for (let i = 0; i < 4; i++) {
        if (i < memberAvatars.length) {
            const member = memberAvatars[i];
            avatarContent += `<div class="group-avatar-item">${member.avatar ? `<img src="${member.avatar}">` : member.name[0]}</div>`;
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
    
    await renderMessages(true); // 初始加载
    
    updateContextIndicator();
    const chatMessagesEl = document.getElementById('chatMessages');
    chatMessagesEl.style.backgroundImage = backgrounds[contact.id] ? `url(${backgrounds[contact.id]})` : 'none';
    
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

async function renderMessages(isInitialLoad = false) {
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
        
        msgDiv.className = `message ${msg.role === 'user' ? 'sent' : 'received'}`;
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

        if (msg.edited) {
            const editedTag = `<span style="color: #999; font-size: 12px; margin-left: 5px;">已编辑</span>`;
            if (msg.type === 'emoji') {
                contentHtml += editedTag;
            } else {
                contentHtml = contentHtml.replace('</div>', editedTag + '</div>');
            }
        }

        let avatarContent = '';
        if (msg.role === 'user') {
            avatarContent = userProfile.avatar ? `<img src="${userProfile.avatar}">` : (userProfile.name[0] || '我');
        } else {
            const sender = contacts.find(c => c.id === msg.senderId);
            avatarContent = sender ? (sender.avatar ? `<img src="${sender.avatar}">` : sender.name[0]) : '?';
        }

        if (currentContact.type === 'group' && msg.role !== 'user') {
            const sender = contacts.find(c => c.id === msg.senderId);
            const senderName = sender ? sender.name : '未知';
            msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble"><div class="group-message-header"><div class="group-message-name">${senderName}</div></div>${contentHtml}</div>`;
        } else {
            msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble">${contentHtml}</div>`;
        }
        
        // 检查 forceVoice 标志, contact.voiceId 和 Minimax 的凭证
        if (msg.forceVoice && currentContact.voiceId && apiSettings.minimaxGroupId && apiSettings.minimaxApiKey) {
            const bubble = msgDiv.querySelector('.message-bubble');
            if (bubble) {
                const messageUniqueId = `${currentContact.id}-${msg.time}`; // 使用时间戳保证唯一性
                const voicePlayer = document.createElement('div');
                voicePlayer.className = 'voice-player';
                voicePlayer.id = `voice-player-${messageUniqueId}`;
                
                // 使用匿名函数包装，确保传递正确的参数
                voicePlayer.onclick = () => playVoiceMessage(voicePlayer, msg.content, currentContact.voiceId);
                
                voicePlayer.innerHTML = `
                    <div class="play-button">▶</div>
                    <div class="waveform">
                        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
                        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
                        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
                    </div>
                    <div class="duration"></div>
                `;
                // 将播放器插入到气泡的开头
                bubble.prepend(voicePlayer);
                
                const textContentDiv = bubble.querySelector('.message-content');
                if (textContentDiv) {
                    textContentDiv.classList.add('has-voice-player');
                }
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
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
    await renderMessages(true); // 重新渲染并滚动到底部
    renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    input.focus();
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
            for (const response of replies) {
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
                
                let messageContent = response.content;
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
                currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : (response.type === 'emoji' ? '[表情]' : '[红包]');
                currentContact.lastTime = formatContactListTime(new Date().toISOString());
                renderMessages(true); // 重新渲染并滚动到底部
                renderContactList();
                await saveDataToDB();
            }
            // 检查是否需要更新记忆（新逻辑：用户发送2条消息就触发）
            console.log('[记忆调试] 准备触发记忆更新检查', {
                hasMemoryManager: !!window.characterMemoryManager,
                hasContacts: !!window.contacts,
                isContactsArray: Array.isArray(window.contacts),
                currentContactId: currentContact?.id,
                currentContactType: currentContact?.type,
                messageCount: currentContact?.messages?.length
            });
            
            if (window.characterMemoryManager && window.contacts && Array.isArray(window.contacts)) {
                try {
                    await window.characterMemoryManager.checkAndUpdateMemory(currentContact.id, currentContact);
                } catch (error) {
                    console.error('[记忆调试] 检查更新记忆失败:', error);
                }
            } else {
                console.log('[记忆调试] 记忆更新条件不满足，跳过');
            }
        }
    } catch (error) {
        console.error('发送消息错误:', error);
        console.error('错误详情:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            currentContact: currentContact ? {
                id: currentContact.id,
                name: currentContact.name,
                type: currentContact.type,
                messagesCount: currentContact.messages ? currentContact.messages.length : 0
            } : null,
            apiSettings: {
                url: apiSettings.url ? 'configured' : 'not configured',
                key: apiSettings.key ? 'configured' : 'not configured',
                model: apiSettings.model ? 'configured' : 'not configured'
            },
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        });
        showToast('发送失败：' + error.message);
        hideTypingIndicator();
    } finally {
        sendBtn.disabled = false;
    }
}

async function sendGroupMessage() {
    if (!currentContact || currentContact.type !== 'group') return;
    let turnContext = []; 
    for (const memberId of currentContact.members) {
        const member = contacts.find(c => c.id === memberId);
        if (!member || member.type === 'group') continue;
        showTypingIndicator(member);
        try {
            const { replies } = await callAPI(member, turnContext);
            hideTypingIndicator();
            
            // 异步更新记忆表格（不阻塞后续流程）
            setTimeout(async () => {
                try {
                    await window.memoryTableManager.updateMemoryTableWithSecondaryModel(member);
                } catch (error) {
                    console.warn('记忆表格更新失败:', error);
                }
            }, 1000);
            if (!replies || replies.length === 0) continue;
            for (const response of replies) {
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));

                let messageContent = response.content;
                let forceVoice = false;

                if (messageContent.startsWith('[语音]:')) {
                    forceVoice = true;
                    messageContent = messageContent.substring(4).trim();
                }

                const aiMessage = { 
                    role: 'assistant', 
                    content: messageContent,
                    type: response.type, 
                    time: new Date().toISOString(), 
                    senderId: member.id,
                    forceVoice: forceVoice 
                };

                currentContact.messages.push(aiMessage);
                if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                    currentlyDisplayedMessageCount++;
                }
                turnContext.push(aiMessage);
                currentContact.lastMessage = `${member.name}: ${response.type === 'text' ? response.content.substring(0, 15) + '...' : '[表情]'}`;
                currentContact.lastTime = formatContactListTime(new Date().toISOString());
                renderMessages(true); // 重新渲染并滚动到底部
                renderContactList();
                await saveDataToDB();
            }
            // 为群聊中的每个成员检查记忆更新
            if (window.characterMemoryManager && window.contacts && Array.isArray(window.contacts)) {
                try {
                    await window.characterMemoryManager.checkAndUpdateMemory(member.id, currentContact);
                } catch (error) {
                    console.error('群聊成员记忆更新失败:', error);
                }
            }
        } catch (error) {
            console.error(`群聊消息发送错误 - ${member.name}:`, error);
            console.error('群聊错误详情:', {
                memberInfo: {
                    id: member.id,
                    name: member.name,
                    type: member.type
                },
                groupInfo: {
                    id: currentContact.id,
                    name: currentContact.name,
                    membersCount: currentContact.members ? currentContact.members.length : 0
                },
                turnContextLength: turnContext.length,
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
                timestamp: new Date().toISOString()
            });
            hideTypingIndicator();
        }
    }
}

function showTypingIndicator(contact = null) {
    const chatMessages = document.getElementById('chatMessages');
    let indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
    indicator = document.createElement('div');
    indicator.className = 'message received';
    indicator.id = 'typingIndicator';
    chatMessages.appendChild(indicator);
    const displayContact = contact || currentContact;
    let avatarContent = displayContact ? (displayContact.avatar ? `<img src="${displayContact.avatar}">` : displayContact.name[0]) : '';
    indicator.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
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

        // 处理回复分割
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
        
        const replies = chatRepliesText.split('|||').map(r => r.trim()).filter(r => r);
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
    
    // 如果是base64图片，存储到emojiImages，否则直接存储URL
    let imageData = imageUrl;
    if (imageUrl.startsWith('data:image/')) {
        await saveEmojiImage(meaning, imageUrl);
        imageData = `[emoji:${meaning}]`; // 内部存储格式
    }
    
    const emoji = { 
        id: Date.now().toString(), 
        tag: meaning,  // 使用tag而不是meaning
        meaning: meaning // 保留meaning用于显示
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
    renderContactList();
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
    renderContactList();
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
            const aiMessage = { role: 'assistant', content: response.content, type: response.type, time: new Date().toISOString(), senderId: currentContact.id };
            currentContact.messages.push(aiMessage);
            if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                currentlyDisplayedMessageCount++;
            }
            currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : '[表情]';
            currentContact.lastTime = formatContactListTime(new Date().toISOString());
            renderMessages(true);
            renderContactList();
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
        renderContactList();
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
    renderContactList();
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

        renderContactList(); // 重新渲染联系人列表
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
            stack: event.error.stack
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
        const systemPrompt = window.promptBuilder.buildManualPostPrompt(
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
        let jsonText = data.choices[0].message.content;
        
        if (!jsonText) {
            throw new Error("AI未返回有效内容");
        }
        
        // 自动清理AI可能返回的多余代码块
        jsonText = jsonText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7).trim();
        }
        if (jsonText.endsWith('```')) {
            jsonText = jsonText.slice(0, -3).trim();
        }

        const commentsData = JSON.parse(jsonText);
        
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
            renderContactList();
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
        this.globalMemories = JSON.parse(localStorage.getItem('globalMemories') || '[]');
        this.characterMemories = JSON.parse(localStorage.getItem('characterMemories') || '{}');
        this.currentMemoryType = 'global';
        this.currentCharacter = null;
        this.selectedMemoryId = null;
    }

    // 保存到localStorage
    save() {
        localStorage.setItem('globalMemories', JSON.stringify(this.globalMemories));
        localStorage.setItem('characterMemories', JSON.stringify(this.characterMemories));
    }

    // 添加全局记忆
    async addGlobalMemory(content) {
        // 清理内容，只保留有效的markdown列表项
        const cleanedContent = this.cleanAndValidateMemoryContent(content);
        
        if (!cleanedContent) {
            throw new Error('无效的记忆格式！请使用 "- 记忆内容" 的格式');
        }
        
        const memory = {
            id: Date.now().toString(),
            content: cleanedContent,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.globalMemories.push(memory);
        this.save();
        
        // 同步到现有的全局记忆系统
        const allGlobalContent = this.globalMemories.map(m => m.content).join('\n');
        await saveExistingGlobalMemory(allGlobalContent);
        
        return memory;
    }

    // 添加角色记忆
    async addCharacterMemory(characterId, content) {
        // 清理内容，只保留有效的markdown列表项
        const cleanedContent = this.cleanAndValidateMemoryContent(content);
        
        if (!cleanedContent) {
            throw new Error('无效的记忆格式！请使用 "- 记忆内容" 的格式');
        }
        
        if (!this.characterMemories[characterId]) {
            this.characterMemories[characterId] = [];
        }
        const memory = {
            id: Date.now().toString(),
            content: cleanedContent,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.characterMemories[characterId].push(memory);
        this.save();
        
        // 同步到现有的角色记忆系统
        const allCharacterContent = this.characterMemories[characterId].map(m => m.content).join('\n');
        await saveExistingCharacterMemory(characterId, allCharacterContent);
        
        return memory;
    }

    // 更新记忆
    async updateMemory(memoryId, content, isCharacter = false, characterId = null) {
        // 清理内容，只保留有效的markdown列表项
        const cleanedContent = this.cleanAndValidateMemoryContent(content);
        
        if (!cleanedContent) {
            throw new Error('无效的记忆格式！请使用 "- 记忆内容" 的格式');
        }
        
        if (isCharacter && characterId) {
            const memories = this.characterMemories[characterId] || [];
            const memory = memories.find(m => m.id === memoryId);
            if (memory) {
                memory.content = cleanedContent;
                memory.updatedAt = new Date().toISOString();
                this.save();
                
                // 同步到现有的角色记忆系统
                const allCharacterContent = this.characterMemories[characterId].map(m => m.content).join('\n');
                await saveExistingCharacterMemory(characterId, allCharacterContent);
                
                return memory;
            }
        } else {
            const memory = this.globalMemories.find(m => m.id === memoryId);
            if (memory) {
                memory.content = cleanedContent;
                memory.updatedAt = new Date().toISOString();
                this.save();
                
                // 同步到现有的全局记忆系统
                const allGlobalContent = this.globalMemories.map(m => m.content).join('\n');
                await saveExistingGlobalMemory(allGlobalContent);
                
                return memory;
            }
        }
        return null;
    }

    // 删除记忆
    async deleteMemory(memoryId, isCharacter = false, characterId = null) {
        if (isCharacter && characterId) {
            const memories = this.characterMemories[characterId] || [];
            const index = memories.findIndex(m => m.id === memoryId);
            if (index !== -1) {
                memories.splice(index, 1);
                this.save();
                
                // 同步到现有的角色记忆系统
                const allCharacterContent = memories.length > 0 ? 
                    memories.map(m => m.content).join('\n\n') : '';
                await saveExistingCharacterMemory(characterId, allCharacterContent);
                
                return true;
            }
        } else {
            const index = this.globalMemories.findIndex(m => m.id === memoryId);
            if (index !== -1) {
                this.globalMemories.splice(index, 1);
                this.save();
                
                // 同步到现有的全局记忆系统
                const allGlobalContent = this.globalMemories.length > 0 ? 
                    this.globalMemories.map(m => m.content).join('\n\n') : '';
                await saveExistingGlobalMemory(allGlobalContent);
                
                return true;
            }
        }
        return false;
    }

    // 获取全局记忆
    getGlobalMemories() {
        return this.globalMemories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // 获取角色记忆
    getCharacterMemories(characterId) {
        return (this.characterMemories[characterId] || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

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
        console.log('开始在模态框中加载AI角色，contacts长度:', window.contacts.length);
        
        window.contacts.forEach(contact => {
            console.log(`检查联系人: ${contact.name}, 类型: ${contact.type}`);
            if (contact.type === 'private') {
                console.log(`添加AI角色: ${contact.name}`);
                const option = document.createElement('option');
                option.value = contact.id;
                option.textContent = contact.name;
                memoryCharacterSelect.appendChild(option);
                aiCount++;
            }
        });
        console.log(`模态框中已加载 ${aiCount} 个AI角色`);
        
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
        console.log('准备为角色添加记忆:', selectedContact.name);
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
            console.log('角色选择器为空，尝试重新等待数据加载...');
            waitForDataReady().then(() => {
                loadCharacterSelector();
            });
        }
    }
}

// 加载全局记忆
function loadGlobalMemories() {
    const memoryList = document.getElementById('globalMemoryList');
    const memories = memoryManager.getGlobalMemories();
    
    if (memories.length === 0) {
        memoryList.innerHTML = '<div class="memory-empty">暂无全局记忆</div>';
        return;
    }
    
    memoryList.innerHTML = memories.map(memory => createMemoryItem(memory, false)).join('');
}

// 加载角色选择器
function loadCharacterSelector() {
    const characterSelector = document.getElementById('characterSelector');
    console.log('角色选择器元素:', characterSelector);
    if (!characterSelector) {
        console.error('角色选择器元素未找到');
        return;
    }
    
    characterSelector.innerHTML = '<option value="">选择角色...</option>';
    console.log('已重置角色选择器内容');
    
    // 确保contacts数组存在
    if (!window.contacts || !Array.isArray(window.contacts)) {
        console.warn('contacts数组不可用，无法加载角色');
        return;
    }
    
    console.log('开始遍历contacts数组，长度:', window.contacts.length);
    
    let aiContactCount = 0;
    let totalContactCount = 0;
    window.contacts.forEach(contact => {
        totalContactCount++;
        console.log(`联系人 ${totalContactCount}: ${contact.name} (类型: ${contact.type})`);
        console.log(`  - 类型检查: contact.type === 'private' = ${contact.type === 'private'}`);
        console.log(`  - 类型值调试: '${contact.type}' (长度: ${contact.type?.length})`);
        if (contact.type === 'private') {
            console.log(`  - 添加联系人 ${contact.name} 到选择器`);
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = contact.name;
            characterSelector.appendChild(option);
            aiContactCount++;
        }
    });
    
    console.log(`已加载 ${aiContactCount} 个AI角色到选择器，总联系人数: ${totalContactCount}`);
    
    // 如果没有加载到任何角色，强制刷新一次
    if (aiContactCount === 0 && totalContactCount > 0) {
        console.log('没有找到AI角色，可能数据加载有问题，尝试重新检查contacts...');
        setTimeout(() => {
            loadCharacterSelector();
        }, 1000);
    }
}

// 加载角色记忆
function loadCharacterMemories() {
    const characterSelector = document.getElementById('characterSelector');
    const memoryList = document.getElementById('characterMemoryList');
    
    if (!characterSelector) {
        console.error('角色选择器未找到');
        return;
    }
    
    const characterId = characterSelector.value;
    console.log('选择的角色ID:', characterId);
    
    if (!characterId) {
        memoryList.innerHTML = '<div class="memory-empty">请先选择角色</div>';
        return;
    }
    
    // 验证选择的角色是否存在
    const selectedContact = window.contacts && window.contacts.find(c => c.id === characterId);
    if (!selectedContact) {
        console.error('选择的角色不存在:', characterId);
        memoryList.innerHTML = '<div class="memory-empty">选择的角色不存在，请重新选择</div>';
        return;
    }
    
    console.log('找到角色:', selectedContact.name);
    
    memoryManager.currentCharacter = characterId;
    const memories = memoryManager.getCharacterMemories(characterId);
    
    if (memories.length === 0) {
        memoryList.innerHTML = '<div class="memory-empty">该角色暂无记忆</div>';
        return;
    }
    
    memoryList.innerHTML = memories.map(memory => createMemoryItem(memory, true, characterId)).join('');
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
                            <button class="memory-btn" onclick="editSingleMemoryItem('${memory.id}', ${index}, ${isCharacter}, '${characterId || ''}')">修改</button>
                            <button class="memory-btn delete" onclick="deleteSingleMemoryItem('${memory.id}', ${index}, ${isCharacter}, '${characterId || ''}')">删除</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 编辑单个记忆项
function editSingleMemoryItem(memoryId, itemIndex, isCharacter, characterId) {
    let memory;
    if (isCharacter && characterId) {
        const memories = memoryManager.getCharacterMemories(characterId);
        memory = memories.find(m => m.id === memoryId);
    } else {
        memory = memoryManager.getGlobalMemories().find(m => m.id === memoryId);
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
        const memories = memoryManager.getCharacterMemories(characterId);
        memory = memories.find(m => m.id === memoryId);
    } else {
        memory = memoryManager.getGlobalMemories().find(m => m.id === memoryId);
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
function editMemory(memoryId, isCharacter, characterId) {
    memoryManager.selectedMemoryId = memoryId;
    
    let memory;
    if (isCharacter && characterId) {
        const memories = memoryManager.getCharacterMemories(characterId);
        memory = memories.find(m => m.id === memoryId);
    } else {
        memory = memoryManager.getGlobalMemories().find(m => m.id === memoryId);
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
    console.log('初始化记忆管理页面');
    
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
        loadGlobalMemories();
        loadCharacterSelector();
        
        // 检查角色选择器是否成功加载
        setTimeout(() => {
            const characterSelector = document.getElementById('characterSelector');
            if (characterSelector && characterSelector.options.length <= 1) {
                console.log('角色选择器仍为空，尝试重新加载...');
                loadCharacterSelector();
            }
        }, 500);
        
    } catch (error) {
        console.error('初始化记忆管理页面失败:', error);
        // 即使加载失败也显示界面
        loadGlobalMemories();
        loadCharacterSelector();
    }
}

// 从现有记忆系统加载数据
async function loadExistingMemories() {
    console.log('从现有记忆系统加载数据');
    
    try {
        // 加载全局记忆
        const existingGlobalMemory = await getExistingGlobalMemory();
        if (existingGlobalMemory && existingGlobalMemory.trim()) {
            // 清理现有记忆内容
            const cleanedGlobalMemory = memoryManager.cleanAndValidateMemoryContent(existingGlobalMemory);
            
            if (cleanedGlobalMemory && memoryManager.globalMemories.length === 0) {
                const globalMemoryItem = {
                    id: 'existing-global',
                    content: cleanedGlobalMemory,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                memoryManager.globalMemories = [globalMemoryItem];
                memoryManager.save();
                
                // 如果清理后的内容与原内容不同，更新到现有系统
                if (cleanedGlobalMemory !== existingGlobalMemory) {
                    await saveExistingGlobalMemory(cleanedGlobalMemory);
                    console.log('全局记忆已清理并更新');
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
                        
                        if (cleanedCharacterMemory && (!memoryManager.characterMemories[contact.id] || memoryManager.characterMemories[contact.id].length === 0)) {
                            const characterMemoryItem = {
                                id: `existing-${contact.id}`,
                                content: cleanedCharacterMemory,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                            if (!memoryManager.characterMemories[contact.id]) {
                                memoryManager.characterMemories[contact.id] = [];
                            }
                            memoryManager.characterMemories[contact.id] = [characterMemoryItem];
                            memoryManager.save();
                            
                            // 如果清理后的内容与原内容不同，更新到现有系统
                            if (cleanedCharacterMemory !== existingCharacterMemory) {
                                await saveExistingCharacterMemory(contact.id, cleanedCharacterMemory);
                                console.log(`角色 ${contact.name} 的记忆已清理并更新`);
                            }
                        }
                    }
                }
            }
        }
        
        console.log('现有记忆数据加载完成');
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
            console.log('切换到记忆管理页面，开始初始化...');
            // 等待数据准备完成后再初始化
            waitForDataReady().then((dataReady) => {
                if (dataReady) {
                    console.log('数据准备就绪，初始化记忆管理页面');
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

// ElevenLabs 语音播放功能
/**
 * [MODIFIED] 播放或停止语音消息 - 直接从前端调用 Minimax API
 * @param {HTMLElement} playerElement - 被点击的播放器元素
 * @param {string} text - 需要转换为语音的文本
 * @param {string} voiceId - Minimax 的声音ID
 */
async function playVoiceMessage(playerElement, text, voiceId) {
    // 1. 检查 Minimax API 凭证是否已在设置中配置
    if (!apiSettings.minimaxGroupId || !apiSettings.minimaxApiKey) {
        showToast('请在设置中填写 Minimax Group ID 和 API Key');
        return;
    }
    if (!voiceId) {
        showToast('该角色未设置语音ID');
        return;
    }

    // 2. 判断当前点击的播放器是否正在播放
    const wasPlaying = playerElement === currentPlayingElement && !voiceAudio.paused;

    // 3. 如果有任何音频正在播放，先停止它
    if (currentPlayingElement) {
        voiceAudio.pause();
        voiceAudio.currentTime = 0;
        const oldPlayButton = currentPlayingElement.querySelector('.play-button');
        if (oldPlayButton) oldPlayButton.textContent = '▶';
        currentPlayingElement.classList.remove('playing', 'loading');
    }

    // 4. 如果点击的是正在播放的按钮，则仅停止，然后退出
    if (wasPlaying) {
        currentPlayingElement = null;
        return;
    }

    // 5. 设置当前播放器为活动状态并更新UI
    currentPlayingElement = playerElement;
    const playButton = playerElement.querySelector('.play-button');
    const durationEl = playerElement.querySelector('.duration');

    try {
        // 显示加载状态
        playerElement.classList.add('loading');
        playButton.textContent = '...';

        // 6. 准备并直接发送 API 请求到 Minimax (纯前端)
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

        // 7. 处理 API 响应
        if (!response.ok) {
            // 如果请求失败，解析错误信息
            let errorMsg = `语音服务错误 (状态码: ${response.status})`;
            try {
                const errorData = await response.json();
                // 尝试从返回的JSON中获取更具体的错误信息
                if (errorData && errorData.base_resp && errorData.base_resp.status_msg) {
                    errorMsg += `: ${errorData.base_resp.status_msg}`;
                }
            } catch (e) {
                // 如果解析JSON失败，则直接显示文本响应
                errorMsg += `: ${await response.text()}`;
            }
            throw new Error(errorMsg);
        }

        // 8. 处理成功的响应
        // 服务器返回的是音频数据流，我们将其转换为 Blob
        const audioBlob = await response.blob();
        
        if (!audioBlob || !audioBlob.type.startsWith('audio/')) {
            console.error("服务器未返回有效的音频。Content-Type:", audioBlob.type);
            throw new Error(`服务器返回了非预期的内容类型: ${audioBlob.type}`);
        }

        // 创建一个临时的 URL 指向这个 Blob 数据
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // 将这个 URL 设置为音频元素的源
        voiceAudio.src = audioUrl;

        // 当音频元数据加载完成后，显示时长
        voiceAudio.onloadedmetadata = () => {
            if (isFinite(voiceAudio.duration)) {
                const minutes = Math.floor(voiceAudio.duration / 60);
                const seconds = Math.floor(voiceAudio.duration % 60).toString().padStart(2, '0');
                durationEl.textContent = `${minutes}:${seconds}`;
            }
        };

        // 播放音频
        await voiceAudio.play();

        // 更新UI为播放状态
        playerElement.classList.remove('loading');
        playerElement.classList.add('playing');
        playButton.textContent = '❚❚';

    } catch (error) {
        // 9. 统一处理所有错误
        console.error('语音播放失败:', error);
        showToast(`语音播放错误: ${error.message}`);
        playerElement.classList.remove('loading');
        playButton.textContent = '▶';
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

        // 2. 将数据发送到我们的云函数中转站
        const response = await fetch('/api/transfer-data', {
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
        // 3. 去Netlify中转站取回数据
        // !!! 注意：请把下面的 'https://your-app.netlify.app' 换成你Netlify应用的真实地址
        const netlifyFunctionUrl = `https://velvety-belekoy-02a99e.netlify.app/.netlify/functions/transfer-data?id=${importId}`;
        const response = await fetch(netlifyFunctionUrl);

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
