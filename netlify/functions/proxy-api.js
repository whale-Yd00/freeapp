// netlify/functions/proxy-api.js

// Netlify Functions 使用的语法是 Node.js 的。
// 我们需要 `node-fetch` 来在后端发送网络请求，就像在前端用 `fetch` 一样。
// 你需要在你的项目中安装它，在你的项目根目录运行: npm install node-fetch
import fetch from 'node-fetch';

// 这是函数的主体。它接收一个 `event` 对象，包含了前端发来的所有信息。
export async function handler(event, context) {
  // 1. 从前端请求中解析出数据
  // event.body 是一个 JSON 字符串，我们需要把它变回 JavaScript 对象。
  const body = JSON.parse(event.body);
  const { apiUrl, apiKey, model, messages } = body;

  // 安全检查：确保必要的信息都存在
  if (!apiUrl || !apiKey || !model || !messages) {
    return {
      statusCode: 400, // Bad Request
      body: JSON.stringify({ error: 'Missing required parameters in request body' }),
    };
  }

  // 2. 准备发送给外部 API (如 OpenAI) 的请求体
  const payload = {
    model: model,
    messages: messages,
    temperature: 0.85
  };

  try {
    // 3. 从服务器端发送请求到真正的 API
    const response = await fetch(apiUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 关键：API Key 在这里被安全地使用，不会暴露到浏览器。
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    // 如果外部 API 返回了错误，我们也把错误信息传回给前端
    if (!response.ok) {
      const errorBody = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `API Error: ${errorBody}` }),
      };
    }

    // 4. 将从外部 API 获取到的成功响应传回给前端
    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data), // 将数据转回 JSON 字符串格式
    };

  } catch (error) {
    // 如果在请求过程中发生网络错误等，返回一个 500 服务器错误
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}