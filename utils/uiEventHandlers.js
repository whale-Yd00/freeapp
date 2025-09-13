/**
 * 🎯 UnifiedDBManager 事件驱动UI处理器
 * 
 * 该文件展示了如何在UI层处理UnifiedDBManager发出的事件，
 * 实现完全的关注点分离。你可以将这些处理器集成到现有的uiManager.js中。
 * 
 * 设计原则：
 * - 数据库层只负责业务逻辑，不直接操作UI
 * - UI层只负责用户界面，通过事件监听获取状态
 * - 异步交互通过Promise + 事件回调实现
 */

// 初始化事件监听器
document.addEventListener('DOMContentLoaded', () => {
    initDatabaseUIEventHandlers();
});

function initDatabaseUIEventHandlers() {
    console.log('🎯 [UI] 初始化数据库事件处理器...');

    // 1. 文件下载处理 - 替代直接DOM操作
    window.addEventListener('database:downloadFile', (event) => {
        const { blob, url, filename, mimeType } = event.detail;
        
        try {
            // 创建下载链接并触发下载
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 清理资源
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            console.log('🎯 [UI] 文件下载成功:', filename);
        } catch (error) {
            console.error('🎯 [UI] 文件下载失败:', error);
            showUserMessage('文件下载失败: ' + error.message, 'error');
        }
    });

    // 2. 错误消息显示 - 替代alert()
    window.addEventListener('database:showError', (event) => {
        const { message, type } = event.detail;
        showUserMessage(message, type || 'error');
    });

    // 3. 成功/信息消息显示 - 替代alert()
    window.addEventListener('database:showMessage', (event) => {
        const { message, type } = event.detail;
        showUserMessage(message, type || 'info');
    });

    // 4. 用户选项确认 - 替代confirm()
    window.addEventListener('database:confirmOptions', (event) => {
        const { messages, resolve } = event.detail;
        
        showConfirmDialog({
            title: '导入选项确认',
            message: '请选择导入选项:',
            options: [
                {
                    label: messages.overwrite,
                    value: 'overwrite',
                    type: 'warning'
                },
                {
                    label: messages.skipMissing,
                    value: 'skipMissing', 
                    type: 'info'
                }
            ],
            onConfirm: (selectedOptions) => {
                resolve({
                    overwrite: selectedOptions.includes('overwrite'),
                    skipMissing: selectedOptions.includes('skipMissing')
                });
            },
            onCancel: () => {
                resolve({ overwrite: false, skipMissing: false });
            }
        });
    });

    // 5. 修复操作确认 - 替代confirm()
    window.addEventListener('database:confirmRepair', (event) => {
        const { message, resolve } = event.detail;
        
        showConfirmDialog({
            title: '数据库修复确认',
            message: message,
            confirmText: '确认修复',
            cancelText: '跳过修复',
            type: 'warning',
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        });
    });

    console.log('🎯 [UI] 数据库事件处理器初始化完成');
}

// ============================================================
// UI实现函数 - 可以根据项目具体需求自定义实现
// ============================================================

/**
 * 显示用户消息 - 可以使用toast、通知栏等任何UI形式
 */
function showUserMessage(message, type = 'info') {
    // 现代UI实现示例
    if (typeof showToast === 'function') {
        showToast(message, type);
        return;
    }
    
    // 降级到浏览器原生弹窗
    if (type === 'error') {
        alert('❌ 错误: ' + message);
    } else if (type === 'success') {
        alert('✅ 成功: ' + message);
    } else {
        alert('ℹ️ 信息: ' + message);
    }
}

/**
 * 显示确认对话框 - 可以使用模态框、对话框等任何UI形式
 */
function showConfirmDialog(config) {
    const {
        title = '确认',
        message,
        options = [],
        confirmText = '确认',
        cancelText = '取消',
        type = 'info',
        onConfirm,
        onCancel
    } = config;

    // 现代UI实现示例（使用自定义模态框）
    if (typeof showCustomDialog === 'function') {
        showCustomDialog({
            title,
            message,
            options,
            confirmText,
            cancelText,
            type,
            onConfirm,
            onCancel
        });
        return;
    }

    // 降级到浏览器原生确认框
    const result = confirm(message);
    if (result && onConfirm) {
        if (options.length > 0) {
            // 对于多选项，默认选择第一个
            onConfirm([options[0].value]);
        } else {
            onConfirm();
        }
    } else if (!result && onCancel) {
        onCancel();
    }
}

/**
 * 集成建议：
 * 
 * 1. 将本文件的事件处理器代码移至现有的 uiManager.js 中
 * 2. 根据项目的UI框架（如Bootstrap、Element UI等）自定义实现 showUserMessage 和 showConfirmDialog
 * 3. 确保在 uiManager.js 加载后调用 initDatabaseUIEventHandlers()
 * 4. 测试所有数据库操作的UI交互是否正常工作
 * 
 * 示例集成方式（在uiManager.js中）：
 * 
 * // 在 uiManager.js 的初始化函数中添加:
 * function initUI() {
 *     // 现有的UI初始化代码...
 *     
 *     // 添加数据库事件处理
 *     initDatabaseUIEventHandlers();
 * }
 */