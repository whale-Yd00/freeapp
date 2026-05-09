// Capacitor工具函数
// 用于在移动应用中扩展web端功能

// 检查是否为Capacitor环境
const isCapacitorEnvironment = () => {
    return (
        typeof window !== 'undefined' &&
        window.Capacitor &&
        window.Capacitor.isNative
    );
};

// 创建一个容器对象，将在Capacitor初始化后包含所有导出的插件
window.capacitorExports = {};

document.addEventListener('deviceready', () => {
    console.log('Capacitor已准备就绪');
    
    // 当Capacitor准备就绪后，导出所有需要的插件
    if (isCapacitorEnvironment()) {
        // 从Capacitor Core导出
        window.capacitorExports.Filesystem = window.Capacitor.Plugins.Filesystem;
        window.capacitorExports.FilePicker = window.Capacitor.Plugins.FilePicker;
        window.capacitorExports.LocalNotifications = window.Capacitor.Plugins.LocalNotifications;
        
        console.log('插件已导出到 window.capacitorExports');
    } else {
        console.log('当前不在Capacitor环境中，插件可能不可用');
    }
}, false);
