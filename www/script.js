/*
 * [Whale-LLT]
 * Copyright (C) [2025] [Xuan Jing]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// =================================================================
// 新增：电话通讯功能所需的全局变量
// =================================================================
let mediaRecorder = null;
let audioChunks = [];
let isCallActive = false;
let silenceTimeout = null; // 用于检测静音的计时器

// ========== 【新增】AI主动发消息（看门狗机制）变量 ==========
let proactiveTimer = null;          // 2分钟生成倒计时
let proactiveRefreshTimer = null;   // 15分钟续命循环
const PROACTIVE_STORAGE_KEY = 'pendingAiNotification'; 
const PROACTIVE_WAIT_TIME = 60 * 60 * 1000;      // 1小时 (真正发送前的等待时间)
const PROACTIVE_TRIGGER_DELAY = 2 * 60 * 1000;   // 2分钟 (用户停留多久后触发生成)
const PROACTIVE_REFRESH_INTERVAL = 15 * 60 * 1000; // 15分钟 (看门狗刷新间隔)

// =================================================================
// 新增：用于生成智谱AI JWT Token的辅助函数
// =================================================================
/**
 * 根据智谱API Key生成认证用的JWT Token。
 * @param {string} apikey - 从智谱官网获取的API Key (格式为 id.secret)
 * @param {number} exp_seconds - Token的过期时间（秒），默认为3600秒
 * @returns {string} 生成的JWT Token
 */
