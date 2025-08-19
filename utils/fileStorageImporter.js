/**
 * 文件存储导入器
 * 专门处理文件存储数据的智能导入和匹配
 */

class FileStorageImporter {
    constructor() {
        this.dbName = 'WhaleLLTDB';
        this.dbVersion = 12;
        this.db = null;
        this.fileManager = null;
        
        // 自动匹配规则
        this.matchingRules = {
            // 头像匹配规则
            avatars: {
                keyFields: ['id', 'name', 'contactId'],
                tolerance: 0.8, // 匹配容忍度
                autoCreate: true
            },
            // 背景匹配规则
            backgrounds: {
                keyFields: ['contactId', 'id'],
                tolerance: 0.9,
                autoCreate: true
            },
            // 表情包匹配规则
            emojis: {
                keyFields: ['tag', 'meaning'],
                tolerance: 0.95,
                autoCreate: true
            },
            // 朋友圈图片匹配规则
            moments: {
                keyFields: ['momentId', 'id', 'timestamp'],
                tolerance: 0.8,
                autoCreate: false // 朋友圈图片不自动创建
            }
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
     * 从ZIP文件导入文件存储数据
     * @param {File} zipFile - ZIP文件
     * @param {Object} options - 导入选项
     * @returns {Object} 导入结果
     */
    async importFromZipFile(zipFile, options = {}) {
        try {
            // 加载JSZip库
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip库未加载，请确保页面中包含了JSZip');
            }

            const zip = new JSZip();
            const zipContent = await zip.loadAsync(zipFile);

            // 读取元数据
            const metadataFile = zipContent.file('metadata.json');
            if (!metadataFile) {
                throw new Error('ZIP文件中缺少metadata.json文件');
            }

            const metadataText = await metadataFile.async('text');
            const metadata = JSON.parse(metadataText);

            // 验证格式
            if (metadata.format !== 'file_storage_zip_export') {
                throw new Error('不是有效的文件存储ZIP导出文件');
            }

            // 执行导入
            return await this.importFromZipContent(zipContent, metadata, options);

        } catch (error) {
            console.error('从ZIP文件导入失败:', error);
            throw new Error(`导入失败: ${error.message}`);
        }
    }

    /**
     * 从ZIP内容导入
     */
    async importFromZipContent(zipContent, metadata, options) {
        await this.init();
        
        const {
            autoMatch = true,
            overwrite = false,
            createMissing = true,
            matchTolerance = 0.8,
            progressCallback = null
        } = options;

        const importResults = {
            totalFiles: 0,
            processed: 0,
            matched: 0,
            created: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            matchingDetails: {},
            summary: {}
        };

        // 获取现有数据用于匹配
        const existingData = await this.getExistingData();
        
        // 计算总文件数
        const totalFiles = Object.values(metadata.files || {})
            .reduce((sum, files) => sum + files.length, 0);
        importResults.totalFiles = totalFiles;

        // 按文件夹处理导入
        for (const [folderName, files] of Object.entries(metadata.files || {})) {
            if (progressCallback) {
                progressCallback({
                    phase: 'processing',
                    folderName,
                    totalFolders: Object.keys(metadata.files).length,
                    currentFolder: Object.keys(importResults.summary).length + 1
                });
            }

            const folderResult = await this.processZipFolder(
                folderName,
                files,
                zipContent,
                existingData,
                {
                    autoMatch,
                    overwrite,
                    createMissing,
                    matchTolerance,
                    progressCallback
                }
            );

            // 合并结果
            importResults.processed += folderResult.processed;
            importResults.matched += folderResult.matched;
            importResults.created += folderResult.created;
            importResults.skipped += folderResult.skipped;
            importResults.failed += folderResult.failed;
            importResults.errors.push(...folderResult.errors);
            importResults.matchingDetails[folderName] = folderResult.matchingDetails;
            importResults.summary[folderName] = folderResult;
        }

        console.log('ZIP文件导入完成:', importResults);
        return { success: true, results: importResults };
    }

    /**
     * 处理ZIP文件夹中的文件
     */
    async processZipFolder(folderName, files, zipContent, existingData, options) {
        const results = {
            processed: 0,
            matched: 0,
            created: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            matchingDetails: []
        };

        const matchingRule = this.getMatchingRuleByFolder(folderName);
        
        for (const fileInfo of files) {
            try {
                results.processed++;
                
                if (options.progressCallback) {
                    options.progressCallback({
                        phase: 'importing',
                        folderName,
                        current: results.processed,
                        total: files.length,
                        file: fileInfo
                    });
                }

                // 从ZIP中读取文件
                const zipFile = zipContent.file(fileInfo.originalPath);
                if (!zipFile) {
                    throw new Error(`找不到文件: ${fileInfo.originalPath}`);
                }

                const fileBlob = await zipFile.async('blob');

                // 尝试匹配现有数据
                const matchResult = options.autoMatch ? 
                    await this.findBestMatchFromFileInfo(fileInfo, existingData, folderName, matchingRule) :
                    null;

                let importAction = 'create';
                let shouldImport = true;
                let matchingDetails = null;

                if (matchResult && matchResult.score >= options.matchTolerance) {
                    matchingDetails = matchResult;
                    
                    // 检查是否已存在文件
                    const existingReference = await this.fileManager.getFileReference(
                        fileInfo.reference.category,
                        matchResult.match.referenceKey || fileInfo.reference.referenceKey
                    );

                    if (existingReference) {
                        if (options.overwrite) {
                            // 删除现有文件
                            await this.fileManager.deleteFile(existingReference.fileId);
                            await this.fileManager.deleteFileReference(
                                fileInfo.reference.category,
                                existingReference.referenceKey
                            );
                            importAction = 'replace';
                        } else {
                            // 跳过已存在的文件
                            results.skipped++;
                            results.matched++;
                            shouldImport = false;
                            importAction = 'skip';
                        }
                    } else {
                        importAction = 'match_create';
                        results.matched++;
                    }
                } else if (!options.createMissing && !matchingRule.autoCreate) {
                    // 没有匹配且不允许创建新文件
                    results.skipped++;
                    shouldImport = false;
                    importAction = 'skip_no_match';
                }

                if (shouldImport) {
                    // 执行导入
                    await this.importSingleFileFromBlob(fileInfo, fileBlob, matchResult);
                    
                    if (importAction === 'create' || importAction === 'match_create') {
                        results.created++;
                    }
                }

                // 记录匹配详情
                results.matchingDetails.push({
                    originalPath: fileInfo.originalPath,
                    referenceKey: fileInfo.reference.referenceKey,
                    action: importAction,
                    matchScore: matchResult?.score || 0,
                    matchedItem: matchResult?.match || null,
                    success: true
                });

            } catch (error) {
                results.failed++;
                results.errors.push({
                    fileInfo: fileInfo,
                    error: error.message
                });
                
                results.matchingDetails.push({
                    originalPath: fileInfo.originalPath,
                    referenceKey: fileInfo.reference.referenceKey,
                    action: 'error',
                    error: error.message,
                    success: false
                });
                
                console.error(`导入文件失败:`, error, fileInfo);
            }
        }

        return results;
    }

    /**
     * 智能导入文件存储数据（兼容原有的JSON格式）
     * @param {Object} importData - 导入的数据
     * @param {Object} options - 导入选项
     * @returns {Object} 导入结果
     */
    async smartImport(importData, options = {}) {
        await this.init();
        
        const {
            autoMatch = true,
            overwrite = false,
            createMissing = true,
            matchTolerance = 0.8,
            progressCallback = null
        } = options;

        try {
            // 验证数据格式
            const validation = this.validateImportData(importData);
            if (!validation.valid) {
                throw new Error(`数据验证失败: ${validation.error}`);
            }

            const importResults = {
                totalFiles: 0,
                processed: 0,
                matched: 0,
                created: 0,
                skipped: 0,
                failed: 0,
                errors: [],
                matchingDetails: {},
                summary: {}
            };

            // 获取现有数据用于匹配
            const existingData = await this.getExistingData();
            
            // 计算总数
            importResults.totalFiles = Object.values(importData.files)
                .reduce((sum, files) => sum + files.length, 0);

            // 按类型处理导入
            for (const [groupKey, files] of Object.entries(importData.files)) {
                if (progressCallback) {
                    progressCallback({
                        phase: 'processing',
                        groupKey,
                        totalGroups: Object.keys(importData.files).length,
                        currentGroup: Object.keys(importResults.summary).length + 1
                    });
                }

                const groupResult = await this.processFileGroup(
                    groupKey,
                    files,
                    existingData,
                    {
                        autoMatch,
                        overwrite,
                        createMissing,
                        matchTolerance,
                        progressCallback
                    }
                );

                // 合并结果
                importResults.processed += groupResult.processed;
                importResults.matched += groupResult.matched;
                importResults.created += groupResult.created;
                importResults.skipped += groupResult.skipped;
                importResults.failed += groupResult.failed;
                importResults.errors.push(...groupResult.errors);
                importResults.matchingDetails[groupKey] = groupResult.matchingDetails;
                importResults.summary[groupKey] = groupResult;
            }

            console.log('智能导入完成:', importResults);
            return { success: true, results: importResults };

        } catch (error) {
            console.error('智能导入失败:', error);
            throw new Error(`导入失败: ${error.message}`);
        }
    }

    /**
     * 处理一组文件的导入
     */
    async processFileGroup(groupKey, files, existingData, options) {
        const results = {
            processed: 0,
            matched: 0,
            created: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            matchingDetails: []
        };

        const matchingRule = this.getMatchingRule(groupKey);
        
        for (const fileRecord of files) {
            try {
                results.processed++;
                
                if (options.progressCallback) {
                    options.progressCallback({
                        phase: 'importing',
                        groupKey,
                        current: results.processed,
                        total: files.length,
                        file: fileRecord
                    });
                }

                // 尝试匹配现有数据
                const matchResult = options.autoMatch ? 
                    await this.findBestMatch(fileRecord, existingData, groupKey, matchingRule) :
                    null;

                let importAction = 'create';
                let shouldImport = true;
                let matchingDetails = null;

                if (matchResult && matchResult.score >= options.matchTolerance) {
                    matchingDetails = matchResult;
                    
                    // 检查是否已存在文件
                    const existingReference = await this.fileManager.getFileReference(
                        fileRecord.reference.category,
                        matchResult.match.referenceKey || fileRecord.reference.referenceKey
                    );

                    if (existingReference) {
                        if (options.overwrite) {
                            // 删除现有文件
                            await this.fileManager.deleteFile(existingReference.fileId);
                            await this.fileManager.deleteFileReference(
                                fileRecord.reference.category,
                                existingReference.referenceKey
                            );
                            importAction = 'replace';
                        } else {
                            // 跳过已存在的文件
                            results.skipped++;
                            results.matched++;
                            shouldImport = false;
                            importAction = 'skip';
                        }
                    } else {
                        importAction = 'match_create';
                        results.matched++;
                    }
                } else if (!options.createMissing && !matchingRule.autoCreate) {
                    // 没有匹配且不允许创建新文件
                    results.skipped++;
                    shouldImport = false;
                    importAction = 'skip_no_match';
                }

                if (shouldImport) {
                    // 执行导入
                    await this.importSingleFile(fileRecord, matchResult);
                    
                    if (importAction === 'create' || importAction === 'match_create') {
                        results.created++;
                    }
                }

                // 记录匹配详情
                results.matchingDetails.push({
                    fileId: fileRecord.fileId,
                    referenceKey: fileRecord.reference.referenceKey,
                    action: importAction,
                    matchScore: matchResult?.score || 0,
                    matchedItem: matchResult?.match || null,
                    success: true
                });

            } catch (error) {
                results.failed++;
                results.errors.push({
                    fileRecord: fileRecord,
                    error: error.message
                });
                
                results.matchingDetails.push({
                    fileId: fileRecord.fileId,
                    referenceKey: fileRecord.reference.referenceKey,
                    action: 'error',
                    error: error.message,
                    success: false
                });
                
                console.error(`导入文件失败:`, error, fileRecord);
            }
        }

        return results;
    }

    /**
     * 导入单个文件（从Blob）
     */
    async importSingleFileFromBlob(fileInfo, blob, matchResult) {
        // 存储文件
        const storeResult = await this.fileManager.storeFile(blob, fileInfo.metadata || {});
        
        // 确定引用键（可能来自匹配结果）
        const referenceKey = matchResult?.match?.referenceKey || fileInfo.reference.referenceKey;
        
        // 创建引用
        await this.fileManager.createFileReference(
            storeResult.fileId,
            fileInfo.reference.category,
            referenceKey,
            {
                ...fileInfo.reference.metadata,
                importedAt: new Date().toISOString(),
                matchScore: matchResult?.score || null,
                originalReferenceKey: fileInfo.reference.referenceKey,
                originalPath: fileInfo.originalPath
            }
        );

        return storeResult;
    }

    /**
     * 导入单个文件（兼容原有JSON格式）
     */
    async importSingleFile(fileRecord, matchResult) {
        // 转换base64为Blob
        const blob = this.base64ToBlob(fileRecord.data);
        
        // 存储文件
        const storeResult = await this.fileManager.storeFile(blob, fileRecord.metadata);
        
        // 确定引用键（可能来自匹配结果）
        const referenceKey = matchResult?.match?.referenceKey || fileRecord.reference.referenceKey;
        
        // 创建引用
        await this.fileManager.createFileReference(
            storeResult.fileId,
            fileRecord.reference.category,
            referenceKey,
            {
                ...fileRecord.reference.metadata,
                importedAt: new Date().toISOString(),
                matchScore: matchResult?.score || null,
                originalReferenceKey: fileRecord.reference.referenceKey
            }
        );

        return storeResult;
    }

    /**
     * 查找最佳匹配
     */
    async findBestMatch(fileRecord, existingData, groupKey, matchingRule) {
        const candidates = this.getCandidatesForMatching(existingData, groupKey);
        
        if (!candidates || candidates.length === 0) {
            return null;
        }

        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of candidates) {
            const score = this.calculateMatchScore(fileRecord, candidate, matchingRule);
            
            if (score > bestScore && score >= matchingRule.tolerance) {
                bestScore = score;
                bestMatch = candidate;
            }
        }

        return bestMatch ? { match: bestMatch, score: bestScore } : null;
    }

