// Minimax TTS API 代理函数
// 引入 node-fetch 库用于发送 HTTP 请求
const fetch = require('node-fetch');

// Netlify/Vercel serverless function 入口
exports.handler = async (event, context) => {
  // 确保请求方法是 POST
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // 1. 解析从前端发送过来的 JSON 数据
    const { text, voiceId, apiKey, groupId } = JSON.parse(event.body);

    // 2. 验证输入数据是否完整
    if (!text || !voiceId || !apiKey || !groupId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '请求中缺少必要参数: text, voiceId, apiKey, 或 groupId' }),
      };
    }

    // 3. 设置 Minimax API 的 URL 和请求参数
    const apiUrl = 'https://api.minimax.chat/v1/text_to_speech';

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groupId}:${apiKey}`
      },
      body: JSON.stringify({
        text: text,
        voice_id: voiceId,
        model: "speech-01",
        speed: 1.0,
      }),
    };

    // 4. 发送请求到 Minimax API
    const response = await fetch(apiUrl, options);

    // 5. 【增强的错误处理】处理 API 响应
    if (!response.ok) {
      // 如果 API 返回错误，则解析错误信息并返回给前端
      const errorBody = await response.json().catch(() => ({})); // 即使解析失败也返回空对象
      console.error('Minimax API Error:', errorBody);
      const errorMessage = errorBody.base_resp?.status_msg || `Minimax API 请求失败，状态码: ${response.status}`;
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: errorMessage }),
      };
    }

    // 6. 成功后，获取音频 Buffer
    const audioBuffer = await response.buffer();

    // 7. 验证获取到的数据是否有效
    if (!audioBuffer || audioBuffer.length === 0) {
        console.error('Minimax API 返回了空的音频数据');
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Minimax API 返回了空的音频数据' }),
        };
    }

    // 8. 将 Buffer 数据以 Base64 编码返回给前端
    // Netlify 会自动处理 Buffer 并设置正确的响应头
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (error) {
    // 捕获函数执行过程中的其他异常
    console.error('Serverless Function Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `服务器内部错误: ${error.message}` }),
    };
  }
};