function generateToken(apikey, exp_seconds = 3600) {
    const [id, secret] = apikey.split('.');

    const header = {
        "alg": "HS256",
        "sign_type": "SIGN"
    };

    const now = new Date();
    const payload = {
        "api_key": id,
        "exp": now.getTime() + exp_seconds * 1000,
        "timestamp": now.getTime(),
    };

    // Helper to Base64 a string
    const base64 = (str) => {
        return CryptoJS.enc.Base64.stringify(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    };

    const encodedHeader = base64(CryptoJS.enc.Utf8.parse(JSON.stringify(header)));
    const encodedPayload = base64(CryptoJS.enc.Utf8.parse(JSON.stringify(payload)));

    const signature = CryptoJS.HmacSHA256(`${encodedHeader}.${encodedPayload}`, secret);
    const encodedSignature = base64(signature);
    
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

// =================================================================
// 新增：用于将文件转换为Base64的辅助函数
// =================================================================
/**
 * 将File或Blob对象转换为Base64格式的Data URL。
 * @param {File|Blob} file - 用户选择的文件或Blob对象。
 * @returns {Promise<string>} - 一个解析为Base64字符串的Promise。
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// =================================================================
// API Service - 所有API调用现在都直接在前端处理
// =================================================================
window.apiService = {
    /**
     * 调用一个通用的、与OpenAI兼容的聊天补全API。
     * @param {string} apiUrl - API的基础URL。
     * @param {string} apiKey - API密钥。
     * @param {string} model - 要使用的模型。
     * @param {Array<object>} messages - 消息对象数组。
     * @param {object} options - 额外的选项，如temperature, response_format。
     * @param {number} timeout - 请求超时时间（毫秒）。
     * @returns {Promise<object>} - 来自API的JSON响应。
     */
    async callOpenAIAPI(apiUrl, apiKey, model, messages, options = {}, timeout = 60000) {
        // 聊天补全的端点
        const fullApiUrl = `${apiUrl}/chat/completions`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const payload = {
            model,
            messages,
            ...options
        };

        try {
            console.log("正在调用API:", fullApiUrl, "负载:", payload);
            const response = await fetch(fullApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    // 伪装UA，有些API需要
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('API 错误响应:', errorBody);
                // 尝试解析更详细的错误信息
                try {
                    const errorJson = JSON.parse(errorBody);
                    if (errorJson.error && errorJson.error.message) {
                         throw new Error(`API请求失败: ${response.status} - ${errorJson.error.message}`);
                    }
                } catch(e) {
                    // 如果不是JSON，则回退到文本
                }
                throw new Error(`API请求失败: ${response.status} - ${errorBody}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error('API 请求超时。');
                throw new Error('API请求超时，请检查网络或在设置中增加超时时间。');
            }
            console.error('在 callOpenAIAPI 中捕获到 Fetch 错误:', error);
            throw error;
        }
    },

    /**
     * 通过获取模型列表来测试与OpenAI兼容API的连接。
     * @param {string} apiUrl - API的基础URL。
     * @param {string} apiKey - API密钥。
     * @returns {Promise<object>} - 来自API的JSON响应。
     */
    async testConnection(apiUrl, apiKey) {
        // 列出模型的端点
        const fullApiUrl = `${apiUrl}/models`;
        
        try {
            console.log("正在测试连接:", fullApiUrl);
            const response = await fetch(fullApiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('API 连接测试错误响应:', errorBody);
                throw new Error(`连接测试失败: ${response.status} - ${errorBody}`);
            }

            return await response.json();
        } catch (error) {
            console.error('在 testConnection 中捕获到 Fetch 错误:', error);
            throw error;
        }
    },



    /**
     * 【已修复】调用智谱GLM的ASR（语音识别）API
     * @param {Blob} audioBlob - 录制的单声道WAV音频数据
     * @returns {Promise<string>} - 返回识别出的文本
     */
    async callGlmAsrAPI(audioBlob) {
        // 1. 从设置中获取GLM API Key
        const glmApiKey = apiSettings.glmApiKey;
        if (!glmApiKey) {
            throw new Error('尚未配置智谱GLM API Key，无法进行语音识别。');
        }

        // 2. 生成认证用的JWT Token
        const token = generateToken(glmApiKey);

        // 3. 准备API请求
        const url = 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions';
        const formData = new FormData();
        
        // 4. 填充表单数据
        formData.append('model', 'glm-asr');
        formData.append('file', audioBlob, 'recording.wav');

        // 5. 配置请求选项
        const options = {
            method: 'POST',
            headers: {
                // 【已修复】根据JWT标准，添加 "Bearer " 前缀
                'Authorization': 'Bearer ' + token
            },
            body: formData
        };

        // 6. 发送请求并处理响应
        try {
            console.log("正在调用智谱ASR API...");
            const response = await fetch(url, options);

            const data = await response.json();
            console.log("智谱ASR原始响应:", data); // 增加日志方便调试

            // 如果请求失败
            if (!response.ok) {
                const errorMessage = data?.error?.message || response.statusText || '未知API错误';
                throw new Error(`GLM ASR API 错误: ${errorMessage} (状态码: ${response.status})`);
            }

            // 【核心修正】: 根据你的截图，识别结果在 'text' 字段中
            // 使用 typeof data.text !== 'undefined' 可以正确处理空字符串""的情况
            if (data && typeof data.text !== 'undefined') {
                return data.text;
            } else {
                 // 如果 text 字段不存在，提供更详细的错误信息
                const errorDetail = data.message || JSON.stringify(data);
                console.error("API未返回有效的'text'字段，完整响应:", data);
                throw new Error(`API未返回有效的识别结果。响应: ${errorDetail}`);
            }
        } catch (error) {
            console.error('调用GLM ASR API时出错:', error.message); 
            // 将原始错误继续向上抛出，以便上层函数能捕获
            throw error;
        }
    }
};


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

        // 【核心改动】检查是否存在原生安卓接口
        if (window.Android && typeof window.Android.saveFile === 'function') {
            window.Android.saveFile(logContent, filename);
        } else {
            // 如果不是在安卓App中，或者接口不存在，则执行原来的Web下载逻辑
            fallbackDownload(logContent, filename);
            showToast(`已导出 ${consoleLogs.length} 条日志`);
        }
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

// --- 通用文件上传与处理 ---
// 这个函数现在更通用：本地文件转为Base64后设置到输入框
async function handleFileAndConvertToBase64(inputId, targetUrlInputId, statusElementId) {
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

    if (statusElement) statusElement.textContent = '加载中...';
    
    // 使用 FileReader 将图片转为 Base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        targetUrlInput.value = reader.result;
        if (statusElement) statusElement.textContent = '加载成功！';
        showToast('图片已加载');
    };
    reader.onerror = (error) => {
        console.error('文件读取失败:', error);
        if (statusElement) statusElement.textContent = '读取失败';
        showToast(`读取失败: ${error.message}`);
    };
}

// 【新增】专门用于处理表情上传的函数
function handleEmojiFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        selectedEmojiFile = null;
        document.getElementById('emojiUrl').value = ''; // 清空URL输入框
        document.getElementById('emojiUploadStatus').textContent = '';
        return;
    }
    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件');
        event.target.value = '';
        return;
    }
    // 将文件对象存到临时变量
    selectedEmojiFile = file;
    // 清空URL输入框，因为我们优先使用文件
    document.getElementById('emojiUrl').value = '';
    // 给用户反馈
    document.getElementById('emojiUploadStatus').textContent = `已选择: ${file.name}`;
    showToast('图片已选择');
}

// 【重要】重命名旧的函数，因为其他地方（如头像上传）还在用它
const handleFileUpload = handleFileAndConvertToBase64;

// --- 全局状态 ---
let contacts = [];
let currentContact = null;
let editingContact = null;
const CONTEXT_MESSAGE_MAX = 1000;
let showDetailedStats = false; // 是否展开显示
// let customBubbleStyle = null; // 删掉或者注释掉这一行
let bubbleStyles = {}; // 新增：用于存储所有自定义气泡样式，格式为 { 'styleId': { name: '样式名', html: '...', css: '...' } }
let selectedEmojiFile = null; // 【新增】用于临时存储待上传的表情文件
let customModelsByUrl = {};
let todoItems = []; // 新增：存储待办事项列表

// 【修改点 1】: 更新 apiSettings 结构以适应 Minimax
let apiSettings = {
    url: '',
    key: '',
    model: '',
    secondaryModel: 'sync_with_primary',
    contextMessageCount: 10,
    timeout: 60,
    showUsageStats: true, // 默认开启统计
    // 计费标准（元/百万Token）
    priceHit: 1.0,
    priceMiss: 12.0,
    priceOut: 24.0,
    // 移除了 elevenLabsApiKey，换成 Minimax 的凭证
    minimaxGroupId: '',
    minimaxApiKey: ''
};

let emojis = [];
let backgrounds = {};
let userProfile = {
    name: '我的昵称',
    avatar: '',
    personality: '',
    bubbleStyleId: '', // 【新增】为用户资料添加气泡样式ID
    // 新增钱包属性
    wallet: {
        balance: 0,       // 余额，默认为0
        transactions: []  // 交易记录，默认为空数组
    }
};
let moments = [];
let weiboPosts = [];


let hashtagCache = {};

// 帖子模板定义
const postTemplate = `
<div class="post" id="\${postId}">
    <div class="post-header">
        <div class="avatar">
            \${postAuthorAvatar}
        </div>
        <div class="post-info">
            <div class="user-name">
                \${postAuthorNickname}
                <span class="vip-badge">\${badgeText}</span>
            </div>
            <div class="post-time">\${postTime}</div>
            <div class="post-source">来自 \${sourceTopic} 研究社</div>
        </div>
        <div class="post-menu" onclick="toggleWeiboMenu(event, '\${storedPostId}', \${postIndex})">
            <span class="post-menu-icon">⋯</span>
            <div class="post-menu-dropdown" id="weibo-menu-\${storedPostId}-\${postIndex}">
                <div class="menu-item" onclick="deleteWeiboPost('\${storedPostId}', \${postIndex})">删除</div>
            </div>
        </div>
    </div>
    <div class="post-content">
        <a href="#" class="hashtag">#\${hashtag}#</a>
        \${postContent}
        \${mentionHtml}
    </div>
    <div class="post-image-desc">
        \${imageDescription}
    </div>
    <div class="post-actions">
        <a href="#" class="action-btn-weibo">
            <span class="action-icon">🔄</span>
            <span>\${randomRepostCount}</span>
        </a>
        <a href="#" class="action-btn-weibo" onclick="showReplyBox('\${postId}')">
            <span class="action-icon">💬</span>
            <span>\${commentCount}</span>
        </a>
        <a href="#" class="action-btn-weibo">
            <span class="action-icon">👍</span>
            <span>\${randomLikeCount}</span>
        </a>
    </div>
    <div class="comments-section">
        \${commentsHtml}
    </div>
</div>
`;

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
    // ▼▼▼ 新增：更新初始进度 ▼▼▼
    updateLoadingProgress(5, '正在初始化...');
    // 模拟一个短暂的启动延迟，让用户能看到"正在初始化"
    await new Promise(resolve => setTimeout(resolve, 100)); 

    // 步骤1: 检查用户是否已经同意过免责声明
    if (localStorage.getItem('disclaimerAccepted') !== 'true') {
        // (免责声明的逻辑不变)
        const blocker = document.getElementById('appBlockerOverlay');
        const modal = document.getElementById('disclaimerModal');
        blocker.style.display = 'block';
        modal.style.display = 'block';
        const checkbox = document.getElementById('disclaimerCheckbox');
        const agreeBtn = document.getElementById('disclaimerAgreeBtn');
        const disagreeBtn = document.getElementById('disclaimerDisagreeBtn');
        checkbox.addEventListener('change', () => {
            agreeBtn.disabled = !checkbox.checked;
        });
        disagreeBtn.addEventListener('click', () => {
            alert('感谢使用。您已选择不同意条款，应用将无法使用。');
            window.close(); 
        });
        agreeBtn.addEventListener('click', () => {
            localStorage.setItem('disclaimerAccepted', 'true');
            blocker.style.display = 'none';
            modal.style.display = 'none';
        });
        // 注意：我们不在此处 return，允许加载在后台继续
    }

    // ▼▼▼ 新增：更新进度 ▼▼▼
    // 无论是否显示免责声明，都开始加载
    updateLoadingProgress(10, '正在连接数据库...');

    try {
        await openDB(); // 确保IndexedDB先打开
        
        // ▼▼▼ 新增：更新进度 ▼▼▼
        updateLoadingProgress(30, '正在加载联系人...');
        
        // 将并行加载拆分为串行，以便更新进度条
        const loadedContacts = await loadContactsForList();
        
        // ▼▼▼ 新增：更新进度 ▼▼▼
        updateLoadingProgress(50, '正在加载应用数据...');
        
        await loadInitialAppState(); // 这个函数不再加载联系人
        
        // ▼▼▼ 新增：更新进度 ▼▼▼
        updateLoadingProgress(75, '正在整理数据...');
        
        contacts = loadedContacts;

        // 【【【 核心修改：在此处调用新函数 】】】
        // 在加载完数据库和联系人之后，立即处理[待处理]的队列
        await processPendingTodoMessages();
        // 【【【 修改结束 】】】

    } catch (error) {
        console.error("数据库初始化失败，应用无法继续加载数据:", error);
        const contactList = document.getElementById('contactList');
        if (contactList) {
            contactList.innerHTML = `<div class="error-message"><h3>数据加载失败</h3><p>无法连接到本地数据库。请尝试关闭本站的其他标签页，然后<strong>刷新页面</strong>。</p><p><small>错误详情: ${error.message}</small></p></div>`;
        }
        // ▼▼▼ 新增：加载失败时也要隐藏加载动画 ▼▼▼
        hideLoadingOverlay();
        return; 
    }
    
    // ▼▼▼ 新增：更新进度 ▼▼▼
    updateLoadingProgress(85, '正在渲染界面...');
    
    // 后续的渲染和事件绑定逻辑保持不变
    renderContactList();
    updateUserProfileUI();
    updateContextIndicator();
    
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
    
    setTimeout(() => {
        const hint = document.getElementById('featureHint');
        if (hint) {
            hint.style.display = 'block';
            setTimeout(() => { hint.style.display = 'none'; }, 5000);
        }
    }, 1000);

    // (语音播放器的事件绑定不变)
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

    // ▼▼▼ 新增：更新进度 ▼▼▼
    updateLoadingProgress(90, '正在检查更新...');

    const unreadAnnouncements = await announcementManager.getUnread();
    if (unreadAnnouncements.length > 0) {
        const modalBody = document.getElementById('updateModalBody');
        const modalFooter = document.querySelector('#updateModal .modal-footer');
        
        const combinedContent = unreadAnnouncements.reverse()
            .map(ann => ann.content)
            .join('<hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">');
        
        modalBody.innerHTML = marked.parse(combinedContent);
        showModal('updateModal');

        modalBody.onscroll = () => {
            if (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 5) {
                modalFooter.classList.add('visible');
            }
        };

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

    // ▼▼▼ 新增：处理主动消息 ▼▼▼
    // 1. 检查离线期间是否触发了消息，有则写入数据库
    await processProactiveMessagesResult();
    
    // 2. 启动看门狗计时器
    startProactiveTimer();
    // ▲▲▲ 新增结束 ▲▲▲

    // ▼▼▼ 新增：所有操作完成，隐藏加载屏幕 ▼▼▼
    updateLoadingProgress(100, '加载完成！');
    // 延迟一小会（比如300ms）再隐藏，让用户能看到"加载完成"
    setTimeout(hideLoadingOverlay, 300);
}



// --- IndexedDB 核心函数 ---
function openDB() {
    return new Promise((resolve, reject) => {
        // 【重要】升级版本号以触发 onupgradeneeded（当前含结构化记忆底座 v14）
        const request = indexedDB.open('WhaleLLTDB', 14); // 结构化记忆底座 memoryEpisodes / memoryFacts

        // 【新增】处理数据库被阻塞的情况
        request.onblocked = event => {
            console.warn('IndexedDB 升级被阻塞。请关闭此网站的其他标签页后再试。');
            showToast('数据库更新被阻塞，请关闭其他页面后刷新');
            // 也可以选择 reject，让上层知道发生了问题
            reject(new Error('数据库更新被阻塞 (onblocked)'));
        };

        request.onupgradeneeded = event => {
            const db = event.target.result;
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
            // emojis 表现在只存储元数据
            if (!db.objectStoreNames.contains('emojis')) {
                db.createObjectStore('emojis', { keyPath: 'id' });
            }
            // 【新增】创建一个新的表，专门用于存储表情包的二进制图片数据(Blob)
            if (!db.objectStoreNames.contains('emojiBlobs')) {
                db.createObjectStore('emojiBlobs', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('backgrounds')) {
                db.createObjectStore('backgrounds', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('userProfile')) {
                db.createObjectStore('userProfile', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('customStyles')) {
                // 这个可以保留，也可以删掉，新的逻辑不再使用它
                db.createObjectStore('customStyles', { keyPath: 'id' });
            }
            // 【新增】创建新的气泡样式库表
            if (!db.objectStoreNames.contains('bubbleStyles')) {
                db.createObjectStore('bubbleStyles', { keyPath: 'id' });
            }
            // 【新增】创建待办事项表
            if (!db.objectStoreNames.contains('todoItems')) {
                db.createObjectStore('todoItems', { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains('bubbleStickers')) {
                db.createObjectStore('bubbleStickers', { keyPath: 'id' });
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
            if (!db.objectStoreNames.contains('customModels')) {
                db.createObjectStore('customModels', { keyPath: 'id' });
            }
            // 【结构化记忆底座】旁路存储 episodes / facts（不影响旧 Markdown 记忆表）
            if (!db.objectStoreNames.contains('memoryEpisodes')) {
                const memoryEpisodesStore = db.createObjectStore('memoryEpisodes', { keyPath: 'id' });
                memoryEpisodesStore.createIndex('contactId', 'contactId', { unique: false });
                memoryEpisodesStore.createIndex('createdAt', 'createdAt', { unique: false });
                memoryEpisodesStore.createIndex('type', 'type', { unique: false });
            }
            if (!db.objectStoreNames.contains('memoryFacts')) {
                const memoryFactsStore = db.createObjectStore('memoryFacts', { keyPath: 'id' });
                memoryFactsStore.createIndex('contactId', 'contactId', { unique: false });
                memoryFactsStore.createIndex('subject', 'subject', { unique: false });
                memoryFactsStore.createIndex('predicate', 'predicate', { unique: false });
                memoryFactsStore.createIndex('status', 'status', { unique: false });
                memoryFactsStore.createIndex('createdAt', 'createdAt', { unique: false });
                memoryFactsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            // 【修正】删除重复的 customStyles 和 bubbleStickers 创建
        };

        request.onsuccess = event => {
            db = event.target.result;
            isIndexedDBReady = true; // 标记IndexedDB已准备就绪
            resolve(db);
        };

        request.onerror = event => {
            // 【修改】使用 event.target.error 可以提供更详细的错误信息
            console.error('IndexedDB 打开失败:', event.target.error); 
            showToast('数据存储初始化失败: ' + event.target.error.message); // 【可选增强】给用户更明确的提示
            reject(event.target.error); // 【修改】将详细的错误对象 reject 出去
        };
    });
}

// 【新增】只更新单个联系人到数据库的函数
async function updateContactInDB(contactToSave) {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法更新联系人。');
        return;
    }
    try {
        const transaction = db.transaction(['contacts'], 'readwrite');
        const store = transaction.objectStore('contacts');
        await promisifyRequest(store.put(contactToSave));
        await promisifyTransaction(transaction);
    } catch (error) {
        console.error(`保存联系人 ${contactToSave.id} 到 IndexedDB 失败:`, error);
        showToast('保存联系人数据失败');
    }
}

// 【新增函数】专门用于高效加载联系人列表
async function loadContactsForList() {
    if (!isIndexedDBReady) return [];

    const transaction = db.transaction(['contacts'], 'readonly');
    const store = transaction.objectStore('contacts');
    const allContacts = await promisifyRequest(store.getAll());

    // 关键优化：在将数据存入全局变量前，移除庞大的 messages 数组
    return allContacts.map(contact => {
        // 创建一个新的联系人对象，只包含列表需要的信息
        const contactSummary = {
            id: contact.id,
            name: contact.name,
            avatar: contact.avatar,
            lastMessage: contact.lastMessage,
            lastTime: contact.lastTime,
            isPinned: contact.isPinned,
            type: contact.type,
            // 保留其他顶层字段，但不包括 messages
            personality: contact.personality,
            customPrompts: contact.customPrompts,
            voiceId: contact.voiceId,
            thinkMode: contact.thinkMode || 'default',
            bubbleStyleId: contact.bubbleStyleId,
            members: contact.members,
            memoryTableContent: contact.memoryTableContent,
            worldBook: contact.worldBook || [] // 确保worldBook也被加载
        };
        // 我们不再将完整的 contact 对象（包含成千上万条消息）放入内存
        return contactSummary;
    });
}

// 【已重构】此函数现在只加载除联系人外的其他应用状态
async function loadInitialAppState() {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法加载数据。');
        return;
    }
    try {
        const transaction = db.transaction(['apiSettings', 'emojis', 'backgrounds', 'userProfile', 'moments', 'weiboPosts', 'hashtagCache', 'customStyles', 'customModels', 'bubbleStyles', 'bubbleStickers', 'todoItems'], 'readonly');
        
        // 分别加载各项数据
        const apiSettingsStore = transaction.objectStore('apiSettings');
        const emojisStore = transaction.objectStore('emojis');
        const backgroundsStore = transaction.objectStore('backgrounds');
        const userProfileStore = transaction.objectStore('userProfile');
        const momentsStore = transaction.objectStore('moments');
        const weiboPostsStore = transaction.objectStore('weiboPosts');
        const bubbleStylesStore = transaction.objectStore('bubbleStyles');
        const todoItemsStore = transaction.objectStore('todoItems');

        // 使用 Promise.all 并行加载，速度更快
        const [
            savedApiSettings, savedEmojis, savedBackgrounds, savedUserProfile, 
            savedMoments, savedWeiboPosts, savedBubbleStyles,
            savedTodos
        ] = await Promise.all([
            promisifyRequest(apiSettingsStore.get('settings')),
            promisifyRequest(emojisStore.getAll()),
            promisifyRequest(backgroundsStore.get('backgroundsMap')),
            promisifyRequest(userProfileStore.get('profile')),
            promisifyRequest(momentsStore.getAll()),
            promisifyRequest(weiboPostsStore.getAll()),
            promisifyRequest(bubbleStylesStore.get('styles')),
            promisifyRequest(todoItemsStore.getAll())
        ]);
        
        // --- 开始处理加载到的数据 ---
        apiSettings = { ...apiSettings, ...(savedApiSettings || {}) };
        if (apiSettings.contextMessageCount === undefined) apiSettings.contextMessageCount = 10;
        if (apiSettings.showUsageStats === undefined) apiSettings.showUsageStats = true;
        if (apiSettings.priceHit === undefined) apiSettings.priceHit = 1.0;
        if (apiSettings.priceMiss === undefined) apiSettings.priceMiss = 12.0;
        if (apiSettings.priceOut === undefined) apiSettings.priceOut = 24.0;
        apiSettings.contextMessageCount = Math.min(
            CONTEXT_MESSAGE_MAX,
            Math.max(1, Number(apiSettings.contextMessageCount) || 10)
        );
        if (savedApiSettings?.elevenLabsApiKey && !savedApiSettings.minimaxApiKey) {
            apiSettings.minimaxApiKey = savedApiSettings.elevenLabsApiKey;
        }

        emojis = (savedEmojis || []).map(emoji => emoji.type ? emoji : { ...emoji, type: 'url' });
        backgrounds = savedBackgrounds || {};
        userProfile = { ...userProfile, ...(savedUserProfile || {}) };
        if (userProfile.wallet === undefined) {
            userProfile.wallet = { balance: 0, transactions: [] };
        }
        moments = savedMoments || [];
        weiboPosts = savedWeiboPosts || [];
        if (savedBubbleStyles) {
            bubbleStyles = savedBubbleStyles.data;
        }
        todoItems = savedTodos || []; // 加载待办事项

        console.log("核心应用状态加载完成。");

    } catch (error) {
        console.error('从IndexedDB加载核心应用状态失败:', error);
        showToast('加载应用设置失败');
    }
}

// 【新增函数】专门用于高效加载联系人列表
async function loadContactsForList() {
    if (!isIndexedDBReady) return [];
    
    const transaction = db.transaction(['contacts'], 'readonly');
    const store = transaction.objectStore('contacts');
    const allContacts = await promisifyRequest(store.getAll());

    // 关键优化：在将数据存入全局变量前，移除庞大的 messages 数组
    return allContacts.map(contact => {
        // 创建一个新的联系人对象，只包含列表需要的信息
        const contactSummary = {
            id: contact.id,
            name: contact.name,
            avatar: contact.avatar,
            lastMessage: contact.lastMessage,
            lastTime: contact.lastTime,
            isPinned: contact.isPinned,
            type: contact.type,
            // 保留其他顶层字段，但不包括 messages
            personality: contact.personality,
            customPrompts: contact.customPrompts,
            voiceId: contact.voiceId,
            thinkMode: contact.thinkMode || 'default',
            bubbleStyleId: contact.bubbleStyleId,
            members: contact.members,
            memoryTableContent: contact.memoryTableContent
        };
        // 我们不再将完整的 contact 对象（包含成千上万条消息）放入内存
        return contactSummary;
    });
}

// 【新增函数】根据联系人ID从数据库加载完整的联系人数据（包含消息）
async function getFullContactFromDB(contactId) {
    if (!isIndexedDBReady) return null;
    const transaction = db.transaction(['contacts'], 'readonly');
    const store = transaction.objectStore('contacts');
    return await promisifyRequest(store.get(contactId));
}

// =================================================================
// 新增：用于将计划任务消息同步到聊天记录的函数
// =================================================================
/**
 * 在通知触发时，将AI生成的提醒消息添加到对应的聊天记录中。
 * @param {object} todoItem - 包含提醒信息的待办事项对象。
 * 需要包含: reminderAuthor, reminderMessage。
 */
async function syncTodoMessageToChat(todoItem) {
    if (!todoItem || !todoItem.reminderAuthor || !todoItem.reminderMessage) {
        console.error('无法同步提醒消息：缺少必要信息。', todoItem);
        return;
    }

    try {
        // 1. 根据作者名找到对应的联系人
        const authorName = todoItem.reminderAuthor;
        // 【【【 关键修复：确保 contacts 数组已加载 】】】
        // 这里的 contacts 依赖于 init() 函数先完成加载
        if (!contacts || contacts.length === 0) {
            console.warn('联系人列表尚未加载，稍后重试同步...');
            // 如果 contacts 为空（可能 init 还没加载完），则延迟重试
            setTimeout(() => syncTodoMessageToChat(todoItem), 1000);
            return;
        }
        
        const contact = contacts.find(c => c.name === authorName);

        if (!contact) {
            console.warn(`未找到名为 "${authorName}" 的联系人，无法同步提醒消息。`);
            // 也可以选择创建一个系统通知，告知用户该角色可能已被删除
            showToast(`角色 "${authorName}" 不存在，提醒消息无法显示在聊天中。`);
            return;
        }

        // 2. 从数据库获取完整的联系人数据（包含消息历史）
        const fullContactData = await getFullContactFromDB(contact.id);
        if (!fullContactData) {
            console.error('获取联系人完整数据失败，无法同步。');
            return;
        }
        
        // 【【【 新增查重逻辑 】】】
        // 检查最后一条消息是否就是这条提醒，防止重复添加
        const lastMsg = fullContactData.messages[fullContactData.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === todoItem.reminderMessage) {
            console.log(`提醒消息 "${todoItem.reminderMessage.substring(0, 10)}..." 已存在，跳过同步。`);
            return; // 消息已存在，直接返回
        }

        // 【【【 核心修改：使用通知触发时间作为消息时间 】】】
        const notificationTime = new Date(new Date(todoItem.dueDate).getTime() - 10 * 60 * 1000);

        const aiMessage = {
            role: 'assistant',
            content: todoItem.reminderMessage,
            type: 'text',
            time: notificationTime.toISOString(), // <-- 使用 2:50 PM 的时间
            senderId: contact.id,
            forceVoice: false // 提醒消息默认不使用语音
        };

        // 4. 将新消息添加到聊天记录中
        fullContactData.messages.push(aiMessage);
        fullContactData.messages.sort((a, b) => new Date(a.time) - new Date(b.time));
        
        const newLastMsg = fullContactData.messages[fullContactData.messages.length - 1];
        fullContactData.lastMessage = `[待办提醒] ${newLastMsg.content.substring(0, 20)}...`;
        fullContactData.lastTime = newLastMsg.time;

        // 5. 将更新后的联系人数据保存回数据库
        await updateContactInDB(fullContactData);

        console.log(`已将提醒消息同步到 "${contact.name}" 的聊天记录中。`);

        // 6. （可选但推荐）更新UI
        // 如果用户当前正在查看这个聊天，则刷新聊天界面
        if (currentContact && currentContact.id === contact.id) {
            // 将完整的消息数组附加到我们当前的联系人对象上
            currentContact.messages = fullContactData.messages || [];
            await renderMessages(true); // 重新渲染并滚动到底部
        }

        // 更新联系人列表的最后消息
        const contactInList = contacts.find(c => c.id === contact.id);
        if (contactInList) {
            contactInList.lastMessage = fullContactData.lastMessage;
            contactInList.lastTime = fullContactData.lastTime;
        }
        renderContactList(); // 刷新联系人列表显示

    } catch (error) {
        console.error('同步待办提醒到聊天时出错:', error);
        showToast('同步提醒消息时发生错误。');
    }
}

/**
 * @description 【【【 核心函数：处理待处理的通知 】】】
 * 在App启动或恢复时调用此函数
 */
async function processPendingTodoMessages() {
    const PENDING_KEY = 'pendingTodoMessages'; // <-- 读取这个KEY
    let pendingMessages = [];
    let processedSomething = false; // 标记是否处理了消息

    // 1. 从 localStorage 中读取队列
    try {
        const storedData = localStorage.getItem(PENDING_KEY);
        if (storedData) {
            pendingMessages = JSON.parse(storedData);
        }
    } catch (e) {
        console.error("解析[待处理]的消息队列失败:", e);
        localStorage.removeItem(PENDING_KEY); // 数据损坏，清空
        return;
    }

    // 2. 检查队列是否为空
    if (pendingMessages.length === 0) {
        // console.log("没有待处理的日程提醒。");
        return;
    }

    console.log(`检测到 ${pendingMessages.length} 条[待处理]的日程提醒，正在检查...`);

    // 3. 确保数据库已准备就绪
    if (!isIndexedDBReady) {
        console.warn("数据库尚未就绪，稍后重试同步日程...");
        setTimeout(processPendingTodoMessages, 1000); 
        return;
    }
    
    const now = new Date();
    const stillPending = []; // 存放尚未到期的任务
    const itemsToProcess = []; // 存放已到期的任务

    // 【【【 核心修改：检查通知时间，而不是截止时间 】】】
    for (const item of pendingMessages) {
        // 重新计算通知应该弹出的时间
        const notificationTime = new Date(new Date(item.dueDate).getTime() - 10 * 60 * 1000);
        
        if (notificationTime <= now) {
            // 如果"通知时间"(2:50 PM) 已经过了
            itemsToProcess.push(item);
        } else {
            // 如果"通知时间"还没到
            stillPending.push(item);
        }
    }
    // 【【【 修改结束 】】】

    // 5. 如果没有需要立即处理的任务，直接返回
    if (itemsToProcess.length === 0) {
        console.log("所有待处理任务均未到通知时间。");
        return;
    }
    
    // 6. 处理所有已到期的任务
    processedSomething = true;
    showToast(`正在同步 ${itemsToProcess.length} 条日程提醒...`);

    // 按时间顺序排序，确保消息按正确顺序添加
    itemsToProcess.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    for (const item of itemsToProcess) {
        try {
            await syncTodoMessageToChat(item);
        } catch (error) {
            console.error("同步一条[待处理]的消息时出错:", error, item);
        }
    }

    // 7. 【重要】将"尚未到期"的任务存回 localStorage
    localStorage.setItem(PENDING_KEY, JSON.stringify(stillPending));
    console.log(`[待处理]日程提醒同步完成: ${itemsToProcess.length} 条已处理, ${stillPending.length} 条仍待处理。`);
}

// =================================================================
// 新增：AI主动发消息核心逻辑 (Watchdog 模式)
// =================================================================

/**
 * 1. 核心生成函数：筛选角色 -> 生成内容 -> 安排初始通知
 * 只有在用户停留满 2 分钟且没有待发送消息时才会触发
 */
async function generateProactiveMessage() {
    // 基础检查
    if (!contacts || contacts.length === 0) return;
    if (!apiSettings.url || !apiSettings.key) return;

    // 筛选条件：私聊角色 + 超过1小时没有互动 + 不是当前正在聊天的角色
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const candidates = contacts.filter(c => {
        const lastMsgTime = new Date(c.lastTime);
        const isNotCurrent = !currentContact || c.id !== currentContact.id;
        return c.type === 'private' && lastMsgTime < oneHourAgo && isNotCurrent;
    });

    if (candidates.length === 0) {
        console.log("[主动关怀] 没有符合条件的角色（所有角色最近都有互动）。");
        return;
    }

    // 随机抽取一名幸运角色
    const targetChar = candidates[Math.floor(Math.random() * candidates.length)];
    console.log(`[主动关怀] 选中角色: ${targetChar.name}，正在生成消息...`);

    try {
        // 构建提示词
        const memoryContext = targetChar.memoryTableContent || "暂无记忆";
        const prompt = `
        你扮演角色：${targetChar.name}。

        用户昵称：${userProfile.name}。

        【你的记忆】：${memoryContext}

        【任务】：你已经一个多小时没理用户了。请根据记忆或性格，主动发一条消息。

        【要求】：简短自然，口语化，像微信消息。不要任何动作描写。不要解释。

        `;

        // 调用 API
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: prompt }],
            { temperature: 0.8 },
            (apiSettings.timeout || 60) * 1000
        );

        const messageContent = data.choices[0].message.content.trim();
        if (!messageContent) return;

        // --- 安排通知 (1小时后) ---
        const fireTime = new Date(Date.now() + PROACTIVE_WAIT_TIME);
        const notificationId = 999999 + Math.floor(Math.random() * 10000); // 随机ID

        const pendingItem = {
            id: notificationId,
            contactId: targetChar.id,
            contactName: targetChar.name,
            content: messageContent,
            dueDate: fireTime.toISOString(),
            status: 'pending'
        };

        // 1. 调用通知管理器安排通知
        if (window.notificationManager) {
            await window.notificationManager.scheduleNotification({
                id: notificationId,
                title: targetChar.name,
                body: messageContent,
                schedule: fireTime,
                extra: { type: 'proactive_ai', ...pendingItem }
            });
        }

        // 2. 存入 Storage
        localStorage.setItem(PROACTIVE_STORAGE_KEY, JSON.stringify(pendingItem));
        console.log(`[主动关怀] 消息已生成。初始触发时间: ${fireTime.toLocaleTimeString()}`);

    } catch (error) {
        console.error("[主动关怀] 生成失败:", error);
    }
}

/**
 * 2. 刷新/续命函数 (Watchdog)
 * 作用：只要用户还在，就把通知时间重新推迟到"1小时后"
 */
async function refreshProactiveNotification() {
    const storedData = localStorage.getItem(PROACTIVE_STORAGE_KEY);
    if (!storedData) return; // 如果还没生成过消息，就不需要续命

    try {
        const pendingItem = JSON.parse(storedData);
        
        // 计算新的触发时间：当前时间 + 1小时
        const newFireTime = new Date(Date.now() + PROACTIVE_WAIT_TIME);
        
        console.log(`[主动关怀-看门狗] 用户依然在线，将通知推迟到: ${newFireTime.toLocaleTimeString()}`);

        // 更新系统通知时间
        if (window.notificationManager) {
            // 先取消旧的
            await window.notificationManager.cancel(pendingItem.id);
            // 重新安排新的
            await window.notificationManager.scheduleNotification({
                id: pendingItem.id,
                title: pendingItem.contactName,
                body: pendingItem.content,
                schedule: newFireTime,
                extra: { type: 'proactive_ai', ...pendingItem } 
            });
        }

        // 更新本地存储的时间
        pendingItem.dueDate = newFireTime.toISOString();
        localStorage.setItem(PROACTIVE_STORAGE_KEY, JSON.stringify(pendingItem));

    } catch (e) {
        console.error("[主动关怀] 刷新时间失败:", e);
    }
}

/**
 * 3. 结算逻辑：处理"已过期"的消息
 * App 启动或切回前台时调用。如果发现通知时间已过，说明通知发出了，将其写入聊天记录。
 */
async function processProactiveMessagesResult() {
    const storedData = localStorage.getItem(PROACTIVE_STORAGE_KEY);
    if (!storedData) return;

    try {
        const pendingItem = JSON.parse(storedData);
        const fireTime = new Date(pendingItem.dueDate);
        const now = new Date();

        // 如果 当前时间 > 设定触发时间，说明通知已经发给用户了
        if (now >= fireTime) {
            console.log(`[主动关怀] 检测到 "${pendingItem.contactName}" 的消息已推送，同步到聊天记录...`);

            const contact = contacts.find(c => c.id === pendingItem.contactId);
            if (contact) {
                const fullContact = await getFullContactFromDB(contact.id);
                if (fullContact) {
                    // 写入消息
                    const aiMessage = {
                        role: 'assistant',
                        content: pendingItem.content,
                        type: 'text',
                        time: fireTime.toISOString(),
                        senderId: contact.id
                    };
                    fullContact.messages.push(aiMessage);
                    fullContact.lastMessage = pendingItem.content;
                    fullContact.lastTime = aiMessage.time;
                    
                    await updateContactInDB(fullContact);
                    
                    // 刷新UI
                    renderContactList();
                    if (currentContact && currentContact.id === contact.id) {
                        currentContact.messages = fullContact.messages;
                        renderMessages(true);
                    }
                    showToast(`收到来自 ${contact.name} 的新消息`);
                }
            }
            // 处理完毕，清除 Storage
            localStorage.removeItem(PROACTIVE_STORAGE_KEY);
        } else {
            // 还没到时间，说明用户提前回来了，什么都不用做，
            // 稍后 startProactiveTimer 会自动接管并推迟时间
        }
    } catch (e) {
        console.error("[主动关怀] 处理结果失败:", e);
        localStorage.removeItem(PROACTIVE_STORAGE_KEY);
    }
}

// =================================================================
// To-Do List Functions
// =================================================================

/**
 * Shows the To-Do List modal and renders the list.
 */
function showTodoModal() {
    renderTodoList();
    showModal('todoModal');
}

/**
 * Renders the list of to-do items in the modal.
 */
function renderTodoList() {
    const container = document.getElementById('todoListContainer');
    container.innerHTML = '';

    if (todoItems.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">还没有待办事项。</p>';
        return;
    }
    
    // Sort items: incomplete first, then by due date
    const sortedItems = [...todoItems].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed - b.completed;
        return new Date(a.dueDate) - new Date(b.dueDate);
    });

    sortedItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `todo-item ${item.completed ? 'completed' : ''}`;
        itemDiv.dataset.id = item.id;

        const formattedDate = new Date(item.dueDate).toLocaleString('zh-CN', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        itemDiv.innerHTML = `
            <input type="checkbox" class="todo-checkbox" onchange="toggleTodoStatus(${item.id})" ${item.completed ? 'checked' : ''}>
            <div class="todo-details">
                <span class="todo-text">${escapeHtml(item.text)}</span>
            </div>
            <button class="todo-delete-btn" onclick="deleteTodo(${item.id})">×</button>
        `;
        container.appendChild(itemDiv);
    });
}

/**
 * Handles adding a new to-do item.
 */
async function addTodo(event) {
    event.preventDefault();
    const textInput = document.getElementById('todoInput');
    const dateInput = document.getElementById('todoDateInput');

    const text = textInput.value.trim();
    const dueDate = dateInput.value;

    if (!text || !dueDate) {
        showToast('请填写任务和时间');
        return;
    }
    
    const dueDateObj = new Date(dueDate);
    if (dueDateObj < new Date()) {
        showToast('提醒时间不能早于当前时间');
        return;
    }
    
    // Disable form while processing
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '正在添加...';

    try {
        // --- AI Integration Step ---
        const { reminderMessage, reminderAuthor } = await generateTodoReminder(text, dueDate);

        const newItem = {
            // id will be auto-generated by IndexedDB
            text: text,
            dueDate: dueDate,
            completed: false,
            reminderMessage: reminderMessage,
            reminderAuthor: reminderAuthor
        };
        
        // Save to DB and get the new ID
        const transaction = db.transaction(['todoItems'], 'readwrite');
        const store = transaction.objectStore('todoItems');
        const newId = await promisifyRequest(store.add(newItem));
        newItem.id = newId; // Assign the auto-generated ID
        
        todoItems.push(newItem); // Update in-memory array

        // --- Notification Scheduling Step ---
        scheduleNotification(newItem);
        
        showToast('新任务已添加！');
        textInput.value = '';
        dateInput.value = '';
        renderTodoList();

    } catch (error) {
        console.error("添加待办事项失败:", error);
        showToast("添加失败: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '添加';
    }
}

/**
 * Toggles the completion status of a to-do item.
 */
async function toggleTodoStatus(itemId) {
    const item = todoItems.find(i => i.id === itemId);
    if (item) {
        item.completed = !item.completed;
        await saveDataToDB(); // Save the whole array
        renderTodoList();

        // If completed, cancel notification. If un-completed, reschedule it.
        if (item.completed) {
            cancelNotification(item.id);
            showToast('任务已完成！提醒已取消。');
        } else {
            scheduleNotification(item);
            showToast('任务已恢复。');
        }
    }
}

/**
 * Deletes a to-do item.
 */
async function deleteTodo(itemId) {
    todoItems = todoItems.filter(i => i.id !== itemId);
    await saveDataToDB();
    renderTodoList();
    
    // Also cancel any scheduled notification for this item
    cancelNotification(itemId);
    showToast('任务已删除');
}

/**
 * Generates a to-do reminder message using a random AI character.
 * @param {string} taskText The text of the to-do item.
 * @param {string} taskDate The due date of the to-do item.
 * @returns {Promise<{reminderMessage: string, reminderAuthor: string}>}
 */

/**
 * Schedules a notification for a to-do item.
 * @param {object} item - The to-do item.
 */
function scheduleNotification(item) {
    if (window.notificationManager) {
        window.notificationManager.schedule(item);
    } else {
        console.warn('Notification manager is not available.');
    }
}

/**
 * Cancels a notification for a to-do item.
 * @param {number} itemId - The ID of the to-do item.
 */
function cancelNotification(itemId) {
    if (window.notificationManager) {
        window.notificationManager.cancel(itemId);
    } else {
        console.warn('Notification manager is not available.');
    }
}

async function generateTodoReminder(taskText, taskDate) {
    const characters = contacts.filter(c => c.type === 'private');
    if (characters.length === 0) {
        return { 
            reminderMessage: `记得完成任务: ${taskText}`, 
            reminderAuthor: '系统' 
        };
    }

    const randomChar = characters[Math.floor(Math.random() * characters.length)];
    
    // Check for API settings
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('API未配置，使用默认提醒');
        return { 
            reminderMessage: `记得完成任务: ${taskText}`, 
            reminderAuthor: randomChar.name 
        };
    }
    
    const prompt = window.promptBuilder.buildTodoReminderPrompt(randomChar, userProfile, taskText, taskDate);
    
    try {
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model, // Use primary model
            [{ role: 'user', content: prompt }],
            { temperature: 0.8 },
            (apiSettings.timeout || 60) * 1000
        );
        
        const reminderMessage = data.choices[0].message.content.trim();
        return {
            reminderMessage: reminderMessage,
            reminderAuthor: randomChar.name
        };
    } catch (error) {
        console.error("AI提醒生成失败:", error);
        showToast("AI提醒生成失败，将使用默认提醒。");
        return { 
            reminderMessage: `别忘了做这件事: ${taskText}`, 
            reminderAuthor: randomChar.name 
        };
    }
}

// 【已修改】此函数不再保存联系人数据
async function saveDataToDB() {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法保存数据。');
        return;
    }
    try {
        // 【核心修改】在事务中移除了 'contacts'
        const transaction = db.transaction(['apiSettings', 'emojis', 'backgrounds', 'userProfile', 'moments', 'hashtagCache', 'customModels', 'emojiBlobs', 'todoItems'], 'readwrite');
        
        // 【已删除】所有关于 contactsStore 的代码都已移除

        // 其他数据的保存逻辑保持不变
        const apiSettingsStore = transaction.objectStore('apiSettings');
        const emojisStore = transaction.objectStore('emojis');
        const backgroundsStore = transaction.objectStore('backgrounds');
        const userProfileStore = transaction.objectStore('userProfile');
        const momentsStore = transaction.objectStore('moments');
        const emojiBlobsStore = transaction.objectStore('emojiBlobs'); // 获取新表的引用

        await promisifyRequest(apiSettingsStore.put({ id: 'settings', ...apiSettings }));
        
        // 【核心修改】所有表情对象现在都完整存入 'emojis' 表
        await promisifyRequest(emojisStore.clear());
        // 我们不再需要清空或写入 emojiBlobsStore，但保留事务定义以防万一
        // await promisifyRequest(emojiBlobsStore.clear()); 
        
        for (const emoji of emojis) {
            // 不再需要区分 blob 类型，所有表情对象都直接存入 emojisStore
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

        const customModelsStore = transaction.objectStore('customModels');
        await promisifyRequest(customModelsStore.put({ id: 'models', data: customModelsByUrl }));
        
        // 保存待办事项
        const todoItemsStore = transaction.objectStore('todoItems');
        await promisifyRequest(todoItemsStore.clear());
        for (const item of todoItems) {
            await promisifyRequest(todoItemsStore.put(item));
        }

        await promisifyTransaction(transaction); // 等待所有操作完成
    } catch (error) {
        console.error('保存数据到IndexedDB失败:', error);
        showToast('保存数据失败');
    }
}

/**
 * 【修改】辅助函数：根据表情对象获取可用的 src URL
 * @param {object} emoji - 表情对象
 * @returns {Promise<string>} - 返回一个 Promise，解析为图片的 URL (http/https 或 data URL)
 */
function getEmojiSrc(emoji) {
    return new Promise((resolve) => {
        // 对于 'url' 和 'base64' 类型，数据都在 emoji.url 字段中
        if (emoji.url) {
            resolve(emoji.url);
        } else {
            // 如果找不到URL，返回一个占位符
            console.warn("表情对象缺少url字段:", emoji);
            resolve('placeholder.png'); // 你可以准备一张表示加载失败的图片
        }
    });
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

// --- 结构化记忆底座（旁路 IndexedDB，不影响旧 Markdown 记忆表） ---
function generateMemoryId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function saveMemoryEpisode(episode) {
    if (!isIndexedDBReady || !db || !episode || !episode.id) {
        return false;
    }
    try {
        if (!db.objectStoreNames.contains('memoryEpisodes')) {
            console.error('[结构化记忆] memoryEpisodes 不存在，跳过写入');
            return false;
        }
        const transaction = db.transaction(['memoryEpisodes'], 'readwrite');
        const store = transaction.objectStore('memoryEpisodes');
        await promisifyRequest(store.put(episode));
        await promisifyTransaction(transaction);
        return true;
    } catch (error) {
        console.error('[结构化记忆] memoryEpisodes 存储失败:', error);
        return false;
    }
}

async function saveMemoryFacts(facts) {
    if (!facts || facts.length === 0) {
        return true;
    }
    if (!isIndexedDBReady || !db) {
        return false;
    }
    try {
        if (!db.objectStoreNames.contains('memoryFacts')) {
            console.error('[结构化记忆] memoryFacts 不存在，跳过写入');
            return false;
        }
        const transaction = db.transaction(['memoryFacts'], 'readwrite');
        const store = transaction.objectStore('memoryFacts');
        for (let i = 0; i < facts.length; i++) {
            store.put(facts[i]);
        }
        await promisifyTransaction(transaction);
        return true;
    } catch (error) {
        console.error('[结构化记忆] memoryFacts 存储失败:', error);
        return false;
    }
}

async function saveMemoryFact(fact) {
    if (!fact || !fact.id) {
        return false;
    }
    if (!isIndexedDBReady || !db) {
        return false;
    }
    try {
        if (!db.objectStoreNames.contains('memoryFacts')) {
            console.error('[结构化记忆] memoryFacts 不存在，跳过单条写入');
            return false;
        }
        const transaction = db.transaction(['memoryFacts'], 'readwrite');
        const store = transaction.objectStore('memoryFacts');
        await promisifyRequest(store.put(fact));
        await promisifyTransaction(transaction);
        return true;
    } catch (error) {
        console.error('[结构化记忆] memoryFacts 单条更新失败:', error);
        return false;
    }
}

async function getMemoryFactsByContact(contactId, { activeOnly = true } = {}) {
    if (!contactId || !isIndexedDBReady || !db) {
        return [];
    }
    try {
        if (!db.objectStoreNames.contains('memoryFacts')) {
            return [];
        }
        const transaction = db.transaction(['memoryFacts'], 'readonly');
        const store = transaction.objectStore('memoryFacts');
        const index = store.index('contactId');
        const list = await promisifyRequest(index.getAll(contactId));
        await promisifyTransaction(transaction);
        const raw = Array.isArray(list) ? list : [];
        if (!activeOnly) {
            return raw;
        }
        return raw.filter(f => f && f.status === 'active' && (f.validTo === null || f.validTo === undefined));
    } catch (error) {
        console.error('[结构化记忆] getMemoryFactsByContact 读取失败:', error);
        return [];
    }
}

/**
 * memory_diff 中 delete（尤其 section「未来」）时，将匹配的 future/promise 类结构化事实失效，不误伤长期偏好。
 * @param {Array} diffArray
 * @param {object} contact
 * @returns {Promise<Array>}
 */
async function invalidateFactsFromMemoryDiffDelete(diffArray, contact) {
    const invalidatedFacts = [];
    if (!Array.isArray(diffArray) || !contact?.id) {
        return invalidatedFacts;
    }

    try {
        const activeFacts = await getMemoryFactsByContact(contact.id, { activeOnly: true });
        const now = Date.now();
        const invalidatedIds = new Set();

        const isFutureIshFact = f => {
            const m = f.metadata || {};
            if (m.timeScope === 'future') return true;
            if (m.type === 'promise' || m.type === 'future_plan') return true;
            const p = f.predicate != null ? String(f.predicate) : '';
            return p === 'promise' || p === 'future_plan' || p === 'new_suggestion';
        };

        const entityMatchesKeyword = (entities, keyword) => {
            if (!Array.isArray(entities) || keyword === undefined || keyword === null) return false;
            const kt = String(keyword);
            for (let i = 0; i < entities.length; i++) {
                const e = entities[i];
                if (!e || typeof e !== 'object') continue;
                const name = e.name != null ? String(e.name) : '';
                const desc = e.description != null ? String(e.description) : '';
                if (name.includes(kt) || desc.includes(kt)) return true;
            }
            return false;
        };

        const factMatchesKeyword = (f, keyword) => {
            if (keyword === undefined || keyword === null || String(keyword).trim() === '') return false;
            const kt = String(keyword);
            if (f.factText != null && String(f.factText).includes(kt)) return true;
            if (f.object != null && String(f.object).includes(kt)) return true;
            return entityMatchesKeyword(f.metadata && f.metadata.entities, keyword);
        };

        for (let oi = 0; oi < diffArray.length; oi++) {
            const op = diffArray[oi];
            if (!op || op.op !== 'delete') continue;
            const section = op.section != null ? String(op.section).trim() : '';
            if (section !== '未来') continue;

            const keyword = op.keyword != null ? String(op.keyword) : '';
            if (!keyword.trim()) continue;

            for (let fi = 0; fi < activeFacts.length; fi++) {
                const f = activeFacts[fi];
                if (!f || invalidatedIds.has(f.id)) continue;
                if (!isFutureIshFact(f)) continue;
                if (!factMatchesKeyword(f, keyword)) continue;

                const updated = {
                    ...f,
                    status: 'inactive',
                    validTo: now,
                    updatedAt: now,
                    metadata: {
                        ...(f.metadata || {}),
                        invalidationReason: `memory_diff delete: ${keyword}`,
                        invalidationSource: 'memory_diff_delete',
                        invalidationSection: section,
                        invalidationKeyword: keyword
                    }
                };
                const ok = await saveMemoryFact(updated);
                if (ok) {
                    invalidatedIds.add(f.id);
                    invalidatedFacts.push(updated);
                }
            }
        }

        console.log(`[结构化记忆] memory_diff delete 触发失效 facts: ${invalidatedFacts.length}`);
    } catch (e) {
        console.error('[结构化记忆] invalidateFactsFromMemoryDiffDelete 失败:', e);
    }

    return invalidatedFacts;
}

function normalizeText(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function buildFactSearchText(fact) {
    if (!fact || typeof fact !== 'object') return '';
    const parts = [];
    if (fact.subject != null) parts.push(String(fact.subject));
    if (fact.predicate != null) parts.push(String(fact.predicate));
    if (fact.object != null) parts.push(String(fact.object));
    if (fact.factText != null) parts.push(String(fact.factText));
    const m = fact.metadata || {};
    if (m.type != null) parts.push(String(m.type));
    if (m.timeScope != null) parts.push(String(m.timeScope));
    if (Array.isArray(m.entities)) {
        m.entities.forEach(e => {
            if (!e || typeof e !== 'object') return;
            if (e.name != null) parts.push(String(e.name));
            if (e.description != null) parts.push(String(e.description));
        });
    }
    return parts.join(' ');
}

function scoreMemoryFact(fact, queryText) {
    if (!fact || fact.status !== 'active') return -Infinity;
    if (fact.validTo != null && fact.validTo !== undefined) return -Infinity;

    const m = fact.metadata || {};
    const searchBlob = normalizeText(buildFactSearchText(fact));
    const qRaw = normalizeText(queryText);
    let score = 0;

    const imp = typeof fact.importance === 'number' && !Number.isNaN(fact.importance) ? fact.importance : 0.5;
    const conf = typeof fact.confidence === 'number' && !Number.isNaN(fact.confidence) ? fact.confidence : 0.5;
    score += imp * 10;
    score += conf * 4;

    if (m.timeScope === 'current') score += 6;
    if (m.timeScope === 'future') score += 5;

    const ty = m.type;
    if (ty === 'emotional_core' || ty === 'relationship' || ty === 'promise' || ty === 'future_plan') score += 8;
    if (ty === 'preference') score += 6;

    if (m.timeScope === 'temporary' || ty === 'current_state') score -= 3;

    if (qRaw.length >= 2) {
        if (searchBlob.includes(qRaw)) {
            score += 18;
        }
        const tokens = qRaw.split(/[\s\n\r,，。.!！?？、；;:：]+/).filter(t => t.length > 1);
        const seen = new Set();
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (seen.has(t)) continue;
            seen.add(t);
            if (searchBlob.includes(t)) {
                score += 4 + Math.min(t.length * 0.15, 3);
            }
        }
        const subj = fact.subject != null ? normalizeText(fact.subject) : '';
        const pred = fact.predicate != null ? normalizeText(fact.predicate) : '';
        const obj = fact.object != null ? normalizeText(String(fact.object)) : '';
        const ft = fact.factText != null ? normalizeText(String(fact.factText)) : '';
        tokens.forEach(t => {
            if (subj.includes(t) || pred.includes(t) || obj.includes(t) || ft.includes(t)) {
                score += 2;
            }
        });
    }

    return score;
}

async function retrieveRelevantMemoryFacts(contactId, queryText, options = {}) {
    try {
        const limit = Math.min(Math.max(options.limit != null ? options.limit : 25, 1), 25);
        const minScore = options.minScore != null ? options.minScore : 5;

        const facts = await getMemoryFactsByContact(contactId, { activeOnly: true });
        const qPreview = String(queryText ?? '');
        console.log('[记忆检索] query:', qPreview.length > 400 ? `${qPreview.slice(0, 400)}…` : qPreview);

        const scored = facts
            .map(f => ({ fact: f, score: scoreMemoryFact(f, queryText) }))
            .filter(x => Number.isFinite(x.score))
            .sort((a, b) => b.score - a.score);

        let picked = scored.filter(x => x.score >= minScore).slice(0, limit);
        if (picked.length === 0 && scored.length > 0 && scored[0].score > 0) {
            picked = scored.slice(0, Math.min(limit, 8));
        }

        const resultFacts = picked.map(({ fact, score }) => ({
            ...fact,
            _retrievalScore: score
        }));
        console.log('[记忆检索] 命中 facts 数量:', resultFacts.length);
        if (picked.length > 0) {
            console.table(picked.map(({ fact, score }) => ({
                score: Math.round(score * 10) / 10,
                subject: (fact.subject || '').slice(0, 24),
                predicate: (fact.predicate || '').slice(0, 28),
                factText: (fact.factText || '').slice(0, 48)
            })));
        }

        return resultFacts;
    } catch (e) {
        console.warn('[记忆检索] retrieveRelevantMemoryFacts 失败:', e);
        return [];
    }
}

function buildRelevantMemoryFactsBlock(facts) {
    if (!Array.isArray(facts) || facts.length === 0) {
        return '';
    }

    let out = '--- [相关结构化长期记忆] ---\n';
    out += '以下是从长期记忆库中检索到的、与当前对话最相关的事实。请自然参考，不要机械复述，不要暴露数据库字段。\n\n';
    out += '<relevant_memory_facts>\n';

    facts.forEach((fact, idx) => {
        const m = fact.metadata || {};
        const mainLine = fact.factText || fact.object || '(无描述)';
        out += `${idx + 1}. ${mainLine}\n`;
        if (m.type != null) out += `   - 类型: ${m.type}\n`;
        if (m.timeScope != null) out += `   - 时间范围: ${m.timeScope}\n`;
        if (typeof fact.confidence === 'number') out += `   - 可信度: ${fact.confidence}\n`;
        if (typeof fact.importance === 'number') out += `   - 重要性: ${fact.importance}\n`;
        out += '\n';
    });

    out += '</relevant_memory_facts>';
    return out;
}

function buildMemoryRetrievalQuery(contact, userInput) {
    const parts = [];
    if (userInput != null) parts.push(String(userInput));
    const msgs = contact && Array.isArray(contact.messages) ? contact.messages : [];
    const tail = msgs.slice(-6);
    for (let i = 0; i < tail.length; i++) {
        const m = tail[i];
        parts.push(m && m.content != null ? String(m.content) : '');
    }
    if (contact && contact.name != null) parts.push(String(contact.name));
    return parts.join('\n');
}

window.retrieveRelevantMemoryFacts = retrieveRelevantMemoryFacts;
window.buildRelevantMemoryFactsBlock = buildRelevantMemoryFactsBlock;
window.buildMemoryRetrievalQuery = buildMemoryRetrievalQuery;

async function debugMemoryStore(contactId) {
    const facts = await getMemoryFactsByContact(contactId, { activeOnly: false });
    let episodes = [];
    try {
        if (contactId && isIndexedDBReady && db && db.objectStoreNames.contains('memoryEpisodes')) {
            const transaction = db.transaction(['memoryEpisodes'], 'readonly');
            const store = transaction.objectStore('memoryEpisodes');
            const index = store.index('contactId');
            const epList = await promisifyRequest(index.getAll(contactId));
            await promisifyTransaction(transaction);
            episodes = Array.isArray(epList) ? epList : [];
        }
    } catch (error) {
        console.error('[结构化记忆] debugMemoryStore 读取 episodes 失败:', error);
    }
    console.table(facts);
    console.table(episodes);
}

window.debugMemoryStore = debugMemoryStore;

/**
 * 从副模型返回文本中提取 <memory_ops> JSON；失败返回 null，不抛错。
 * @param {string} responseText
 * @returns {object|null}
 */
function parseMemoryOps(responseText) {
    if (!responseText || typeof responseText !== 'string') {
        return null;
    }
    try {
        const opsRegex = /<memory_ops>([\s\S]*?)<\/memory_ops>/;
        const match = responseText.match(opsRegex);
        if (!match) {
            return null;
        }
        let jsonStr = match[1].trim();
        jsonStr = jsonStr.replace(/^```json\s*/i, '');
        jsonStr = jsonStr.replace(/^```\s*/, '');
        jsonStr = jsonStr.replace(/```\s*$/, '');
        jsonStr = jsonStr.trim();
        const parsed = JSON.parse(jsonStr);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed;
    } catch (e) {
        console.warn('[结构化记忆] memory_ops 解析失败:', e);
        return null;
    }
}

/**
 * 将 memory_ops 应用到 IndexedDB：失效旧事实、写入新事实。
 * @returns {Promise<{ addedFacts: Array, invalidatedFacts: Array }>}
 */
async function applyMemoryOps(contact, memoryOps, sourceEpisodeId) {
    const addedFacts = [];
    const invalidatedFacts = [];
    if (!contact || !contact.id || !memoryOps || typeof memoryOps !== 'object') {
        return { addedFacts, invalidatedFacts };
    }

    const now = Date.now();
    const entitiesBlock = Array.isArray(memoryOps.entities) ? memoryOps.entities : [];

    try {
        const activeFacts = await getMemoryFactsByContact(contact.id, { activeOnly: true });
        const invalidatedIds = new Set();

        for (const inv of memoryOps.facts_to_invalidate || []) {
            if (!inv || typeof inv !== 'object') continue;
            const subj = inv.subject != null ? String(inv.subject) : '';
            const pred = inv.predicate != null ? String(inv.predicate) : '';
            const reason = inv.reason != null ? String(inv.reason) : '';

            for (const f of activeFacts) {
                if (!f || invalidatedIds.has(f.id)) continue;
                if (f.subject === subj && f.predicate === pred) {
                    const updated = {
                        ...f,
                        status: 'inactive',
                        validTo: now,
                        updatedAt: now,
                        metadata: { ...(f.metadata || {}), invalidationReason: reason }
                    };
                    const ok = await saveMemoryFact(updated);
                    if (ok) {
                        invalidatedIds.add(f.id);
                        invalidatedFacts.push(updated);
                    }
                }
            }
        }

        for (const item of memoryOps.facts_to_add || []) {
            if (!item || typeof item !== 'object') continue;
            const confRaw = item.confidence;
            const impRaw = item.importance;
            const conf = typeof confRaw === 'number' && !Number.isNaN(confRaw)
                ? Math.min(1, Math.max(0, confRaw))
                : 0.7;
            const imp = typeof impRaw === 'number' && !Number.isNaN(impRaw)
                ? Math.min(1, Math.max(0, impRaw))
                : 0.5;

            addedFacts.push({
                id: generateMemoryId('fact'),
                contactId: contact.id,
                subject: item.subject != null ? String(item.subject) : '',
                predicate: item.predicate != null ? String(item.predicate) : '',
                object: item.object != null ? String(item.object) : '',
                factText: item.factText != null ? String(item.factText) : '',
                sourceEpisodeId,
                confidence: conf,
                importance: imp,
                status: 'active',
                createdAt: now,
                updatedAt: now,
                validFrom: now,
                validTo: null,
                metadata: {
                    type: item.type,
                    timeScope: item.timeScope,
                    entities: entitiesBlock,
                    source: 'memory_ops'
                }
            });
        }

        if (addedFacts.length > 0) {
            await saveMemoryFacts(addedFacts);
        }
    } catch (e) {
        console.error('[结构化记忆] applyMemoryOps 异常:', e);
    }

    return { addedFacts, invalidatedFacts };
}

window.parseMemoryOps = parseMemoryOps;
window.applyMemoryOps = applyMemoryOps;

/**
 * 将副模型输出的 memory_diff JSON 数组转为可入库的结构化事实（保守实现）。
 * @param {Array} diffArray
 * @param {object} contact
 * @param {string} sourceEpisodeId
 * @returns {Array<object>}
 */
function convertMemoryDiffToFacts(diffArray, contact, sourceEpisodeId) {
    if (!Array.isArray(diffArray) || !contact) {
        return [];
    }
    const contactId = contact.id;
    const subjectName = contact.name != null ? String(contact.name) : '';
    const facts = [];
    const now = Date.now();

    diffArray.forEach(op => {
        if (!op || typeof op !== 'object') return;
        const section = op.section != null ? String(op.section) : '';

        if (op.op === 'update') {
            const key = op.key != null ? String(op.key) : '';
            const valueStr = op.value != null ? String(op.value) : '';
            const pred = section ? `${section}.${key}` : key;
            facts.push({
                id: generateMemoryId('fact'),
                contactId,
                subject: subjectName,
                predicate: pred,
                object: valueStr,
                factText: `【${section}】${key}：${valueStr}`,
                sourceEpisodeId,
                confidence: 0.7,
                importance: 0.5,
                status: 'active',
                createdAt: now,
                updatedAt: now,
                validFrom: now,
                validTo: null,
                metadata: {}
            });
        } else if (op.op === 'append') {
            const line = op.line != null ? String(op.line).trim() : '';
            if (!line) return;
            facts.push({
                id: generateMemoryId('fact'),
                contactId,
                subject: subjectName,
                predicate: section,
                object: line,
                factText: line,
                sourceEpisodeId,
                confidence: 0.7,
                importance: 0.5,
                status: 'active',
                createdAt: now,
                updatedAt: now,
                validFrom: now,
                validTo: null,
                metadata: {}
            });
        }
    });

    return facts;
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
const pageIds = ['contactListPage', 'weiboPage', 'interactivePage', 'momentsPage', 'profilePage', 'chatPage', 'dataManagementPage', 'debugLogPage', 'walletPage', 'offlineModePage'];

/**
 * 向互动场景 iframe 发送初始化数据
 */
function sendDataToInteractiveFrame() {
    const iframe = document.getElementById('interactiveFrame');
    if (!iframe || !iframe.contentWindow) {
        console.error("互动场景 iframe 未找到或未准备好。");
        return;
    }

    if (!currentContact) {
        showToast('请先选择一个聊天对象再进入互动场景');
        // 可选：阻止页面切换
        showPage('contactListPage'); 
        return;
    }

    // 1. 打包所有需要的数据
    const payload = {
        type: 'INIT_DATA', // 消息类型，用于 iframe 识别
        apiSettings: apiSettings, // 完整的 API 设置
        character: {
            name: currentContact.name,
            persona: currentContact.personality,
            voiceId: currentContact.voiceId || '', // 确保传递 voiceId
            avatar: currentContact.avatar || '', // 传递头像URL或Base64
        },
        userPersona: {
            name: userProfile.name,
            persona: userProfile.personality
        }
    };

    // 2. 发送消息
    iframe.contentWindow.postMessage(payload, '*'); // '*' 适用于本地文件，生产环境应指定具体源
    console.log("已向互动场景发送初始化数据:", payload);
}

/**
 * @description 将主应用的所有角色和用户数据批量同步到互动页面
 */
function syncDataToInteractivePage() {
    const iframe = document.getElementById('interactiveFrame');
    if (!iframe || !iframe.contentWindow) {
        showToast('互动页面未准备好，请稍后再试');
        console.error("互动场景 iframe 未找到或未准备好。");
        return;
    }

    // 1. 打包所有需要的数据
    // 我们只筛选出私聊联系人作为可互动的角色
    const charactersToSync = contacts.filter(c => c.type === 'private');
    
    const payload = {
        type: 'BULK_DATA_SYNC', // 使用一个新的消息类型
        characters: charactersToSync,
        userProfile: userProfile,
        apiSettings: apiSettings // 在这里将 apiSettings 一起发送过去
    };

    // 2. 发送消息
    iframe.contentWindow.postMessage(payload, '*');
    
    // 3. 给用户反馈
    showToast('数据已开始同步到互动页！');
    console.log("已向互动场景发送批量同步数据:", payload);
}

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
    const navMapping = ['contactListPage', 'weiboPage', 'interactivePage', 'momentsPage', 'profilePage'];
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

    // 当切换到互动页面时，不再自动发送数据
    if (pageIdToShow === 'interactivePage') {
        // sendDataToInteractiveFrame();  // 已移除自动发送数据
    }
}

/**
 * 刷新数据库统计信息
 */
async function refreshDatabaseStats() {
    const statsContent = document.getElementById('databaseStatsContent');
    const refreshBtn = document.querySelector('.refresh-stats-btn');
    
    if (!statsContent) return;
    
    try {
        if (refreshBtn) {
            refreshBtn.textContent = '刷新中...';
            refreshBtn.disabled = true;
        }
        
        // 添加安全检查，确保DatabaseManager已初始化
        if (!window.DatabaseManager) {
            throw new Error('数据库管理器尚未初始化');
        }
        const result = await window.DatabaseManager.getStats();
        
        if (result.success) {
            const stats = result.stats;
            let statsHtml = '';
            
            const storeLabels = {
                'contacts': '联系人/群聊',
                'songs': '音乐文件', 
                'apiSettings': 'API设置',
                'emojis': '表情包',
                'backgrounds': '聊天背景',
                'userProfile': '用户资料',
                'moments': '朋友圈',
                'weiboPosts': '论坛帖子',
                'hashtagCache': '话题缓存',
                'customStyles': '自定义气泡样式'
            };
            
            let totalRecords = 0;
            Object.entries(stats).forEach(([storeName, count]) => {
                const label = storeLabels[storeName] || storeName;
                statsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>${label}:</span>
                    <span><strong>${count}</strong> 条记录</span>
                </div>`;
                totalRecords += count;
            });
            
            statsHtml += `<hr style="margin: 10px 0;"><div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>总计:</span>
                <span>${totalRecords} 条记录</span>
            </div>`;
            
            statsContent.innerHTML = statsHtml;
        } else {
            statsContent.innerHTML = `<div style="color: #dc3545;">加载失败: ${result.error}</div>`;
        }
    } catch (error) {
        if (statsContent) {
            statsContent.innerHTML = `<div style="color: #dc3545;">加载出错: ${error.message}</div>`;
        }
    } finally {
        if (refreshBtn) {
            refreshBtn.textContent = '刷新统计';
            refreshBtn.disabled = false;
        }
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
    
    
    showModal('generatePostModal');
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
    const hashtagInput = document.getElementById('postGenHashtag');
    const count = document.getElementById('postGenCount').value;

    if (!contactId) {
        showToast('请选择角色');
        return;
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
    await generateWeiboPosts(contactId, hashtag, count);
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

async function generateWeiboPosts(contactId, hashtag, count = 1) {
    // 【核心修复】获取完整的角色数据
    const fullContact = await getFullContactFromDB(contactId);

    if (!fullContact) { // 使用 fullContact 进行判断
        showToast('错误：找不到指定的聊天对象数据。');
        return; 
    }
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先在设置中配置API');
        return;
    }
    
    const container = document.getElementById('weiboContainer');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-text';
    loadingIndicator.textContent = '正在生成论坛内容...';
    container.prepend(loadingIndicator);

    try {
        // ==================== VVVVVV 在这里粘贴下面的新代码 VVVVVV ====================

        // 1. 创建一个 fullContact 的临时副本，以避免修改原始数据
        const limitedContact = { ...fullContact }; 
        
        // 2. 在副本中，将消息数组截取为最近的15条
        limitedContact.messages = (fullContact.messages || []).slice(-15);

        // ==================== ^^^^^^ 粘贴到这里结束 ^^^^^^ ====================

        // 【新流程 1】: 构建只请求"数据"的指令
        const systemPrompt = window.promptBuilder.buildWeiboPrompt(
            contactId,
            hashtag,
            count,
            limitedContact, // <--- 修改这里！使用我们刚刚创建的临时副本
            userProfile,
            contacts,
            emojis,
            fullContact.memoryTableContent 
        );

        // 【新流程 2】: 调用AI，获取纯数据JSON
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { 
                response_format: { type: "json_object" },
                temperature: 0.7 
            },
            (apiSettings.timeout || 60) * 1000
        );

        let jsonText = data.choices[0].message.content;
        
        if (!jsonText) {
            throw new Error("AI未返回有效内容");
        }
        
        // 自动清理AI可能返回的多余代码块
        jsonText = jsonText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7).trim(); // 移除 ```json 和可能的前导空格
        }
        if (jsonText.endsWith('```')) {
            jsonText = jsonText.slice(0, -3).trim(); // 移除末尾的 ``` 和可能的尾随空格
        }

        const aiGeneratedData = JSON.parse(jsonText);

        // 【新流程 3】: 将AI数据存入我们的应用结构中
        // 注意：这里的结构与之前类似，是为了保持数据存储的兼容性
        const postCreatedAt = new Date();
        const newPost = {
            id: Date.now(),
            contactId: contactId,
            hashtag: hashtag,
            createdAt: postCreatedAt.toISOString(),
            // 核心变化：我们将AI的单帖数据存入，并自己构建外层结构
            data: {
                posts: [{
                    author_type: 'Char', // 发帖人固定为角色
                    timestamp: postCreatedAt.toISOString(),
                    ...aiGeneratedData // 使用扩展运算符(...)将AI生成的所有字段合并进来
                }]
            }
        };
        
        // 【新流程 4】: 保存并渲染
        await saveWeiboPost(newPost);
        weiboPosts.push(newPost); // Update in-memory array
        renderAllWeiboPosts(); // renderAllWeiboPosts 内部的 renderSingleWeiboPost 会使用新逻辑
        showToast('帖子已刷新！');

    } catch (error) {
        console.error('生成论坛失败:', error);
        showToast('生成论坛失败: ' + error.message);
    } finally {
        loadingIndicator.remove();
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
        // 准备填充模板所需的所有数据
        const postAuthorContact = post.author_type === 'User' ? userProfile : contact;
        const postAuthorNickname = post.author_type === 'User' ? userProfile.name : (contact ? contact.name : '未知用户');
        const postAuthorAvatar = postAuthorContact ? (postAuthorContact.avatar ? `<img src="${postAuthorContact.avatar}" alt="${postAuthorNickname[0]}">` : postAuthorNickname[0]) : postAuthorNickname[0];
        const mentionHtml = post.author_type === 'User' ? '' : `<a href="#" class="mention">@${userProfile.name}</a>`;
        
        // 生成评论区的HTML
        let commentsHtml = '';
        if (post.comments && Array.isArray(post.comments)) {
            commentsHtml = post.comments.map(comment => {
                const commenterType = comment.commenter_type ? ` (${comment.commenter_type})` : '';
                const commentTime = comment.timestamp ? formatTime(comment.timestamp) : '';
                return `<div class="comment" onclick="replyToComment('${comment.commenter_name}', 'weibo-post-${storedPost.id}-${index}')">
                    <span class="comment-user">${comment.commenter_name}${commenterType}:</span>
                    <span class="comment-content">${comment.comment_content}</span>
                    <span class="comment-time">${commentTime}</span>
                </div>`;
            }).join('');
        }

        // 【核心】: 使用模板和数据进行填充
        let finalHtml = postTemplate // 使用我们定义的模板
            .replace(/\${postId}/g, `weibo-post-${storedPost.id}-${index}`)
            .replace(/\${postAuthorAvatar}/g, postAuthorAvatar)
            .replace(/\${postAuthorNickname}/g, postAuthorNickname)
            .replace(/\${badgeText}/g, post.author_type === 'User' ? '会员' : '蓝星')
            .replace(/\${postTime}/g, formatTime(post.timestamp))
            .replace(/\${sourceTopic}/g, post.source_topic || storedPost.hashtag) // 使用AI生成的研究社名称
            .replace(/\${storedPostId}/g, storedPost.id)
            .replace(/\${postIndex}/g, index)
            .replace(/\${hashtag}/g, storedPost.hashtag)
            .replace(/\${postContent}/g, post.post_content)
            .replace(/\${mentionHtml}/g, mentionHtml)
            .replace(/\${imageDescription}/g, post.image_description || '')
            .replace(/\${randomRepostCount}/g, Math.floor(Math.random() * 500))
            .replace(/\${commentCount}/g, post.comments ? post.comments.length : 0)
            .replace(/\${randomLikeCount}/g, Math.floor(Math.random() * 5000))
            .replace(/\${commentsHtml}/g, commentsHtml);
        
        // 将填充好的HTML添加到容器中
        container.innerHTML += finalHtml;
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

// ========== 在这里插入下面的新代码 ==========

/**
 * @description 更新加载屏幕的进度和状态
 * @param {number} percentage - 0到100的百分比
 * @param {string} text - 显示的状态文本
 */
function updateLoadingProgress(percentage, text) {
    const progressBar = document.getElementById('loading-progress-bar');
    const statusText = document.getElementById('loading-status-text');
    
    if (progressBar) {
        progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
    }
    if (statusText) {
        statusText.textContent = text;
    }
}

/**
 * @description 隐藏加载屏幕
 */
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        // 在动画结束后将其隐藏，防止遮挡
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500); // 必须与 CSS 中的 transition (0.5s) 时间一致
    }
}
// ========== 插入结束 ==========

function showTopNotification(message) {
    const notification = document.getElementById('topNotification');
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 1500);
}

/**
 * @description 显示发红包弹窗，并【强制从数据库】同步显示当前钱包余额
 */
async function showRedPacketModal() {
    // 步骤 1: 异步地从数据库直接获取最新的用户配置
    try {
        if (!db) {
            console.error("数据库连接尚未准备好！");
            showToast("数据库错误，无法获取余额");
            // 即使数据库有问题，也尝试用内存数据作为备用方案
            const balanceEl = document.getElementById('redPacketBalance');
            if (balanceEl) {
                balanceEl.textContent = `¥ ${userProfile.wallet.balance.toFixed(2)}`;
            }
            showModal('redPacketModal');
            return;
        }

        // 创建一个只读事务来获取数据
        const transaction = db.transaction(['userProfile'], 'readonly');
        const store = transaction.objectStore('userProfile');
        // 等待数据库查询完成
        const latestUserProfile = await promisifyRequest(store.get('profile'));

        // 步骤 2: 使用从数据库新鲜出炉的数据来更新UI
        const balanceEl = document.getElementById('redPacketBalance');
        if (balanceEl) {
            // 优先使用从数据库获取的最新余额
            const currentBalance = (latestUserProfile && latestUserProfile.wallet) 
                ? latestUserProfile.wallet.balance 
                : userProfile.wallet.balance; // 如果数据库没查到，则使用内存数据
            
            balanceEl.textContent = `¥ ${currentBalance.toFixed(2)}`;
        }
    } catch (error) {
        console.error("从数据库获取最新余额失败:", error);
        showToast("获取最新余额失败，显示可能不准确");
        // 如果查询数据库出错，仍然尝试使用内存中的数据作为后备
        const balanceEl = document.getElementById('redPacketBalance');
        if (balanceEl) {
            balanceEl.textContent = `¥ ${userProfile.wallet.balance.toFixed(2)}`;
        }
    }
    
    // 步骤 3: (最后) 显示弹窗
    showModal('redPacketModal');
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
    if (modalId === 'apiSettingsModal') {
        const contextSlider = document.getElementById('contextSlider');
        contextSlider.max = CONTEXT_MESSAGE_MAX;
        contextSlider.value = apiSettings.contextMessageCount;
        document.getElementById('contextValue').textContent = apiSettings.contextMessageCount + '条';
        const usageStatsToggle = document.getElementById('showUsageStatsToggle');
        if (usageStatsToggle) {
            usageStatsToggle.checked = apiSettings.showUsageStats !== false;
        }
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
        // 重置 DeepSeek 思考模式
        document.getElementById('contactThinkMode').value = 'default';
    }
}

function showAddContactModal() {
    editingContact = null;
    document.getElementById('contactModalTitle').textContent = '添加AI助手';
    // 清空语音ID输入框
    document.getElementById('contactVoiceId').value = '';
    document.getElementById('contactThinkMode').value = 'default';
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
    document.getElementById('contactThinkMode').value = currentContact.thinkMode || 'default';
    
    // 【新增】填充气泡样式下拉菜单
    const styleSelect = document.getElementById('contactBubbleStyleSelect');
    styleSelect.innerHTML = '<option value="">默认样式</option>'; // 重置

    for (const styleId in bubbleStyles) {
        const style = bubbleStyles[styleId];
        const option = document.createElement('option');
        option.value = style.id;
        option.textContent = style.name;
        styleSelect.appendChild(option);
    }

    // 设置当前联系人已选中的样式
    styleSelect.value = currentContact.bubbleStyleId || '';

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
    
    // 【新增】加载智谱 GLM API Key
    document.getElementById('glmApiKey').value = apiSettings.glmApiKey || '';

    // 计费标准回显（元/百万Token）
    const priceHitEl = document.getElementById('priceHit');
    const priceMissEl = document.getElementById('priceMiss');
    const priceOutEl = document.getElementById('priceOut');
    if (priceHitEl) priceHitEl.value = apiSettings.priceHit ?? 1.0;
    if (priceMissEl) priceMissEl.value = apiSettings.priceMiss ?? 12.0;
    if (priceOutEl) priceOutEl.value = apiSettings.priceOut ?? 24.0;

    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');

    // 重置并填充
    primarySelect.innerHTML = '<option value="">请先测试连接</option>';
    secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
}

function showBubbleManagerModal() {
    renderBubbleManagerList(); // 每次打开时都重新渲染列表
    showModal('bubbleManagerModal');
}

/**
 * @description 渲染气泡样式管理器中的列表
 */
function renderBubbleManagerList() {
    const listContainer = document.getElementById('bubbleManagerList');
    listContainer.innerHTML = ''; // 清空现有列表

    // Object.values() 将样式对象转换为数组，方便遍历
    const styles = Object.values(bubbleStyles);

    if (styles.length === 0) {
        listContainer.innerHTML = `
            <div class="bubble-manager-empty">
                还没有自定义样式，快去"气泡设计器"创建一个吧！
            </div>
        `;
        return;
    }

    styles.forEach(style => {
        const item = document.createElement('div');
        item.className = 'bubble-manager-item';
        item.innerHTML = `
            <div class="bubble-manager-item-name">${style.name}</div>
            <div class="bubble-manager-item-actions">
                <button class="bubble-manager-btn export-btn" onclick="exportBubbleStyle('${style.id}')">导出</button>
                <button class="bubble-manager-btn delete-btn" onclick="deleteBubbleStyle('${style.id}')">删除</button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

/**
 * @description 处理导入的气泡样式JSON文件
 */
function importBubbleStyles(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedStyle = JSON.parse(e.target.result);

            // 简单的格式验证
            if (importedStyle.id && importedStyle.name && importedStyle.html !== undefined && importedStyle.css !== undefined) {
                bubbleStyles[importedStyle.id] = importedStyle; // 添加或覆盖样式
                await saveBubbleStylesToDB(); // 保存到数据库
                renderBubbleManagerList(); // 刷新列表
                showToast(`样式 "${importedStyle.name}" 已成功导入！`);
            } else {
                throw new Error('JSON文件格式不正确，缺少必要的字段。');
            }
        } catch (error) {
            console.error('导入气泡样式失败:', error);
            showToast(`导入失败: ${error.message}`);
        }
    };
    reader.readAsText(file);

    // 清空file input，以便下次可以选择同一个文件
    event.target.value = '';
}

/**
 * @description 导出指定的气泡样式为JSON文件 (适配App环境)
 * @param {string} styleId - 要导出的样式ID
 */
function exportBubbleStyle(styleId) {
    const style = bubbleStyles[styleId];
    if (!style) {
        showToast('找不到要导出的样式');
        return;
    }

    const jsonString = JSON.stringify(style, null, 2);
    const filename = `${style.name.replace(/[/\\?%*:|"<>]/g, '-')}.json`;

    // 【核心改动】检查是否存在原生安卓接口
    if (window.Android && typeof window.Android.saveFile === 'function') {
        // 如果存在，就调用原生接口保存文件
        window.Android.saveFile(jsonString, filename);
        // Java代码会显示Toast，JS端无需操作
    } else {
        // 如果不存在，则执行原来的Web下载逻辑（作为备用方案）
        const blob = new Blob([jsonString], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast(`样式 "${style.name}" 已开始下载。`);
    }
}

/**
 * @description 删除指定的气泡样式
 * @param {string} styleId - 要删除的样式ID
 */
function deleteBubbleStyle(styleId) {
    const style = bubbleStyles[styleId];
    if (!style) {
        showToast('找不到要删除的样式');
        return;
    }

    showConfirmDialog(
        '删除确认',
        `确定要永久删除样式 "${style.name}" 吗？此操作不可撤销。`,
        async () => {
            delete bubbleStyles[styleId]; // 从内存中删除
            await saveBubbleStylesToDB(); // 更新数据库
            renderBubbleManagerList();    // 刷新UI
            showToast(`样式 "${style.name}" 已被删除。`);
        }
    );
}

// ================== 已移除预加载自定义模型的代码 ==================
// 现在由 testApiConnection 函数负责加载和合并API返回的模型列表和自定义模型列表

// ========== 在这里插入下面的新代码 ==========
// 在显示弹窗时，为"检查"按钮绑定点击事件
// 使用一个标记来防止重复绑定
function bindApiCheckButton() {
    // ▼▼▼ 将复制的代码粘贴到这里 ▼▼▼
    document.getElementById('apiUrl').value = apiSettings.url;
    document.getElementById('apiKey').value = apiSettings.key;
    document.getElementById('apiTimeout').value = apiSettings.timeout || 60;
    document.getElementById('minimaxGroupId').value = apiSettings.minimaxGroupId;
    document.getElementById('minimaxApiKey').value = apiSettings.minimaxApiKey;
    document.getElementById('glmApiKey').value = apiSettings.glmApiKey || '';

    // 计费标准回显（元/百万Token）
    const priceHitEl = document.getElementById('priceHit');
    const priceMissEl = document.getElementById('priceMiss');
    const priceOutEl = document.getElementById('priceOut');
    if (priceHitEl) priceHitEl.value = apiSettings.priceHit ?? 1.0;
    if (priceMissEl) priceMissEl.value = apiSettings.priceMiss ?? 12.0;
    if (priceOutEl) priceOutEl.value = apiSettings.priceOut ?? 24.0;

    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');

    primarySelect.innerHTML = '<option value="">请先测试连接</option>';
    secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
    // ▲▲▲ 粘贴区域结束 ▲▲▲

    const checkBtn = document.getElementById('checkModelBtn');
    if (checkBtn && !checkBtn.dataset.listenerAttached) {
        checkBtn.addEventListener('click', checkManualModel);
        checkBtn.dataset.listenerAttached = 'true';
    }
    
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


function showEditProfileModal() {
    document.getElementById('profileNameInput').value = userProfile.name;
    document.getElementById('profileAvatarInput').value = userProfile.avatar || '';
    document.getElementById('profilePersonality').value = userProfile.personality || '';
    
    // ========== 下方是新增的代码 ==========
    // 1. 获取为用户新增的气泡样式选择器
    const styleSelect = document.getElementById('profileBubbleStyleSelect');
    styleSelect.innerHTML = '<option value="">默认样式</option>'; // 重置并保留默认选项

    // 2. 遍历所有已保存的气泡样式，并创建<option>元素
    for (const styleId in bubbleStyles) {
        const style = bubbleStyles[styleId];
        const option = document.createElement('option');
        option.value = style.id;
        option.textContent = style.name;
        styleSelect.appendChild(option);
    }

    // 3. 设置下拉菜单的当前值为用户已保存的样式ID
    styleSelect.value = userProfile.bubbleStyleId || '';
    // ========== 新增代码结束 ==========

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
        voiceId: document.getElementById('contactVoiceId').value.trim(),
        // 保存 DeepSeek 思考模式
        thinkMode: document.getElementById('contactThinkMode').value || 'default',
        // 【新增】保存选择的气泡样式ID
        bubbleStyleId: document.getElementById('contactBubbleStyleSelect').value
    };
    if (editingContact) {
        Object.assign(editingContact, contactData);
        showToast('修改成功');
    } else {
        const contact = { id: Date.now().toString(), ...contactData, isPinned: false, messages: [], lastMessage: '点击开始聊天', lastTime: new Date().toISOString(), type: 'private', memoryTableContent: defaultMemoryTable, worldBook: [] };
        contacts.unshift(contact);
        showToast('添加成功');
    }
    if (editingContact) {
        // 如果是编辑模式，更新当前联系人
        await updateContactInDB(editingContact);
    } else {
        // 如果是新建模式，获取我们刚刚添加到内存列表中的新联系人并保存它
        const newContact = contacts[0]; // unshift() 把它放在了数组最前面
        await updateContactInDB(newContact);
    }

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
    const group = { id: 'group_' + Date.now().toString(), name: groupName, members: memberIds, isPinned: false, messages: [], lastMessage: '群聊已创建', lastTime: new Date().toISOString(), type: 'group', memoryTableContent: defaultMemoryTable, worldBook: [] };
    contacts.unshift(group);
    // 获取我们刚刚创建并添加到内存列表中的新群聊
    const newGroup = contacts[0]; // unshift() 同样把它放在了最前面
    await updateContactInDB(newGroup); // 调用正确的函数来保存这个新群聊

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

    // 【新增】保存用户选择的气泡样式ID
    userProfile.bubbleStyleId = document.getElementById('profileBubbleStyleSelect').value;

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

/**
 * 切换联系人或群聊的置顶状态
 * @param {string} contactId - 要操作的联系人ID
 */
async function togglePinContact(contactId) {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
        contact.isPinned = !contact.isPinned; // 切换置顶状态 (true -> false, false -> true)
        await saveDataToDB(); // 保存更改到数据库
        renderContactList(); // 重新渲染列表以反映排序和样式的变化
        showToast(contact.isPinned ? '已置顶' : '已取消置顶'); // 给出用户反馈
    }
}

/**
 * 显示联系人操作菜单 (置顶/删除)
 * @param {object} contact - 被长按的联系人对象
 */
function showContactActionMenu(contact) {
    const menuId = 'contactActionMenu';
    let menu = document.getElementById(menuId);

    // 如果菜单不存在，则动态创建它
    if (!menu) {
        menu = document.createElement('div');
        menu.id = menuId;
        menu.className = 'modal'; // 复用现有的 modal 样式作为遮罩层
        menu.innerHTML = `
            <div class="modal-content">
                <div class="modal-body" style="padding: 10px 0;">
                    <div class="menu-item" id="pinContactBtn"></div>
                    <div class="menu-item delete-item" id="deleteContactBtn"></div>
                </div>
                <div style="padding: 10px; border-top: 8px solid #f0f0f0;">
                     <button class="form-submit" style="background-color: #f7f7f7; color: #333;" onclick="closeModal('${menuId}')">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(menu);

        // 点击菜单外部的遮罩层时关闭菜单
        menu.addEventListener('click', (e) => {
            if (e.target.id === menuId) {
                closeModal(menuId);
            }
        });
    }

    // 根据联系人的当前状态，动态设置按钮的文本和行为
    const pinBtn = document.getElementById('pinContactBtn');
    const deleteBtn = document.getElementById('deleteContactBtn');

    pinBtn.textContent = contact.isPinned ? '取消置顶' : '置顶该聊天';
    pinBtn.onclick = () => {
        togglePinContact(contact.id);
        closeModal(menuId);
    };

    deleteBtn.textContent = `删除该聊天`;
    deleteBtn.onclick = () => {
        closeModal(menuId);
        // 复用已有的删除确认对话框
        showConfirmDialog('删除确认', `确定要删除 "${contact.name}" 吗？此操作不可撤销。`, () => {
            deleteContact(contact.id);
        });
    };

    showModal(menuId); // 显示菜单
}

function renderContactList() {
    const contactList = document.getElementById('contactList');
    contactList.innerHTML = '';

    // 【核心修改1】: 在渲染前对联系人数组进行排序
    contacts.sort((a, b) => {
        // 如果 a 置顶而 b 没有，a 排在前面
        if (a.isPinned && !b.isPinned) return -1;
        // 如果 b 置顶而 a 没有，b 排在前面
        if (!a.isPinned && b.isPinned) return 1;
        // 如果两者都置顶或都不置顶，则按最后消息时间排序
        return new Date(b.lastTime) - new Date(a.lastTime);
    });

    contacts.forEach(contact => {
        const item = document.createElement('div');
        // 【核心修改2】: 根据 isPinned 状态添加 'pinned' 类
        item.className = `contact-item ${contact.isPinned ? 'pinned' : ''}`;

        if (contact.type === 'group') {
            item.innerHTML = `<div class="group-avatar"><div class="group-avatar-inner">${getGroupAvatarContent(contact)}</div></div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${formatContactListTime(contact.lastTime)}</div>`;
        } else {
            item.innerHTML = `<div class="contact-avatar">${contact.avatar ? `<img src="${contact.avatar}">` : contact.name[0]}</div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${formatContactListTime(contact.lastTime)}</div>`;
        }
        item.onclick = () => openChat(contact);

        // 【核心修改3】: 绑定新的长按/右键菜单事件
        let pressTimer;
        // 移动端长按
        item.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                showContactActionMenu(contact);
            }, 700); // 长按700毫秒触发
        });
        item.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        item.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });
        // PC端右键
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContactActionMenu(contact);
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
// 【已重构】现在是异步函数，会从数据库加载消息
async function openChat(contact) {
    // 1. 更新当前联系人（不含消息的摘要对象）
    currentContact = contact;
    window.memoryTableManager.setCurrentContact(contact);
    document.getElementById('chatTitle').textContent = contact.name;
    showPage('chatPage');
    
    // 2. 显示加载状态
    const chatMessagesEl = document.getElementById('chatMessages');
    chatMessagesEl.innerHTML = '<div class="loading-text">正在加载聊天记录...</div>';
    
    // 3. 异步从数据库获取完整的联系人数据（包含所有消息）
    const fullContactData = await getFullContactFromDB(contact.id);
    if (!fullContactData) {
        chatMessagesEl.innerHTML = '<div class="loading-text">加载失败，找不到聊天记录。</div>';
        return;
    }
    // 将完整的消息数组附加到我们当前的联系人对象上
    currentContact.messages = fullContactData.messages || [];
    // 确保世界书数据也准备好了
    currentContact.worldBook = fullContactData.worldBook || [];

    // 4. 重置分页状态并进行初次渲染
    isLoadingMoreMessages = false;
    currentlyDisplayedMessageCount = Math.min(currentContact.messages.length, MESSAGES_PER_PAGE);
    
    await renderMessages(true); // 使用 await 等待异步渲染完成
    
    // 5. 设置背景和滚动监听
    updateContextIndicator();
    chatMessagesEl.style.backgroundImage = backgrounds[contact.id] ? `url(${backgrounds[contact.id]})` : 'none';
    
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
    toggleEmojiPanel(true);
    toggleSettingsMenu(true);
    toggleMemoryPanel(true);
    // 重置标签页状态
    if (window.switchMemoryTab) {
        window.switchMemoryTab('table');
    }
}

// 【重要】将函数声明为 async
// 【已重构】支持分页加载和异步渲染
async function renderMessages(isInitialLoad = false) {
    if (!currentContact) return;
    const chatMessages = document.getElementById('chatMessages');
    
    // 从消息总数中，根据当前已显示的条数，截取出需要渲染的部分
    const messagesToRender = (currentContact.messages || []).slice(currentContact.messages.length - currentlyDisplayedMessageCount);

    let messagesHtml = '';

    // 【分页逻辑】如果还有更早的消息未显示，就在最顶部添加一个加载按钮
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        messagesHtml += `<div class="load-more-messages" onclick="loadMoreMessages()">加载更早的消息...</div>`;
    }

    if (currentContact.type === 'group') {
        messagesHtml += `<div class="group-info-hint">群聊成员: ${getGroupMembersText()}</div>`;
    }

    const buildReasoningHtml = (reasoningText) => {
        if (!reasoningText || !String(reasoningText).trim()) return '';
        const safeReasoning = escapeHtml(String(reasoningText)).replace(/\n/g, '<br>');
        return `
            <details class="message-reasoning" style="margin-bottom: 6px;">
                <summary style="font-size: 12px; color: #888; cursor: pointer; user-select: none;">thinking</summary>
                <div style="margin-top: 6px; font-size: 13px; color: #888; line-height: 1.5;">${safeReasoning}</div>
            </details>
        `;
    };

    let lastTimestamp = null;
    for (const [index, msg] of messagesToRender.entries()) {
        const originalIndex = (currentContact.messages.length - currentlyDisplayedMessageCount) + index;
        const currentMsgTime = new Date(msg.time);

        if (!lastTimestamp || currentMsgTime - lastTimestamp > 5 * 60 * 1000) {
            messagesHtml += `<div class="message-timestamp">${formatChatTimestamp(msg.time)}</div>`;
            lastTimestamp = currentMsgTime;
        }

        if (msg.role === 'system') continue;

        // 1. 准备基础变量
        const isSent = msg.role === 'user';
        const msgDivClass = `message ${isSent ? 'sent' : 'received'}`;
        // originalIndex 已在循环开始时声明，这里不需要重复声明

        // 2. 准备消息内容 (contentHtml) - 这部分逻辑您原来是正确的，我们保持不变
        let contentHtml = '';
        if (msg.type === 'emoji') {
            let emojiSrc = 'placeholder.png';
            const content = msg.content;
            if (content.startsWith('http') || content.startsWith('data:')) {
                emojiSrc = content;
            } else {
                const foundEmoji = emojis.find(e => e.meaning === content);
                if (foundEmoji) {
                    emojiSrc = await getEmojiSrc(foundEmoji);
                } else {
                    contentHtml = `<div class="message-content">[表情: ${content}]</div>`;
                }
            }
            if (!contentHtml) {
                contentHtml = `<img src="${emojiSrc}" class="message-emoji">`;
            }
        } else if (msg.type === 'red_packet') {
            const packet = JSON.parse(msg.content);
            const isSentByUser = msg.role === 'user';
            const isOpened = msg.opened;
            let statusText = isSentByUser ? '查看红包' : (isOpened ? '已领取' : '领取红包');
            const clickHandler = !isSentByUser && !isOpened ? `onclick="openRedPacket(${originalIndex})"` : '';
            const cursorStyle = !isSentByUser && !isOpened ? 'cursor: pointer;' : 'cursor: default;';
            const openedClass = isOpened ? 'opened' : '';
            contentHtml = `
                <div class="message-content red-packet ${openedClass}" ${clickHandler} style="${cursorStyle}">
                    <div class="red-packet-body">
                        <svg class="red-packet-icon" viewBox="0 0 1024 1024"><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32zM731.2 565.2H603.9c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8zM419.8 565.2H292.5c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8z" fill="#FEFEFE"></path><path d="M872.4 240H151.6c-17.7 0-32 14.3-32 32v64h784v-64c0-17.7-14.3-32-32-32z" fill="#FCD4B3"></path><path d="M512 432c-48.6 0-88 39.4-88 88s39.4 88 88 88 88-39.4 88-88-39.4-88-88-88z m0 152c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64-64z" fill="#FCD4B3"></path><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32z m-32 552H215.6V368h624.8v488z" fill="#F37666"></path><path d="M512 128c-112.5 0-204 91.5-204 204s91.5 204 204 204 204-91.5 204-204-91.5-204-204-204z m0 384c-99.4 0-180-80.6-180-180s80.6-180 180-180 180 80.6 180 180-80.6 180-180 180z" fill="#F37666"></path><path d="M512 456c-35.3 0-64 28.7-64 64s28.7 64 64 64 64 28.7 64 64-28.7-64-64-64z m16.4 76.4c-2.3 2.3-5.4 3.6-8.5 3.6h-15.8c-3.1 0-6.2-1.3-8.5-3.6s-3.6-5.4-3.6-8.5v-27.8c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12v27.8c0.1 3.1-1.2 6.2-3.5 8.5z" fill="#F37666"></path></svg>
                        <div class="red-packet-text">
                            <div>${packet.message || '恭喜发财，大吉大利！'}</div>
                            <div>${statusText}</div>
                        </div>
                    </div>
                    <div class="red-packet-footer">AI红包</div>
                </div>
            `;
        } else {
            // 处理普通文本消息
            let processedContent = msg.content;
            const emojiTagRegex = /\[(?:emoji|发送了表情)[:：]([^\]]+)\]/g;
            const standaloneEmojiMatch = processedContent.trim().match(/^\[(?:emoji|发送了表情)[:：]([^\]]+)\]$/);
            if (standaloneEmojiMatch) {
                 const emojiName = standaloneEmojiMatch[1];
                 const foundEmoji = emojis.find(e => e.meaning === emojiName);
                 if(foundEmoji) {
                    const emojiSrc = await getEmojiSrc(foundEmoji);
                    contentHtml = `<img src="${emojiSrc}" class="message-emoji">`;
                 } else {
                    contentHtml = `<div class="message-content">${processedContent}</div>`;
                 }
            } else {
                processedContent = processedContent.replace(/\n/g, '<br>');
                const matches = [...processedContent.matchAll(emojiTagRegex)];
                if (matches.length > 0) {
                    for (const match of matches) {
                        const emojiName = match[1];
                        const foundEmoji = emojis.find(e => e.meaning === emojiName);
                        if (foundEmoji) {
                            const emojiSrc = await getEmojiSrc(foundEmoji);
                            const imgTag = `<img src="${emojiSrc}" style="max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;">`;
                            processedContent = processedContent.replace(match[0], imgTag);
                        }
                    }
                }
                contentHtml = `<div class="message-content">${processedContent}</div>`;
            }
        }

        // "已编辑"标签的代码块已被移除

        // 4. 准备头像 (avatarContent)
        let avatarContent = '';
        if (msg.role === 'user') {
            avatarContent = userProfile.avatar ? `<img src="${userProfile.avatar}">` : (userProfile.name[0] || '我');
        } else {
            const sender = contacts.find(c => c.id === msg.senderId);
            avatarContent = sender ? (sender.avatar ? `<img src="${sender.avatar}">` : sender.name[0]) : '?';
        }

        const reasoningHtml = buildReasoningHtml(msg.reasoning);

        // 5. 【核心修正】拼接单条消息的完整 HTML
        let bubbleHtml;
        if (currentContact.type === 'group' && msg.role !== 'user') {
            const sender = contacts.find(c => c.id === msg.senderId);
            const senderName = sender ? sender.name : '未知';
            // 群聊中他人消息的 HTML 结构
            bubbleHtml = `<div class="message-bubble"><div class="group-message-header"><div class="group-message-name">${senderName}</div></div>${reasoningHtml}${contentHtml}</div>`;
        } else {
            // 私聊或群聊中自己消息的 HTML 结构
            bubbleHtml = `<div class="message-bubble">${reasoningHtml}${contentHtml}</div>`;
        }

        // 【重构】检查并应用自定义气泡样式（兼容用户和助手）
        let styleIdToApply = null;

        // 1. 根据消息发送者（用户或助手）确定要使用哪个样式ID
        if (msg.role === 'user') {
            styleIdToApply = userProfile.bubbleStyleId;
        } else if (msg.role === 'assistant') {
            styleIdToApply = currentContact.bubbleStyleId;
        }
        
        // 2. 检查样式ID是否存在、有效，并且消息类型是普通文本
        if (styleIdToApply && bubbleStyles[styleIdToApply] && msg.type !== 'emoji' && msg.type !== 'red_packet' && !msg.forceVoice) {
            try {
                // 3. 从样式库中获取对应的样式对象
                const styleToApply = bubbleStyles[styleIdToApply];
                
                // 4. 使用该样式的HTML模板替换默认气泡
                let finalHtml = styleToApply.html.replace('{{BUBBLE_TEXT}}', msg.content);
                bubbleHtml = `<div class="message-bubble custom-bubble">${reasoningHtml}${finalHtml}</div>`;

            } catch (error) {
                console.error("应用自定义气泡模板出错:", error);
                // 如果出错，会自动使用之前的默认 bubbleHtml，无需额外处理
            }
        }

        // 6. 拼接语音播放器
        let voicePlayerHtml = '';
        if (msg.forceVoice && currentContact.voiceId && apiSettings.minimaxGroupId && apiSettings.minimaxApiKey) {
            const messageUniqueId = `${currentContact.id}-${msg.time}`;
            voicePlayerHtml = `
                <div class="voice-player" id="voice-player-${messageUniqueId}" onclick="playVoiceMessage(this, '${msg.content.replace(/'/g, "\\'")}', '${currentContact.voiceId}')">
                    <div class="play-button">▶</div>
                    <div class="waveform">
                        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
                        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
                        <div class="waveform-bar"></div><div class="waveform-bar"></div><div class="waveform-bar"></div>
                    </div>
                    <div class="duration"></div>
                </div>
            `;
            // 将播放器插入到气泡的开头
            bubbleHtml = bubbleHtml.replace('<div class="message-bubble', '<div class="message-bubble has-voice-player');
            bubbleHtml = bubbleHtml.replace('>', `>${voicePlayerHtml}`);
        }

        // 7. 【核心修正】将拼接好的完整消息HTML追加到 messagesHtml
        messagesHtml += `
            <div class="${msgDivClass}" data-message-index="${originalIndex}">
                <div class="message-avatar">${avatarContent}</div>
                ${bubbleHtml}
            </div>
        `;
    }
    
    // 【重要】因为是异步生成，最后再一次性设置 innerHTML
    chatMessages.innerHTML = messagesHtml;
    
    // 重新绑定事件
    chatMessages.querySelectorAll('.message[data-message-index]').forEach(msgDiv => {
        const originalIndex = parseInt(msgDiv.dataset.messageIndex, 10);
        if (isMultiSelectMode) {
            msgDiv.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMessageSelection(originalIndex);
            });
        } else {
            let msgPressTimer;
            msgDiv.addEventListener('touchstart', () => { msgPressTimer = setTimeout(() => { showMessageActionMenu(originalIndex, msgDiv); }, 700); });
            msgDiv.addEventListener('touchend', () => clearTimeout(msgPressTimer));
            msgDiv.addEventListener('touchmove', () => clearTimeout(msgPressTimer));
            msgDiv.addEventListener('contextmenu', (e) => { e.preventDefault(); showMessageActionMenu(originalIndex, msgDiv); });
        }
    });


    // 只有在初次加载时才滚动到底部
    if (isInitialLoad) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}


// 【新增函数】用于分页加载更多消息
async function loadMoreMessages() {
    if (isLoadingMoreMessages) return;
    isLoadingMoreMessages = true;

    const chatMessages = document.getElementById('chatMessages');
    const loadMoreButton = chatMessages.querySelector('.load-more-messages');
    if (loadMoreButton) {
        loadMoreButton.textContent = '正在加载...';
    }
    
    // 记录加载前的高度，用于恢复滚动位置
    const oldScrollHeight = chatMessages.scrollHeight;

    // 模拟网络延迟，让用户能看到加载状态
    await new Promise(resolve => setTimeout(resolve, 300));

    const newCount = Math.min(currentContact.messages.length, currentlyDisplayedMessageCount + MESSAGES_PER_PAGE);
    
    if (newCount > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount = newCount;
        await renderMessages(false); // 重新渲染，非初始加载
        
        // 关键：恢复滚动位置，让用户感觉内容是无缝衔接的
        const newScrollHeight = chatMessages.scrollHeight;
        chatMessages.scrollTop = newScrollHeight - oldScrollHeight;
    } else {
        // 如果没有更多消息了，移除加载按钮
        if(loadMoreButton) loadMoreButton.remove();
    }
    
    isLoadingMoreMessages = false;
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
    currentContact.lastTime = userMessage.time;
    input.value = '';
    input.style.height = 'auto';
    renderMessages(true); // 重新渲染并滚动到底部
    renderContactList();
    await updateContactInDB(currentContact);
    
    // 【新增优化】: 保存数据后，更新内存中联系人列表的摘要信息
    const contactInList = contacts.find(c => c.id === currentContact.id);
    if (contactInList) {
        contactInList.lastMessage = currentContact.lastMessage;
        contactInList.lastTime = currentContact.lastTime;
    }
    
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
            const { replies, newMemoryTable } = await callAPI(currentContact);
            hideTypingIndicator();
            if (newMemoryTable) {
                currentContact.memoryTableContent = newMemoryTable;
                await updateContactInDB(currentContact);
            }
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
                    reasoning: response.reasoning || '',
                    time: new Date().toISOString(), 
                    senderId: currentContact.id,
                    forceVoice: forceVoice // 添加新标志
                };

                currentContact.messages.push(aiMessage);
                if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                    currentlyDisplayedMessageCount++;
                }
                currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : (response.type === 'emoji' ? '[表情]' : '[红包]');
                currentContact.lastTime = aiMessage.time;
                renderMessages(true); // 重新渲染并滚动到底部
                renderContactList();
                await updateContactInDB(currentContact);
                
                // 【新增优化】: 保存数据后，更新内存中联系人列表的摘要信息
                const contactInList = contacts.find(c => c.id === currentContact.id);
                if (contactInList) {
                    contactInList.lastMessage = currentContact.lastMessage;
                    contactInList.lastTime = currentContact.lastTime;
                }
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
            const { replies, newMemoryTable } = await callAPI(member, turnContext);
            hideTypingIndicator();
            if (newMemoryTable) {
                window.memoryTableManager.updateContactMemoryTable(currentContact, newMemoryTable);
                await updateContactInDB(currentContact);
            }
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
                    reasoning: response.reasoning || '',
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
                currentContact.lastTime = aiMessage.time;
                renderMessages(true); // 重新渲染并滚动到底部
                renderContactList();
                await updateContactInDB(currentContact);
                
                // 【新增优化】: 保存数据后，更新内存中联系人列表的摘要信息
                const contactInList = contacts.find(c => c.id === currentContact.id);
                if (contactInList) {
                    contactInList.lastMessage = currentContact.lastMessage;
                    contactInList.lastTime = currentContact.lastTime;
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

// =================================================================
// 新增：记忆表格增量更新工具
// =================================================================
const MemoryPatcher = {
    applyDiff: function(oldMarkdown, diffJson) {
        if (!oldMarkdown) return ""; 

        let lines = oldMarkdown.split(/\r?\n/);
        const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isMarkdownHeadingLine = line => /^#{1,6}\s+\S/.test(String(line).trim());
        
        try {
            const operations = JSON.parse(diffJson);
            
            operations.forEach(op => {
                // 1. 找到对应板块：优先 ### 【section】，否则 # section（兼容默认模板里的一级标题）
                const sectionName = op.section != null ? String(op.section) : '';
                if (!sectionName) return;

                const primaryHeader = `### 【${sectionName}】`;
                let startIndex = -1;
                let headerHit = null;

                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(primaryHeader)) {
                        startIndex = i;
                        headerHit = primaryHeader;
                        break;
                    }
                }
                if (startIndex === -1) {
                    const fallbackRe = new RegExp(`^#\\s+${escapeRegExp(sectionName)}\\s*$`);
                    for (let i = 0; i < lines.length; i++) {
                        if (fallbackRe.test(lines[i].trim())) {
                            startIndex = i;
                            headerHit = lines[i].trim();
                            break;
                        }
                    }
                }

                if (startIndex === -1) return; // 没找到板块，跳过（不报错）

                let endIndex = lines.length;
                for (let j = startIndex + 1; j < lines.length; j++) {
                    if (isMarkdownHeadingLine(lines[j])) {
                        endIndex = j;
                        break;
                    }
                }

                console.log(`[记忆补丁] 命中 section: ${sectionName}, header: ${headerHit}`);

                // 2. 执行操作
                if (op.op === 'update') {
                    // 更新逻辑保持不变
                    for (let i = startIndex; i < endIndex; i++) {
                        if (lines[i].includes(`| ${op.key} |`)) {
                            lines[i] = `| ${op.key} | ${op.value} |`;
                            break;
                        }
                    }
                } 
                else if (op.op === 'append') {
                    // 【核心修复】：追加逻辑优化
                    // 不要直接在 endIndex 插入，而是从 endIndex 往回找，找到最后一个非空行
                    // 这样可以确保新行紧贴着表格底部，消除空行导致的断层
                    let insertIndex = endIndex;
                    while (insertIndex > startIndex && lines[insertIndex - 1].trim() === '') {
                        insertIndex--;
                    }
                    
                    // 确保 op.line 前后没有多余的换行符干扰
                    lines.splice(insertIndex, 0, op.line.trim());
                    
                    // 因为插入了新行，原来的 endIndex 位置也后移了，虽然循环会重新计算，但逻辑上要注意
                } 
                else if (op.op === 'delete') {
                    // 删除逻辑保持不变
                    for (let i = startIndex; i < endIndex; i++) {
                        if (lines[i].includes(op.keyword)) {
                            lines.splice(i, 1);
                            i--; 
                            endIndex--; 
                        }
                    }
                }
            });
            
            return lines.join('\n');
        } catch (e) {
            console.error("记忆表格Patch失败:", e);
            return oldMarkdown; 
        }
    }
};

/**
 * [MODIFIED] 主副模型分离版本：主模型只管聊天，副模型后台更新记忆
 * @param {object} contact The contact object.
 * @param {array} turnContext Additional messages for group chat context.
 * @returns {object} The API response containing replies and the new memory table.
 */
function estimatePromptChars(text) {
    return String(text || '').length;
}

const MIN_AI_BUBBLE_COUNT = 5;

function splitAIReplyIntoBubbleLines(text, minCount = MIN_AI_BUBBLE_COUNT) {
    const rawText = String(text || '').trim();
    if (!rawText) return [];

    const rawLines = rawText
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    if (rawLines.length >= minCount) {
        return rawLines;
    }

    // 表情和红包这类特殊格式不能乱按标点切，否则会破坏格式
    const specialLineRegex = /^(<emoji>.*?<\/emoji>|\[red_packet:{.*}\])$/;
    if (rawLines.some(line => specialLineRegex.test(line))) {
        return rawLines;
    }

    // 第一轮：按句末标点拆
    let sentenceParts = rawText
        .replace(/([。！？!?；;…]+)\s*/g, '$1\n')
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    if (sentenceParts.length >= minCount) {
        return sentenceParts;
    }

    // 第二轮：如果仍然太少，再允许按逗号拆，让一整段也能变成聊天节奏
    sentenceParts = rawText
        .replace(/([。！？!?；;…]+|，|,)\s*/g, '$1\n')
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    if (sentenceParts.length > rawLines.length) {
        return sentenceParts;
    }

    return rawLines;
}

async function callAPI(contact, turnContext = []) {
    try {
        let retrievedMemoryFacts = [];
        try {
            const msgs = contact.messages || [];
            const lastMsg = msgs[msgs.length - 1];
            const userInput = lastMsg && lastMsg.role === 'user' ? String(lastMsg.content || '') : '';
            const queryText = buildMemoryRetrievalQuery(contact, userInput);
            retrievedMemoryFacts = await retrieveRelevantMemoryFacts(contact.id, queryText, { limit: 25 });
            setLastTriggeredMemoryFactsDebug(contact, queryText, retrievedMemoryFacts);
            if (retrievedMemoryFacts.length > 0) {
                console.log('[记忆检索] 注入主模型 facts 数量:', retrievedMemoryFacts.length);
            } else {
                console.log('[记忆检索] 没有相关结构化记忆，本轮只使用旧记忆表');
            }
        } catch (retrievalErr) {
            console.warn('[记忆检索] 检索失败，继续使用旧记忆表:', retrievalErr);
            setLastTriggeredMemoryFactsDebug(contact, '', []);
        }

        // ==========================================
        // 阶段一：主模型生成对话
        // ==========================================
        const systemPrompt = window.promptBuilder.buildChatPrompt(
            contact, userProfile, currentContact, apiSettings, emojis, window, turnContext
        );
        const cleanHistoryForWorldBook = window.promptBuilder.buildMessageHistory(
            currentContact, apiSettings, userProfile, contacts, contact, emojis, turnContext, false, []
        );

        const triggeredEntriesText = getTriggeredWorldBookEntries(contact, cleanHistoryForWorldBook);

        const messageHistory = window.promptBuilder.buildMessageHistory(
            currentContact, apiSettings, userProfile, contacts, contact, emojis, turnContext, true, retrievedMemoryFacts,
            {
                includeFullMemoryTableInMainPrompt: false,
                memoryPreviewMaxChars: 0,
                keepLatestUserMessageLast: true
            }
        );

        // 【核心修改】：首条 System 消息永远保持纯静态，只放固定的人设和规则
        const messages = [{ role: 'system', content: systemPrompt }, ...messageHistory];

        if (triggeredEntriesText) {
            const systemContextIndex = messages.findIndex(m =>
                m.role === 'user' &&
                typeof m.content === 'string' &&
                m.content.startsWith('[System Context / 系统实时状态]')
            );

            if (systemContextIndex >= 0) {
                messages[systemContextIndex].content += `\n\n${triggeredEntriesText}`;
            } else {
                let insertIndex = messages.length;
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].role === 'user') {
                        insertIndex = i;
                        break;
                    }
                }
                messages.splice(insertIndex, 0, {
                    role: 'user',
                    content: `[WorldBook / 世界书触发设定]\n${triggeredEntriesText}`
                });
            }
        }

        console.table(messages.map((m, i) => ({
            index: i,
            role: m.role,
            chars: estimatePromptChars(m.content),
            preview: String(m.content || '').slice(0, 80).replace(/\n/g, ' ')
        })));

        // 1. 调用主模型
        const chatData = await window.apiService.callOpenAIAPI(
            apiSettings.url, apiSettings.key, apiSettings.model, messages, {}, (apiSettings.timeout || 60) * 1000
        );

        if (chatData.usage) {
            const usage = chatData.usage;
            const totalPrompt = usage.prompt_tokens;
            const cachedTokens = usage.prompt_cache_hit_tokens ||
                                (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0;
            const outputTokens = usage.completion_tokens || 0;
            const missTokens = totalPrompt - cachedTokens;
            
            const hitRate = ((cachedTokens / totalPrompt) * 100).toFixed(1);
            
            // 计算成本（元/百万Token，可由用户在 API 设置中自定义）
            const cost = (
                (cachedTokens / 1000000 * (apiSettings.priceHit ?? 0)) +
                (missTokens / 1000000 * (apiSettings.priceMiss ?? 0)) +
                (outputTokens / 1000000 * (apiSettings.priceOut ?? 0))
            ).toFixed(5);

            // 保存到全局以便切换显示
            window.lastStats = { hitRate, totalPrompt, cachedTokens, outputTokens, cost };
            
            // 实时更新 UI
            updateStatsUI();
            
            console.log(`📊 [API 消耗统计] 命中率: ${hitRate}% | 预估成本: ￥${cost}`);
        }

        if (!chatData) throw new Error('主模型返回数据为空');

        let fullResponseText = chatData.choices?.[0]?.message?.content || chatData.candidates?.[0]?.content?.parts?.[0]?.text;
        let reasoningContent = chatData.choices?.[0]?.message?.reasoning_content || '';
        
        if (!fullResponseText || fullResponseText.trim() === '') {
            if (chatData.choices?.[0]?.finish_reason === 'content_filter') {
                throw new Error('内容被过滤，请检查输入');
            }
            throw new Error('主模型回复内容为空');
        }

        // ==========================================
        // 阶段二：副模型生成记忆表格 (完全隔离的上下文)
        // ==========================================
        let newMemoryTable = null;
        try {
            const secondaryModel = apiSettings.secondaryModel === 'sync_with_primary' ? apiSettings.model : apiSettings.secondaryModel;
            
            // 1. 构建副模型专属的系统提示词（包含人设和记忆表）
            const memorySystemPrompt = window.promptBuilder.buildMemoryUpdatePrompt(contact, userProfile);
            
            // 2. 获取干净的历史记录数组
            const cleanHistory = window.promptBuilder.buildMessageHistory(
                currentContact, apiSettings, userProfile, contacts, contact, emojis, turnContext, false 
            );

            // 【核心修改】：将聊天记录“拍扁”成一段文本数据，避免使用 role: 'assistant' 让副模型入戏
            let conversationText = "【最新对话记录】\n";
            cleanHistory.forEach(msg => {
                const senderName = msg.role === 'user' ? userProfile.name : contact.name;
                conversationText += `${senderName}：${msg.content}\n`;
            });
            // 加上主模型刚刚生成的最新回复
            conversationText += `${contact.name}：${fullResponseText}\n`;
            const currentMemory = contact.memoryTableContent || window.promptBuilder.defaultMemoryTable;

            // 3. 组装给副模型的请求：系统提示词 + 将动态记忆放在 User 消息末尾（提升前缀缓存稳定性）
            const memoryMessages = [
                { role: 'system', content: memorySystemPrompt },
                { 
                  role: 'user', 
                  content: `请分析以下对话记录并提取情报。\n\n${conversationText}\n\n【输出要求】\n1. 严格按照系统提示：优先输出完整的 <memory_ops> … </memory_ops>（JSON 对象）。\n2. 为兼容旧版，请再输出 <memory_diff> … </memory_diff> 以更新下方 Markdown 记忆表；无表格变更时输出 <memory_diff>[]</memory_diff>。\n\n【当前记忆状态】：\n<current_memory>\n${currentMemory}\n</current_memory>` 
                }
            ];

            // 4. 调用副模型 (降低 temperature 提高格式稳定性)
            const memoryData = await window.apiService.callOpenAIAPI(
                apiSettings.url, apiSettings.key, secondaryModel, memoryMessages, { temperature: 0.1 }, (apiSettings.timeout || 60) * 1000
            );
            
            const memoryUsage = memoryData?.usage;
            if (memoryUsage) {
                const memoryPromptTokens = memoryUsage.prompt_tokens || 0;
                const memoryCachedTokens = memoryUsage.prompt_cache_hit_tokens ||
                    (memoryUsage.prompt_tokens_details && memoryUsage.prompt_tokens_details.cached_tokens) || 0;
                const memoryHitRate = memoryPromptTokens > 0 ? ((memoryCachedTokens / memoryPromptTokens) * 100).toFixed(1) : '0.0';
                console.log(`[副模型缓存统计] 命中率: ${memoryHitRate}%`);
            }

            const memoryResponseText = memoryData.choices?.[0]?.message?.content || '';

            let memoryOpsApplied = false;
            let memoryOps = null;
            try {
                memoryOps = parseMemoryOps(memoryResponseText);
            } catch (opsParseErr) {
                memoryOps = null;
            }

            if (memoryOps) {
                console.log('[结构化记忆] 检测到 memory_ops');
                try {
                    const opsEpisode = {
                        id: generateMemoryId('episode'),
                        contactId: contact.id,
                        type: 'memory_update',
                        content: conversationText,
                        source: 'secondary_model_memory_ops',
                        createdAt: Date.now(),
                        messageIds: [],
                        metadata: {
                            memoryOps,
                            oldMemoryLength: currentMemory.length
                        }
                    };
                    const opsEpSaved = await saveMemoryEpisode(opsEpisode);
                    if (opsEpSaved) {
                        console.log('[结构化记忆] memory_ops 已保存 episode:', opsEpisode.id);
                        const opsResult = await applyMemoryOps(contact, memoryOps, opsEpisode.id);
                        console.log('[结构化记忆] memory_ops 已应用:', opsResult);
                        console.log('[结构化记忆] 新增 facts:', opsResult.addedFacts.length);
                        console.log('[结构化记忆] 失效 facts:', opsResult.invalidatedFacts.length);
                        memoryOpsApplied = true;
                    }
                } catch (opsFlowErr) {
                    console.error('[结构化记忆] memory_ops 流程失败（不影响聊天）:', opsFlowErr);
                }
            }
            
            // 提取增量更新标签 (加上了上一次我们写的防弹衣正则清理)
            const diffRegex = /<memory_diff>([\s\S]*?)<\/memory_diff>/;
            const diffMatch = memoryResponseText.match(diffRegex);

            if (diffMatch) {
                console.log(">>> [副模型] 检测到【增量更新】指令，开始清理...");
                let diffJson = diffMatch[1].trim();
                diffJson = diffJson.replace(/^```json\s*/i, '');
                diffJson = diffJson.replace(/^```\s*/, '');
                diffJson = diffJson.replace(/```\s*$/, '');
                diffJson = diffJson.trim();
                
                console.log(">>> [副模型] 清理后的干净 JSON:", diffJson);

                let diffArray = null;
                try {
                    diffArray = JSON.parse(diffJson);
                } catch (parseErr) {
                    console.warn('[结构化记忆] diff JSON 解析失败，跳过结构化存储:', parseErr);
                }

                newMemoryTable = MemoryPatcher.applyDiff(currentMemory, diffJson);

                if (memoryOpsApplied) {
                    console.log('[结构化记忆] 已应用 memory_ops，本轮跳过 memory_diff 旁路 facts 保存');
                }

                if (Array.isArray(diffArray)) {
                    try {
                        await invalidateFactsFromMemoryDiffDelete(diffArray, contact);
                    } catch (invErr) {
                        console.error('[结构化记忆] memory_diff delete 失效流程异常（不影响聊天）:', invErr);
                    }
                }

                if (!memoryOpsApplied && diffArray !== null) {
                    if (!Array.isArray(diffArray)) {
                        console.warn('[结构化记忆] diff 解析结果不是数组，跳过结构化存储');
                    } else {
                        const episode = {
                            id: generateMemoryId('episode'),
                            contactId: contact.id,
                            type: 'memory_update',
                            content: conversationText,
                            source: 'secondary_model_memory_diff',
                            createdAt: Date.now(),
                            messageIds: [],
                            metadata: {
                                rawDiff: diffArray,
                                oldMemoryLength: currentMemory.length,
                                newMemoryLength: newMemoryTable != null ? newMemoryTable.length : 0
                            }
                        };
                        try {
                            const epSaved = await saveMemoryEpisode(episode);
                            if (epSaved) {
                                console.log('[结构化记忆] 已保存 episode:', episode.id);
                                const facts = convertMemoryDiffToFacts(diffArray, contact, episode.id);
                                const factsSaved = await saveMemoryFacts(facts);
                                if (factsSaved) {
                                    console.log('[结构化记忆] 已保存 facts 数量:', facts.length);
                                }
                            }
                        } catch (structuredErr) {
                            console.error('[结构化记忆] 旁路写入异常:', structuredErr);
                        }
                    }
                }
            } else if (!memoryOps) {
                console.log(">>> [副模型] 未检测到合规的增量标签，原样输出为：", memoryResponseText);
            }
        } catch (memError) {
            console.error(">>> [副模型] 后台提取记忆失败，跳过此次更新:", memError);
        }

        // ==========================================
        // 阶段三：处理聊天气泡、表情、红包
        // ==========================================
        // 清理一下可能被主模型意外带入的 memory 标签 (防漏)
        let cleanedResponse = fullResponseText.replace(/<memory_diff>[\s\S]*?<\/memory_diff>/g, '').replace(/<memory_table>[\s\S]*?<\/memory_table>/g, '').trim();

        const replies = splitAIReplyIntoBubbleLines(cleanedResponse, MIN_AI_BUBBLE_COUNT);
        const processedReplies = [];
        const normalizedReasoning = typeof reasoningContent === 'string' ? reasoningContent.trim() : '';
        
        const emojiTagRegex = /^<emoji>(.*?)<\/emoji>$/; 
        const redPacketRegex = /^\[red_packet:({.*})\]$/;

        for (const [index, reply] of replies.entries()) {
            const emojiMatch = reply.match(emojiTagRegex);
            const redPacketMatch = reply.match(redPacketRegex);
            const reasoningForReply = index === 0 ? normalizedReasoning : ''; // 思考过程只挂载在第一条消息上

            if (emojiMatch) {
                const foundEmoji = emojis.find(e => e.meaning === emojiMatch[1]);
                processedReplies.push({ 
                    type: foundEmoji ? 'emoji' : 'text', 
                    content: foundEmoji ? foundEmoji.meaning : reply, 
                    reasoning: reasoningForReply 
                });
            } else if (redPacketMatch) {
                try {
                    const packetData = JSON.parse(redPacketMatch[1]);
                    if (typeof packetData.amount === 'number') {
                         processedReplies.push({ type: 'red_packet', content: JSON.stringify(packetData), reasoning: reasoningForReply });
                         continue;
                    }
                } catch (e) {}
                processedReplies.push({ type: 'text', content: reply, reasoning: reasoningForReply });
            } else {
                processedReplies.push({ type: 'text', content: reply, reasoning: reasoningForReply });
            }
        }
        
        return { replies: processedReplies, newMemoryTable };

    } catch (error) {
        console.error('callAPI 调用失败:', error);
        throw error;
    }
}


/**
 * [MODIFIED] 直接从前端测试API连接，不再通过服务器代理。
 */
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
        // [MODIFIED] 直接调用前端API服务
        const data = await window.apiService.testConnection(url, key);
        
        // 尝试从API响应中获取模型列表，如果失败则默认为空数组
        const apiModels = data.data ? data.data.map(m => m.id) : [];

        // 【核心修正】: 合并来自API的模型列表和本地为该URL保存的自定义模型列表
        
        // 1. 获取当前正在测试的API URL
        const currentUrl = url; // 直接使用函数参数 'url'，更准确
        
        // 2. 从全局变量 customModelsByUrl 中查找已为该URL保存的自定义模型
        const customSavedModels = customModelsByUrl[currentUrl] || [];
        console.log(`[模型加载] API返回模型: ${apiModels.length}个, 为URL(${currentUrl})加载的本地模型: ${customSavedModels.length}个`);

        // 3. 使用Set数据结构来合并两个列表并自动去重，然后转回数组并排序
        const combinedModels = [...new Set([...apiModels, ...customSavedModels])].sort();
        console.log(`[模型加载] 合并后总模型数: ${combinedModels.length}个`);


        if (combinedModels.length === 0) {
            showToast('连接成功，但未找到任何可用模型');
            primarySelect.innerHTML = '<option>无可用模型</option>';
            secondarySelect.innerHTML = '<option>无可用模型</option>';
            // 即使没有模型，也要启用选择器，以便用户可以手动添加
            primarySelect.disabled = false;
            secondarySelect.disabled = false;
            return;
        }

        // 3. 使用合并后的最终列表来填充下拉框
        // 填充主要模型
        primarySelect.innerHTML = '';
        combinedModels.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            primarySelect.appendChild(option);
        });
        // 尝试恢复之前选择的模型
        primarySelect.value = apiSettings.model; 

        // 填充次要模型
        secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
        combinedModels.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            secondarySelect.appendChild(option);
        });
        // 尝试恢复之前选择的模型
        secondarySelect.value = apiSettings.secondaryModel || 'sync_with_primary';
        
        primarySelect.disabled = false;
        secondarySelect.disabled = false;
        showToast('连接成功，模型列表已更新');

    } catch (error) {
        primarySelect.innerHTML = '<option>连接失败</option>';
        secondarySelect.innerHTML = '<option>连接失败</option>';
        showToast(error.message);
    }
}

function handlePrimaryModelChange() {
    const primaryModel = document.getElementById('primaryModelSelect').value;
    const secondarySelect = document.getElementById('secondaryModelSelect');
    
    // 如果次要模型设置为"同步"，则在数据层面更新它
    if (apiSettings.secondaryModel === 'sync_with_primary') {
        // 不需要直接修改UI，保存时会处理
    }
}

/**
 * 辅助函数：将一个模型ID添加到主/次模型选择器中，如果它不存在的话
 * @param {string} modelId 要添加的模型ID
 */
function addModelToSelectors(modelId) {
    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');

    // 检查主选择器中是否已存在该选项
    if (!primarySelect.querySelector(`option[value="${modelId}"]`)) {
        const option1 = document.createElement('option');
        option1.value = modelId;
        option1.textContent = modelId;
        primarySelect.appendChild(option1);
    }

    // 检查次选择器中是否已存在该选项
    if (!secondarySelect.querySelector(`option[value="${modelId}"]`)) {
        const option2 = document.createElement('option');
        option2.value = modelId;
        option2.textContent = modelId;
        secondarySelect.appendChild(option2);
    }
}

/**
 * 核心功能：手动检查一个模型是否可用
 */
async function checkManualModel() {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const modelId = document.getElementById('manualModelInput').value.trim();

    if (!apiUrl || !apiKey || !modelId) {
        showToast('API URL, Key 和模型名称都不能为空');
        return;
    }

    const checkBtn = document.getElementById('checkModelBtn');
    const originalBtnText = checkBtn.textContent;
    checkBtn.disabled = true;
    checkBtn.textContent = '检查中...';

    try {
        // 使用你已有的 apiService 发送一个极简的测试请求
        await window.apiService.callOpenAIAPI(
            apiUrl,
            apiKey,
            modelId,
            [{ role: "user", content: "test" }], // 一个极简的测试消息
            { max_tokens: 1 }, // 我们只需要成功响应，不需要内容
            15000 // 设置15秒超时
        );

        // 如果请求成功，就将这个模型添加到下拉列表中
        addModelToSelectors(modelId);
        showToast(`模型 "${modelId}" 可用，已添加到列表！`);
        
        // ================== 新增代码开始 ==================
        // 确保持久化这个新模型
        if (!customModelsByUrl[apiUrl]) {
            customModelsByUrl[apiUrl] = []; // 如果这个URL还没有条目，则初始化一个数组
        }
        if (!customModelsByUrl[apiUrl].includes(modelId)) {
            customModelsByUrl[apiUrl].push(modelId); // 添加新模型
            await saveDataToDB(); // 立即保存到数据库
            console.log(`已为URL: ${apiUrl} 保存新模型: ${modelId}`);
        }
        // ================== 新增代码结束 ==================
        
        document.getElementById('manualModelInput').value = ''; // 成功后清空输入框

    } catch (error) {
        console.error(`检查模型 ${modelId} 失败:`, error);
        showToast(`模型 "${modelId}" 不可用或检查失败`);
    } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = originalBtnText;
    }
}

async function saveApiSettings(event) {
    event.preventDefault();
    apiSettings.url = document.getElementById('apiUrl').value;
    apiSettings.key = document.getElementById('apiKey').value;
    apiSettings.model = document.getElementById('primaryModelSelect').value;
    apiSettings.secondaryModel = document.getElementById('secondaryModelSelect').value;
    apiSettings.contextMessageCount = Math.min(
        CONTEXT_MESSAGE_MAX,
        Math.max(1, parseInt(document.getElementById('contextSlider').value, 10) || 10)
    );
    apiSettings.timeout = parseInt(document.getElementById('apiTimeout').value) || 60;
    
    // 【修改点 4】: 保存 Minimax 的设置
    // 假设你的HTML中输入框的ID是 minimaxGroupId 和 minimaxApiKey
    apiSettings.minimaxGroupId = document.getElementById('minimaxGroupId').value.trim();
    apiSettings.minimaxApiKey = document.getElementById('minimaxApiKey').value.trim();
    
    // 【新增】保存智谱 GLM API Key
    apiSettings.glmApiKey = document.getElementById('glmApiKey').value.trim();

    // 保存计费标准（元/百万Token）
    const readPrice = (id, fallback) => {
        const el = document.getElementById(id);
        const raw = el ? String(el.value ?? '').trim() : '';
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : fallback;
    };
    apiSettings.priceHit = readPrice('priceHit', 1.0);
    apiSettings.priceMiss = readPrice('priceMiss', 12.0);
    apiSettings.priceOut = readPrice('priceOut', 24.0);
    // 保存开关状态
    const showUsageStatsToggle = document.getElementById('showUsageStatsToggle');
    apiSettings.showUsageStats = showUsageStatsToggle ? showUsageStatsToggle.checked : true;
    
    await saveDataToDB();
    closeModal('apiSettingsModal');
    updateContextIndicator();
    updateStatsUI();
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

// =================================================================
// 辅助函数：将 File 对象转换为 Base64 字符串
// 我们可以把它放在 addEmoji 函数前面，方便调用
// =================================================================
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result); // reader.result 已经是 'data:image/png;base64,...' 格式
        reader.onerror = error => reject(error);
    });
}


// =================================================================
// 【核心修改】将 addEmoji 函数替换为下面的异步版本
// =================================================================
async function addEmoji(event) {
    event.preventDefault();
    const meaning = document.getElementById('emojiMeaning').value.trim();
    const urlValue = document.getElementById('emojiUrl').value.trim();

    if (!meaning) {
        showToast('必须填写表情含义');
        return;
    }
    if (emojis.some(e => e.meaning === meaning)) {
        showToast('该表情含义已存在，请使用其他名称。');
        return;
    }
    
    let newEmoji;
    const emojiId = Date.now().toString();

    try {
        if (selectedEmojiFile) {
            // 【修改】优先处理上传的文件，并将其转换为Base64
            showToast('正在转换图片...');
            const base64Url = await fileToBase64(selectedEmojiFile); // <-- 使用新函数
            
            newEmoji = { 
                id: emojiId,
                meaning: meaning,
                type: 'base64', // <-- 类型改为 'base64'
                url: base64Url    // <-- 存储Base64字符串
            };
            showToast('正在添加图片表情...');

        } else if (urlValue) {
            // 如果没有上传文件，但有URL，则按旧方式处理
            newEmoji = {
                id: emojiId,
                url: urlValue, 
                meaning: meaning,
                type: 'url' // 保持为 'url' 类型
            };
            showToast('正在添加链接表情...');
        } else {
            showToast('请上传表情图片或粘贴图片URL');
            return;
        }

        emojis.push(newEmoji);
        await saveDataToDB(); // 调用保存函数
        
        renderEmojiGrid(); // 重新渲染表情面板
        closeModal('addEmojiModal');
        
        // 清理工作
        event.target.reset();
        selectedEmojiFile = null;
        document.getElementById('emojiUploadStatus').textContent = '';

        showToast('表情添加成功');

    } catch (error) {
        console.error('添加表情失败:', error);
        showToast('图片转换或添加失败: ' + error.message);
    }
}

async function deleteEmoji(emojiId) {
    showConfirmDialog('删除确认', '确定要删除这个表情吗？', async () => {
        const emojiToDelete = emojis.find(e => e.id === emojiId);
        if (!emojiToDelete) return;

        // 从内存数组中移除
        emojis = emojis.filter(e => e.id !== emojiId);

        // 从 IndexedDB 中删除
        if (isIndexedDBReady) {
            const transaction = db.transaction(['emojis', 'emojiBlobs'], 'readwrite');
            const emojisStore = transaction.objectStore('emojis');
            await promisifyRequest(emojisStore.delete(emojiId));

            // 如果是 blob 类型，也要从 emojiBlobs 表中删除
            if (emojiToDelete.type === 'blob') {
                const emojiBlobsStore = transaction.objectStore('emojiBlobs');
                await promisifyRequest(emojiBlobsStore.delete(emojiId));
            }
            await promisifyTransaction(transaction);
        }
        
        renderEmojiGrid();
        showToast('表情已删除');
    });
}

// 将函数声明为 async，因为我们需要等待 getEmojiSrc
async function renderEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    
    // 使用 Promise.all 来并行获取所有表情的 URL
    const emojiItemsHtml = await Promise.all(emojis.map(async (emoji) => {
        try {
            const src = await getEmojiSrc(emoji);
            // 注意这里 onclick 传递的是完整的 emoji 对象
            const itemHtml = `
                <div class="emoji-item" data-emoji-id="${emoji.id}">
                    <img src="${src}">
                    <div class="emoji-delete-btn" onclick="event.stopPropagation(); deleteEmoji('${emoji.id}')">×</div>
                </div>
            `;
            return itemHtml;
        } catch (error) {
            console.error(`渲染表情 ${emoji.meaning} 失败:`, error);
            return ''; // 出错时返回空字符串
        }
    }));

    grid.innerHTML = emojiItemsHtml.join('');
    
    // 为每个 emoji-item 单独绑定事件，确保传递正确的对象
    grid.querySelectorAll('.emoji-item').forEach(item => {
        const emojiId = item.dataset.emojiId;
        const emojiObject = emojis.find(e => e.id === emojiId);
        if (emojiObject) {
            item.onclick = () => sendEmoji(emojiObject);
        }
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'add-emoji-btn';
    addBtn.textContent = '+ 添加表情';
    addBtn.onclick = showAddEmojiModal;
    grid.appendChild(addBtn);
}

async function sendRedPacket(event) {
    event.preventDefault();
    if (!currentContact) return;

    const amountInput = document.getElementById('redPacketAmount');
    const messageInput = document.getElementById('redPacketMessage');
    
    const amount = parseFloat(amountInput.value);
    const message = messageInput.value || '恭喜发财，大吉大利！';

    // 1. 检查金额是否有效
    if (isNaN(amount) || amount <= 0) {
        showToast('红包金额必须大于0');
        return;
    }

    // 2. 核心：检查钱包余额
    if (amount > userProfile.wallet.balance) {
        showToast('钱包余额不足，无法发送红包');
        return; // 余额不足，终止操作
    }

    // 3. 扣款并创建支出记录
    userProfile.wallet.balance -= amount;
    const transaction = {
        id: Date.now(),
        type: 'expense', // 交易类型：支出
        amount: amount,
        description: `给 ${currentContact.name} 发送了红包`,
        timestamp: new Date().toISOString()
    };
    userProfile.wallet.transactions.unshift(transaction); // 将记录添加到最前面

    // 4. 创建红包消息并发送（这部分和原来一样）
    const packetData = { amount: amount.toFixed(2), message };
    const packetMessage = { role: 'user', content: JSON.stringify(packetData), type: 'red_packet', time: new Date().toISOString(), senderId: 'user' };
    
    currentContact.messages.push(packetMessage);
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }
    currentContact.lastMessage = '[红包]';
    currentContact.lastTime = packetMessage.time;
    
    renderMessages(true);
    renderContactList();
    
    // 5. 保存所有更改到数据库
    await saveDataToDB();
    
    closeModal('redPacketModal');
    
    // 清空输入框以便下次使用
    amountInput.value = '';
    messageInput.value = '';
    
    await sendMessage(); // 触发AI回复
}

async function sendEmoji(emoji) {
    if (!currentContact) return;

    // 【核心修改】消息内容现在存储的是表情的"含义"，而不是URL
    currentContact.messages.push({ 
        role: 'user', 
        content: emoji.meaning, // 使用含义
        type: 'emoji', 
        time: new Date().toISOString(), 
        senderId: 'user' 
    });

    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }
    currentContact.lastMessage = `[表情] ${emoji.meaning}`;
    // 获取刚刚发送的表情消息的时间戳
    const userEmojiMessageTime = currentContact.messages[currentContact.messages.length - 1].time;
    currentContact.lastTime = userEmojiMessageTime;
    
    renderMessages(true);
    renderContactList();
    await updateContactInDB(currentContact);
    toggleEmojiPanel(true);

    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先设置API');
        return;
    }

    // 新增：判断当前聊天类型
    if (currentContact.type === 'group') {
        // 如果是群聊，调用群聊消息处理函数
        await sendGroupMessage();
    } else {
        // 如果是私聊，执行原来的逻辑
        showTypingIndicator();
        try {
            const { replies, newMemoryTable } = await callAPI(currentContact);
            hideTypingIndicator();
            if (newMemoryTable) {
                window.memoryTableManager.updateContactMemoryTable(currentContact, newMemoryTable);
                await updateContactInDB(currentContact);
            }
            if (!replies || replies.length === 0) {
                showTopNotification('AI没有返回有效回复');
                return;
            }
            for (const response of replies) {
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
                const aiMessage = { role: 'assistant', content: response.content, type: response.type, time: new Date().toISOString(), senderId: currentContact.id };
                currentContact.messages.push(aiMessage);
                if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                    currentlyDisplayedMessageCount++;
                }
                currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : '[表情]';
                currentContact.lastTime = aiMessage.time;
                renderMessages(true);
                renderContactList();
                await updateContactInDB(currentContact);
            }
        } catch (error) {
            hideTypingIndicator();
            console.error('AI回复错误:', error);
            showToast('AI回复失败');
        }
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
        currentContact.lastTime = new Date().toISOString();
        renderMessages(true); // 重新渲染
        renderContactList();
        await updateContactInDB(currentContact);
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
    
    currentContact.messages.splice(messageIndex, 1);

    // 如果删除的是已显示的消息，则更新计数
    const displayedMessagesStartRange = currentContact.messages.length - currentlyDisplayedMessageCount;
    if (messageIndex >= displayedMessagesStartRange) {
        currentlyDisplayedMessageCount = Math.max(0, currentlyDisplayedMessageCount - 1);
    }
    
    if (currentContact.messages.length > 0) {
        const lastMsg = currentContact.messages[currentContact.messages.length - 1];
        currentContact.lastMessage = lastMsg.type === 'text' ? lastMsg.content.substring(0, 20) + '...' : (lastMsg.type === 'emoji' ? '[表情]' : '[红包]');
        currentContact.lastTime = lastMsg.time;
    } else {
        currentContact.lastMessage = '暂无消息';
        currentContact.lastTime = new Date().toISOString();
    }

    renderMessages(false); // 重新渲染，但不滚动到底部
    renderContactList();
    await updateContactInDB(currentContact);
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
        }

        renderContactList(); // 重新渲染联系人列表
        await saveDataToDB(); // 重新保存contacts数组到IndexedDB，确保数据同步
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
    // currentContact.messages[messageIndex].edited = true; // 已注释掉，不再标记为已编辑
    currentContact.messages[messageIndex].editTime = new Date().toISOString();
    
    // 重新渲染消息
    renderMessages(false);
    
    // 保存到数据库
    await updateContactInDB(currentContact);
    
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

/**
 * @description 显示钱包页面并渲染数据
 */
function showWalletPage() {
    // 切换到钱包页面
    showPage('walletPage');

    const balanceEl = document.getElementById('walletBalance');
    const transactionListEl = document.getElementById('transactionList');

    // 1. 更新余额显示，并格式化为两位小数
    balanceEl.textContent = `¥ ${userProfile.wallet.balance.toFixed(2)}`;

    // 2. 渲染交易记录列表
    transactionListEl.innerHTML = ''; // 先清空列表

    if (!userProfile.wallet.transactions || userProfile.wallet.transactions.length === 0) {
        transactionListEl.innerHTML = '<div class="transaction-empty">还没有任何交易记录</div>';
    } else {
        // 按照时间倒序排序交易记录
        const sortedTransactions = [...userProfile.wallet.transactions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        sortedTransactions.forEach(tx => {
            const item = document.createElement('div');
            item.className = 'transaction-item';

            const isIncome = tx.type === 'income';
            const amountClass = isIncome ? 'income' : 'expense'; // 根据类型设置不同样式
            const amountSign = isIncome ? '+' : '-';             // 根据类型设置不同符号
            const amountColorStyle = isIncome ? 'color: #28a745;' : 'color: #dc3545;'; // 直接内联颜色

            item.innerHTML = `
                <div class="transaction-details">
                    <div class="transaction-description">${tx.description}</div>
                    <div class="transaction-time">${formatChatTimestamp(tx.timestamp)}</div>
                </div>
                <div class="transaction-amount ${amountClass}" style="${amountColorStyle}">
                    ${amountSign}${tx.amount.toFixed(2)}
                </div>
            `;
            transactionListEl.appendChild(item);
        });
    }
}

/**
 * @description 用户点击领取红包
 * @param {number} messageIndex 红包消息在消息数组中的索引
 */
async function openRedPacket(messageIndex) {
    if (!currentContact || messageIndex >= currentContact.messages.length) {
        return;
    }

    const message = currentContact.messages[messageIndex];

    // ================== 新增代码开始 ==================
    // 检查红包发送者，如果是自己（'user'），则提示并中断函数
    if (message.senderId === 'user' || message.role === 'user') {
        showToast('您不能领取自己发送的红包');
        return;
    }
    // ================== 新增代码结束 ==================

    // 检查红包是否已被领取
    if (message.opened) {
        showToast('这个红包已经被领过啦');
        return;
    }

    try {
        const packet = JSON.parse(message.content);
        const amount = parseFloat(packet.amount);

        // 1. 更新钱包余额
        userProfile.wallet.balance += amount;

        // 2. 创建一条交易记录
        const transaction = {
            id: Date.now(),
            type: 'income', // 收入
            amount: amount,
            from: currentContact.name, // 红包来源
            description: `领取了 ${currentContact.name} 的红包`,
            timestamp: new Date().toISOString()
        };
        userProfile.wallet.transactions.unshift(transaction); // 加到记录数组的开头

        // 3. 标记红包为已打开
        message.opened = true;

        // 4. 保存所有更改到数据库
        await updateContactInDB(currentContact); // 只更新当前联系人（红包状态）
        await saveDataToDB(); // 同时需要保存用户钱包的变化

        // 5. 给用户反馈
        showToast(`领取成功！+${amount.toFixed(2)}元`);

    } catch (error) {
        console.error('打开红包失败:', error);
        showToast('打开红包失败，数据格式可能已损坏。');
    }
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

// 监听DOMContentLoaded事件，这是执行所有JS代码的入口
document.addEventListener('DOMContentLoaded', init);

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
        
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { 
                response_format: { type: "json_object" },
                temperature: 0.8 
            },
            (apiSettings.timeout || 60) * 1000
        );

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
                currentContact.lastTime = lastMsg.time;
            } else {
                currentContact.lastMessage = '暂无消息';
                currentContact.lastTime = new Date().toISOString();
            }
            
            // 更新当前显示的消息数量
            if (currentlyDisplayedMessageCount > currentContact.messages.length) {
                currentlyDisplayedMessageCount = currentContact.messages.length;
            }
            
            // 退出多选模式
            exitMultiSelectMode();
            
            // 重新渲染
            renderContactList();
            await updateContactInDB(currentContact);
            
            showToast(`已成功删除 ${selectedCount} 条消息`);
            
        } catch (error) {
            console.error('批量删除消息失败:', error);
            showToast('删除失败：' + error.message);
        }
    });
}


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

/**
 * 【新增】将自定义气泡的CSS注入到主文档中
 * @param {string} css - 要注入的CSS字符串
 */
function injectCustomBubbleCSS(css) {
    const styleId = 'custom-bubble-style-sheet';
    let styleTag = document.getElementById(styleId);
    // 如果样式表已存在，先移除，以便更新
    if (styleTag) {
        styleTag.remove();
    }
    // 如果没有css内容，则不创建
    if (!css || css.trim() === '/* CSS 已内联，此部分为空 */') {
        return;
    }
    styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.innerHTML = css;
    document.head.appendChild(styleTag);
}

/**
 * 【新增】保存自定义气泡样式到IndexedDB
 */
// 保留此函数是为了兼容性，但实际上我们已经迁移到新的气泡样式库
async function saveCustomBubbleStyle() {
    // 此函数已不再使用
    console.log('saveCustomBubbleStyle 函数已被弃用，使用 saveBubbleStylesToDB 代替');
}

/**
 * 【新增】将整个气泡样式库保存到IndexedDB
 */
async function saveBubbleStylesToDB() {
    if (!isIndexedDBReady) return;
    try {
        const transaction = db.transaction(['bubbleStyles'], 'readwrite');
        const store = transaction.objectStore('bubbleStyles');
        // 我们用一个固定的'styles' ID来存储整个样式库对象
        await promisifyRequest(store.put({ id: 'styles', data: bubbleStyles }));
        await promisifyTransaction(transaction);
        console.log('气泡样式库已保存。');
    } catch (error) {
        console.error('保存气泡样式库失败:', error);
        showToast('保存样式库失败');
    }
}

/**
 * 【新增】监听来自 iframe (气泡设计器) 的消息
 */
window.addEventListener('message', (event) => {
    // 安全性检查，确保消息是我们期望的类型
    if (event.data && event.data.type === 'apply-bubble-style') {
        console.log('从设计器收到新的命名气泡样式:', event.data.payload);

        const { id, name, html, css } = event.data.payload;

        // 【核心修改】将新样式存入样式库对象
        bubbleStyles[id] = { id, name, html, css };

        // 保存整个更新后的样式库到数据库
        saveBubbleStylesToDB();

        showToast(`新样式 "${name}" 已保存到样式库！`);
        // 注意：这里不再立即应用，而是等待用户为角色指定
    }
});

// =================================================================
// 新增：电话通讯功能
// =================================================================

// =================================================================
// 新增：电话通讯功能的核心辅助函数
// =================================================================

/**
 * @description 更新通话界面的状态显示
 * @param {string} text - 要显示的文本
 * @param {boolean} isListening - 是否应用"聆听中"的动画效果
 */
function updateCallStatus(text, isListening = false) {
    const statusEl = document.getElementById('callStatus');
    if (statusEl) {
        statusEl.textContent = text;
        if (isListening) {
            statusEl.classList.add('listening');
        } else {
            statusEl.classList.remove('listening');
        }
    }
}

/**
 * @description 开始录音，并设置一个自动停止的计时器（模拟人说完话后停顿）
 */
function startListening() {
    if (!isCallActive || !mediaRecorder) return;
    
    if (mediaRecorder.state === 'inactive') {
        audioChunks = [];
        mediaRecorder.start();
        updateCallStatus('我正在听...', true);

        // 如果用户在5秒内没有说话，自动停止录音并重新开始
        if (silenceTimeout) clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                console.log("检测到长时间静音，重新开始聆听。");
                mediaRecorder.stop(); // 停止录音，但onstop里会判断audioChunks为空，然后重新startListening
            }
        }, 5000); // 5秒静音检测
    }
}

/**
 * @description [新增] 将 AudioBuffer 重新采样到指定的目标采样率
 * @param {AudioBuffer} audioBuffer - 原始的 AudioBuffer
 * @param {number} targetSampleRate - 目标采样率 (例如: 16000)
 * @returns {Promise<AudioBuffer>} - 一个新的、重采样后的 AudioBuffer
 */
async function resampleAudioBuffer(audioBuffer, targetSampleRate) {
    // 如果原始采样率已经是目标采样率，则无需处理，直接返回
    if (audioBuffer.sampleRate === targetSampleRate) {
        console.log(`音频采样率已经是 ${targetSampleRate}Hz，无需重采样。`);
        return audioBuffer;
    }

    console.log(`正在将采样率从 ${audioBuffer.sampleRate}Hz 重采样到 ${targetSampleRate}Hz...`);

    // 计算新 buffer 的长度
    const duration = audioBuffer.duration;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const newLength = Math.round(duration * targetSampleRate);

    // 创建一个离线音频上下文，它的作用是在后台处理音频，而不直接播放
    // 关键在于，我们用目标采样率来创建这个上下文
    const offlineContext = new OfflineAudioContext(numberOfChannels, newLength, targetSampleRate);

    // 创建一个音频源节点，并将原始的、未重采样的音频数据放入其中
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // 将音频源连接到离线上下文的"扬声器"（目的地）
    source.connect(offlineContext.destination);

    // 开始播放（在后台），这将触发重采样过程
    source.start(0);

    // 开始渲染，这个过程会返回一个 Promise，
    // 当所有音频处理（包括重采样）完成后，Promise 会解析为一个新的 AudioBuffer
    const resampledBuffer = await offlineContext.startRendering();
    
    console.log("重采样完成。");
    return resampledBuffer;
}

/**
 * @description [全新替换] 将 AudioBuffer 转换为 API 兼容的单声道16-bit WAV格式的Blob
 * @param {AudioBuffer} audioBuffer - 经过重采样后的 AudioBuffer
 * @returns {Blob} 标准的单声道 WAV 格式的 Blob 对象
 */
function audioBufferToMonoWav(audioBuffer) {
    const buffer = audioBuffer;
    
    // 我们强制输出单声道
    const numberOfChannels = 1; 
    // 我们强制输出 16-bit 位深
    const bitsPerSample = 16;
    
    const sampleRate = buffer.sampleRate;
    const blockAlign = numberOfChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const bufferSize = 44 + dataSize; // 文件总大小

    const resultBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(resultBuffer);
    let pos = 0;

    // 辅助函数：写入字符串
    function writeString(str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(pos++, str.charCodeAt(i));
        }
    }

    // 写入标准WAV文件头
    writeString('RIFF');
    view.setUint32(pos, 36 + dataSize, true); pos += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(pos, 16, true); pos += 4; // Sub-chunk size
    view.setUint16(pos, 1, true); pos += 2; // PCM format
    view.setUint16(pos, numberOfChannels, true); pos += 2; // Mono
    view.setUint32(pos, sampleRate, true); pos += 4;
    view.setUint32(pos, byteRate, true); pos += 4;
    view.setUint16(pos, blockAlign, true); pos += 2;
    view.setUint16(pos, bitsPerSample, true); pos += 2;
    writeString('data');
    view.setUint32(pos, dataSize, true); pos += 4;

    // 将多声道数据混合为单声道并写入
    const monoChannel = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const channelData = buffer.getChannelData(i);
        for (let j = 0; j < buffer.length; j++) {
            // 在混合时累加
            monoChannel[j] += channelData[j];
        }
    }
    // 取平均值
    for (let i = 0; i < buffer.length; i++) {
        monoChannel[i] /= buffer.numberOfChannels;
    }

    // 写入16-bit PCM数据
    for (let i = 0; i < monoChannel.length; i++) {
        let sample = Math.max(-1, Math.min(1, monoChannel[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * @description 处理录制的音频、获取AI回复并播放
 * @param {Blob} audioBlob - 录制好的音频数据
 */
async function processAudioAndGetReply(audioBlob) {
    if (!isCallActive) return;

    try {
        // 1. 语音转文字 (STT)
        updateCallStatus('正在理解...', false);
        // 使用新的 GLM API 进行语音识别，替换旧的 Minimax STT
        const userText = await window.apiService.callGlmAsrAPI(audioBlob);

        if (!userText || userText.trim() === '') {
            console.log("STT 结果为空，重新聆听。");
            startListening();
            return;
        }

        // 2. 将识别的文本添加到聊天记录（可选，但推荐）
        const userMessage = { role: 'user', content: `[语音] ${userText}`, type: 'text', time: new Date().toISOString(), senderId: 'user' };
        currentContact.messages.push(userMessage);
        
        // 3. 调用AI获取回复
        updateCallStatus('正在思考...', false);
        // 我们复用已有的 callAPI 函数，但只处理第一个回复
        const { replies } = await callAPI(currentContact);
        
        if (!replies || replies.length === 0) {
            throw new Error("AI没有返回有效回复。");
        }
        
        let aiReplyText = replies[0].content; // 只取第一句回复
        
        // 【核心修复】检查并移除语音标记，防止被念出来
        if (aiReplyText.startsWith('[语音]:')) {
            aiReplyText = aiReplyText.substring(4).trim();
        }

        // 4. 将AI的回复也添加到聊天记录 (使用清理后的文本)
        const aiMessage = { role: 'assistant', content: aiReplyText, type: 'text', time: new Date().toISOString(), senderId: currentContact.id, forceVoice: true };
        currentContact.messages.push(aiMessage);
        await updateContactInDB(currentContact); // 保存聊天记录

        // 5. 文字转语音 (TTS) (使用清理后的文本)
        updateCallStatus('对方正在说话...', false);
        // 复用已有的 playVoiceMessage 逻辑，但需要找到一个播放器元素（我们可以临时创建一个）
        // 更好的方式是直接调用TTS逻辑
        await playAIVoice(aiReplyText);

    } catch (error) {
        console.error("处理语音并回复时出错:", error);
        showToast(`出错了: ${error.message}`);
        updateCallStatus('出错了，稍后重试', false);
        // 出错后，等待2秒再重新开始聆听
        setTimeout(() => {
            if (isCallActive) startListening();
        }, 2000);
    }
}

/**
 * @description 播放AI的语音回复，并在播放结束后重新开始聆听
 * @param {string} text - AI的文字回复
 */
async function playAIVoice(text) {
    if (!isCallActive) return;

    try {
        const ttsUrl = `https://api.minimax.chat/v1/text_to_speech?GroupId=${apiSettings.minimaxGroupId}`;
        const ttsResponse = await fetch(ttsUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiSettings.minimaxApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "voice_id": currentContact.voiceId,
                "text": text,
                "model": "speech-01"
            })
        });

        if (!ttsResponse.ok) throw new Error(`TTS API 错误: ${ttsResponse.status}`);

        const audioBlob = await ttsResponse.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        voiceAudio.src = audioUrl;
        voiceAudio.play();

        // 关键：监听语音播放结束事件
        voiceAudio.onended = () => {
            URL.revokeObjectURL(audioUrl); // 清理资源
            if (isCallActive) {
                // AI说完后，立即重新开始聆听用户的下一句话
                startListening();
            }
        };

    } catch (error) {
        console.error("播放AI语音失败:", error);
        showToast(`语音播放失败: ${error.message}`);
        // 即使播放失败，也要重新进入聆听状态
        if (isCallActive) startListening();
    }
}

/**
 * @description 【已重写】开始一个真正的语音通话
 */
async function startPhoneCall() {
    // 1. 检查并准备
    if (!currentContact) {
        showToast('请先选择一个聊天对象再进行通话');
        return;
    }
    if (!apiSettings.minimaxGroupId || !apiSettings.minimaxApiKey) {
        showToast('请在设置中配置 Minimax Group ID 和 API Key');
        return;
    }
    if (!currentContact.voiceId) {
        showToast('当前角色没有设置语音ID，无法通话');
        return;
    }

    // 2. 显示UI
    const modal = document.getElementById('phoneCallModal');
    const avatarEl = document.getElementById('callAvatar');
    const nameEl = document.getElementById('callName');
    
    nameEl.textContent = currentContact.name;
    avatarEl.innerHTML = currentContact.avatar 
        ? `<img src="${currentContact.avatar}" style="width:100%; height:100%; object-fit:cover;">` 
        : currentContact.name[0];
    
    modal.classList.add('active');
    updateCallStatus('正在连接...');

    // 3. 请求麦克风并设置MediaRecorder
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isCallActive = true;
        mediaRecorder = new MediaRecorder(stream);

        // 4. 定义录音器的事件处理
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        // [核心修改] 替换 mediaRecorder.onstop 的整个函数体
        mediaRecorder.onstop = async () => {
            if (!isCallActive) return; 
            if (audioChunks.length === 0) {
                console.log("没有录到音频，重新开始聆听。");
                startListening();
                return;
            }

            try {
                // 1. 组合录制的 WebM 数据块
                const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = []; // 清空缓存

                // 2. 转换为 ArrayBuffer 以便解码
                const arrayBuffer = await webmBlob.arrayBuffer();
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                // 3. 【新增步骤】将解码后的音频重采样到 16000Hz
                const resampledAudioBuffer = await resampleAudioBuffer(originalAudioBuffer, 16000);

                // 4. 【全新】调用一步到位的函数，直接生成单声道WAV文件
                const wavBlob = audioBufferToMonoWav(resampledAudioBuffer);

                // 5. 将最终的 WAV Blob 传递给处理函数
                await processAudioAndGetReply(wavBlob);

            } catch (error) {
                console.error("音频转换或处理失败:", error);
                showToast(`音频处理失败: ${error.message}`);
                // 即使失败也要重新开始聆听
                if (isCallActive) {
                    startListening();
                }
            }
        };
        
        // 5. 首次启动聆听
        updateCallStatus('接通了！请说话...', false);
        setTimeout(startListening, 1000); // 延迟一秒给用户反应时间

    } catch (err) {
        // ▼▼▼ 核心修改 ▼▼▼
        console.error("麦克风访问失败，错误类型:", err.name, "错误信息:", err.message);
        // ▲▲▲ 核心修改 ▲▲▲
        showToast("无法访问麦克风: " + err.name); // 提示更详细的错误类型
        endPhoneCall(); // 如果失败，则直接结束通话
    }
}

