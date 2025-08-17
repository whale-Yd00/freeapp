/**
 * 视口管理器 - 处理iPhone刘海屏/药丸屏的safe area计算
 * 使用VisualViewport API优化布局
 */

class ViewportManager {
    constructor() {
        this.init();
    }

    init() {
        // 设置CSS自定义属性
        this.updateViewportProperties();

        // 监听视口变化
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                this.handleKeyboardToggle();
            });
        }

        // 监听屏幕方向变化
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.updateViewportProperties();
            }, 100);
        });

        // 初始设置
        this.setInitialStyles();
    }

    updateViewportProperties() {
        const root = document.documentElement;
        
        // 获取真实的视口尺寸
        // 键盘弹出时不调整viewport height，避免出现白色区域
        const viewportHeight = window.innerHeight; // 使用固定的window.innerHeight
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        
        // 计算safe area
        const safeAreaTop = this.getSafeAreaTop();
        const safeAreaBottom = this.getSafeAreaBottom();
        const safeAreaLeft = this.getSafeAreaLeft();
        const safeAreaRight = this.getSafeAreaRight();

        // 设置CSS自定义属性
        root.style.setProperty('--viewport-height', `${viewportHeight}px`);
        root.style.setProperty('--viewport-width', `${viewportWidth}px`);
        root.style.setProperty('--safe-area-top', `${safeAreaTop}px`);
        root.style.setProperty('--safe-area-bottom', `${safeAreaBottom}px`);
        root.style.setProperty('--safe-area-left', `${safeAreaLeft}px`);
        root.style.setProperty('--safe-area-right', `${safeAreaRight}px`);

        // 计算header高度
        const headerHeight = 44; // 基础header高度
        const totalHeaderHeight = headerHeight + safeAreaTop;
        root.style.setProperty('--header-height', `${totalHeaderHeight}px`);

        // 计算底部导航栏高度
        const navHeight = 50; // 基础导航栏高度
        const totalNavHeight = navHeight + safeAreaBottom;
        root.style.setProperty('--nav-height', `${totalNavHeight}px`);

        // 计算可用内容区域高度
        const contentHeight = viewportHeight - totalHeaderHeight - totalNavHeight;
        root.style.setProperty('--content-height', `${contentHeight}px`);

        // 聊天页面特殊处理（无导航栏）
        const chatContentHeight = viewportHeight - totalHeaderHeight;
        root.style.setProperty('--chat-content-height', `${chatContentHeight}px`);
    }

    /**
     * 处理键盘弹出/收起时的布局调整
     * 使用transform和scroll来适应键盘，而不是改变容器高度
     * 优化版本：增加防抖和状态检查
     */
    handleKeyboardToggle() {
        if (!window.visualViewport) return;
        
        // 防抖机制，避免频繁触发
        if (this.keyboardToggleTimeout) {
            clearTimeout(this.keyboardToggleTimeout);
        }
        
        this.keyboardToggleTimeout = setTimeout(() => {
            const visualHeight = window.visualViewport.height;
            const windowHeight = window.innerHeight;
            const heightDiff = windowHeight - visualHeight;
            
            // 键盘高度阈值，超过150px认为是键盘弹出（提高阈值避免误判）
            const keyboardThreshold = 150;
            const isKeyboardVisible = heightDiff > keyboardThreshold;
            
            const root = document.documentElement;
            const currentState = root.getAttribute('data-keyboard-visible') === 'true';
            
            // 只有状态真正变化时才执行操作
            if (isKeyboardVisible !== currentState) {
                if (isKeyboardVisible) {
                    // 键盘弹出时，设置一个CSS变量来标识状态
                    root.style.setProperty('--keyboard-height', `${heightDiff}px`);
                    root.setAttribute('data-keyboard-visible', 'true');
                    
                    // 延迟执行滚动，确保键盘完全弹出
                    setTimeout(() => {
                        this.scrollToActiveInput();
                    }, 50);
                } else {
                    // 键盘收起时，清除状态
                    root.style.removeProperty('--keyboard-height');
                    root.removeAttribute('data-keyboard-visible');
                }
            }
            
            this.keyboardToggleTimeout = null;
        }, 100); // 100ms防抖
    }

    /**
     * 将当前聚焦的输入框滚动到可见区域
     * 优化版本：避免过度滚动和重复调用
     */
    scrollToActiveInput() {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            // 防抖机制，避免重复调用
            if (this.scrollTimeout) {
                clearTimeout(this.scrollTimeout);
            }
            
            this.scrollTimeout = setTimeout(() => {
                // 检查元素是否已经在可视区域内
                const rect = activeElement.getBoundingClientRect();
                const windowHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const keyboardHeight = windowHeight - (window.visualViewport ? window.visualViewport.height : windowHeight);
                const availableHeight = windowHeight - keyboardHeight;
                
                // 只有当输入框不在可视区域或被键盘遮挡时才滚动
                const isVisible = rect.top >= 0 && rect.bottom <= availableHeight;
                const isPartiallyHidden = rect.bottom > availableHeight * 0.7; // 如果输入框底部超过可用高度的70%，认为需要调整
                
                if (!isVisible || isPartiallyHidden) {
                    activeElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest', // 改为nearest，避免过度滚动
                        inline: 'nearest'
                    });
                }
                
                this.scrollTimeout = null;
            }, 350); // 稍微延长等待时间，确保键盘动画完成
        }
    }

    getSafeAreaTop() {
        // 使用CSS env()获取safe area，如果不支持则返回默认值
        const testEl = document.createElement('div');
        testEl.style.paddingTop = 'env(safe-area-inset-top)';
        document.body.appendChild(testEl);
        const computedStyle = window.getComputedStyle(testEl);
        const safeAreaTop = parseInt(computedStyle.paddingTop) || 0;
        document.body.removeChild(testEl);
        return safeAreaTop;
    }

    getSafeAreaBottom() {
        const testEl = document.createElement('div');
        testEl.style.paddingBottom = 'env(safe-area-inset-bottom)';
        document.body.appendChild(testEl);
        const computedStyle = window.getComputedStyle(testEl);
        const safeAreaBottom = parseInt(computedStyle.paddingBottom) || 0;
        document.body.removeChild(testEl);
        return safeAreaBottom;
    }

    getSafeAreaLeft() {
        const testEl = document.createElement('div');
        testEl.style.paddingLeft = 'env(safe-area-inset-left)';
        document.body.appendChild(testEl);
        const computedStyle = window.getComputedStyle(testEl);
        const safeAreaLeft = parseInt(computedStyle.paddingLeft) || 0;
        document.body.removeChild(testEl);
        return safeAreaLeft;
    }

    getSafeAreaRight() {
        const testEl = document.createElement('div');
        testEl.style.paddingRight = 'env(safe-area-inset-right)';
        document.body.appendChild(testEl);
        const computedStyle = window.getComputedStyle(testEl);
        const safeAreaRight = parseInt(computedStyle.paddingRight) || 0;
        document.body.removeChild(testEl);
        return safeAreaRight;
    }

    setInitialStyles() {
        // 确保body使用完整视口
        document.body.style.height = '100vh';
        document.body.style.height = 'var(--viewport-height, 100vh)';
    }
}

// 初始化视口管理器
if (typeof window !== 'undefined') {
    window.viewportManager = new ViewportManager();
}