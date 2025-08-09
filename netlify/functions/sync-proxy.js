// Netlify函数：代理到Vercel API，解决CORS问题
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    console.log('代理请求:', event.httpMethod, event.queryStringParameters);
    
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        // 从查询参数获取API端点
        const apiEndpoint = event.queryStringParameters?.endpoint || 'upload';
        
        // 尝试不同的Vercel URL
        const possibleUrls = [
            `https://freeapp-git-sync-tosd0.vercel.app/api/sync/${apiEndpoint}`,
            `https://freeapp-tosd0.vercel.app/api/sync/${apiEndpoint}`,
            `https://freeapp.vercel.app/api/sync/${apiEndpoint}`
        ];
        
        // 暂时使用第一个URL，后面可以优化为自动检测
        const vercelUrl = possibleUrls[0];
        
        console.log('转发到:', vercelUrl);
        console.log('请求体:', event.body);

        // 转发请求到Vercel
        const response = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Netlify-Function-Proxy'
            },
            body: event.body
        });

        console.log('Vercel响应状态:', response.status);
        
        let responseData;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.text();
        } else {
            // 如果返回的不是JSON，说明有错误
            const errorText = await response.text();
            console.log('Vercel错误响应:', errorText);
            
            responseData = JSON.stringify({ 
                error: '服务器返回非JSON响应',
                status: response.status,
                statusText: response.statusText,
                url: vercelUrl,
                details: errorText.substring(0, 500),
                headers: Object.fromEntries(response.headers.entries())
            });
        }
        
        return {
            statusCode: response.status,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: responseData
        };

    } catch (error) {
        console.error('代理错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: '代理服务器错误: ' + error.message,
                stack: error.stack
            })
        };
    }
};