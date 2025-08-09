/**
 * 云同步配置 - 自动检测部署环境
 */
class SyncConfig {
    /**
     * 获取API基础URL
     */
    static getApiBaseUrl() {
        // 如果在浏览器环境中
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            
            // Vercel部署检测
            if (hostname.includes('.vercel.app') || hostname.includes('vercel')) {
                return ''; // 相对路径，使用当前域名的API
            }
            
            // Netlify部署检测
            if (hostname.includes('.netlify.app') || hostname.includes('netlify')) {
                // 使用Netlify Functions代理（无需配置环境变量）
                return '/.netlify/functions';
                // 生产环境Vercel域名：
                // return 'https://chat.whale-llt.top';
            }
            
            // 本地开发环境
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                // 如果是在Vercel Dev环境
                if (window.location.port === '3000') {
                    return ''; // 使用本地Vercel API
                }
                // 如果是其他本地环境，调用已部署的Vercel API
                return 'https://your-vercel-app.vercel.app';
            }
            
            // 自定义域名 - 默认使用相对路径
            return '';
        }
        
        // Node.js环境（服务端）- 默认相对路径
        return '';
    }
    
    /**
     * 获取完整的API URL
     */
    static getApiUrl(endpoint) {
        const baseUrl = this.getApiBaseUrl();
        
        // 如果是Netlify函数代理
        if (baseUrl === '/.netlify/functions') {
            return `${baseUrl}/sync-proxy?endpoint=${endpoint}`;
        }
        
        // 其他情况使用标准API路径
        return `${baseUrl}/api/sync/${endpoint}`;
    }
    
    /**
     * 检查当前是否为Vercel环境（有API能力）
     */
    static isVercelEnvironment() {
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            return hostname.includes('.vercel.app') || 
                   hostname.includes('vercel') ||
                   (hostname === 'localhost' && window.location.port === '3000');
        }
        return false;
    }
    
    /**
     * 获取密钥生成器URL
     */
    static getKeyGeneratorUrl() {
        const baseUrl = this.getApiBaseUrl();
        return `${baseUrl}/sync-key-generator.html`;
    }
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncConfig;
} else {
    window.SyncConfig = SyncConfig;
}