// 修改: 'import' 改为 'require'
const { Database } = require('../../lib/db.js');
const crypto = require('crypto');

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
        const { action, syncKey, adminKey } = req.body;

        // 简单的管理员验证（实际使用中应该使用更安全的方式）
        const expectedAdminKey = process.env.ADMIN_KEY;
        if (adminKey !== expectedAdminKey) {
            return res.status(403).json({ error: '无权限访问' });
        }

        // 初始化数据库
        await Database.init();

        switch (action) {
            case 'create':
                // 创建新的同步密钥
                const newSyncKey = syncKey || generateSyncKey();
                const createResult = await Database.createSyncKey(newSyncKey);
                
                if (createResult.success) {
                    return res.status(200).json({
                        success: true,
                        syncKey: newSyncKey,
                        message: '同步密钥创建成功'
                    });
                } else {
                    return res.status(500).json({ error: '创建同步密钥失败: ' + createResult.error });
                }

            case 'delete':
                // 删除同步密钥和相关数据
                if (!syncKey) {
                    return res.status(400).json({ error: '缺少syncKey参数' });
                }
                
                const deleteResult = await Database.deleteUserData(syncKey);
                
                if (deleteResult.success) {
                    return res.status(200).json({
                        success: true,
                        message: '同步密钥和数据删除成功'
                    });
                } else {
                    return res.status(500).json({ error: '删除失败: ' + deleteResult.error });
                }

            case 'stats':
                // 获取统计信息
                const statsResult = await Database.getStats();
                
                if (statsResult.success) {
                    return res.status(200).json({
                        success: true,
                        stats: statsResult.stats
                    });
                } else {
                    return res.status(500).json({ error: '获取统计信息失败: ' + statsResult.error });
                }

            default:
                return res.status(400).json({ error: '无效的action参数' });
        }

    } catch (error) {
        console.error('管理API错误:', error);
        return res.status(500).json({ error: '服务器内部错误' });
    }
}

/**
 * 生成唯一的同步密钥
 */
function generateSyncKey() {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.randomBytes(8).toString('hex');
    return `sync_${timestamp}_${randomBytes}`;
}