/**
 * @description 【已重写】结束电话呼叫并清理资源
 */
function endPhoneCall() {
    isCallActive = false; // 这是最重要的标志位，会中断所有正在进行的操作

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    
    // 停止任何可能正在播放的TTS语音
    if (voiceAudio && !voiceAudio.paused) {
        voiceAudio.pause();
        voiceAudio.src = '';
    }
    
    // 清理计时器和资源
    if (silenceTimeout) clearTimeout(silenceTimeout);
    mediaRecorder = null;
    audioChunks = [];

    // 关闭UI
    const modal = document.getElementById('phoneCallModal');
    modal.classList.remove('active');
    updateCallStatus('通话结束', false);
}
// =================================================================
// 新增：侧边栏功能逻辑
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 确保在DOM加载完毕后获取元素
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebarMenu = document.getElementById('sidebar-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    // 如果元素不存在，则不执行后续操作，防止报错
    if (!hamburgerBtn || !sidebarMenu || !sidebarOverlay) {
        console.error('Sidebar elements not found!');
        return;
    }

    // 打开侧边栏的函数
    function openSidebar() {
        sidebarMenu.classList.add('open');
        sidebarOverlay.classList.add('active');
    }

    // 关闭侧边栏的函数
    function closeSidebar() {
        sidebarMenu.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }

    // 点击汉堡按钮时，打开侧边栏
    hamburgerBtn.addEventListener('click', openSidebar);

    // 点击遮罩层时，关闭侧边栏
    sidebarOverlay.addEventListener('click', closeSidebar);

    // --- 【新增功能】为侧边栏添加右滑关闭手势 ---
    let touchstartX = 0;
    let touchendX = 0;

    // 监听侧边栏上的手指触摸开始事件
    sidebarMenu.addEventListener('touchstart', function(event) {
        // 记录下手指开始滑动时的水平位置 (X坐标)
        touchstartX = event.changedTouches[0].screenX;
    }, false);

    // 监听侧边栏上的手指触摸结束事件
    sidebarMenu.addEventListener('touchend', function(event) {
        // 记录下手指离开屏幕时的水平位置 (X坐标)
        touchendX = event.changedTouches[0].screenX;
        // 调用处理函数来判断是否是有效的右滑
        handleSwipeGesture();
    }, false);

    function handleSwipeGesture() {
        // 检查滑动的方向和距离
        // 条件1: touchendX > touchstartX  (结束位置比开始位置更靠右，说明是向右滑)
        // 条件2: touchendX - touchstartX > 50 (滑动的距离要超过50像素，防止误触)
        if (touchendX - touchstartX > 50) {
            // 检查侧边栏当前是否是打开状态
            // 如果 class 列表中包含 'open'，说明它是打开的
            if (sidebarMenu.classList.contains('open')) {
                // 调用我们已经写好的 closeSidebar 函数来关闭它
                closeSidebar();
            }
        }
    }
    // --- 【新增功能结束】 ---
});

