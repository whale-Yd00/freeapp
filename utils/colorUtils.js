/**
 * Color Utilities
 * 颜色处理相关的实用工具函数
 */

/**
 * 验证十六进制颜色格式是否有效
 * @param {string} color - 十六进制颜色值 (如: #FF0000)
 * @returns {boolean} 是否为有效的十六进制颜色
 */
function isValidHexColor(color) {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * 将十六进制颜色转换为RGBA格式
 * @param {string} hex - 十六进制颜色值 (如: #FF0000)  
 * @param {number} alpha - 透明度 (0-1)
 * @returns {string} RGBA颜色字符串 (如: rgba(255, 0, 0, 0.5))
 */
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 加深颜色 - 通过百分比降低RGB值
 * @param {string} hex - 十六进制颜色值 (如: #FF0000)
 * @param {number} percent - 加深的百分比 (0-1，0.2表示加深20%)
 * @returns {string} 加深后的十六进制颜色值
 */
function darkenColor(hex, percent) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    const newR = Math.round(r * (1 - percent));
    const newG = Math.round(g * (1 - percent));
    const newB = Math.round(b * (1 - percent));
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * 验证颜色输入框并更新按钮状态
 * @param {HTMLInputElement} input - 颜色输入框元素
 * @param {HTMLButtonElement} button - 关联的按钮元素
 */
function validateColorInput(input, button) {
    const isValid = isValidHexColor(input.value);
    button.disabled = !isValid;
    
    if (isValid) {
        input.classList.remove('invalid');
    } else {
        input.classList.add('invalid');
    }
}

/**
 * 应用单色主题到页面
 * @param {string} color - 主题色的十六进制值
 */
function applyThemeColor(color) {
    // 禁用渐变模式
    document.body.classList.remove('gradient-mode');
    
    // 计算辅助颜色
    const lightColor = hexToRgba(color, 0.1);
    const hoverColor = darkenColor(color, 0.1);
    
    // 计算次要色的交互状态（用于模态框、信息按钮等UI元素）
    const secondaryColor = '#1890ff'; // 固定的次要色
    const secondaryHover = darkenColor(secondaryColor, 0.15);
    const secondaryActive = darkenColor(secondaryColor, 0.25);
    
    // 更新CSS变量
    document.documentElement.style.setProperty('--theme-primary', color);
    document.documentElement.style.setProperty('--theme-primary-light', lightColor);
    document.documentElement.style.setProperty('--theme-primary-hover', hoverColor);
    document.documentElement.style.setProperty('--theme-secondary-hover', secondaryHover);
    document.documentElement.style.setProperty('--theme-secondary-active', secondaryActive);
    document.documentElement.style.setProperty('--use-gradient', '0');
    
    // 更新meta标签中的主题色（影响系统状态栏）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', color);
    }
    
    // 更新manifest相关的meta标签
    const tileMeta = document.querySelector('meta[name="msapplication-TileColor"]');
    if (tileMeta) {
        tileMeta.setAttribute('content', color);
    }
    
    console.log('主题色已应用:', color);
}

/**
 * 应用渐变主题到页面
 * @param {string} primaryColor - 主色的十六进制值
 * @param {string} secondaryColor - 次要色的十六进制值
 * @param {string} direction - 渐变方向 (如: 'to right', 'to bottom')
 */
function applyGradientTheme(primaryColor, secondaryColor, direction) {
    // 启用渐变模式
    document.body.classList.add('gradient-mode');
    
    // 计算辅助颜色
    const lightColor = hexToRgba(primaryColor, 0.1);
    const hoverColor = darkenColor(primaryColor, 0.1);
    
    // 在渐变模式下，使用渐变的次要色作为UI元素的次要色
    const secondaryHover = darkenColor(secondaryColor, 0.15);
    const secondaryActive = darkenColor(secondaryColor, 0.25);
    
    // 更新CSS变量
    document.documentElement.style.setProperty('--theme-primary', primaryColor);
    document.documentElement.style.setProperty('--theme-secondary', secondaryColor);
    document.documentElement.style.setProperty('--theme-primary-light', lightColor);
    document.documentElement.style.setProperty('--theme-primary-hover', hoverColor);
    document.documentElement.style.setProperty('--theme-secondary-hover', secondaryHover);
    document.documentElement.style.setProperty('--theme-secondary-active', secondaryActive);
    document.documentElement.style.setProperty('--theme-gradient-direction', direction);
    document.documentElement.style.setProperty('--theme-gradient', `linear-gradient(${direction}, ${primaryColor}, ${secondaryColor})`);
    document.documentElement.style.setProperty('--use-gradient', '1');
    
    // 更新meta标签中的主题色（使用主色）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', primaryColor);
    }
    
    // 更新manifest相关的meta标签
    const tileMeta = document.querySelector('meta[name="msapplication-TileColor"]');
    if (tileMeta) {
        tileMeta.setAttribute('content', primaryColor);
    }
    
    console.log('渐变主题已应用:', { primaryColor, secondaryColor, direction });
}

// 兼容性：将函数分组暴露到全局window对象
if (typeof window !== 'undefined') {
    window.ColorUtils = {
        isValidHexColor,
        hexToRgba,
        darkenColor,
        validateColorInput,
        applyThemeColor,
        applyGradientTheme
    };
    
    // 向后兼容：保留直接挂载的函数（逐步废弃）
    window.isValidHexColor = isValidHexColor;
    window.hexToRgba = hexToRgba;
    window.darkenColor = darkenColor;
    window.validateColorInput = validateColorInput;
    window.applyThemeColor = applyThemeColor;
    window.applyGradientTheme = applyGradientTheme;
}