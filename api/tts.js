module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, voiceId, apiKey } = req.body;

    if (!text || !voiceId || !apiKey) {
      return res.status(400).json({ 
        error: '缺少必要参数: text, voiceId, 或 apiKey' 
      });
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
        model_id: 'eleven_multilingual_v2',
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
      return res.status(response.status).json({ 
        error: errorBody.detail?.message || '语音生成失败' 
      });
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(Buffer.from(base64Audio, 'base64'));

  } catch (error) {
    console.error('Function Error:', error);
    return res.status(500).json({ error: '服务器内部错误' });
  }
}