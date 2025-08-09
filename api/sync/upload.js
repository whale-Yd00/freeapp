import { Database } from '../../lib/db.js';

export default async function handler(req, res) {
    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        const { syncKey, data } = req.body;

        // 验证输入
        if (!syncKey || !data) {
            return res.status(400).json({ error: '缺少必要参数：syncKey 和 data' });
        }

        if (typeof syncKey !== 'string' || syncKey.trim().length === 0) {
            return res.status(400).json({ error: 'syncKey 必须是非空字符串' });
        }

        if (typeof data !== 'object') {
            return res.status(400).json({ error: 'data 必须是对象类型' });
        }

        // 验证同步密钥长度和格式
        const trimmedSyncKey = syncKey.trim();
        if (trimmedSyncKey.length < 6 || trimmedSyncKey.length > 100) {
            return res.status(400).json({ error: '同步密钥长度必须在6-100个字符之间' });
        }

        // 初始化数据库（如果需要）
        await Database.init();

        // 验证同步密钥是否存在，如果不存在则创建
        const keyExists = await Database.validateSyncKey(trimmedSyncKey);
        if (!keyExists) {
            const createResult = await Database.createSyncKey(trimmedSyncKey);
            if (!createResult.success) {
                return res.status(500).json({ error: '创建同步密钥失败: ' + createResult.error });
            }
        }

        // 保存用户数据
        const saveResult = await Database.saveUserData(trimmedSyncKey, data);
        
        if (saveResult.success) {
            return res.status(200).json({ 
                success: true, 
                message: '数据上传成功',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(500).json({ error: '保存数据失败: ' + saveResult.error });
        }

    } catch (error) {
        console.error('上传API错误:', error);
        return res.status(500).json({ error: '服务器内部错误' });
    }
}