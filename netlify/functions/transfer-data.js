
// 导入Netlify的Blobs功能，这是我们的临时仓库
import { getDeployStore } from '@netlify/blobs';

export const handler = async (event) => {
  // 设置CORS，允许你的Vercel应用访问这个函数
  const headers = {
    'Access-Control-Allow-Origin': '*', // 为了简单起见，允许所有来源。生产环境建议换成你的Vercel域名
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // 处理浏览器的预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
    };
  }

  // 获取我们的临时仓库，给它起个名字叫 'shared-data'
  const store = getDeployStore('shared-data');

  // --- 情况一：收到数据，存起来 (POST请求) ---
  if (event.httpMethod === 'POST') {
    try {
      const dataToStore = JSON.parse(event.body);
      // 生成一个独一无二的、别人猜不到的ID作为取件码
      const uniqueId = crypto.randomUUID();

      // 把数据存进仓库，用ID作为钥匙
      // 数据只存15分钟，过期作废，非常安全！
      await store.setJSON(uniqueId, dataToStore, {
          metadata: { expires: Date.now() + 15 * 60 * 1000 } // 15分钟后过期
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
      const { id } = event.queryStringParameters;
      if (!id) {
        throw new Error('没有提供ID。');
      }

      // 根据取件码去仓库里找数据
      const storedData = await store.get(id, { type: 'json' });
      const metadata = await store.getMetadata(id);

      // 如果数据不存在，或者已经过期了，就告诉他找不到了
      if (!storedData || (metadata?.expires && Date.now() > metadata.expires)) {
        if(storedData) await store.delete(id); // 如果是过期的，就顺手删掉
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: '数据未找到或已过期。' }),
        };
      }
      
      // 重要！数据一旦被取走，立刻销毁，防止二次使用
      await store.delete(id);

      // 把取到的数据交出去
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: storedData }),
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
