/**
 * Formatting Utilities
 * 数据格式化相关的实用工具函数
 */

/**
 * HTML字符转义，防止XSS攻击
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的安全HTML文本
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/**
 * 格式化音乐播放时间 (秒 -> MM:SS格式)
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间字符串 (如: "3:45")
 */
function formatMusicTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化时间戳为相对时间显示 (统一版本)
 * @param {string|number|Date} timestamp - 时间戳
 * @param {Object} options - 格式化选项
 * @param {boolean} options.precise - 是否使用精确的"刚刚"判断 (默认true)
 * @returns {string} 格式化的时间字符串
 */
function formatTime(timestamp, options = {}) {
    if (!timestamp) return '';
    
    const { precise = true } = options;
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffInSeconds = (now - postTime) / 1000;
    const diffInMinutes = diffInSeconds / 60;
    const diffInHours = diffInMinutes / 60;

    // 使用日期边界而非24小时计算天数差异
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfPostTime = new Date(postTime.getFullYear(), postTime.getMonth(), postTime.getDate());
    const diffInDays = (startOfNow - startOfPostTime) / (1000 * 60 * 60 * 24);

    if (diffInDays < 1) { // 今天
        if (precise && diffInMinutes < 1) return "刚刚";
        if (diffInHours < 1) {
            const minutes = Math.max(1, Math.floor(diffInMinutes));
            return `${minutes}分钟前`;
        }
        return `${Math.floor(diffInHours)}小时前`;
    } else if (diffInDays < 2) { // 昨天
        return "1天前";
    } else { // 2天前及以上
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

/**
 * 格式化时间戳为相对时间显示 (兼容旧版本 - 无"刚刚"判断)
 * @param {string|number|Date} timestamp - 时间戳
 * @returns {string} 格式化的时间字符串
 */
function formatTimeLegacy(timestamp) {
    return formatTime(timestamp, { precise: false });
}

/**
 * 格式化联系人列表时间显示 (针对聊天列表优化)
 * @param {string} dateString - 时间字符串
 * @returns {string} 格式化的时间字符串
 */
function formatContactListTime(dateString) {
    // 处理空值或无效输入
    if (!dateString) return '';
    
    // 如果已经是格式化后的时间，直接返回
    if (typeof dateString === 'string' && (
        dateString === '刚刚' || 
        dateString.includes('分钟前') || 
        dateString.includes('小时前') ||
        dateString.includes('星期') ||
        dateString.includes('昨天') ||
        dateString.includes('前天') ||
        (dateString.includes(':') && !dateString.includes('T')) || // 排除ISO格式
        (dateString.includes('月') && dateString.includes('日'))
    )) {
        return dateString;
    }
    
    // 尝试解析日期
    let d;
    try {
        d = new Date(dateString);
        // 检查日期是否有效
        if (isNaN(d.getTime())) {
            console.warn('Invalid date string:', dateString);
            return '';
        }
    } catch (e) {
        console.warn('Error parsing date:', dateString, e);
        return '';
    }
    
    const now = new Date();
    const diff = now - d;
    
    // 如果时间在未来，可能是时区问题，使用当前时间
    if (diff < 0) {
        console.warn('Future timestamp detected, using current time:', dateString);
        d = now;
    }
    
    // 2分钟内显示"刚刚"
    if (diff < 2 * 60 * 1000) {
        return '刚刚';
    }
    
    // 2分钟后到1小时内显示"X分钟前"
    if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `${minutes}分钟前`;
    }
    
    // 1小时到24小时内显示"X小时前"
    if (diff < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return `${hours}小时前`;
    }

    // 获取今天、昨天、前天的日期（只比较日期部分）
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    
    // 昨天
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.getTime() === messageDate.getTime()) {
        return '昨天';
    }
    
    // 前天
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
    if (dayBeforeYesterday.getTime() === messageDate.getTime()) {
        return '前天';
    }
    
    // 一周内显示星期几
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (d >= weekAgo) {
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        return weekdays[d.getDay()];
    }
    
    // 今年内显示月日
    if (d.getFullYear() === now.getFullYear()) {
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
    
    // 其他显示年月日
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 格式化聊天时间戳 (针对聊天消息优化)
 * @param {string} dateString - 时间字符串
 * @returns {string} 格式化的时间字符串
 */
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

/**
 * 生成唯一ID
 * @returns {string} 唯一的ID字符串 (时间戳 + 随机字符串)
 */
function generateId() {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 将文件读取为Data URL格式
 * @param {File} file - 要读取的文件对象
 * @returns {Promise<string>} Promise，解析为Data URL字符串
 */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

/**
 * 将Canvas转换为Blob对象
 * @param {HTMLCanvasElement} canvas - Canvas元素
 * @returns {Promise<Blob>} Promise，解析为Blob对象
 */
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

/**
 * 移除文本中的思维链标签
 * @param {string} text - 包含思维链的文本
 * @returns {string} 清理后的文本
 */
function removeThinkingChain(text) {
    // 删除 <think> ... </think> 标签及其内容
    return text.replace(/<think\s*>[\s\S]*?<\/think\s*>/gi, '').trim();
}

/**
 * 安全创建IndexedDB事务
 * @param {IDBDatabase} db - 数据库对象
 * @param {string|Array} storeNames - 存储名称
 * @param {string} mode - 事务模式 ('readonly' | 'readwrite')
 * @returns {IDBTransaction} 事务对象
 */
function safeCreateTransaction(db, storeNames, mode = 'readonly') {
    if (!db) {
        throw new Error('数据库连接不可用');
    }
    
    // 检查所有存储是否存在
    const missingStores = Array.isArray(storeNames) 
        ? storeNames.filter(storeName => !db.objectStoreNames.contains(storeName))
        : !db.objectStoreNames.contains(storeNames) ? [storeNames] : [];
    
    if (missingStores.length > 0) {
        throw new Error(`存储不存在: ${missingStores.join(', ')}`);
    }
    
    return db.transaction(storeNames, mode);
}

/**
 * Promise化IndexedDB请求
 * @param {IDBRequest} request - IndexedDB请求对象
 * @param {string} operation - 操作描述（用于错误日志）
 * @returns {Promise} Promise对象
 */
function promisifyRequest(request, operation = '数据库操作') {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.error(`${operation}失败:`, request.error);
            reject(request.error);
        };
    });
}

