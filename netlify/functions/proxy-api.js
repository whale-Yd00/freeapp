// netlify/functions/proxy-api.js
import fetch from 'node-fetch';

export async function handler(event, context) {
  const body = JSON.parse(event.body);
  const { apiUrl, apiKey, model, messages, ...options } = body; // 使用 ...options 捕获剩余参数

  if (!apiUrl || !apiKey || !model || !messages) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required parameters' }),
    };
  }

  const payload = {
    model: model,
    messages: messages,
    ...options // 将前端传来的额外选项（如 temperature）加入 payload
  };

  try {
    const response = await fetch(apiUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // --- UA 伪装 ---
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      // 返回更详细的错误
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `API Error: ${errorBody}` }),
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}