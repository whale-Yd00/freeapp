// netlify/functions/tts.js

// 这是一个Netlify云函数，用于代理对ElevenLabs API的请求
// 它可以安全地在服务器端处理API Key，避免在前端暴露

// 引入node-fetch库来发送HTTP请求
// 在Netlify环境中，你需要通过npm或yarn安装这个依赖: npm install node-fetch
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

    // ElevenLabs API的URL
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    // 配置请求参数
    const options = {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey, // 将用户的API Key放在请求头中
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // 你可以根据需要选择不同的模型
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    };

    // 发送请求到ElevenLabs API
    const response = await fetch(apiUrl, options);

    // 如果API返回错误，则将错误信息回传给前端
    if (!response.ok) {
      const errorBody = await response.json();
      console.error('ElevenLabs API Error:', errorBody);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorBody.detail.message || '语音生成失败' }),
      };
    }

    // 获取音频数据
    const audioBuffer = await response.buffer();

    // 将音频数据以Base64编码的形式返回给前端
    // 这是Netlify Function返回二进制数据的标准方式
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true,
    };

  } catch (error) {
    // 捕获任何在执行过程中发生的错误
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '服务器内部错误' }),
    };
  }
};
