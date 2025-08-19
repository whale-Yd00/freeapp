/**
 * 文件存储导出器
 * 专门处理图片、表情包、背景等文件数据的导入导出
 * 支持ZIP格式打包，保持原始文件格式
 */

class FileStorageExporter {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.dbVersion = 13;
        this.db = null;
        this.fileManager = null;
        
        // 支持的文件类型
        this.supportedFileTypes = ['avatar', 'background', 'emoji', 'moment', 'banner'];
        
        // 文件夹映射
        this.folderMapping = {
            'avatar_contact': 'avatars',
            'avatar_user': 'user_avatars', 
            'background': 'backgrounds',
            'emoji': 'emojis',
            'moment_image': 'moments',
            'banner': 'banners'
        };

        // 文件扩展名映射
        this.mimeToExtension = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.bmp',
            'image/svg+xml': '.svg',
            'image/jpg': '.jpg'
        };
    }

    /**
     * 初始化
     */
    async init() {
        if (!this.db) {
            if (window.db && window.isIndexedDBReady) {
                this.db = window.db;
            } else {
                throw new Error('数据库未初始化');
            }
        }

        if (!this.fileManager) {
            if (window.FileStorageManager) {
                this.fileManager = window.FileStorageManager;
                await this.fileManager.init();
            } else {
                throw new Error('FileStorageManager未加载');
            }
        }

        return true;
    }

    /**
     * 导出所有文件存储数据为ZIP格式
     * @param {Object} options - 导出选项
     * @returns {Object} 导出结果
     */
    async exportFileStorageAsZip(options = {}) {
        await this.init();
        
        const {
            includeAvatars = true,
            includeBackgrounds = true,
            includeEmojis = true,
            includeMoments = true
        } = options;

        try {
            // 加载JSZip库
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip库未加载，请确保页面中包含了JSZip');
            }

            const zip = new JSZip();
            
            // 创建元数据
            const metadata = {
                exportTime: new Date().toISOString(),
                version: this.dbVersion,
                format: 'file_storage_zip_export',
                description: '文件存储ZIP导出包',
                structure: {
                    avatars: '用户和联系人头像',
                    user_avatars: '用户头像',
                    backgrounds: '聊天背景图片', 
                    emojis: '表情包图片',
                    moments: '朋友圈图片'
                }
            };

            const statistics = {
                totalFiles: 0,
                totalSize: 0,
                folderBreakdown: {}
            };

            // 获取所有文件存储数据
            const allFiles = await this.getAllFiles();
            const allReferences = await this.getAllReferences();

            // 按类型处理文件
            for (const file of allFiles) {
                const references = allReferences.filter(ref => ref.fileId === file.fileId);
                
                for (const reference of references) {
                    const category = reference.category;
                    
                    // 根据选项过滤
                    if (!this.shouldIncludeCategory(category, {
                        includeAvatars,
                        includeBackgrounds,
                        includeEmojis,
                        includeMoments
                    })) {
                        continue;
                    }

                    // 确定文件夹和文件名
                    const folderName = this.folderMapping[category] || 'others';
                    const extension = this.getFileExtension(file.type);
                    const fileName = this.generateFileName(reference, extension);
                    const filePath = `${folderName}/${fileName}`;

                    // 添加文件到ZIP
                    zip.file(filePath, file.blob);

                    // 创建文件信息记录
                    const fileInfo = {
                        originalPath: filePath,
                        fileId: file.fileId,
                        type: file.type,
                        size: file.size,
                        createdAt: file.createdAt,
                        reference: {
                            category: reference.category,
                            referenceKey: reference.referenceKey,
                            referenceId: reference.referenceId,
                            metadata: reference.metadata || {}
                        }
                    };

                    // 添加到元数据的文件列表
                    if (!metadata.files) {
                        metadata.files = {};
                    }
                    if (!metadata.files[folderName]) {
                        metadata.files[folderName] = [];
                    }
                    metadata.files[folderName].push(fileInfo);

                    // 更新统计信息
                    statistics.totalFiles++;
                    statistics.totalSize += file.size;
                    
                    if (!statistics.folderBreakdown[folderName]) {
                        statistics.folderBreakdown[folderName] = { count: 0, size: 0 };
                    }
                    statistics.folderBreakdown[folderName].count++;
                    statistics.folderBreakdown[folderName].size += file.size;
                }
            }

            // 添加元数据和统计信息到ZIP
            metadata.statistics = statistics;
            zip.file('metadata.json', JSON.stringify(metadata, null, 2));

            console.log('文件存储ZIP导出完成:', statistics);

            return {
                zip: zip,
                metadata: metadata,
                statistics: statistics
            };

        } catch (error) {
            console.error('导出文件存储ZIP失败:', error);
            throw new Error(`导出失败: ${error.message}`);
        }
    }

    /**
     * 导入文件存储数据
     * @param {Object} importData - 导入的数据
     * @param {Object} options - 导入选项
     * @returns {Object} 导入结果
     */
    async importFileStorage(importData, options = {}) {
        await this.init();
        
        const {
            overwrite = false,
            autoMatch = true,
            createMissing = true
        } = options;

        try {
            // 验证导入数据格式
            const validation = this.validateImportData(importData);
            if (!validation.valid) {
                throw new Error(`数据格式无效: ${validation.error}`);
            }

            const importResults = {
                success: 0,
                failed: 0,
                matched: 0,
                created: 0,
                errors: [],
                summary: {}
            };

            // 按类型处理导入
            for (const [groupKey, files] of Object.entries(importData.files)) {
                console.log(`开始导入 ${groupKey} 类型文件，共 ${files.length} 个`);
                
                const groupResult = await this.importFileGroup(
                    groupKey, 
                    files, 
                    { overwrite, autoMatch, createMissing }
                );
                
                // 合并结果
                importResults.success += groupResult.success;
                importResults.failed += groupResult.failed;
                importResults.matched += groupResult.matched;
                importResults.created += groupResult.created;
                importResults.errors.push(...groupResult.errors);
                importResults.summary[groupKey] = groupResult;
            }

            console.log('文件存储导入完成:', importResults);
            return { success: true, results: importResults };

        } catch (error) {
            console.error('导入文件存储失败:', error);
            throw new Error(`导入失败: ${error.message}`);
        }
    }

    /**
     * 导入一组文件
     */
    async importFileGroup(groupKey, files, options) {
        const results = {
            success: 0,
            failed: 0,
            matched: 0,
            created: 0,
            errors: []
        };

        for (const fileRecord of files) {
            try {
                // 检查是否已存在
                const existingReference = await this.fileManager.getFileReference(
                    fileRecord.reference.category,
                    fileRecord.reference.referenceKey
                );

                let shouldImport = true;
                let isMatched = false;

                if (existingReference) {
                    if (!options.overwrite) {
                        // 已存在且不覆盖，跳过
                        results.matched++;
                        isMatched = true;
                        shouldImport = false;
                    } else {
                        // 删除现有文件和引用
                        await this.fileManager.deleteFile(existingReference.fileId);
                        await this.fileManager.deleteFileReference(
                            fileRecord.reference.category,
                            fileRecord.reference.referenceKey
                        );
                    }
                }

                if (shouldImport) {
                    // 转换base64为Blob
                    const blob = this.base64ToBlob(fileRecord.data);
                    
                    // 存储新文件
                    const storeResult = await this.fileManager.storeFile(blob, fileRecord.metadata);
                    
                    // 创建引用
                    await this.fileManager.createFileReference(
                        storeResult.fileId,
                        fileRecord.reference.category,
                        fileRecord.reference.referenceKey,
                        fileRecord.reference.metadata
                    );

                    if (isMatched) {
                        results.matched++;
                    } else {
                        results.created++;
                    }
                    results.success++;
                }

            } catch (error) {
                results.failed++;
                results.errors.push({
                    fileRecord: fileRecord,
                    error: error.message
                });
                console.error(`导入文件失败:`, error, fileRecord);
            }
        }

        return results;
    }

    /**
     * 下载文件存储数据为ZIP格式
     */
    async downloadFileStorageAsZip(options = {}) {
        try {
            const { zip, statistics } = await this.exportFileStorageAsZip(options);
            
            // 生成ZIP文件
            const zipBlob = await zip.generateAsync({ 
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: {
                    level: 6
                }
            });
            
            // 下载ZIP文件
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `whale-files-${timestamp}.zip`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            return { 
                success: true, 
                message: `文件存储导出成功！导出了 ${statistics.totalFiles} 个文件，总大小 ${this.formatBytes(statistics.totalSize)}`,
                statistics: statistics
            };
            
        } catch (error) {
            console.error('下载ZIP文件失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 从文件读取并导入
     */
    async importFromFile(file, options = {}) {
        try {
            const importData = await this.readImportFile(file);
            return await this.importFileStorage(importData, options);
        } catch (error) {
            throw new Error(`从文件导入失败: ${error.message}`);
        }
    }

    // === 辅助方法 ===

    /**
     * 获取所有文件
     */
    async getAllFiles() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileStorage'], 'readonly');
            const store = transaction.objectStore('fileStorage');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有引用
     */
    async getAllReferences() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['fileReferences'], 'readonly');
            const store = transaction.objectStore('fileReferences');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 判断是否应该包含某个分类
     */
    shouldIncludeCategory(category, options) {
        switch (category) {
            case 'avatar_contact':
            case 'avatar_user':
                return options.includeAvatars;
            case 'background':
                return options.includeBackgrounds;
            case 'emoji':
                return options.includeEmojis;
            case 'moment_image':
                return options.includeMoments;
            default:
                return true;
        }
    }

    /**
     * 获取文件扩展名
     */
    getFileExtension(mimeType) {
        return this.mimeToExtension[mimeType] || '.jpg';
    }

    /**
     * 生成文件名
     */
    generateFileName(reference, extension) {
        // 使用引用键作为基础文件名，确保安全
        let baseName = reference.referenceKey || reference.fileId || 'unknown';
        
        // 清理文件名中的非法字符
        baseName = baseName.replace(/[<>:"/\\|?*]/g, '_');
        
        // 如果文件名太长，截取前50个字符
        if (baseName.length > 50) {
            baseName = baseName.substring(0, 50);
        }
        
        return baseName + extension;
    }

    /**
     * 格式化字节数
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 获取文件分组键
     */
    getFileGroupKey(category) {
        return this.folderMapping[category] || category;
    }

    /**
     * 获取相关引用信息
     */
    async getRelatedReferences(allReferences) {
        const references = {};
        
        for (const ref of allReferences) {
            const groupKey = this.getFileGroupKey(ref.category);
            if (!references[groupKey]) {
                references[groupKey] = [];
            }
            references[groupKey].push({
                referenceId: ref.referenceId,
                category: ref.category,
                referenceKey: ref.referenceKey,
                fileId: ref.fileId
            });
        }
        
        return references;
    }

    /**
     * Blob转base64
     */
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    /**
     * base64转Blob
     */
    base64ToBlob(base64String) {
        try {
            const [header, data] = base64String.split(',');
            const mimeMatch = header.match(/data:([^;]+);base64/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            
            const byteCharacters = atob(data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        } catch (error) {
            throw new Error(`base64转换失败: ${error.message}`);
        }
    }

    /**
     * 验证导入数据
     */
    validateImportData(importData) {
        if (!importData || typeof importData !== 'object') {
            return { valid: false, error: '数据格式无效' };
        }

        if (!importData._metadata) {
            return { valid: false, error: '缺少元数据' };
        }

        if (importData._metadata.format !== 'file_storage_export') {
            return { valid: false, error: '文件格式不匹配，这不是文件存储导出文件' };
        }

        if (!importData.files || typeof importData.files !== 'object') {
            return { valid: false, error: '缺少文件数据' };
        }

        return { valid: true };
    }

    /**
     * 读取导入文件
     */
    async readImportFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('请选择要导入的文件'));
                return;
            }
            
            if (!file.name.endsWith('.json')) {
                reject(new Error('只支持 JSON 格式的文件存储导出文件'));
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const data = JSON.parse(text);
                    resolve(data);
                } catch (error) {
                    reject(new Error('文件格式错误，无法解析 JSON'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsText(file, 'utf-8');
        });
    }

    /**
     * 获取存储统计信息
     */
    async getStorageStatistics() {
        await this.init();
        
        const stats = await this.fileManager.getStorageStats();
        const allReferences = await this.getAllReferences();
        
        // 按类型分类统计
        const categoryStats = {};
        for (const ref of allReferences) {
            const groupKey = this.getFileGroupKey(ref.category);
            if (!categoryStats[groupKey]) {
                categoryStats[groupKey] = { count: 0, references: [] };
            }
            categoryStats[groupKey].count++;
            categoryStats[groupKey].references.push(ref);
        }
        
        return {
            ...stats,
            categoryBreakdown: categoryStats,
            totalReferences: allReferences.length
        };
    }
}

// 创建全局实例
const fileStorageExporter = new FileStorageExporter();

// 导出到window对象
window.FileStorageExporter = fileStorageExporter;