// CJS 语法导入模块
const { Database } = require('../../lib/db.js');
const crypto = require('crypto');
/**
 * 从错误对象中提取可读的错误消息。
 * @param {*} error - 错误对象或字符串。
 * @returns {string} - 可读的错误消息。
 */
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'object' && error !== null && error.message) {
        return error.message;
    }
    return String(error);
}
// CJS 语法导出模块
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
        const expectedAdminKey = process.env.ADMIN_KEY;
        if (adminKey !== expectedAdminKey) {
            return res.status(403).json({ error: '无权限访问' });
        }
        await Database.init();
        let result, errorMessage;
        switch (action) {
            case 'create':
                const newSyncKey = syncKey || generateSyncKey();
                result = await Database.createSyncKey(newSyncKey);
                
                if (result.success) {
                    return res.status(200).json({
                        success: true,
                        syncKey: newSyncKey,
                        message: '同步密钥创建成功'
                    });
                } else {
                    errorMessage = getErrorMessage(result.error);
                    return res.status(500).json({ error: '创建同步密钥失败: ' + errorMessage });
                }
            case 'delete':
                if (!syncKey) {
                    return res.status(400).json({ error: '缺少syncKey参数' });
                }
                
                result = await Database.deleteUserData(syncKey);
                
                if (result.success) {
                    return res.status(200).json({
                        success: true,
                        message: '同步密钥和数据删除成功'
                    });
                } else {
                    errorMessage = getErrorMessage(result.error);
                    return res.status(500).json({ error: '删除失败: ' + errorMessage });
                }
            case 'stats':
                result = await Database.getStats();
                
                if (result.success) {
                    return res.status(200).json({
                        success: true,
                        stats: result.stats
                    });
                } else {
                    errorMessage = getErrorMessage(result.error);
                    return res.status(500).json({ error: '获取统计信息失败: ' + errorMessage });
                }
            default:
                return res.status(400).json({ error: '无效的action参数' });
        }
    } catch (error) {
        console.error('管理API错误:', error);
        const errorMessage = getErrorMessage(error);
        return res.status(500).json({ error: '服务器内部错误: ' + errorMessage });
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