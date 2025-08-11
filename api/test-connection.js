module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiUrl, apiKey } = req.body;

  if (!apiUrl || !apiKey) {
    return res.status(400).json({ error: 'Missing apiUrl or apiKey' });
  }

  try {
    const response = await fetch(apiUrl + '/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `API Error: ${errorBody}` });
    }
    
    const data = await response.json();
    console.log('API测试连接完整返回:', JSON.stringify(data, null, 2));
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}