// 这是一个辅助函数，用于处理侧边栏项目的点击
// 它会先执行你指定的操作（比如打开一个弹窗），然后自动关闭侧边栏
/**
 * 【新增】处理从设置菜单点击"恢复默认气泡"的事件
 */
function handleRestoreDefaultBubble() {
    // 调用我们第一步创建的核心函数
    restoreDefaultBubbleStyle();
    // 操作后关闭菜单
    toggleSettingsMenu(true);
}

function handleSidebarClick(actionFunction) {
    // 1. 执行传入的函数
    if (typeof actionFunction === 'function') {
        actionFunction();
    }
    
    // 2. 关闭侧边栏
    const sidebarMenu = document.getElementById('sidebar-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarMenu && sidebarOverlay) {
        sidebarMenu.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }
}

// =================================================================
// 新增：处理来自气泡设计器 iframe 的消息
// =================================================================

/**
 * 监听并处理来自气泡设计器iframe的消息请求
 * @param {MessageEvent} event - 消息事件对象
 */
async function handleBubbleDesignerMessages(event) {
    // 安全性检查：可以简单地通过消息类型来判断是否是我们需要的消息
    if (!event.data || !event.data.type || !event.data.type.startsWith('BUBBLE_')) {
        return;
    }

    if (!isIndexedDBReady) {
        console.error('主应用数据库尚未准备好，无法处理贴图请求');
        return;
    }

    const { type, payload } = event.data;

    try {
        switch (type) {
            // iframe准备就绪，请求获取所有贴图
            case 'BUBBLE_DESIGNER_READY': {
                const transaction = db.transaction(['bubbleStickers'], 'readonly');
                const store = transaction.objectStore('bubbleStickers');
                const stickers = await promisifyRequest(store.getAll());
                // 将贴图数据发送回iframe
                event.source.postMessage({ type: 'LOAD_STICKERS', payload: stickers }, event.origin);
                break;
            }

            // iframe请求保存（新增或更新）一个贴图
            case 'SAVE_STICKER': {
                const transaction = db.transaction(['bubbleStickers'], 'readwrite');
                const store = transaction.objectStore('bubbleStickers');
                await promisifyRequest(store.put(payload)); // put方法会自动处理新增和更新
                console.log('贴图已保存到IndexedDB:', payload.id);
                break;
            }

            // iframe请求删除一个贴图
            case 'DELETE_STICKER': {
                const transaction = db.transaction(['bubbleStickers'], 'readwrite');
                const store = transaction.objectStore('bubbleStickers');
                await promisifyRequest(store.delete(payload)); // payload此时是stickerId
                console.log('贴图已从IndexedDB删除:', payload);
                break;
            }
            
            // 【新增】iframe请求恢复默认气泡
            case 'BUBBLE_RESTORE_DEFAULT': {
                await restoreDefaultBubbleStyle();
                break;
            }
        }
    } catch (error) {
        console.error(`处理iframe消息时发生错误 (类型: ${type}):`, error);
    }
}

