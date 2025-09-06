/**
 * UI Utilities
 * 通用UI交互相关的实用工具函数
 */

/**
 * 显示Toast消息通知
 * @param {string} message - 要显示的消息内容
 * @param {string} type - 消息类型: 'info', 'success', 'warning', 'error'
 * @param {number} duration - 显示持续时间(毫秒)，默认3秒
 */
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

/**
 * 显示模态框
 * @param {string} modalId - 模态框的DOM元素ID
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('模态框不存在:', modalId);
        return;
    }
    modal.style.display = 'block';
    
    // 特定模态框的初始化逻辑
    if (modalId === 'apiSettingsModal' && window.apiSettings) {
        const contextSlider = document.getElementById('contextSlider');
        const contextValue = document.getElementById('contextValue');
        if (contextSlider && contextValue) {
            contextSlider.value = window.apiSettings.contextMessageCount;
            contextValue.textContent = window.apiSettings.contextMessageCount + '条';
        }
    }
}

/**
 * 关闭模态框并执行相关清理工作
 * @param {string} modalId - 模态框的DOM元素ID
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('要关闭的模态框不存在:', modalId);
        return;
    }
    modal.style.display = 'none';
    
    // 特定模态框的清理逻辑
    if (modalId === 'addContactModal') {
        // 重置编辑状态
        if (window.editingContact !== undefined) {
            window.editingContact = null;
        }
        
        // 重置表单
        const elements = {
            'contactModalTitle': '添加AI助手',
            'contactName': '',
            'contactAvatar': '',
            'contactPersonality': '',
            'customPrompts': '',
            'contactVoiceId': ''
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                if (element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA') {
                    element.value = value;
                } else {
                    element.textContent = value;
                }
            }
        });
    } else if (modalId === 'addEmojiModal') {
        // 清理表情包上传的临时数据
        cleanupEmojiUploadData();
    }
}

/**
 * 清理表情包上传临时数据的辅助函数
 */
function cleanupEmojiUploadData() {
    try {
        // 清理临时文件
        if (window.ImageUploadHandlers && window.ImageUploadHandlers.tempEmojiFile) {
            window.ImageUploadHandlers.tempEmojiFile = null;
        }
        
        // 清理临时URL
        const emojiUrlInput = document.getElementById('emojiUrl');
        if (emojiUrlInput && emojiUrlInput.value.startsWith('temp:')) {
            const tempUrl = emojiUrlInput.value.substring(5);
            URL.revokeObjectURL(tempUrl);
            emojiUrlInput.value = '';
        }
        
        // 清理文件输入
        const fileInput = document.getElementById('emojiUploadInput');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // 清理状态提示
        const statusElement = document.getElementById('emojiUploadStatus');
        if (statusElement) {
            statusElement.textContent = '';
            statusElement.style.color = '';
        }
        
        // 清理意思输入框
        const meaningInput = document.getElementById('emojiMeaning');
        if (meaningInput) {
            meaningInput.value = '';
        }
        
        console.log('表情包上传临时数据已清理');
    } catch (error) {
        console.warn('清理表情包临时数据时出错:', error);
    }
}

/**
 * 显示顶部通知消息（短暂显示）
 * @param {string} message - 要显示的通知消息
 */
function showTopNotification(message) {
    const notification = document.getElementById('topNotification');
    if (!notification) {
        console.warn('TopNotification元素不存在');
        return;
    }
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 1500);
}

/**
 * 显示确认对话框
 * @param {string} title - 对话框标题
 * @param {string} message - 对话框消息内容
 * @param {Function} onConfirm - 确认按钮的回调函数
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
 * 显示上传错误的专用处理函数
 * @param {Error|Object} error - 错误对象，可能包含DetailedError结构
 */
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

/**
 * 处理API错误的专用函数，包含详细的错误记录和重试功能
 * @param {string|Error} prefixOrError - 错误前缀字符串或错误对象
 * @param {Error} error - 错误对象（当第一个参数是前缀时）
 */
function showApiError(prefixOrError, error) {
    let errorMessage;
    let prefix = '';
    
    // 支持单参数和双参数调用
    if (typeof prefixOrError === 'string' && error) {
        // 双参数调用：showApiError('前缀', error)
        prefix = prefixOrError + ': ';
        errorMessage = error.message || '未知错误';
    } else {
        // 单参数调用：showApiError(error)
        errorMessage = prefixOrError.message || '未知错误';
    }
    
    // 记录ERROR级别的日志，包含完整的错误信息
    console.error('ERROR: API调用失败详情:', {
        errorMessage: errorMessage,
        error: error,
        apiResponse: error?.response || error?.apiResponse || error?.data || null,
        timestamp: new Date().toISOString(),
        networkStatus: navigator.onLine ? 'online' : 'offline',
        pageUrl: window.location.href
    });
    
    // 调用特殊的重试模态框处理
    if (typeof window.showQixiRetryModal === 'function') {
        window.showQixiRetryModal(prefixOrError, error, errorMessage, prefix);
    } else {
        // 后备方案：显示普通错误提示
        showToast(prefix + errorMessage, 'error', 4000);
    }
}

// 兼容性：将函数分组暴露到全局window对象
if (typeof window !== 'undefined') {
    window.UIUtils = {
        showToast,
        showModal,
        closeModal,
        showTopNotification,
        showConfirmDialog,
        showUploadError,
        showApiError
    };
    
    // 向后兼容：保留直接挂载的函数（逐步废弃）
    window.showToast = showToast;
    window.showModal = showModal;
    window.closeModal = closeModal;
    window.showTopNotification = showTopNotification;
    window.showConfirmDialog = showConfirmDialog;
    window.showUploadError = showUploadError;
    window.showApiError = showApiError;
}