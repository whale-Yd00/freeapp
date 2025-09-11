/**
 * 跨页面数据库状态监听器
 * 专门解决 interact.html 无法检测主页面数据库状态的问题
 */

class CrossPageDBListener {
    constructor() {
        this.isListening = false;
        this.listeners = [];
        this.debugId = Math.random().toString(36).substr(2, 8);
        
        console.log(`[CrossPageDB-${this.debugId}] 初始化跨页面监听器 - 页面: ${window.location.pathname}`);
    }

    /**
     * 开始监听跨页面数据库状态变化
     */
    startListening() {
        if (this.isListening) {
            console.log(`[CrossPageDB-${this.debugId}] 已在监听中，跳过重复启动`);
            return;
        }

        this.isListening = true;
        console.log(`[CrossPageDB-${this.debugId}] 开始监听跨页面数据库状态...`);

        // 方法1: localStorage 事件监听（跨标签页）
        const storageListener = (event) => {
            console.log(`[CrossPageDB-${this.debugId}] 收到 localStorage 事件:`, {
                key: event.key,
                newValue: event.newValue,
                oldValue: event.oldValue,
                url: event.url
            });

            if (event.key === 'dbSyncTrigger') {
                console.log(`[CrossPageDB-${this.debugId}] 检测到数据库状态同步事件`);
                this.checkAndNotify();
            }
        };
        
        window.addEventListener('storage', storageListener);
        this.listeners.push(() => window.removeEventListener('storage', storageListener));

        // 方法2: 轮询检查（备用机制）
        const pollInterval = setInterval(() => {
            this.checkAndNotify();
        }, 1000); // 每秒检查一次
        
        this.listeners.push(() => clearInterval(pollInterval));

        // 方法3: 立即检查一次
        setTimeout(() => this.checkAndNotify(), 100);
        
        console.log(`[CrossPageDB-${this.debugId}] 监听器已设置完成`);
    }

    /**
     * 检查数据库状态并通知监听者
     */
    checkAndNotify() {
        const isReady = window.isIndexedDBReady && window.db && window.db.version >= 13;
        
        console.log(`[CrossPageDB-${this.debugId}] 状态检查:`, {
            isIndexedDBReady: window.isIndexedDBReady,
            dbExists: !!window.db,
            dbVersion: window.db?.version,
            isReady: isReady,
            pathname: window.location.pathname
        });

        if (isReady) {
            console.log(`[CrossPageDB-${this.debugId}] 数据库已就绪，触发事件通知`);
            
            // 触发自定义事件
            const event = new CustomEvent('crossPageDBReady', {
                detail: {
                    db: window.db,
                    version: window.db.version,
                    timestamp: Date.now(),
                    source: 'CrossPageDBListener'
                }
            });
            
            window.dispatchEvent(event);
            
            // 停止轮询（但保留 localStorage 监听）
            this.stopPolling();
            
            return true;
        }
        
        return false;
    }

    /**
     * 等待数据库就绪
     */
    async waitForDB(timeout = 8000) {
        console.log(`[CrossPageDB-${this.debugId}] 开始等待数据库就绪，超时: ${timeout}ms`);
        
        return new Promise((resolve, reject) => {
            let resolved = false;

            // 立即检查
            if (this.checkAndNotify()) {
                resolved = true;
                resolve(window.db);
                return;
            }

            // 设置事件监听
            const eventListener = (event) => {
                if (!resolved) {
                    resolved = true;
                    console.log(`[CrossPageDB-${this.debugId}] 通过事件检测到数据库就绪`);
                    window.removeEventListener('crossPageDBReady', eventListener);
                    resolve(event.detail.db);
                }
            };
            
            window.addEventListener('crossPageDBReady', eventListener);

            // 超时处理
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`[CrossPageDB-${this.debugId}] 等待数据库就绪超时`);
                    window.removeEventListener('crossPageDBReady', eventListener);
                    reject(new Error(`等待数据库就绪超时 (${timeout}ms)`));
                }
            }, timeout);

            // 开始监听
            this.startListening();
        });
    }

    /**
     * 停止轮询（但保留 localStorage 监听）
     */
    stopPolling() {
        if (this.listeners.length > 1) {
            // 只停止轮询，保留 localStorage 监听
            const pollCleanup = this.listeners.pop();
            if (pollCleanup) {
                pollCleanup();
                console.log(`[CrossPageDB-${this.debugId}] 已停止轮询检查`);
            }
        }
    }

    /**
     * 完全停止监听
     */
    stopListening() {
        console.log(`[CrossPageDB-${this.debugId}] 停止所有监听`);
        this.listeners.forEach(cleanup => cleanup());
        this.listeners = [];
        this.isListening = false;
    }
}

// 全局导出
if (typeof window !== 'undefined') {
    window.CrossPageDBListener = CrossPageDBListener;
}

export default CrossPageDBListener;