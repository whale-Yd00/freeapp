// PostgreSQL 数据库连接
const { Pool } = require('pg');
/**
 * 数据库工具类
 */
class Database {
    static pool = null;
    
    static getPool() {
        if (!this.pool) {
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            });
        }
        return this.pool;
    }
    /**
     * 初始化数据库表
     */
    static async init() {
        try {
            const client = this.getPool();
            
            // 创建同步密钥表
            await client.query(`
                CREATE TABLE IF NOT EXISTS sync_keys (
                    id SERIAL PRIMARY KEY,
                    sync_key VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            // 创建用户数据表
            await client.query(`
                CREATE TABLE IF NOT EXISTS user_data (
                    id SERIAL PRIMARY KEY,
                    sync_key VARCHAR(255) NOT NULL,
                    data_content JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (sync_key) REFERENCES sync_keys(sync_key) ON DELETE CASCADE,
                    UNIQUE(sync_key)
                );
            `);
            
            // 创建索引以提高查询性能
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_sync_keys_sync_key ON sync_keys(sync_key);
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_user_data_sync_key ON user_data(sync_key);
            `);
            
            console.log('数据库初始化完成');
            return { success: true };
        } catch (error) {
            console.error('数据库初始化失败:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 验证同步密钥是否存在
     * @param {string} syncKey - 同步密钥
     * @returns {Promise<boolean>} 是否存在
     */
    static async validateSyncKey(syncKey) {
        try {
            const client = this.getPool();
            const result = await client.query(
                'SELECT sync_key FROM sync_keys WHERE sync_key = $1',
                [syncKey]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('验证同步密钥失败:', error);
            throw error;
        }
    }
    /**
     * 创建同步密钥
     * @param {string} syncKey - 同步密钥
     * @returns {Promise<object>} 创建结果
     */
    static async createSyncKey(syncKey) {
        try {
            const client = this.getPool();
            await client.query(
                'INSERT INTO sync_keys (sync_key) VALUES ($1) ON CONFLICT (sync_key) DO NOTHING',
                [syncKey]
            );
            return { success: true };
        } catch (error) {
            console.error('创建同步密钥失败:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 保存用户数据
     * @param {string} syncKey - 同步密钥
     * @param {object} data - 用户数据
     * @returns {Promise<object>} 保存结果
     */
    static async saveUserData(syncKey, data) {
        try {
            // 检查同步密钥是否存在
            const keyExists = await this.validateSyncKey(syncKey);
            if (!keyExists) {
                return { success: false, error: '无效的同步密钥' };
            }
            const client = this.getPool();
            // 保存或更新数据
            await client.query(`
                INSERT INTO user_data (sync_key, data_content, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (sync_key) 
                DO UPDATE SET 
                    data_content = $2, 
                    updated_at = CURRENT_TIMESTAMP
            `, [syncKey, JSON.stringify(data)]);
            return { success: true };
        } catch (error) {
            console.error('保存用户数据失败:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 获取用户数据
     * @param {string} syncKey - 同步密钥
     * @returns {Promise<object>} 用户数据
     */
    static async getUserData(syncKey) {
        try {
            // 检查同步密钥是否存在
            const keyExists = await this.validateSyncKey(syncKey);
            if (!keyExists) {
                return { success: false, error: '无效的同步密钥' };
            }
            const client = this.getPool();
            const result = await client.query(
                'SELECT data_content, updated_at FROM user_data WHERE sync_key = $1',
                [syncKey]
            );
            if (result.rows.length === 0) {
                return { success: false, error: '未找到数据' };
            }
            const row = result.rows[0];
            return {
                success: true,
                data: row.data_content,
                updatedAt: row.updated_at
            };
        } catch (error) {
            console.error('获取用户数据失败:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 删除用户数据
     * @param {string} syncKey - 同步密钥
     * @returns {Promise<object>} 删除结果
     */
    static async deleteUserData(syncKey) {
        try {
            const client = this.getPool();
            await client.query('DELETE FROM user_data WHERE sync_key = $1', [syncKey]);
            await client.query('DELETE FROM sync_keys WHERE sync_key = $1', [syncKey]);
            return { success: true };
        } catch (error) {
            console.error('删除用户数据失败:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * 获取数据库统计信息
     * @returns {Promise<object>} 统计信息
     */
    static async getStats() {
        try {
            const client = this.getPool();
            const syncKeysResult = await client.query('SELECT COUNT(*) as count FROM sync_keys');
            const userDataResult = await client.query('SELECT COUNT(*) as count FROM user_data');
            return {
                success: true,
                stats: {
                    syncKeys: parseInt(syncKeysResult.rows[0].count),
                    userDataEntries: parseInt(userDataResult.rows[0].count)
                }
            };
        } catch (error) {
            console.error('获取统计信息失败:', error);
            return { success: false, error: error.message };
        }
    }
}
// 修改: 在文件末尾添加 module.exports，导出一个包含 Database 类的对象
module.exports = { Database };