/**
 * 【新增】恢复默认气泡样式的核心函数
 */
async function restoreDefaultBubbleStyle() {
    try {
        // 我们可以保留这个函数用于重置当前联系人的气泡样式
        if (currentContact && currentContact.bubbleStyleId) {
            // 清除当前联系人的气泡样式ID
            currentContact.bubbleStyleId = '';
            
            // 保存更改
            await updateContactInDB(currentContact);
            
            // 重新渲染当前聊天
            renderMessages(true);
            
            showToast('已为当前联系人恢复默认气泡样式');
        } else {
            showToast('当前联系人未设置自定义气泡样式');
        }
    } catch (error) {
        console.error('恢复默认气泡样式失败:', error);
        showToast('操作失败');
    }
}

// 在主窗口上添加消息监听器
window.addEventListener('message', handleBubbleDesignerMessages);

let memoryFactsShowInactive = false;
let memoryFactsCacheForUI = [];
let lastTriggeredMemoryFactsDebug = {
    contactId: null,
    contactName: '',
    queryText: '',
    triggeredAt: null,
    facts: []
};

window.lastTriggeredMemoryFactsDebug = lastTriggeredMemoryFactsDebug;

function setLastTriggeredMemoryFactsDebug(contact, queryText, facts) {
    lastTriggeredMemoryFactsDebug = {
        contactId: contact?.id || null,
        contactName: contact?.name || '',
        queryText: String(queryText || ''),
        triggeredAt: Date.now(),
        facts: Array.isArray(facts) ? facts : []
    };

    window.lastTriggeredMemoryFactsDebug = lastTriggeredMemoryFactsDebug;

    if (typeof renderLastTriggeredMemoryFactsPanel === 'function') {
        renderLastTriggeredMemoryFactsPanel();
    }
}

