/**
 * 环境指示器组件
 * 在非生产环境下显示环境提示信息
 */
class EnvironmentIndicator {
    constructor() {
        this.indicator = null;
        this.isVisible = false;
    }

    /**
     * 初始化环境指示器
     */
    init() {
        // 确保 EnvironmentConfig 已加载
        if (typeof EnvironmentConfig === 'undefined') {
            console.warn('EnvironmentConfig not loaded, environment indicator disabled');
            return;
        }

        // 调试：打印当前环境信息
        console.log('🌍 Environment Indicator Initializing...');
        const envInfo = EnvironmentConfig.getEnvironment();
        console.log('Environment Info:', envInfo);

        const config = EnvironmentConfig.getEnvironmentIndicatorConfig();
        console.log('Indicator Config:', config);
        
        if (config) {
            this.createIndicator(config);
            this.show();
            console.log('✅ Environment indicator created and shown');
            
            // 打印环境信息到控制台
            EnvironmentConfig.printEnvironmentInfo();
        } else {
            console.log('❌ Environment indicator not shown (production or disabled)');
        }
    }

    /**
     * 创建指示器DOM元素
     */
    createIndicator(config) {
        // 避免重复创建
        if (this.indicator) {
            this.indicator.remove();
        }

        const indicator = document.createElement('div');
        indicator.className = 'environment-indicator';
        indicator.innerHTML = `
            <div class="environment-indicator-content">
                <span class="environment-text">${config.text}</span>
                <span class="environment-version">v${config.version}</span>
            </div>
        `;

        // 设置样式
        this.setIndicatorStyles(indicator, config);
        
        this.indicator = indicator;
        document.body.appendChild(indicator);
    }

    /**
     * 设置指示器样式
     */
    setIndicatorStyles(element, config) {
        // 使用 setProperty 方法应用关键样式以确保优先级
        element.style.setProperty('position', 'fixed', 'important');
        element.style.setProperty('bottom', '52px', 'important');
        element.style.setProperty('left', '50%', 'important');
        element.style.setProperty('transform', 'translateX(-50%) translateY(0)', 'important');
        element.style.setProperty('backgroundColor', 'transparent', 'important');
        element.style.setProperty('color', '#ff6600', 'important');
        element.style.setProperty('z-index', '999999', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        
        // 应用其他样式
        const additionalStyles = {
            padding: '4px 0',
            borderRadius: '0',
            fontSize: '11px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxShadow: 'none',
            userSelect: 'none',
            opacity: '0.8',
            maxWidth: '300px',
            lineHeight: '1.1',
            textAlign: 'center',
            transition: 'opacity 0.3s ease-in-out',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        };

        Object.assign(element.style, additionalStyles);

        // 为内容容器设置样式
        const content = element.querySelector('.environment-indicator-content');
        if (content) {
            Object.assign(content.style, {
                display: 'inline', // 改为内联显示
                gap: '0'
            });
        }

        // 为版本号设置样式
        const version = element.querySelector('.environment-version');
        if (version) {
            Object.assign(version.style, {
                fontSize: '10px',
                opacity: '0.7',
                fontWeight: 'normal',
                marginLeft: '4px'
            });
        }
    }

    /**
     * 显示指示器
     */
    show() {
        if (this.indicator && !this.isVisible) {
            this.indicator.style.setProperty('transform', 'translateX(-50%) translateY(0)', 'important');
            this.indicator.style.setProperty('opacity', '0.8', 'important');
            this.isVisible = true;
        }
    }

    /**
     * 隐藏指示器
     */
    hide() {
        if (this.indicator && this.isVisible) {
            this.indicator.style.setProperty('transform', 'translateX(-50%) translateY(100%)', 'important');
            this.indicator.style.setProperty('opacity', '0', 'important');
            this.isVisible = false;
            
            // 延迟移除元素
            setTimeout(() => {
                if (this.indicator && this.indicator.parentNode) {
                    this.indicator.parentNode.removeChild(this.indicator);
                }
                this.indicator = null;
            }, 300);
        }
    }

    /**
     * 切换显示状态
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.init();
        }
    }

    /**
     * 销毁指示器
     */
    destroy() {
        this.hide();
    }
}

/**
 * 全局环境指示器实例
 */
window.environmentIndicator = new EnvironmentIndicator();

/**
 * DOM加载完成后自动初始化
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.environmentIndicator.init();
    });
} else {
    // 如果DOM已经加载完成
    window.environmentIndicator.init();
}

/**
 * 开发调试功能
 * 在控制台中可以使用以下命令：
 * - environmentIndicator.toggle() - 切换显示
 * - environmentIndicator.hide() - 隐藏指示器  
 * - environmentIndicator.show() - 显示指示器
 * - EnvironmentConfig.printEnvironmentInfo() - 打印环境信息
 */
if (typeof EnvironmentConfig !== 'undefined') {
    const config = EnvironmentConfig.getEnvironment();
    if (config.isDevelopment) {
        console.log('🔧 Environment Indicator Debug Commands:');
        console.log('  environmentIndicator.toggle() - Toggle indicator');
        console.log('  environmentIndicator.hide() - Hide indicator');
        console.log('  environmentIndicator.show() - Show indicator');
        console.log('  EnvironmentConfig.printEnvironmentInfo() - Print env info');
    }
}