/**
 * Promise化IndexedDB事务
 * @param {IDBTransaction} transaction - 事务对象
 * @param {string} operation - 操作描述（用于错误日志）
 * @returns {Promise} Promise对象
 */
function promisifyTransaction(transaction, operation = '数据库事务') {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            console.error(`${operation}失败:`, transaction.error);
            reject(transaction.error);
        };
        transaction.onabort = () => {
            console.error(`${operation}被中止:`, transaction.error);
            reject(transaction.error || new Error('事务被中止'));
        };
    });
}

// 兼容性：将函数分组暴露到全局window对象
if (typeof window !== 'undefined') {
    window.FormatUtils = {
        escapeHtml,
        formatMusicTime,
        formatTime,
        formatTimeLegacy,
        formatContactListTime,
        formatChatTimestamp,
        generateId,
        readFileAsDataURL,
        canvasToBlob,
        removeThinkingChain
    };
    
    window.DBUtils = {
        safeCreateTransaction,
        promisifyRequest,
        promisifyTransaction
    };
    
    // 向后兼容：保留直接挂载的函数（逐步废弃）
    window.escapeHtml = escapeHtml;
    window.formatMusicTime = formatMusicTime;
    window.formatTime = formatTime;
    window.formatTimeLegacy = formatTimeLegacy;
    window.formatContactListTime = formatContactListTime;
    window.formatChatTimestamp = formatChatTimestamp;
    window.generateId = generateId;
    window.readFileAsDataURL = readFileAsDataURL;
    window.canvasToBlob = canvasToBlob;
    window.removeThinkingChain = removeThinkingChain;
    window.safeCreateTransaction = safeCreateTransaction;
    window.promisifyRequest = promisifyRequest;
    window.promisifyTransaction = promisifyTransaction;
}