/**
 * 切换记忆面板中的标签页 (记忆表格 / 世界书 / 记忆条目)
 * @param {string} tabName - 'table' | 'worldbook' | 'facts'
 */
function switchMemoryTab(tabName) {
    const memoryView = document.getElementById('memoryTableViewWrapper');
    const worldBookView = document.getElementById('worldBookViewWrapper');
    const memoryFactsView = document.getElementById('memoryFactsViewWrapper');
    const tabMemory = document.getElementById('tabMemoryTable');
    const tabWorldBook = document.getElementById('tabWorldBook');
    const tabMemoryFacts = document.getElementById('tabMemoryFacts');
    const editBtn = document.getElementById('memoryEditBtn');

    memoryView.style.display = 'none';
    worldBookView.style.display = 'none';
    if (memoryFactsView) {
        memoryFactsView.style.display = 'none';
    }

    tabMemory.classList.remove('active');
    tabWorldBook.classList.remove('active');
    if (tabMemoryFacts) {
        tabMemoryFacts.classList.remove('active');
    }

    if (tabName === 'table') {
        memoryView.style.display = 'block';
        tabMemory.classList.add('active');
        editBtn.style.display = 'block';
        return;
    }

    editBtn.style.display = 'none';

    if (tabName === 'worldbook') {
        worldBookView.style.display = 'flex';
        tabWorldBook.classList.add('active');
        renderWorldBookUI();
        return;
    }

    if (tabName === 'facts') {
        if (memoryFactsView) {
            memoryFactsView.style.display = 'flex';
        }
        if (tabMemoryFacts) {
            tabMemoryFacts.classList.add('active');
        }
        renderMemoryFactsUI(false);
        renderLastTriggeredMemoryFactsPanel();
        return;
    }
}

