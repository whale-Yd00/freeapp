/**
 * 环境配置系统 - 支持构建时环境变量注入
 * 支持 Vercel 和 Netlify 部署平台
 */
class EnvironmentConfig {
    /**
     * 构建时环境变量占位符
     * 这些将在构建过程中被实际值替换
     */
    static BUILD_TIME_CONFIG = {
        // 环境类型: development, staging, production
        ENVIRONMENT: '{{ENVIRONMENT}}',
        // 应用版本
        APP_VERSION: '{{APP_VERSION}}',
        // 构建时间戳
        BUILD_TIMESTAMP: '{{BUILD_TIMESTAMP}}',
        // Git 提交哈希
        GIT_COMMIT: '{{GIT_COMMIT}}',
        // 是否为开发版本
        IS_DEVELOPMENT: '{{IS_DEVELOPMENT}}',
        // 自定义标签
        ENVIRONMENT_LABEL: '{{ENVIRONMENT_LABEL}}'
    };

    /**
     * 获取当前环境配置
     */
    static getEnvironment() {
        // 优先使用构建时注入的环境变量
        let environment = this.BUILD_TIME_CONFIG.ENVIRONMENT;
        let isDevelopment = this.BUILD_TIME_CONFIG.IS_DEVELOPMENT;
        let environmentLabel = this.BUILD_TIME_CONFIG.ENVIRONMENT_LABEL;

        // 如果没有被替换（仍然包含花括号），则回退到运行时检测
        if (environment.includes('{{')) {
            environment = this.detectEnvironmentFromURL();
            isDevelopment = environment !== 'production';
            environmentLabel = this.getDefaultEnvironmentLabel(environment);
        } else {
            // 处理字符串形式的布尔值
            isDevelopment = isDevelopment === 'true' || isDevelopment === true;
        }

        return {
            environment,
            isDevelopment,
            environmentLabel,
            version: this.getVersion(),
            buildTime: this.getBuildTime(),
            gitCommit: this.getGitCommit()
        };
    }

    /**
     * 通过URL检测环境（回退方案）
     */
    static detectEnvironmentFromURL() {
        if (typeof window === 'undefined') return 'production';

        const hostname = window.location.hostname;

        // 本地开发环境
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.')) {
            return 'development';
        }

        // Vercel Preview 部署
        if (hostname.includes('-git-') || hostname.includes('.vercel.app')) {
            // 检查是否是 dev 分支或包含 dev 相关标识
            if (hostname.includes('-dev-') || hostname.includes('-develop-') || 
                hostname.includes('-test-') || hostname.includes('-staging-')) {
                return 'staging';
            }
            // Vercel 的主分支部署通常是生产环境
            return hostname.includes('main') ? 'production' : 'staging';
        }

        // Netlify 部署
        if (hostname.includes('.netlify.app')) {
            // 检查域名中是否包含开发相关关键词
            if (hostname.includes('dev') || hostname.includes('test') || 
                hostname.includes('staging') || hostname.includes('preview')) {
                return 'staging';
            }
            
            // Netlify 的 branch 部署检测（格式：branch--sitename.netlify.app）
            if (hostname.includes('--')) {
                const parts = hostname.split('--');
                const branchName = parts[0];
                if (branchName && (branchName.includes('dev') || branchName.includes('test'))) {
                    return 'staging';
                }
            }
            
            // 默认为生产环境
            return 'production';
        }

        // 自定义域名默认为生产环境
        return 'production';
    }

    /**
     * 获取默认环境标签
     */
    static getDefaultEnvironmentLabel(environment) {
        switch (environment) {
            case 'development':
                return '开发环境';
            case 'staging':
                return '测试环境';
            case 'production':
            default:
                return null; // 生产环境不显示标签
        }
    }

    /**
     * 获取应用版本
     */
    static getVersion() {
        // 优先使用 git commit hash 的前7位作为版本显示
        let gitCommit = this.BUILD_TIME_CONFIG.GIT_COMMIT;
        if (!gitCommit.includes('{{') && gitCommit !== 'unknown' && gitCommit.length >= 7) {
            return gitCommit.substring(0, 7);
        }
        
        // 如果没有有效的 git commit hash，回退到应用版本号
        let version = this.BUILD_TIME_CONFIG.APP_VERSION;
        return version.includes('{{') ? 'dev' : version;
    }

    /**
     * 获取构建时间
     */
    static getBuildTime() {
        let buildTime = this.BUILD_TIME_CONFIG.BUILD_TIMESTAMP;
        return buildTime.includes('{{') ? new Date().toISOString() : buildTime;
    }

    /**
     * 获取 Git 提交哈希
     */
    static getGitCommit() {
        let gitCommit = this.BUILD_TIME_CONFIG.GIT_COMMIT;
        return gitCommit.includes('{{') ? 'unknown' : gitCommit;
    }

    /**
     * 检查是否应该显示环境指示器
     * 只有在生产环境且没有环境标签时才不显示
     */
    static shouldShowEnvironmentIndicator() {
        const config = this.getEnvironment();
        // 生产环境永远不显示环境指示器
        return config.environment !== 'production';
    }

    /**
     * 获取环境指示器配置
     */
    static getEnvironmentIndicatorConfig() {
        const config = this.getEnvironment();
        
        // 生产环境永远不显示环境指示器，无论是否有环境标签
        if (config.environment === 'production') {
            return null;
        }

        // 只有非生产环境才显示环境指示器
        return {
            text: config.environmentLabel ? `${config.environmentLabel} - 开发中内容，不代表最终成果` : '开发中内容，不代表最终成果',
            version: config.version,
            environment: config.environment
        };
    }

    /**
     * 打印环境信息到控制台
     */
    static printEnvironmentInfo() {
        const config = this.getEnvironment();
        console.group('🌍 Environment Info');
        console.log('Environment:', config.environment);
        console.log('Development Mode:', config.isDevelopment);
        console.log('Version:', config.version);
        console.log('Build Time:', config.buildTime);
        console.log('Git Commit:', config.gitCommit);
        if (config.environmentLabel) {
            console.log('Label:', config.environmentLabel);
        }
        console.groupEnd();
    }
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentConfig;
} else {
    window.EnvironmentConfig = EnvironmentConfig;
}
