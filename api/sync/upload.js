// CJS 语法导入模块
const { Database } = require('../../lib/db.js');
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
        const { syncKey, data } = req.body;
        if (!syncKey || !data) {
            return res.status(400).json({ error: '缺少必要参数：syncKey 和 data' });
        }
        if (typeof syncKey !== 'string' || syncKey.trim().length === 0) {
            return res.status(400).json({ error: 'syncKey 必须是非空字符串' });
        }
        if (typeof data !== 'object') {
            return res.status(400).json({ error: 'data 必须是对象类型' });
        }
        const trimmedSyncKey = syncKey.trim();
        if (trimmedSyncKey.length < 6 || trimmedSyncKey.length > 100) {
            return res.status(400).json({ error: '同步密钥长度必须在6-100个字符之间' });
        }
        await Database.init();
        const keyExists = await Database.validateSyncKey(trimmedSyncKey);
        if (!keyExists) {
            const createResult = await Database.createSyncKey(trimmedSyncKey);
            if (!createResult.success) {
                const errorMessage = getErrorMessage(createResult.error);
                return res.status(500).json({ error: '创建同步密钥失败: ' + errorMessage });
            }
        }
        const saveResult = await Database.saveUserData(trimmedSyncKey, data);
        
        if (saveResult.success) {
            return res.status(200).json({ 
                success: true, 
                message: '数据上传成功',
                timestamp: new Date().toISOString()
            });
        } else {
            const errorMessage = getErrorMessage(saveResult.error);
            return res.status(500).json({ error: '保存数据失败: ' + errorMessage });
        }
    } catch (error) {
        console.error('上传API错误:', error);
        const errorMessage = getErrorMessage(error);
        return res.status(500).json({ error: '服务器内部错误: ' + errorMessage });
    }
}