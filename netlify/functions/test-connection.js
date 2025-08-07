// netlify/functions/test-connection.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const body = JSON.parse(event.body);
  const { apiUrl, apiKey } = body;

  if (!apiUrl || !apiKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing apiUrl or apiKey' }),
    };
  }

  try {
    const response = await fetch(apiUrl + '/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // --- UA ---
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
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
};