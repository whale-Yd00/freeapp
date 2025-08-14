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
                this.updateViewportProperties();
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
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
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