    /**
     * 计算匹配分数
     */
    calculateMatchScore(fileRecord, candidate, matchingRule) {
        let totalScore = 0;
        let weightSum = 0;

        const referenceKey = fileRecord.reference.referenceKey;
        const metadata = fileRecord.reference.metadata;

        // 基于关键字段计算匹配分数
        for (const field of matchingRule.keyFields) {
            const weight = this.getFieldWeight(field);
            let fieldScore = 0;

            // 直接键匹配
            if (candidate[field] && candidate[field] === referenceKey) {
                fieldScore = 1.0;
            }
            // 元数据匹配
            else if (metadata[field] && candidate[field]) {
                fieldScore = this.calculateStringsimilarity(
                    String(metadata[field]),
                    String(candidate[field])
                );
            }
            // ID匹配
            else if (candidate.id && candidate.id === referenceKey) {
                fieldScore = 0.9;
            }

            totalScore += fieldScore * weight;
            weightSum += weight;
        }

        return weightSum > 0 ? totalScore / weightSum : 0;
    }

    /**
     * 计算字符串相似度
     */
    calculateStringsimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * 编辑距离算法
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * 获取现有数据用于匹配
     */
    async getExistingData() {
        const existingData = {
            contacts: [],
            emojis: [],
            backgrounds: null,
            moments: [],
            userProfile: null
        };

        try {
            // 获取联系人数据
            const contactsRequest = await this.getStoreData('contacts');
            existingData.contacts = contactsRequest || [];

            // 获取表情包数据
            const emojisRequest = await this.getStoreData('emojis');
            existingData.emojis = emojisRequest || [];

            // 获取背景数据
            const backgroundsRequest = await this.getStoreData('backgrounds');
            existingData.backgrounds = backgroundsRequest?.[0] || null;

            // 获取朋友圈数据
            const momentsRequest = await this.getStoreData('moments');
            existingData.moments = momentsRequest || [];

            // 获取用户资料
            const userProfileRequest = await this.getStoreData('userProfile');
            existingData.userProfile = userProfileRequest?.[0] || null;

        } catch (error) {
            console.error('获取现有数据失败:', error);
        }

        return existingData;
    }

