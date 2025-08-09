// 修改: 'import' 改为 'require'
const { Database } = require('../../lib/db.js');

// 修改: 'export default' 改为 'module.exports ='
module.exports = async function handler(req, res) {
    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        const { syncKey } = req.body;

        // 验证输入
        if (!syncKey) {
            return res.status(400).json({ error: '缺少必要参数：syncKey' });
        }

        if (typeof syncKey !== 'string' || syncKey.trim().length === 0) {
            return res.status(400).json({ error: 'syncKey 必须是非空字符串' });
        }

        // 验证同步密钥长度和格式
        const trimmedSyncKey = syncKey.trim();
        if (trimmedSyncKey.length < 6 || trimmedSyncKey.length > 100) {
            return res.status(400).json({ error: '同步密钥长度必须在6-100个字符之间' });
        }

        // 初始化数据库（如果需要）
        await Database.init();

        // 获取用户数据
        const result = await Database.getUserData(trimmedSyncKey);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                data: result.data,
                updatedAt: result.updatedAt,
                message: '数据获取成功'
            });
        } else {
            // 根据不同的错误返回不同的状态码
            if (result.error === '无效的同步密钥') {
                return res.status(404).json({ error: '同步密钥不存在，请检查是否正确' });
            } else if (result.error === '未找到数据') {
                return res.status(404).json({ error: '该同步密钥下没有保存的数据' });
            } else {
                return res.status(500).json({ error: '获取数据失败: ' + result.error });
            }
        }

    } catch (error) {
        console.error('下载API错误:', error);
        return res.status(500).json({ error: '服务器内部错误' });
    }
}