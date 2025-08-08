// Minimax TTS API 代理函数
// 引入 node-fetch 库用于发送 HTTP 请求
const fetch = require('node-fetch');

// Netlify/Vercel serverless function 入口
exports.handler = async (event, context) => {
  // 确保请求方法是 POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. 解析从前端发送过来的 JSON 数据
    // 这里需要 groupId, apiKey, voiceId 和 text
    const { text, voiceId, apiKey, groupId } = JSON.parse(event.body);

    // 2. 验证输入数据是否完整
    if (!text || !voiceId || !apiKey || !groupId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '缺少必要参数: text, voiceId, apiKey, 或 groupId' }),
      };
    }

    // 3. 设置 Minimax API 的 URL 和请求参数
    const apiUrl = 'https://api.minimax.chat/v1/text_to_speech';

    // Minimax API 的请求配置
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Minimax 的认证方式是在 Authorization Header 中提供 Group ID 和 API Key
        'Authorization': `Bearer ${groupId}:${apiKey}`
      },
      body: JSON.stringify({
        // 要合成的文本
        text: text,
        // 使用的声音 ID
        voice_id: voiceId,
        // 你可以根据需要调整以下参数
        model: "speech-01", // Minimax 的语音模型
        speed: 1.0, // 语速
        // 如果是声音克隆，可能需要配置 timber_weights
        // timber_weights: [
        //   {
        //     "voice_id": voiceId,
        //     "weight": 1.0
        //   }
        // ]
      }),
    };

    // 4. 发送请求到 Minimax API
    const response = await fetch(apiUrl, options);

    // 5. 处理 API 响应
    if (!response.ok) {
      // 如果 API 返回错误，则解析错误信息并返回给前端
      const errorBody = await response.json();
      console.error('Minimax API Error:', errorBody);
      return {
        statusCode: response.status,
        // 尝试返回 Minimax 提供的具体错误信息
        body: JSON.stringify({ error: errorBody.base_resp?.status_msg || '语音生成失败' }),
      };
    }

    // 6. 成功后，将获取到的音频流转换为 Base64 编码
    const audioBuffer = await response.buffer();

    // 7. 将 Base64 编码的音频返回给前端
    return {
      statusCode: 200,
      headers: {
        // Minimax 返回的是 mpeg 格式的音频
        'Content-Type': 'audio/mpeg',
      },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (error) {
    // 捕获函数执行过程中的其他异常
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '服务器内部错误' }),
    };
  }
};