/**
 * 渲染当前角色的世界书UI
 */
function renderWorldBookUI() {
    if (!currentContact) return;

    const listContainer = document.getElementById('worldBookList');
    listContainer.innerHTML = '';

    const worldBook = currentContact.worldBook || [];

    if (worldBook.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">还没有条目，在下方添加一个吧！</p>';
    } else {
        worldBook.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'world-book-item';
            itemEl.innerHTML = `
                <div class="world-book-item-header">
                    <div class="world-book-item-keywords">${escapeHtml(item.keywords)}</div>
                    <div class="world-book-item-actions">
                        <button onclick="editWorldBookEntry(${index})">编辑</button>
                        <button class="delete" onclick="deleteWorldBookEntry(${index})">删除</button>
                    </div>
                </div>
                <div class="world-book-item-entry">${escapeHtml(item.entry)}</div>
            `;
            listContainer.appendChild(itemEl);
        });
    }
}

/**
 * 保存(新增或修改)一个世界书条目
 */
async function saveWorldBookEntry(event) {
    event.preventDefault();
    if (!currentContact) return;

    const keywords = document.getElementById('worldBookKeywords').value.trim();
    const entry = document.getElementById('worldBookEntry').value.trim();
    const index = document.getElementById('worldBookEntryIndex').value;

    if (!keywords || !entry) {
        showToast('关键词和条目内容均不能为空');
        return;
    }

    if (!currentContact.worldBook) {
        currentContact.worldBook = [];
    }

    const newEntry = { keywords, entry };

    if (index !== '') {
        // 编辑模式
        currentContact.worldBook[parseInt(index)] = newEntry;
        showToast('条目已更新');
    } else {
        // 新增模式
        currentContact.worldBook.push(newEntry);
        showToast('条目已添加');
    }

    await updateContactInDB(currentContact);
    renderWorldBookUI();

    // 重置表单
    document.getElementById('worldBookForm').reset();
    document.getElementById('worldBookEntryIndex').value = '';
    document.getElementById('cancelEditWorldBookBtn').style.display = 'none';
}