    /**
     * 获取存储数据
     */
    async getStoreData(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取候选匹配项
     */
    getCandidatesForMatching(existingData, groupKey) {
        switch (groupKey) {
            case 'avatars':
                return [...existingData.contacts];
            case 'user_avatars':
                return existingData.userProfile ? [existingData.userProfile] : [];
            case 'backgrounds':
                // 背景数据结构特殊，需要转换
                if (existingData.backgrounds) {
                    return Object.keys(existingData.backgrounds)
                        .filter(key => key !== 'id')
                        .map(contactId => ({ id: contactId, referenceKey: contactId }));
                }
                return [];
            case 'emojis':
                return existingData.emojis;
            case 'moments':
                return existingData.moments;
            default:
                return [];
        }
    }

    /**
     * 根据文件夹名获取匹配规则
     */
    getMatchingRuleByFolder(folderName) {
        const folderToRuleMapping = {
            'avatars': 'avatars',
            'user_avatars': 'avatars',
            'backgrounds': 'backgrounds',
            'emojis': 'emojis',
            'moments': 'moments'
        };
        
        const ruleKey = folderToRuleMapping[folderName] || 'avatars';
        return this.matchingRules[ruleKey] || {
            keyFields: ['id'],
            tolerance: 0.8,
            autoCreate: true
        };
    }

    /**
     * 从文件信息中查找最佳匹配
     */
    async findBestMatchFromFileInfo(fileInfo, existingData, folderName, matchingRule) {
        // 将文件信息转换为匹配格式
        const pseudoFileRecord = {
            reference: fileInfo.reference
        };
        
        return await this.findBestMatch(pseudoFileRecord, existingData, folderName, matchingRule);
    }

    /**
     * 获取匹配规则
     */
    getMatchingRule(groupKey) {
        return this.matchingRules[groupKey] || {
            keyFields: ['id'],
            tolerance: 0.8,
            autoCreate: true
        };
    }

    /**
     * 获取字段权重
     */
    getFieldWeight(field) {
        const weights = {
            id: 1.0,
            tag: 1.0,
            contactId: 0.9,
            name: 0.8,
            meaning: 0.7,
            momentId: 1.0,
            timestamp: 0.6
        };
        return weights[field] || 0.5;
    }

    // === 辅助方法 ===

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
     * 生成导入预览
     */
    async generateImportPreview(importData) {
        const preview = {
            totalFiles: 0,
            categories: {},
            potentialMatches: {},
            warnings: []
        };

        // 获取现有数据
        const existingData = await this.getExistingData();

        for (const [groupKey, files] of Object.entries(importData.files)) {
            preview.totalFiles += files.length;
            
            const categoryPreview = {
                fileCount: files.length,
                samples: files.slice(0, 3), // 显示前3个样本
                estimatedMatches: 0,
                estimatedNew: 0
            };

            // 估算匹配情况
            const matchingRule = this.getMatchingRule(groupKey);
            let estimatedMatches = 0;

            for (const file of files.slice(0, 10)) { // 只检查前10个作为估算
                const matchResult = await this.findBestMatch(file, existingData, groupKey, matchingRule);
                if (matchResult && matchResult.score >= 0.8) {
                    estimatedMatches++;
                }
            }

            categoryPreview.estimatedMatches = Math.round(estimatedMatches * files.length / Math.min(files.length, 10));
            categoryPreview.estimatedNew = files.length - categoryPreview.estimatedMatches;

            preview.categories[groupKey] = categoryPreview;
        }

        return preview;
    }
}

// 创建全局实例
const fileStorageImporter = new FileStorageImporter();

// 导出到window对象
window.FileStorageImporter = fileStorageImporter;