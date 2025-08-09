// 修改: 'import' 改为 'require'
const { neon } = require('@neondatabase/serverless');

/**
 * 数据库工具类
 */
// 修改: 去掉 'export'
class Database {
    static getSql() {
        return neon(process.env.DATABASE_URL);
    }

    /**
     * 初始化数据库表
     */
    static async init() {
        try {
            const sql = this.getSql();
            
            // 创建同步密钥表
            await sql`
                CREATE TABLE IF NOT EXISTS sync_keys (
                    id SERIAL PRIMARY KEY,
                    sync_key VARCHAR(255) UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;

            // 创建用户数据表
            await sql`
                CREATE TABLE IF NOT EXISTS user_data (
                    id SERIAL PRIMARY KEY,
                    sync_key VARCHAR(255) NOT NULL,
                    data_content JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (sync_key) REFERENCES sync_keys(sync_key) ON DELETE CASCADE,
                    UNIQUE(sync_key)
                );
            `;

            // 创建索引以提高查询性能
            await sql`
                CREATE INDEX IF NOT EXISTS idx_sync_keys_sync_key ON sync_keys(sync_key);
            `;
            
            await sql`
                CREATE INDEX IF NOT EXISTS idx_user_data_sync_key ON user_data(sync_key);
            `;

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
            const sql = this.getSql();
            const result = await sql`
                SELECT sync_key FROM sync_keys WHERE sync_key = ${syncKey};
            `;
            return result.length > 0;
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
            const sql = this.getSql();
            await sql`
                INSERT INTO sync_keys (sync_key) VALUES (${syncKey})
                ON CONFLICT (sync_key) DO NOTHING;
            `;
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

            const sql = this.getSql();
            // 保存或更新数据
            await sql`
                INSERT INTO user_data (sync_key, data_content, updated_at)
                VALUES (${syncKey}, ${JSON.stringify(data)}, CURRENT_TIMESTAMP)
                ON CONFLICT (sync_key) 
                DO UPDATE SET 
                    data_content = ${JSON.stringify(data)}, 
                    updated_at = CURRENT_TIMESTAMP;
            `;

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

            const sql = this.getSql();
            const result = await sql`
                SELECT data_content, updated_at FROM user_data 
                WHERE sync_key = ${syncKey};
            `;

            if (result.length === 0) {
                return { success: false, error: '未找到数据' };
            }

            const row = result[0];
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
            const sql = this.getSql();
            await sql`
                DELETE FROM user_data WHERE sync_key = ${syncKey};
            `;
            
            await sql`
                DELETE FROM sync_keys WHERE sync_key = ${syncKey};
            `;

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
            const sql = this.getSql();
            const syncKeysResult = await sql`SELECT COUNT(*) as count FROM sync_keys;`;
            const userDataResult = await sql`SELECT COUNT(*) as count FROM user_data;`;

            return {
                success: true,
                stats: {
                    syncKeys: parseInt(syncKeysResult[0].count),
                    userDataEntries: parseInt(userDataResult[0].count)
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