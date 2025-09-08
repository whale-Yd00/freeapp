#!/usr/bin/env node

/**
 * 构建时环境变量注入脚本
 * 用于将环境变量注入到 JavaScript 文件中
 */

const fs = require('fs');
const path = require('path');

/**
 * 获取环境变量配置
 */
function getEnvironmentConfig() {
    const config = {
        // 环境类型
        ENVIRONMENT: process.env.ENVIRONMENT || process.env.NODE_ENV || 'production',
        
        // 应用版本（从 package.json 获取，或使用环境变量）
        APP_VERSION: process.env.APP_VERSION || getPackageVersion(),
        
        // 构建时间戳
        BUILD_TIMESTAMP: new Date().toISOString(),
        
        // Git 提交哈希
        GIT_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA || 
                   process.env.COMMIT_REF || 
                   process.env.GIT_COMMIT || 
                   'unknown',
        
        // 是否为开发版本
        IS_DEVELOPMENT: (process.env.ENVIRONMENT === 'development' || 
                        process.env.ENVIRONMENT === 'staging' ||
                        process.env.NODE_ENV === 'development').toString(),
        
        // 自定义环境标签
        ENVIRONMENT_LABEL: process.env.ENVIRONMENT_LABEL || getDefaultLabel()
    };

    return config;
}

/**
 * 从 package.json 获取版本号
 */
function getPackageVersion() {
    try {
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version || '1.0.0';
    } catch (error) {
        console.warn('Unable to read package.json version:', error.message);
        return '1.0.0';
    }
}

/**
 * 获取默认环境标签
 */
function getDefaultLabel() {
    const env = process.env.ENVIRONMENT || process.env.NODE_ENV || 'production';
    
    switch (env) {
        case 'development':
            return '开发环境';
        case 'staging':
            return '测试环境';
        case 'production':
        default:
            return ''; // 返回空字符串而不是null，避免语法错误
    }
}

/**
 * 替换文件中的环境变量占位符
 */
function injectEnvironmentVariables(filePath, config) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        let replacements = [];
        
        // 替换所有环境变量占位符
        for (const [key, value] of Object.entries(config)) {
            const placeholder = `{{${key}}}`;
            if (content.includes(placeholder)) {
                // 确保值是有效的JavaScript字符串
                let safeValue = value;
                if (safeValue === null || safeValue === undefined) {
                    safeValue = '';
                } else if (typeof safeValue === 'string') {
                    // 转义字符串中的特殊字符
                    safeValue = safeValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                } else {
                    // 非字符串值保持原样
                    safeValue = String(safeValue);
                }
                
                content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), safeValue);
                modified = true;
                replacements.push(`${key}=${safeValue}`);
            }
        }

        // 如果有修改，写回文件
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`     ✓ Replaced: ${replacements.join(', ')}`);
        } else {
            console.log(`     - No placeholders found`);
        }

        return modified;
    } catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
        return false;
    }
}

/**
 * 递归查找需要处理的文件
 */
function findTargetFiles(dir, extensions = ['.js'], exclude = ['node_modules', '.git', 'dist', 'build']) {
    const files = [];
    
    function scanDir(currentDir) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    // 跳过排除的目录
                    if (!exclude.some(ex => entry.name.includes(ex))) {
                        scanDir(fullPath);
                    }
                } else if (entry.isFile()) {
                    // 检查文件扩展名
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.warn(`Warning: Cannot scan directory ${currentDir}:`, error.message);
        }
    }
    
    scanDir(dir);
    return files;
}

/**
 * 主函数
 */
function main() {
    console.log('🌍 Environment Variable Injection Script');
    console.log('==========================================');
    
    const config = getEnvironmentConfig();
    
    console.log('\n📋 Environment Configuration:');
    for (const [key, value] of Object.entries(config)) {
        console.log(`   ${key}: ${value}`);
    }
    
    // 动态查找需要处理的文件
    const configFiles = findTargetFiles(path.join(process.cwd(), 'config'));
    const jsFiles = findTargetFiles(path.join(process.cwd(), 'js'));
    const utilsFiles = findTargetFiles(path.join(process.cwd(), 'utils'));
    
    // 合并所有候选文件
    const candidateFiles = [...configFiles, ...jsFiles, ...utilsFiles];
    
    // 过滤出真正包含占位符的文件
    const targetFiles = candidateFiles.filter(filePath => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return content.includes('{{') && content.includes('}}');
        } catch (error) {
            return false;
        }
    });
    
    console.log('\n🔍 Scanning for files with environment placeholders:');
    console.log(`   Found ${candidateFiles.length} JavaScript files`);
    console.log(`   ${targetFiles.length} files contain placeholders`);
    
    if (targetFiles.length === 0) {
        console.log('   No files need environment variable injection');
        return;
    }
    
    console.log('\n📝 Processing files:');
    let totalModified = 0;
    
    for (const filePath of targetFiles) {
        const relativePath = path.relative(process.cwd(), filePath);
        console.log(`   Processing: ${relativePath}`);
        
        if (injectEnvironmentVariables(filePath, config)) {
            totalModified++;
        }
    }
    
    console.log(`\n✨ Environment injection completed! Modified ${totalModified} files.`);
    
    // 如果是开发环境，显示调试信息
    if (config.IS_DEVELOPMENT === 'true') {
        console.log('\n🔧 Development mode detected:');
        console.log('   Environment indicator will be displayed');
        console.log('   Console debugging commands available');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = {
    getEnvironmentConfig,
    injectEnvironmentVariables,
    main
};