/**
 * 进入编辑世界书条目的状态
 * @param {number} index - 条目的索引
 */
function editWorldBookEntry(index) {
    if (!currentContact || !currentContact.worldBook || !currentContact.worldBook[index]) return;

    const item = currentContact.worldBook[index];
    document.getElementById('worldBookKeywords').value = item.keywords;
    document.getElementById('worldBookEntry').value = item.entry;
    document.getElementById('worldBookEntryIndex').value = index;

    // 显示取消编辑按钮并滚动到表单
    const cancelBtn = document.getElementById('cancelEditWorldBookBtn');
    cancelBtn.style.display = 'block';
    cancelBtn.onclick = () => {
         document.getElementById('worldBookForm').reset();
         document.getElementById('worldBookEntryIndex').value = '';
         cancelBtn.style.display = 'none';
    };

    document.getElementById('worldBookForm').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 删除一个世界书条目
 * @param {number} index - 条目的索引
 */
function deleteWorldBookEntry(index) {
    if (!currentContact || !currentContact.worldBook) return;

    showConfirmDialog('删除确认', '确定要删除这个世界书条目吗？', async () => {
        currentContact.worldBook.splice(index, 1);
        await updateContactInDB(currentContact);
        renderWorldBookUI();
        showToast('条目已删除');
    });
}

function formatMemoryFactTime(timestamp) {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '未知时间';
    return date.toLocaleString('zh-CN');
}

function renderLastTriggeredMemoryFactsPanel() {
    const container = document.getElementById('lastTriggeredFactsContent');
    if (!container) return;

    const debug = window.lastTriggeredMemoryFactsDebug || lastTriggeredMemoryFactsDebug;

    if (!debug || !debug.triggeredAt || !Array.isArray(debug.facts)) {
        container.innerHTML = '暂无触发记录。';
        return;
    }

    if (currentContact && debug.contactId && currentContact.id !== debug.contactId) {
        container.innerHTML = `当前显示的是其他角色的触发记录：${escapeHtml(debug.contactName || '未知角色')}`;
        return;
    }

    const timeText = new Date(debug.triggeredAt).toLocaleString();

    if (debug.facts.length === 0) {
        container.innerHTML = `
            <div>时间：${escapeHtml(timeText)}</div>
            <div style="margin-top:4px;">本轮没有命中结构化记忆。</div>
            <details style="margin-top:6px;">
                <summary>查看本轮检索 query</summary>
                <pre style="white-space:pre-wrap; font-size:11px;">${escapeHtml(debug.queryText || '')}</pre>
            </details>
        `;
        return;
    }

    const factsHtml = debug.facts.map((fact, index) => {
        const m = fact.metadata || {};
        const score = typeof fact._retrievalScore === 'number'
            ? Math.round(fact._retrievalScore * 10) / 10
            : '未知';

        return `
            <div style="padding:8px; margin-top:8px; border:1px solid #eee; border-radius:6px; background:white;">
                <div style="font-weight:600;">${index + 1}. ${escapeHtml(fact.factText || fact.object || '(空记忆)')}</div>
                <div style="margin-top:4px;">score：${escapeHtml(String(score))}</div>
                <div>subject：${escapeHtml(fact.subject || '')}</div>
                <div>predicate：${escapeHtml(fact.predicate || '')}</div>
                <div>type：${escapeHtml(String(m.type || '未知'))} ｜ timeScope：${escapeHtml(String(m.timeScope || '未知'))}</div>
                <div>importance：${escapeHtml(String(fact.importance ?? '未知'))} ｜ confidence：${escapeHtml(String(fact.confidence ?? '未知'))}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div>时间：${escapeHtml(timeText)}</div>
        <div>角色：${escapeHtml(debug.contactName || '')}</div>
        <div>命中数量：${debug.facts.length}</div>

        <details style="margin-top:6px;">
            <summary>查看本轮检索 query</summary>
            <pre style="white-space:pre-wrap; font-size:11px;">${escapeHtml(debug.queryText || '')}</pre>
        </details>

        ${factsHtml}
    `;
}

async function renderMemoryFactsUI(showInactive = memoryFactsShowInactive) {
    if (!currentContact) return;

    memoryFactsShowInactive = !!showInactive;

    const listEl = document.getElementById('memoryFactsList');
    const searchInputEl = document.getElementById('memoryFactsSearchInput');
    if (!listEl) return;

    const searchTerm = String(searchInputEl?.value || '').trim().toLowerCase();
    const facts = await getMemoryFactsByContact(currentContact.id, {
        activeOnly: !memoryFactsShowInactive
    });
    memoryFactsCacheForUI = Array.isArray(facts) ? facts.slice() : [];

    const filtered = memoryFactsCacheForUI
        .filter(fact => {
            if (!searchTerm) return true;
            const metadata = fact && fact.metadata ? fact.metadata : {};
            const fields = [
                fact?.subject,
                fact?.predicate,
                fact?.object,
                fact?.factText,
                metadata?.type,
                metadata?.timeScope
            ];
            return fields.some(v => String(v || '').toLowerCase().includes(searchTerm));
        })
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    if (filtered.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">没有匹配的结构化记忆条目。</p>';
        return;
    }

    listEl.innerHTML = '';
    filtered.forEach(fact => {
        const itemEl = document.createElement('div');
        itemEl.className = 'world-book-item';

        const isActive = fact.status === 'active' && (fact.validTo === null || fact.validTo === undefined);
        const statusText = isActive ? '有效' : '已删除';
        const statusColor = isActive ? '#07c160' : '#999';
        const importance = typeof fact.importance === 'number' ? fact.importance : '-';
        const confidence = typeof fact.confidence === 'number' ? fact.confidence : '-';
        itemEl.innerHTML = `
            <div class="world-book-item-header">
                <div class="world-book-item-keywords">${escapeHtml(String(fact.subject || '(空主体)'))} · ${escapeHtml(String(fact.predicate || '(空字段)'))}</div>
                <div class="world-book-item-actions">
                    <button onclick="editMemoryFactFromUI('${String(fact.id).replace(/'/g, "\\'")}')">编辑</button>
                    ${
                        isActive
                            ? `<button class="delete" onclick="softDeleteMemoryFactFromUI('${String(fact.id).replace(/'/g, "\\'")}')">软删除</button>`
                            : `<button onclick="restoreMemoryFactFromUI('${String(fact.id).replace(/'/g, "\\'")}')">恢复</button>`
                    }
                </div>
            </div>
            <div class="world-book-item-entry">
                <div><strong>内容:</strong> ${escapeHtml(String(fact.factText || fact.object || ''))}</div>
                <div style="margin-top: 4px;"><strong>主体/关系:</strong> ${escapeHtml(String(fact.subject || ''))} / ${escapeHtml(String(fact.predicate || ''))}</div>
                <div style="margin-top: 6px; font-size: 12px; color: #888;">
                    类型/时间域: ${escapeHtml(String(fact?.metadata?.type || '-'))} / ${escapeHtml(String(fact?.metadata?.timeScope || '-'))}
                </div>
                <div style="margin-top: 2px; font-size: 12px; color: #888;">
                    · importance: ${importance}
                    · confidence: ${confidence}
                    · status: <span style="color:${statusColor};">${statusText}</span>
                </div>
                <div style="margin-top: 2px; font-size: 12px; color: #aaa;">
                    创建: ${escapeHtml(formatMemoryFactTime(fact.createdAt))}
                    · 更新: ${escapeHtml(formatMemoryFactTime(fact.updatedAt || fact.createdAt))}
                </div>
            </div>
        `;
        listEl.appendChild(itemEl);
    });
}

function editMemoryFactFromUI(factId) {
    const target = memoryFactsCacheForUI.find(f => f && f.id === factId);
    if (!target) {
        showToast('未找到该记忆条目');
        return;
    }

    document.getElementById('memoryFactEditId').value = target.id || '';
    document.getElementById('memoryFactSubject').value = target.subject || '';
    document.getElementById('memoryFactPredicate').value = target.predicate || '';
    document.getElementById('memoryFactObject').value = target.object || '';
    document.getElementById('memoryFactText').value = target.factText || '';
    document.getElementById('memoryFactImportance').value = typeof target.importance === 'number' ? target.importance : 0.5;
    document.getElementById('memoryFactConfidence').value = typeof target.confidence === 'number' ? target.confidence : 0.7;

    const formEl = document.getElementById('memoryFactEditForm');
    formEl.style.display = 'block';
    formEl.scrollIntoView({ behavior: 'smooth' });
}

function cancelMemoryFactEdit() {
    const formEl = document.getElementById('memoryFactEditForm');
    if (formEl) {
        formEl.reset();
        formEl.style.display = 'none';
    }
    const idEl = document.getElementById('memoryFactEditId');
    if (idEl) idEl.value = '';
}

async function saveMemoryFactFromUI(event) {
    event.preventDefault();
    if (!currentContact) return;

    const id = document.getElementById('memoryFactEditId').value.trim();
    if (!id) {
        showToast('缺少条目ID，无法保存');
        return;
    }

    const oldFact = memoryFactsCacheForUI.find(f => f && f.id === id);
    if (!oldFact) {
        showToast('条目不存在或已更新，请刷新后重试');
        return;
    }

    const importanceRaw = Number(document.getElementById('memoryFactImportance').value);
    const confidenceRaw = Number(document.getElementById('memoryFactConfidence').value);
    const clamp01 = (n, fallback) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

    const updatedFact = {
        ...oldFact,
        subject: document.getElementById('memoryFactSubject').value.trim(),
        predicate: document.getElementById('memoryFactPredicate').value.trim(),
        object: document.getElementById('memoryFactObject').value.trim(),
        factText: document.getElementById('memoryFactText').value.trim(),
        importance: clamp01(importanceRaw, typeof oldFact.importance === 'number' ? oldFact.importance : 0.5),
        confidence: clamp01(confidenceRaw, typeof oldFact.confidence === 'number' ? oldFact.confidence : 0.7),
        updatedAt: Date.now()
    };

    const ok = await saveMemoryFact(updatedFact);
    if (!ok) {
        showToast('保存失败');
        return;
    }

    showToast('记忆条目已保存');
    cancelMemoryFactEdit();
    await renderMemoryFactsUI(memoryFactsShowInactive);
}

async function softDeleteMemoryFactFromUI(factId) {
    const target = memoryFactsCacheForUI.find(f => f && f.id === factId);
    if (!target) {
        showToast('未找到该记忆条目');
        return;
    }

    showConfirmDialog('软删除确认', '确定将该结构化记忆标记为已删除吗？', async () => {
        const updated = {
            ...target,
            status: 'inactive',
            validTo: Date.now(),
            updatedAt: Date.now(),
            metadata: {
                ...(target.metadata || {}),
                invalidationSource: 'manual_ui',
                invalidationReason: '用户在记忆条目面板手动删除'
            }
        };
        const ok = await saveMemoryFact(updated);
        if (!ok) {
            showToast('软删除失败');
            return;
        }
        showToast('已软删除');
        await renderMemoryFactsUI(memoryFactsShowInactive);
    });
}

async function restoreMemoryFactFromUI(factId) {
    const target = memoryFactsCacheForUI.find(f => f && f.id === factId);
    if (!target) {
        showToast('未找到该记忆条目');
        return;
    }

    const updated = {
        ...target,
        status: 'active',
        validTo: null,
        updatedAt: Date.now()
    };
    const ok = await saveMemoryFact(updated);
    if (!ok) {
        showToast('恢复失败');
        return;
    }
    showToast('已恢复为有效记忆');
    await renderMemoryFactsUI(memoryFactsShowInactive);
}

window.getLastTriggeredMemoryFacts = function() {
    return window.lastTriggeredMemoryFactsDebug;
};

/**
 * 根据聊天记录，找出触发了哪些世界书条目
 * @param {object} contact - 当前联系人对象
 * @param {Array<object>} messageHistory - 用于检查的消息历史记录
 * @returns {string} - 格式化好的、要补充给AI的设定文本，如果没有则返回空字符串
 */
function getTriggeredWorldBookEntries(contact, messageHistory) {
    if (!contact.worldBook || contact.worldBook.length === 0) {
        return '';
    }

    // 将消息历史拼接成一个长字符串，用于关键词检测
    const contextString = messageHistory.map(msg => msg.content).join(' ');
    const triggeredEntries = new Set(); // 使用Set确保每个条目只添加一次

    contact.worldBook.forEach(item => {
        // 将关键词字符串按中文逗号分割成数组
        const keywords = item.keywords.split('，'); 
        for (const keyword of keywords) {
            const trimmedKeyword = keyword.trim();
            // 如果关键词非空，并且在上下文中找到了该关键词
            if (trimmedKeyword && contextString.includes(trimmedKeyword)) {
                triggeredEntries.add(item.entry);
                break; // 只要触发一个关键词，就添加该条目，然后检查下一个条目
            }
        }
    });

    if (triggeredEntries.size === 0) {
        return ''; // 没有触发任何条目
    }

    // 将触发的条目格式化成AI易于理解的格式
    let supplementaryText = '[补充世界书设定]:\n';
    triggeredEntries.forEach(entry => {
        supplementaryText += `- ${entry}\n`;
    });
    return supplementaryText;
}

// 【【【 修改：App恢复/暂停事件监听器 】】】
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        console.log("App已恢复到前台...");
        
        // 1. 恢复待办事项检查
        setTimeout(processPendingTodoMessages, 500);
        
        // 2. 【关键修改】加上 await，等待结算彻底完成（发消息+删缓存）
        // 只有等这里运行完了，代码才会往下走
        await processProactiveMessagesResult();

        // 3. 此时缓存已经被删干净了，这里就会正确启动新的2分钟倒计时
        startProactiveTimer();
        
    } else {
        console.log("App进入后台...");
        // 用户离开，停止刷新。
        // 此时，最后一次设定的通知（1小时后触发）将生效。
        stopProactiveTimer();
    }
});
// 【【【 修改结束 】】】

// 触发文件选择的标准写法
function triggerFileSelect() {
    const fileInput = document.getElementById('importFileInput');
    if (!fileInput) {
        showToast('错误：找不到文件输入框');
        return;
    }
    // 使用 click() 方法触发原生选择器
    try {
        fileInput.click();
    } catch (e) {
        console.error(e);
        showToast('无法打开文件选择器，请检查存储权限');
    }
}

// 处理文件选择事件
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    
    // 检查文件类型
    if (!file.name.endsWith('.json')) {
        showToast('只支持 JSON 格式的备份文件');
        return;
    }
    
    // 调用导入函数（如果存在）
    if (typeof window.importDatabase === 'function') {
        window.importDatabase(file);
    } else {
        showToast('导入功能未初始化，请刷新页面后重试');
    }
    
    // 重置文件输入，允许再次选择同一文件
    event.target.value = '';
}

/**
 * 启动计时器 (App 启动/前台时调用)
 */
function startProactiveTimer() {
    // 1. 清理旧的计时器
    if (proactiveTimer) clearTimeout(proactiveTimer);
    if (proactiveRefreshTimer) clearInterval(proactiveRefreshTimer);

    // 2. 检查当前状态
    const hasPending = localStorage.getItem(PROACTIVE_STORAGE_KEY);
    
    if (hasPending) {
        // 如果已经有待发送的消息，说明用户回来了，立即推迟时间（续命）
        console.log("[主动关怀] 检测到待发送消息，进入续命模式。");
        refreshProactiveNotification(); 
    } else {
        // 如果没有消息，则启动 2 分钟生成倒计时
        console.log(`[主动关怀] 无待发送消息，启动2分钟生成倒计时...`);
        proactiveTimer = setTimeout(async () => {
            await generateProactiveMessage();
        }, PROACTIVE_TRIGGER_DELAY);
    }

    // 3. 启动看门狗循环：每 15 分钟执行一次推迟操作
    // 只要用户还在这里，通知就会无限期推迟
    proactiveRefreshTimer = setInterval(() => {
        refreshProactiveNotification();
    }, PROACTIVE_REFRESH_INTERVAL);
}

/**
 * 停止计时器 (App 后台/关闭时调用)
 */
function stopProactiveTimer() {
    console.log("[主动关怀] 用户离开，停止JS计时器，保留最后一次通知设置。");
    
    if (proactiveTimer) {
        clearTimeout(proactiveTimer);
        proactiveTimer = null;
    }
    
    if (proactiveRefreshTimer) {
        clearInterval(proactiveRefreshTimer);
        proactiveRefreshTimer = null;
    }
    
    // 离开时最后刷新一次，确保倒计时是从现在开始算起最精准
    refreshProactiveNotification(); 
}

/**
 * 更新顶部灰色统计小字的显示内容
 */
function updateStatsUI() {
    const el = document.getElementById('hitRateShort');
    const container = document.getElementById('usageStatsDisplay');
    
    if (!el || !container) return;

    // 1. 检查开关：如果用户在设置里关闭了，彻底隐藏
    if (apiSettings.showUsageStats === false) {
        container.style.display = 'none';
        return;
    }

    // 2. 检查数据：如果没有统计数据，也先隐藏
    if (!window.lastStats) {
        container.style.display = 'none';
        return;
    }

    // 3. 有数据且开启了开关，显示容器
    container.style.display = 'inline-block';
    
    const { hitRate, totalPrompt, cachedTokens, outputTokens, cost } = window.lastStats;
    
    if (showDetailedStats) {
        // 展开模式
        el.innerHTML = `命中:${hitRate}% | 缓存:${cachedTokens} | ￥${cost}`;
    } else {
        // 简洁模式
        el.innerHTML = `| 命中:${hitRate}%`;
    }
}

/**
 * 切换统计信息的展开状态
 */
function toggleUsageDetail() {
    showDetailedStats = !showDetailedStats;
    updateStatsUI();
}