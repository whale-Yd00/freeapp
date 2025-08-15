// Netlify函数：代理到Vercel API，解决CORS问题
// 无需配置任何环境变量，硬编码Vercel URL
exports.handler = async (event, context) => {
    console.log('🔄 代理请求:', event.httpMethod, event.queryStringParameters);
    
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    // 处理OPTIONS预检请求
    if (event.httpMethod === 'OPTIONS') {
        console.log('✅ OPTIONS预检请求');
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }
    // 只处理POST请求
    if (event.httpMethod !== 'POST') {
        console.log('❌ 非POST请求:', event.httpMethod);
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: '只允许POST请求' })
        };
    }
    try {
        // 生产环境Vercel API URL（无需环境变量）
        const apiEndpoint = event.queryStringParameters?.endpoint || 'upload';
        const vercelUrl = `https://chat.whale-llt.top/api/sync/${apiEndpoint}`;
        
        console.log('🎯 转发目标:', vercelUrl);
        console.log('📦 请求体长度:', event.body?.length || 0);
        // 动态导入fetch（兼容性处理）
        let fetch;
        try {
            fetch = globalThis.fetch || require('node-fetch');
        } catch (e) {
            const nodeFetch = require('node-fetch');
            fetch = nodeFetch;
        }
        // 转发请求到Vercel
        const response = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Netlify-Proxy/1.0'
            },
            body: event.body
        });
        console.log('📡 Vercel响应状态:', response.status, response.statusText);
        
        // 读取响应
        const responseText = await response.text();
        console.log('📥 响应内容长度:', responseText.length);
        
        // 检查是否为JSON
        let responseBody = responseText;
        const contentType = response.headers.get('content-type') || '';
        
        if (!contentType.includes('application/json')) {
            console.log('⚠️  非JSON响应，包装错误信息');
            responseBody = JSON.stringify({
                error: `Vercel API返回非JSON响应 (${response.status})`,
                details: responseText.substring(0, 300),
                url: vercelUrl
            });
        }
        
        return {
            statusCode: response.status,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: responseBody
        };
    } catch (error) {
        console.error('💥 代理错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: '代理服务器错误',
                message: error.message,
                type: error.name
            })
        };
    }
};