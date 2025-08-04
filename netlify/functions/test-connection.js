// netlify/functions/test-connection.js

// 同样，我们需要 `node-fetch` 来发送网络请求
const fetch = require('node-fetch');

// 这是专门用于测试连接的函数
exports.handler = async function(event, context) {
  // 1. 从前端请求中解析出数据
  const body = JSON.parse(event.body);
  const { apiUrl, apiKey } = body;

  // 安全检查
  if (!apiUrl || !apiKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing apiUrl or apiKey' }),
    };
  }

  try {
    // 2. 从服务器端发送请求到真正的 API 的 /models 端点
    const response = await fetch(apiUrl + '/models', {
      method: 'GET', // 获取模型列表通常是 GET 请求
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    // 如果外部 API 返回了错误
    if (!response.ok) {
      const errorBody = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `API Error: ${errorBody}` }),
      };
    }

    // 3. 将成功响应传回给前端
    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };

  } catch (error) {
    // 网络等其他错误
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
