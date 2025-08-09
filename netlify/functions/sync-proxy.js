// Netlify函数：代理到Vercel API，解决CORS问题
exports.handler = async (event, context) => {
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // 处理OPTIONS预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 只处理POST请求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: '只允许POST请求' })
        };
    }

    try {
        // 从路径参数获取API端点
        const apiEndpoint = event.queryStringParameters.endpoint || 'upload';
        const vercelUrl = `https://freeapp-git-sync-tosd0.vercel.app/api/sync/${apiEndpoint}`;

        // 转发请求到Vercel
        const fetch = require('node-fetch');
        const response = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: event.body
        });

        const data = await response.text();
        
        return {
            statusCode: response.status,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: data
        };

    } catch (error) {
        console.error('代理错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: '代理服务器错误: ' + error.message })
        };
    }
};