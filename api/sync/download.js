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
        const { syncKey } = req.body;

        // 验证输入
        if (!syncKey) {
            return res.status(400).json({ error: '缺少必要参数：syncKey' });
        }

        if (typeof syncKey !== 'string' || syncKey.trim().length === 0) {
            return res.status(400).json({ error: 'syncKey 必须是非空字符串' });
        }

        const trimmedSyncKey = syncKey.trim();
        if (trimmedSyncKey.length < 6 || trimmedSyncKey.length > 100) {
            return res.status(400).json({ error: '同步密钥长度必须在6-100个字符之间' });
        }

        await Database.init();

        const result = await Database.getUserData(trimmedSyncKey);
        
        if (result.success) {
            return res.status(200).json({
                success: true,
                data: result.data,
                updatedAt: result.updatedAt,
                message: '数据获取成功'
            });
        } else {
            if (result.error === '无效的同步密钥') {
                return res.status(404).json({ error: '同步密钥不存在，请检查是否正确' });
            } else if (result.error === '未找到数据') {
                return res.status(404).json({ error: '该同步密钥下没有保存的数据' });
            } else {
                const errorMessage = getErrorMessage(result.error);
                return res.status(500).json({ error: '获取数据失败: ' + errorMessage });
            }
        }

    } catch (error) {
        console.error('下载API错误:', error);
        const errorMessage = getErrorMessage(error);
        return res.status(500).json({ error: '服务器内部错误: ' + errorMessage });
    }
}