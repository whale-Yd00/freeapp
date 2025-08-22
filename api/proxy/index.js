module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiUrl, apiKey, model, messages, ...options } = req.body;

  if (!apiUrl || !apiKey || !model || !messages) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const payload = {
    model: model,
    messages: messages,
    ...options,
    // 强制所有API请求都为非流式
    stream: false
  };

  try {
    const response = await fetch(apiUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `API Error: ${errorBody}` });
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
    
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}