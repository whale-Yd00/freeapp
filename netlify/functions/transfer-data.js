// Simple data transfer function without Netlify Blobs
// Uses a simple in-memory store with expiration (note: this won't persist across function cold starts)

// In-memory storage for shared data
const dataStore = new Map();

// Clean up expired entries
function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of dataStore.entries()) {
    if (value.expires < now) {
      dataStore.delete(key);
    }
  }
}

export const handler = async (event) => {
  // Clean up expired entries on each request
  cleanupExpired();
  
  // 设置CORS，只允许指定域名访问
  const allowedOrigins = [
    'https://chat.whale-llt.top',
  ];
  
  const origin = event.headers.origin || event.headers.Origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  // 处理浏览器的预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
    };
  }

  // --- 情况一：收到数据，存起来 (POST请求) ---
  if (event.httpMethod === 'POST') {
    try {
      const dataToStore = JSON.parse(event.body);
      // 生成一个独一无二的、别人猜不到的ID作为取件码
      const uniqueId = crypto.randomUUID();
      
      // 把数据存进内存仓库，用ID作为钥匙
      // 数据只存15分钟，过期作废，非常安全！
      dataStore.set(uniqueId, {
        data: dataToStore,
        expires: Date.now() + 15 * 60 * 1000 // 15分钟后过期
      });

      // 把取件码返回给前端
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, id: uniqueId }),
      };
    } catch (error) {
      console.error('Error storing data:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: '存储数据失败。' }),
      };
    }
  }

  // --- 情况二：根据ID，交出数据 (GET请求) ---
  if (event.httpMethod === 'GET') {
    try {
      // 从URL里拿到取件码
      const { id } = event.queryStringParameters || {};
      if (!id) {
        throw new Error('没有提供ID。');
      }

      // 根据取件码去仓库里找数据
      const storedItem = dataStore.get(id);

      // 如果数据不存在，或者已经过期了，就告诉他找不到了
      if (!storedItem || Date.now() > storedItem.expires) {
        if (storedItem) dataStore.delete(id); // 如果是过期的，就顺手删掉
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: '数据未找到或已过期。' }),
        };
      }
      
      // 重要！数据一旦被取走，立刻销毁，防止二次使用
      dataStore.delete(id);

      // 把取到的数据交出去
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: storedItem.data }),
      };
    } catch (error) {
      console.error('Error retrieving data:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: '获取数据失败。' }),
      };
    }
  }

  // 如果是其他类型的请求，就拒绝
  return {
    statusCode: 405,
    headers,
    body: 'Method Not Allowed',
  };
};