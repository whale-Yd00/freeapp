/**
 * UI管理器 - 统一的UI控制系统
 * 包含视口管理、主题管理、输入处理、浏览器兼容性等功能
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

// === 主题管理系统 ===
class ThemeManager {
    constructor() {
        this.THEME_KEY = 'whale-llt-theme';
        this.themes = {
            system: 'system-theme',
            light: '',
            dark: 'dark-mode'
        };
        this.currentTheme = this.getStoredTheme();
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }

    getStoredTheme() {
        return localStorage.getItem(this.THEME_KEY) || 'system';
    }

    setTheme(theme) {
        if (!this.themes.hasOwnProperty(theme)) {
            console.warn('未知主题:', theme);
            return;
        }

        this.currentTheme = theme;
        localStorage.setItem(this.THEME_KEY, theme);
        this.applyTheme();
        this.updateThemeUI();
    }

    applyTheme() {
        const body = document.body;
        
        // 移除所有主题类
        Object.values(this.themes).forEach(className => {
            if (className) body.classList.remove(className);
        });

        // 应用当前主题类
        const themeClass = this.themes[this.currentTheme];
        if (themeClass) {
            body.classList.add(themeClass);
        }
    }

    updateThemeUI() {
        // 更新主题切换按钮的显示状态
        const buttons = document.querySelectorAll('[data-theme]');
        buttons.forEach(btn => {
            if (btn.dataset.theme === this.currentTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        console.log('主题UI已更新，当前主题:', this.currentTheme);
    }

    init() {
        // 立即应用主题，避免闪烁
        this.applyTheme();
        
        // 初始化UI状态
        this.updateThemeUI();
        
        // 监听系统主题变化
        this.mediaQuery.addEventListener('change', () => {
            if (this.currentTheme === 'system') {
                this.applyTheme();
            }
        });

        console.log('主题管理器初始化完成，当前主题:', this.currentTheme);
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// === 输入处理和浏览器兼容性系统 ===

// 浏览器兼容性检测
function checkBrowserCompatibility() {
    // 检测浏览器是否支持 :has() 选择器
    let supportsHas = false;
    
    try {
        // 尝试创建一个使用 :has() 的CSS规则来测试支持性
        const testRule = document.createElement('style');
        testRule.textContent = 'body:has(div) { color: inherit; }';
        document.head.appendChild(testRule);
        
        // 检查规则是否被正确解析
        supportsHas = testRule.sheet && testRule.sheet.cssRules.length > 0;
        
        // 清理测试元素
        document.head.removeChild(testRule);
    } catch (e) {
        // 如果出现错误，说明不支持
        supportsHas = false;
    }
    
    // 如果不支持 :has()，为body添加标识类以启用JavaScript备用方案
    if (!supportsHas) {
        document.body.classList.add('no-has-support');
        console.log('检测到浏览器不支持 :has() 选择器，已启用JavaScript备用方案');
    } else {
        console.log('浏览器支持 :has() 选择器');
    }
    
    // 将支持状态存储为全局变量，供其他函数使用
    window.browserSupportsHas = supportsHas;
}

// 安全聚焦工具函数
function safeFocus(element, options = {}) {
    if (!element || typeof element.focus !== 'function') return;
    
    const {
        preventScroll = false,
        delay = 0,
        smooth = true
    } = options;
    
    // 防抖机制：如果element已经是activeElement，避免重复操作
    if (document.activeElement === element) return;
    
    const focusAction = () => {
        try {
            // 如果元素不在可视区域，先聚焦但阻止滚动
            element.focus({ preventScroll: true });
            
            // 如果需要滚动到可视区域，使用viewportManager的方法
            if (!preventScroll && window.viewportManager) {
                // 延迟一下，让focus事件先完成
                setTimeout(() => {
                    window.viewportManager.scrollToActiveInput();
                }, 50);
            }
        } catch (error) {
            console.warn('Focus operation failed:', error);
        }
    };
    
    if (delay > 0) {
        setTimeout(focusAction, delay);
    } else {
        focusAction();
    }
}

// 屏蔽长按选择和上下文菜单系统
function initializeLongPressBlocking() {
    // 屏蔽上下文菜单（右键菜单和长按菜单）
    document.addEventListener('contextmenu', function(e) {
        // 允许输入框的上下文菜单
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
            e.target.contentEditable === 'true') {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });

    // 屏蔽选择开始事件
    document.addEventListener('selectstart', function(e) {
        // 允许输入框的选择
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
            e.target.contentEditable === 'true') {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });

    // 屏蔽拖拽开始事件（某些情况下长按会触发）
    document.addEventListener('dragstart', function(e) {
        // 允许输入框内容的拖拽
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
            e.target.contentEditable === 'true') {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });

    // iOS Safari 特殊处理：屏蔽长按高亮
    let longPressTimer = null;
    let touchStartTime = 0;
    let touchTarget = null;
    
    document.addEventListener('touchstart', function(e) {
        // 输入框允许正常行为
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
            e.target.contentEditable === 'true') {
            return;
        }
        
        touchTarget = e.target;
        touchStartTime = Date.now();
        longPressTimer = setTimeout(() => {
            // 只有当前活跃元素不是输入框时才blur
            if (document.activeElement && 
                document.activeElement.tagName !== 'INPUT' && 
                document.activeElement.tagName !== 'TEXTAREA' && 
                document.activeElement.contentEditable !== 'true') {
                document.activeElement.blur();
            }
            // 只清除非输入框的选择
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const container = range.commonAncestorContainer;
                const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
                
                if (element && 
                    element.tagName !== 'INPUT' && 
                    element.tagName !== 'TEXTAREA' && 
                    element.contentEditable !== 'true' &&
                    !element.closest('input, textarea, [contenteditable="true"]')) {
                    selection.removeAllRanges();
                }
            }
        }, 500); // 500ms 后算作长按
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        touchTarget = null;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }, { passive: true });

    // 额外保护：清除任何意外的选择（但不干扰正在交互的输入框）
    setInterval(() => {
        // 如果当前有输入框聚焦，跳过清理
        if (document.activeElement && (
            document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' || 
            document.activeElement.contentEditable === 'true')) {
            return;
        }
        
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
            
            // 如果选择的不是输入框内容，就清除选择
            if (element && 
                element.tagName !== 'INPUT' && 
                element.tagName !== 'TEXTAREA' && 
                element.contentEditable !== 'true' &&
                !element.closest('input, textarea, [contenteditable="true"]')) {
                selection.removeAllRanges();
            }
        }
    }, 200); // 降低频率，减少对性能的影响
}

// 主题切换函数（全局函数）
function switchTheme(theme) {
    window.themeManager.setTheme(theme);
    
    // 提供用户反馈
    const themeNames = {
        system: '跟随系统',
        light: '亮色模式', 
        dark: '暗黑模式'
    };
    
    // 可以在这里添加toast提示，但现在先不添加以免干扰用户
    console.log(`已切换到${themeNames[theme]}主题`);
}

// 获取当前主题（全局函数）
function getCurrentTheme() {
    return window.themeManager.getCurrentTheme();
}

// 初始化UI管理器
if (typeof window !== 'undefined') {
    window.viewportManager = new ViewportManager();
    window.themeManager = new ThemeManager();
    
    // 暴露全局函数
    window.safeFocus = safeFocus;
    window.switchTheme = switchTheme;
    window.getCurrentTheme = getCurrentTheme;
    window.checkBrowserCompatibility = checkBrowserCompatibility;
    window.initializeLongPressBlocking = initializeLongPressBlocking;
    
    // 自动初始化
    window.themeManager.init();
    window.checkBrowserCompatibility();
    
    // 在页面加载完成后初始化长按屏蔽
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeLongPressBlocking);
    } else {
        initializeLongPressBlocking();
    }
}