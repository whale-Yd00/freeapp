// ElevenLabs TTS API 代理函数
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 只接受POST请求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 解析从前端发送过来的JSON数据
    const { text, voiceId, apiKey } = JSON.parse(event.body);

    // 验证输入数据是否完整
    if (!text || !voiceId || !apiKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '缺少必要参数: text, voiceId, 或 apiKey' }),
      };
    }

    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const options = {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v3',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    };

    const response = await fetch(apiUrl, options);

    if (!response.ok) {
      const errorBody = await response.json();
      console.error('ElevenLabs API Error:', errorBody);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorBody.detail.message || '语音生成失败' }),
      };
    }

    const audioBuffer = await response.buffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (error) {
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '服务器内部错误' }),
    };
  }
};
