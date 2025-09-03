/**
 * 系统工具集 - 包含公告管理、日志系统和系统级功能
 */

// === 公告管理系统 ===
const announcementManager = (() => {
    const STORAGE_KEY = 'whale-llt-seen-announcements';
    const OLD_STORAGE_KEY = 'update-20250805-seen';
    const ANNOUNCEMENT_DIR = 'announcements/';

    // To add a new announcement:
    // 1. Create a new .md file in the /announcements/ directory.
    // 2. Add the filename (without .md) to the TOP of this list.
    const ANNOUNCEMENT_IDS = [
        '20250806',
        '20250805'
    ];

    function getSeenIds() {
        let seenIds = [];
        try {
            const storedValue = localStorage.getItem(STORAGE_KEY);
            if (storedValue) {
                seenIds = JSON.parse(storedValue);
            }
        } catch (e) {
            console.error("Failed to parse seen announcements:", e);
            seenIds = [];
        }

        // Migration from old system for existing users
        if (localStorage.getItem(OLD_STORAGE_KEY) === 'true') {
            if (!seenIds.includes('20250805')) {
                seenIds.push('20250805');
            }
            localStorage.removeItem(OLD_STORAGE_KEY);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(seenIds));
        }
        
        return seenIds;
    }

    async function getUnread() {
        const seenIds = getSeenIds();
        const unreadIds = ANNOUNCEMENT_IDS.filter(id => !seenIds.includes(id));

        if (unreadIds.length === 0) {
            return [];
        }

        try {
            const fetchPromises = unreadIds.map(id => 
                fetch(`${ANNOUNCEMENT_DIR}${id}.md`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Announcement ${id}.md not found.`);
                        }
                        return response.text();
                    })
                    .then(text => ({ id, content: text }))
            );
            
            const unreadAnnouncements = await Promise.all(fetchPromises);
            return unreadAnnouncements;

        } catch (error) {
            console.error("Failed to fetch announcements:", error);
            return []; // Return empty if any fetch fails
        }
    }

    function markAsSeen(idsToMark) {
        const seenIds = getSeenIds();
        const newSeenIds = [...new Set([...seenIds, ...idsToMark])]; 
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSeenIds));
    }

    return {
        getUnread,
        markAsSeen
    };
})();

// === 控制台日志捕获系统 ===
let consoleLogs = [];
const maxLogEntries = 500; // 限制日志条目数量避免内存过大

/**
 * 重写console方法来捕获日志
 */
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

/**
 * 传统下载方式的辅助函数
 */
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

/**
 * 导出日志功能
 */
function exportConsoleLogs() {
    try {
        if (consoleLogs.length === 0) {
            if (typeof showToast === 'function') showToast('没有日志可导出');
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
                    if (typeof showToast === 'function') showToast('分享成功');
                    // 关闭设置菜单
                    const settingsMenu = document.getElementById('settingsMenu');
                    if (settingsMenu) settingsMenu.style.display = 'none';
                }).catch((error) => {
                    console.log('分享取消或失败:', error);
                    // 如果分享失败，回退到传统下载方式
                    fallbackDownload(logContent, filename);
                    if (typeof showToast === 'function') showToast(`已导出 ${consoleLogs.length} 条日志`);
                    // 关闭设置菜单
                    const settingsMenu = document.getElementById('settingsMenu');
                    if (settingsMenu) settingsMenu.style.display = 'none';
                });
                return;
            }
        }
        
        // 回退到传统下载方式（PC端或不支持分享的移动端）
        fallbackDownload(logContent, filename);
        if (typeof showToast === 'function') showToast(`已导出 ${consoleLogs.length} 条日志`);
        
        // 关闭设置菜单
        const settingsMenu = document.getElementById('settingsMenu');
        if (settingsMenu) settingsMenu.style.display = 'none';
    } catch (error) {
        console.error('导出日志失败:', error);
        if (typeof showToast === 'function') showToast('导出日志失败: ' + error.message);
    }
}

/**
 * 调试日志页面功能
 */
function showDebugLogPage() {
    if (typeof showPage === 'function') {
        showPage('debugLogPage');
        updateDebugLogDisplay();
    }
}

function updateDebugLogDisplay() {
    const logContent = document.getElementById('debugLogContent');
    const logCount = document.getElementById('logCount');
    
    if (!logContent) return;
    
    if (consoleLogs.length === 0) {
        logContent.innerHTML = '<div class="debug-log-empty">暂无日志记录</div>';
        if (logCount) logCount.textContent = '0';
        return;
    }
    
    if (logCount) logCount.textContent = consoleLogs.length.toString();
    
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
    if (typeof showToast === 'function') showToast('已清空调试日志');
}

function copyDebugLogs() {
    if (consoleLogs.length === 0) {
        if (typeof showToast === 'function') showToast('没有日志可复制');
        return;
    }
    
    const logText = consoleLogs.map(log => 
        `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    // 尝试使用现代的Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logText).then(() => {
            if (typeof showToast === 'function') showToast(`已复制 ${consoleLogs.length} 条日志到剪贴板`);
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
            if (typeof showToast === 'function') showToast(`已复制 ${consoleLogs.length} 条日志到剪贴板`);
        } else {
            if (typeof showToast === 'function') showToast('复制失败，请手动选择文本');
        }
    } catch (err) {
        console.error('Fallback: 复制失败', err);
        if (typeof showToast === 'function') showToast('复制失败: ' + err.message);
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

// === 系统状态和错误处理 ===

/**
 * 全局错误处理 - 捕获未处理的Promise拒绝
 */
function initializeGlobalErrorHandling() {
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
        
        // 检查是否是API相关的错误，如果是则显示重试对话框
        const errorMessage = event.reason?.message || event.reason?.toString() || '';
        const isAPIError = errorMessage.includes('API请求失败') || 
                          errorMessage.includes('API Error') || 
                          errorMessage.includes('429') ||
                          errorMessage.includes('500') ||
                          errorMessage.includes('503') ||
                          errorMessage.includes('502') ||
                          errorMessage.includes('空回') ||
                          errorMessage.includes('AI回复内容为空') ||
                          errorMessage.includes('AI未返回有效内容');
        
        if (isAPIError && typeof showApiError === 'function') {
            showApiError(event.reason || new Error(errorMessage));
        }
        
        // 防止控制台显示未处理的错误（已记录）
        event.preventDefault();
    });
}

/**
 * Service Worker 注册
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').then(registration => {
                console.log('Service Worker 注册成功: ', registration);
            }).catch(registrationError => {
                console.log('Service Worker 注册失败: ', registrationError);
            });
        });
    }
}

/**
 * 特殊事件检查（如节日特殊处理）
 */
async function checkSpecialEvents() {
    try {
        const today = new Date();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        const dateString = `${month}-${day}`;
        
        console.log('当前日期检查:', dateString);
        
        // 检查是否为8月29日
        if (month === '08' && day === '29') {
            console.log('今天是七夕节！'); // 保持原有日志，因为这是具体的日期判断
            
            // 检查是否为今日第一次打开应用
            const lastSpecialEventVisit = localStorage.getItem('lastSpecialEventVisit');
            const todayString = today.toDateString();
            
            if (lastSpecialEventVisit !== todayString) {
                console.log('今日第一次打开应用，开始特殊事件流程');
                
                // 记录今日已访问
                localStorage.setItem('lastSpecialEventVisit', todayString);
                
                // 启动特殊事件流程（七夕节）
                if (window.startSpecialEventFlow && typeof window.startSpecialEventFlow === 'function') {
                    await window.startSpecialEventFlow('qixi');
                } else {
                    console.warn('startSpecialEventFlow 函数未找到');
                }
            } else {
                console.log('今日已处理过特殊事件流程');
            }
        }
    } catch (error) {
        console.error('特殊事件检查出错:', error);
    }
}

// 立即启用console捕获和全局错误处理
setupConsoleCapture();
initializeGlobalErrorHandling();

// 创建命名空间并暴露系统工具函数
window.SystemUtils = {
    announcementManager,
    consoleLogs,
    exportConsoleLogs,
    showDebugLogPage,
    updateDebugLogDisplay,
    clearDebugLogs,
    copyDebugLogs,
    escapeHtml,
    setupConsoleCapture,
    checkSpecialEvents,
    registerServiceWorker
};

// 为了向后兼容，保留一些关键的全局引用
// TODO: Remove these global assignments once all code is updated to use SystemUtils.
window.announcementManager = announcementManager;
window.escapeHtml = escapeHtml;
