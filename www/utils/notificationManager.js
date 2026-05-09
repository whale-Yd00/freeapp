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
/**
 * 通知管理器模块
 */

class NotificationManager {
    constructor() {
        this.initialized = false;
        this.hasPermission = false;
        // 【修改】：移除了 this.syncTimers
    }
    
    /**
     * 初始化通知管理器
     */
    async init() {
        if (this.initialized) {
            return { success: true };
        }
        
        // 检查是否为Capacitor环境
        const isCapacitor = typeof window !== 'undefined' &&
                           window.Capacitor && 
                           window.Capacitor.isPluginAvailable('LocalNotifications');
        
        if (!isCapacitor) {
            console.log('不在Capacitor环境中，通知功能不可用');
            return { success: false, error: '通知功能不可用' };
        }
        
        try {
            // 获取通知插件
            this.notificationPlugin = window.Capacitor.Plugins.LocalNotifications;
            
            // 检查通知权限
            let permissionStatus = await this.notificationPlugin.checkPermissions();
            
            if (permissionStatus.display !== 'granted') {
                console.log('请求通知权限...');
                permissionStatus = await this.notificationPlugin.requestPermissions();
                console.log('通知权限状态:', permissionStatus);
            }
            
            this.hasPermission = permissionStatus.display === 'granted';
            this.initialized = true;
            
            // 监听通知点击事件
            this.notificationPlugin.addListener('localNotificationActionPerformed', 
                (notification) => {
                    console.log('用户点击了通知:', notification);
                    this.handleNotificationClick(notification);
                }
            );
            
            return { success: true };
            
        } catch (error) {
            console.error('初始化通知管理器出错:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 检查是否有通知权限
     * @returns {Promise<boolean>}
     */
    async hasPermissions() {
        if (!this.initialized) {
            await this.init();
        }
        return this.hasPermission;
    }

    /**
     * 请求通知权限
     * @returns {Promise<boolean>}
     */
    async requestPermissions() {
        if (!this.initialized) {
            await this.init();
        }
        
        if (typeof window === 'undefined' || !window.Capacitor || !window.Capacitor.isPluginAvailable('LocalNotifications')) {
            return false;
        }
        
        try {
            const result = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
            this.hasPermission = result.display === 'granted';
            return this.hasPermission;
        } catch (error) {
            console.error('请求通知权限失败:', error);
            return false;
        }
    }
    
    /**
     * 发送本地通知
     * @param {object} options - 通知选项
     * @param {string} options.title - 通知标题
     * @param {string} options.body - 通知内容
     * @param {number} options.id - 通知ID
     * @param {Date} options.schedule - 定时通知的时间
     * @param {object} options.extra - 附加数据
     */
    async scheduleNotification(options) {
        if (!this.initialized) {
            await this.init();
        }
        
        if (!this.hasPermission) {
            console.warn('没有通知权限，无法发送通知');
            return { success: false, error: '没有通知权限' };
        }
        
        try {
            const { title, body, id, schedule, extra } = options;
            
            // 通知ID必须是数字
            const notificationId = id || new Date().getTime();
            
            // 准备通知
            const notificationOptions = {
                notifications: [{
                    id: notificationId,
                    title: title || '玄鲸虚拟聊天',
                    body: body || '您有一条新消息',
                    schedule: schedule ? { at: schedule } : null,
                    sound: null,
                    attachments: null,
                    actionTypeId: '',
                    extra: extra || null
                }]
            };
            
            // 发送通知
            await this.notificationPlugin.schedule(notificationOptions);
            
            return { success: true, id: notificationId };
            
        } catch (error) {
            console.error('发送通知失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 取消指定ID的通知
     * @param {number} id - 通知ID
     */
    async cancelNotification(id) {
        if (!this.initialized) {
            await this.init();
        }
        
        try {
            await this.notificationPlugin.cancel({ notifications: [{ id }] });
            return { success: true };
        } catch (error) {
            console.error('取消通知失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 取消所有通知
     */
    async cancelAllNotifications() {
        if (!this.initialized) {
            await this.init();
        }
        
        try {
            await this.notificationPlugin.cancelAll();
            return { success: true };
        } catch (error) {
            console.error('取消所有通知失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 获取所有待处理的通知
     */
    async getPendingNotifications() {
        if (!this.initialized) {
            await this.init();
        }
        
        try {
            const pending = await this.notificationPlugin.getPending();
            return { success: true, notifications: pending.notifications };
        } catch (error) {
            console.error('获取待处理通知失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 处理通知点击事件
     * @param {object} notification - 点击的通知对象
     */
    handleNotificationClick(notification) {
        // 发送自定义事件
        const event = new CustomEvent('notificationClicked', {
            detail: notification
        });
        document.dispatchEvent(event);
        
        // 根据通知的额外数据执行特定操作
        const extra = notification.notification.extra;
        if (extra) {
            // 【修改】: 移除了在这里添加队列的逻辑。
            // 队列在 schedule 时就已经添加了。
            
            // 如果是待办事项通知
            if (extra.type === 'todo') {
                // (保留) 打开待办清单
                if (typeof window.showTodoModal === 'function') {
                    window.showTodoModal();
                }
            }
            
            if (extra.contactId) {
                // 如果是聊天通知，打开相应的聊天界面
                if (typeof window.openChatWithContact === 'function') {
                    window.openChatWithContact(extra.contactId);
                }
            }
            
            if (extra.action) {
                // 执行自定义动作
                switch(extra.action) {
                    case 'openWeibo':
                        if (typeof window.showPage === 'function') {
                            window.showPage('weiboPage');
                        }
                        break;
                    case 'openMoments':
                        if (typeof window.showPage === 'function') {
                            window.showPage('momentsPage');
                        }
                        break;
                    // 可以添加更多自定义动作
                }
            }
        }
    }
    
    /**
     * 为待办事项安排通知
     * @param {object} todoItem - 待办事项对象
     */
    async schedule(todoItem) {
        if (!(await this.hasPermissions())) {
            if (!(await this.requestPermissions())) {
                if (typeof window.showToast === 'function') {
                    window.showToast('无法安排提醒，需要通知权限。');
                }
                return;
            }
        }

        const notificationTime = new Date(new Date(todoItem.dueDate).getTime() - 10 * 60 * 1000);

        if (notificationTime < new Date()) {
            console.log(`任务 "${todoItem.text}" 已经过期，不会安排通知。`);
            return;
        }

        try {
            // 【重要】我们仍然需要把 todoItem 传给 extra，
            // 这样 handleNotificationClick 才能正确处理点击
            const extraData = { ...todoItem, type: 'todo' }; 
        
            await this.scheduleNotification({
                id: todoItem.id,
                title: `"${todoItem.reminderAuthor}" 提醒您`,
                body: todoItem.reminderMessage,
                schedule: notificationTime,
                extra: extraData // <--- 传递包含所有信息的 extraData
            });
            console.log(`已为任务 ${todoItem.id} 安排原生通知，时间：${notificationTime.toLocaleString()}`);

            // 【【【 核心修改：使用"待处理队列" 】】】
            try {
                const PENDING_KEY = 'pendingTodoMessages'; // <-- 使用这个KEY
                let pendingMessages = [];
                // 1. 读取现有队列
                const storedData = localStorage.getItem(PENDING_KEY);
                if (storedData) {
                    pendingMessages = JSON.parse(storedData);
                }
                // 2. 为防止重复添加，先移除可能已存在的
                pendingMessages = pendingMessages.filter(item => item.id !== todoItem.id);
                // 3. 将新任务添加到队列
                pendingMessages.push(todoItem);
                // 4. 将更新后的队列存回 localStorage
                localStorage.setItem(PENDING_KEY, JSON.stringify(pendingMessages));
                console.log(`已将任务 ${todoItem.id} 添加到待处理同步队列。`);
            } catch (e) {
                console.error("无法将待办消息存入待处理队列:", e);
            }
            // 【【【 修改结束 】】】

        } catch (e) {
            console.error("安排通知失败:", e);
        }
    }

    /**
     * 取消待办事项的通知
     * @param {number} todoId - 待办事项ID
     */
    async cancel(todoId) {
        try {
            // 取消原生通知
            await this.cancelNotification(todoId);
            console.log(`已取消任务 ${todoId} 的原生通知`);

            // 【【【 核心修改：从"待处理队列"中移除 】】】
            try {
                const PENDING_KEY = 'pendingTodoMessages'; // <-- 确保使用同一个KEY
                let pendingMessages = [];
                const storedData = localStorage.getItem(PENDING_KEY);
                if (storedData) {
                    pendingMessages = JSON.parse(storedData);
                }
                // 1. 过滤掉要取消的任务
                const newPendingMessages = pendingMessages.filter(item => item.id !== todoId);
                // 2. 存回更新后的队列
                localStorage.setItem(PENDING_KEY, JSON.stringify(newPendingMessages));
                console.log(`已从待处理同步队列中移除任务 ${todoId}。`);
            } catch (e) {
                console.error("无法从待处理队列中移除待办消息:", e);
            }
            // 【【【 修改结束 】】】

        } catch (e) {
            console.error("取消通知失败:", e);
        }
    }
}

// 创建全局通知管理器实例
window.notificationManager = new NotificationManager();

// 在文档加载完成后初始化通知管理器
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.notificationManager.init();
        });
    } else {
        window.notificationManager.init();
    }
}