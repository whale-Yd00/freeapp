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
    ...options, // 将前端传来的额外选项（如 temperature）加入 payload
    // 强制所有API请求都为非流式
    stream: false
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
    console.log('API完整返回:', JSON.stringify(data, null, 2));
    
    // 自动清理响应中的markdown代码块标记
    if (data && data.choices && Array.isArray(data.choices)) {
      data.choices.forEach(choice => {
        if (choice.message && choice.message.content && typeof choice.message.content === 'string') {
          const originalContent = choice.message.content;
          let cleanedContent = originalContent.trim();
          
          // 移除```json前缀
          if (cleanedContent.startsWith('```json')) {
            cleanedContent = cleanedContent.substring(7).trim();
            console.log('API层移除了```json前缀');
          }
          
          // 移除```后缀
          if (cleanedContent.endsWith('```')) {
            cleanedContent = cleanedContent.slice(0, -3).trim();
            console.log('API层移除了```后缀');
          }
          
          // 如果内容有变化，更新并记录
          if (originalContent !== cleanedContent) {
            choice.message.content = cleanedContent;
            console.log('API层清理前内容长度:', originalContent.length);
            console.log('API层清理后内容长度:', cleanedContent.length);
          }
        }
      });
    }
    
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