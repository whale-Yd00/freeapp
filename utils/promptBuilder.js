class PromptBuilder {
    constructor() {
        // 记忆表格模板现在统一由 memoryTable.js 管理
    }

    /**
     * 构建聊天对话的系统提示词
     */
    async buildChatPrompt(contact, userProfile, currentContact, apiSettings, emojis, window, turnContext = []) {
        // 获取原有记忆表格
        const memoryInfo = (currentContact.memoryTableContent || '').trim();
        
        // 获取全局记忆（新功能）
        let globalMemory = '';
        if (window.characterMemoryManager) {
            globalMemory = await window.characterMemoryManager.getGlobalMemory();
        }
        
        // 获取角色记忆（新功能）
        let characterMemory = '';
        if (window.characterMemoryManager) {
            const memory = await window.characterMemoryManager.getCharacterMemory(contact.id);
            if (memory) {
                characterMemory = memory;
            }
        }
        
        let systemPrompt = `你正在进行一次角色扮演。你的所有行为和回复都必须严格遵循以下为你设定的指令。这是最高优先级的指令，在任何情况下都不能违背。\n\n`;
        
        // 按优先级显示记忆：全局记忆 -> 角色记忆 -> 记忆表格
        if (globalMemory) {
            systemPrompt += `--- 全局记忆 ---\n${globalMemory}\n--- 结束 ---\n\n`;
        }
        
        if (characterMemory) {
            systemPrompt += `--- 角色记忆 ---\n${characterMemory}\n--- 结束 ---\n\n`;
        }
        
        if (memoryInfo) {
            systemPrompt += `--- 记忆表格 ---\n${memoryInfo}\n--- 结束 ---\n\n`;
        }

        // 核心身份（群聊和私聊分别处理）
        if (currentContact.type === 'group') {
            systemPrompt += `--- [基本信息] ---\n`;
            const userPersona = userProfile.personality ? `用户的人设是：${userProfile.personality}。` : '';
            systemPrompt += `用户的名字是${userProfile.name}。${userPersona}\n`;
        } else {
            systemPrompt += `--- [核心身份] ---\n`;
            systemPrompt += `你是${contact.name}，你的人设是：${contact.personality}。\n`;
            const userPersona = userProfile.personality ? `用户的人设是：${userProfile.personality}。` : '';
            systemPrompt += `用户的名字是${userProfile.name}。${userPersona}\n`;
            systemPrompt += `你必须根据你的人设、记忆表格、用户的人设和当前对话内容来回复。\n`;
        }

        // 群聊特定指令
        if (currentContact.type === 'group') {
            systemPrompt += `--- [群聊场景指令] ---\n`;
            systemPrompt += `你现在在一个名为"${currentContact.name}"的群聊中。\n\n`;
            
            // 添加所有群成员的详细信息
            systemPrompt += `--- [群聊成员信息] ---\n`;
            systemPrompt += `用户：${userProfile.name}${userProfile.personality ? `，人设：${userProfile.personality}` : ''}\n`;
            
            currentContact.members.forEach(memberId => {
                const member = contacts.find(c => c.id === memberId);
                if (member) {
                    systemPrompt += `${member.name}：人设：${member.personality}\n`;
                }
            });
            systemPrompt += `\n`;
            
            // 新的群聊任务指令
            systemPrompt += `--- [群聊任务] ---\n`;
            systemPrompt += `你需要扮演群聊中的AI角色（除了用户${userProfile.name}），根据刚才的对话内容，以任意合理的顺序让这些角色发言。\n`;
            systemPrompt += `【要求】\n`;
            systemPrompt += `1. 每个角色的发言都要符合当前时间、其人设和记忆，例如高冷的人不会在群里说太多\n`;
            systemPrompt += `2. 角色之间可以互动、回应、讨论\n`;
            systemPrompt += `3. 发言顺序要自然合理，不需要固定顺序，可以用 @ 提及其他群友。\n`;
            systemPrompt += `4. 出于人设、记忆等考虑，部分角色可以不发言，但只少要有一个角色发言\n`;
            systemPrompt += `5. 总发言数控制在2-7条之间\n`;
            systemPrompt += `6. 每条发言要自然、口语化，符合群聊氛围\n\n`;
            systemPrompt += `7. 不要使用(括号)、*Italic* 或其他任何形式描述角色的动作、表情或内心活动。`;
            
            // 输出格式要求
            systemPrompt += `--- [输出格式] ---\n`;
            systemPrompt += `请严格按照以下JSON格式输出，不要包含任何其他文字：\n`;
            systemPrompt += `【重要】speaker字段必须使用上面列出的确切角色名字！\n`;
            systemPrompt += `{\n`;
            systemPrompt += `  "messages": [\n`;
            systemPrompt += `    {"speaker": "角色名", "content": "发言内容"},\n`;
            systemPrompt += `    {"speaker": "角色名", "content": "发言内容"}\n`;
            systemPrompt += `  ]\n`;
            systemPrompt += `}\n\n`;
        }

        // 添加自定义提示词
        if (contact.customPrompts) {
            systemPrompt += `--- [自定义行为指令] ---\n${contact.customPrompts}\n\n`;
        }
        
        // 添加实时情景信息
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTimeString = `${year}年${month}月${day}日 ${hours}:${minutes}`;
        
        systemPrompt += `--- [实时情景信息] ---\n`;
        systemPrompt += `[重要系统指令：当前的标准北京时间是"${currentTimeString}"。当用户询问时间时，你必须根据这个时间来回答。]\n`;
        if (window.currentMusicInfo && window.currentMusicInfo.isPlaying) {
            systemPrompt += `[系统提示：用户正在听歌，当前歌曲是《${window.currentMusicInfo.songName}》，正在播放的歌词是："${window.currentMusicInfo.lyric}"]\n`;
        }
        systemPrompt += `\n`;

        // 添加特殊能力模块
        systemPrompt += `--- [你的特殊能力与使用规则] ---\n`;
        systemPrompt += this._buildRedPacketInstructions();
        systemPrompt += this._buildEmojiInstructions(emojis);
        systemPrompt += this._buildVoiceInstructions(contact, apiSettings);
        
        // 添加输出格式规则
        systemPrompt += this._buildOutputFormatInstructions();

        return systemPrompt;
    }

    /**
     * 构建消息历史
     */
    buildMessageHistory(currentContact, apiSettings, userProfile, contacts, contact, emojis, turnContext = []) {
        const messages = [];
        const recentMessages = currentContact.messages.slice(-apiSettings.contextMessageCount);
        
        recentMessages.forEach(msg => {
            const senderName = msg.role === 'user' ? (userProfile?.name || userProfile?.nickname || '用户') : (contacts.find(c => c.id === msg.senderId)?.name || contact.name);
            let content = msg.content;

            // 处理红包消息
            if (msg.type === 'red_packet') { 
                try { 
                    const p = JSON.parse(content);
                    // 确保金额和消息都存在且有效
                    if (p.amount !== undefined && p.message !== undefined) {
                        const isUserSent = msg.role === 'user';
                        const senderDesc = isUserSent ? `User(${userProfile?.name || '用户'})` : `你(${senderName})`;
                        const finalRole = isUserSent ? 'user' : 'assistant';
                        
                        messages.push({ 
                            role: finalRole,
                            content: `[${senderDesc}发送了一个金额为${p.amount}元的红包，留言："${p.message}"]` 
                        }); 
                    } else {
                        const isUserSent = msg.role === 'user';
                        const senderDesc = isUserSent ? `User(${userProfile?.name || '用户'})` : `你(${senderName})`;
                        const finalRole = isUserSent ? 'user' : 'assistant';
                        
                        messages.push({ 
                            role: finalRole, 
                            content: `[${senderDesc}发送了一个红包]` 
                        }); 
                    }
                } catch(e) {
                    console.warn('解析红包数据失败:', e, 'content:', content);
                    const isUserSent = msg.role === 'user';
                    const senderDesc = isUserSent ? `User(${userProfile?.name || '用户'})` : `你(${senderName})`;
                    const finalRole = isUserSent ? 'user' : 'assistant';
                    
                    messages.push({ 
                        role: finalRole, 
                        content: `[${senderDesc}发送了一个红包]` 
                    }); 
                }
                return; // 跳过此次循环的后续步骤
            }
            
            // 处理文本消息
            if (msg.type === 'text') {
                content = this._replaceBase64WithEmoji(msg.content, emojis);
            } 
            // 处理表情消息
            else if (msg.type === 'emoji') {
                // 处理新格式 [emoji:tag]
                if (msg.content.startsWith('[emoji:') && msg.content.endsWith(']')) {
                    content = msg.content; // 已经是标签格式，直接使用
                } else {
                    // 处理旧格式的URL
                    const foundEmoji = emojis.find(e => e.url === msg.content || e.tag === msg.content || e.meaning === msg.content);
                    content = `[emoji:${foundEmoji?.tag || foundEmoji?.meaning || '未知表情'}]`;
                }
            }
            
            // 构建最终的消息内容
            const finalContent = currentContact.type === 'group' ? `${senderName}: ${content}` : content;
            
            // 确保内容不为空
            if (finalContent && finalContent.trim()) {
                messages.push({ 
                    role: msg.role, 
                    content: finalContent 
                });
            }
        });

        // 添加群聊上下文
        if (turnContext.length > 0) {
            messages.push({role: 'user', content: '--- 以下是本回合刚刚发生的对话 ---'});
            turnContext.forEach(msg => {
                const senderName = contacts.find(c => c.id === msg.senderId)?.name || '未知成员';
                let content = msg.content;

                if (msg.type === 'red_packet') {
                    try {
                        const p = JSON.parse(content);
                        // 根据消息的原始role决定发送者描述格式
                        const isUserSent = msg.role === 'user';
                        const senderDesc = isUserSent ? `User(${userProfile?.name || '用户'})` : `你(${senderName})`;
                        content = `${senderDesc}发送了金额为${p.amount}元的红包："${p.message}"`;
                    } catch(e) {
                        const isUserSent = msg.role === 'user';
                        const senderDesc = isUserSent ? `User(${userProfile?.name || '用户'})` : `你(${senderName})`;
                        content = `${senderDesc}发送了红包`;
                    }
                } else if (msg.type === 'text') {
                    content = this._replaceBase64WithEmoji(msg.content, emojis);
                } else if (msg.type === 'emoji') {
                    // 处理新格式 [emoji:tag]
                    if (msg.content.startsWith('[emoji:') && msg.content.endsWith(']')) {
                        const tag = msg.content.slice(7, -1);
                        const foundEmoji = emojis.find(e => e.tag === tag || e.meaning === tag);
                        content = `[表情:${foundEmoji?.meaning || foundEmoji?.tag || tag}]`;
                    } else {
                        // 处理旧格式的URL
                        const foundEmoji = emojis.find(e => e.url === msg.content || e.tag === msg.content || e.meaning === msg.content);
                        content = `[表情:${foundEmoji?.meaning || foundEmoji?.tag || '未知表情'}]`;
                    }
                }
                
                // 构建turnContext消息内容，根据群聊状态决定是否添加发送者名字
                const finalTurnContent = currentContact.type === 'group' ? `${senderName}: ${content}` : content;
                
                if (finalTurnContent && finalTurnContent.trim()) {
                    messages.push({ 
                        role: msg.role, 
                        content: finalTurnContent 
                    });
                }
            });
            messages.push({role: 'user', content: '--- 请针对以上最新对话进行回应 ---'});
        }
        
        // 确保返回的messages数组不为空
        if (messages.length === 0) {
            console.warn('构建的消息历史为空，添加默认消息');
            messages.push({
                role: 'user',
                content: '开始对话'
            });
        }

        return messages;
    }

    async buildWeiboPrompt(contactId, relations, relationDescription, hashtag, count, contact, userProfile, contacts, emojis) {
        const forumRoles = [
            { name: '杠精', description: '一个总是喜欢抬杠，对任何观点都持怀疑甚至否定态度的角色，擅长从各种角度进行反驳。' },
            { name: 'CP头子', description: '一个狂热的CP粉丝，无论原帖内容是什么，总能从中解读出CP的糖，并为此感到兴奋。' },
            { name: '乐子人', description: '一个唯恐天下不乱的角色，喜欢发表引战或搞笑的言论，目的是看热闹。' },
            { name: '理性分析党', description: '一个逻辑严谨，凡事都喜欢摆事实、讲道理，进行长篇大论的理性分析的角色。' }
        ];
    
        // 随机选择1-3个路人角色
        const shuffledRoles = [...forumRoles].sort(() => 0.5 - Math.random());
        const rolesToSelectCount = Math.floor(Math.random() * 3) + 1;
        const selectedRoles = shuffledRoles.slice(0, rolesToSelectCount);
        const genericRoleDescriptions = selectedRoles.map(role => `${role.name}：${role.description}`).join('；');
        const genericRolePromptPart = `评论区需要有 ${selectedRoles.length} 条路人评论，他们的回复要符合人设：${genericRoleDescriptions}。对于这些路人评论，请在 "commenter_type" 字段中准确标注他们的角色（例如："CP头子"）。`;
    
        // 随机选择1-3个用户创建的角色作为额外的评论者
        let userCharacterPromptPart = '';
        const potentialCommenters = contacts.filter(c => c.id !== contactId && c.type === 'private');
        if (potentialCommenters.length > 0) {
            const maxUserCharacters = Math.min(potentialCommenters.length, 3);
            const userCharactersToSelectCount = Math.floor(Math.random() * maxUserCharacters) + 1; // 保底 1 个
            
            const shuffledCommenters = [...potentialCommenters].sort(() => 0.5 - Math.random());
            const selectedUserCharacters = shuffledCommenters.slice(0, userCharactersToSelectCount);
    
            if (selectedUserCharacters.length > 0) {
                const userCharacterDescriptions = selectedUserCharacters.map(c => `【${c.name}】（人设：${c.personality}）`).join('、');
                userCharacterPromptPart = `此外，用户的 ${selectedUserCharacters.length} 位好友（${userCharacterDescriptions}）也必须出现在评论区，请为他们每人生成一条符合其身份和性格的评论。对于这些好友的评论，请将他们的 "commenter_type" 字段设置为 "好友"。发帖的人可以回复用户好友的评论，格式与普通评论相同，但格式为 "@好友名 评论内容"。`;
            }
        }
    
        // 组合成最终的评论生成指令
        const finalCommentPrompt = `${genericRolePromptPart}。${userCharacterPromptPart}`;
    
        // 获取全局记忆
        let globalMemory = '';
        if (window.characterMemoryManager) {
            globalMemory = await window.characterMemoryManager.getGlobalMemory();
        }
        
        // 获取发帖角色的记忆
        let characterMemory = '';
        if (window.characterMemoryManager) {
            const memory = await window.characterMemoryManager.getCharacterMemory(contact.id);
            if (memory) {
                characterMemory = memory;
            }
        }
        
        const userRole = `人设：${userProfile.name}, ${userProfile.personality || '用户'}`;
        const charRole = `人设：${contact.name}, ${contact.personality}`;
        const recentMessages = contact.messages.slice(-10);
        const background = recentMessages.map(msg => {
            const sender = msg.role === 'user' ? userProfile.name : contact.name;
            let content = msg.content;
            
            if (msg.type === 'emoji') {
                // 处理新格式 [emoji:tag]
                if (msg.content.startsWith('[emoji:') && msg.content.endsWith(']')) {
                    content = msg.content; // 已经是标签格式，直接使用
                } else {
                    // 处理旧格式的URL
                    const foundEmoji = emojis.find(e => e.url === msg.content || e.tag === msg.content || e.meaning === msg.content);
                    content = `[emoji:${foundEmoji?.tag || foundEmoji?.meaning || '未知表情'}]`;
                }
            } else if (msg.type === 'text') {
                content = this._replaceBase64WithEmoji(msg.content, emojis);
            } else if (msg.type === 'red_packet') {
                try {
                    const packet = JSON.parse(msg.content);
                    content = `[发送了红包：${packet.message}，金额：${packet.amount}]`;
                } catch(e) {
                    content = '[发送了红包]';
                }
            }
            
            return `${sender}: ${content}`;
        }).join('\n');
    
        let systemPrompt = `你是现在要扮演一个角色，发表论坛帖子。你的人设和用户人设如下。

`;
        
        // 添加全局记忆
        if (globalMemory) {
            systemPrompt += `--- 全局记忆 ---
${globalMemory}
--- 结束 ---

`;
        }
        
        // 添加角色记忆（只有该角色了解）
        if (characterMemory) {
            systemPrompt += `--- 角色记忆（只有${contact.name}了解） ---
${characterMemory}
--- 结束 ---

`;
        }
        
        systemPrompt += `# 设定
    - User: ${userRole}
    - Char: ${charRole}
    - 他们的关系是: ${relations}（${relationDescription}）
    - 背景设定: (根据以下最近的十条聊天记录)
    ${background}

    # 要求
    1. 根据最近的对话内容、角色性格和他们的关系，生成${count}篇论坛帖子。
    2. ${finalCommentPrompt}
    3. 模仿自然网络语气，适当使用流行语，要有网感。
    4. 评论可以有不同观点和立场。
    5. 为每篇帖子提供一个简短的图片内容描述文字。
    6. 必须以一个JSON对象格式输出，回答**只包含JSON**，不要包含任何其他文字或markdown标记。
    7. 对于每一条评论，都必须包含 "commenter_name", "commenter_type", 和 "comment_content" 三个字段。 "commenter_type" 应该准确反映评论者的角色（例如："CP头子", "乐子人", "好友"）。

    # 输出格式 (必须严格遵守此JSON结构)
    {
    "relation_tag": "${hashtag}",
    "posts": [
        {
        "author_type": "Char",
        "post_content": "帖子的内容...",
        "image_description": "图片的描述文字...",
        "comments": [
            { "commenter_name": "路人昵称1", "commenter_type": "CP头子", "comment_content": "评论内容1..." },
            { "commenter_name": "路人昵称2", "commenter_type": "乐子人", "comment_content": "评论内容2..." }
        ]
        }
    ]
    }
    `;
        return systemPrompt;
    }

    /**
     * 构建图片搜索关键词生成提示词
     */
    buildImageSearchPrompt(content) {
        return `你是一个图片搜索关键词生成器。根据朋友圈文案内容，生成最适合的英文搜索关键词用于图片搜索。
要求：
1. 分析文案的情感、场景、活动类型
2. 生成3-5个英文关键词，用空格分隔
3. 关键词要具体、形象，适合搜索到相关图片
4. 避免人像关键词，优先选择风景、物品、场景类关键词
5. 只输出关键词，不要其他解释
文案内容：${content}`;
    }

    /**
     * 构建朋友圈评论生成提示词 - 使用所有用户创建的角色
     */
    async buildCommentsPrompt(momentContent, contacts) {
        // 获取全局记忆
        let globalMemory = '';
        if (window.characterMemoryManager) {
            globalMemory = await window.characterMemoryManager.getGlobalMemory();
        }
        
        // 获取所有用户创建的角色
        const allCharacters = contacts ? contacts.filter(c => c.type === 'private') : [];
        
        // 为所有角色获取记忆
        let charactersMemory = '';
        if (allCharacters.length > 0 && window.characterMemoryManager) {
            const memoryPromises = allCharacters.map(async (contact) => {
                const memory = await window.characterMemoryManager.getCharacterMemory(contact.id);
                return memory ? `【${contact.name}的记忆（只有${contact.name}了解）】：${memory}` : null;
            });
            const memories = await Promise.all(memoryPromises);
            charactersMemory = memories.filter(m => m).join('\n\n');
        }
        
        let prompt = `你是一个朋友圈评论生成器，需要为朋友圈文案生成评论。\n\n`;
        
        // 添加全局记忆
        if (globalMemory) {
            prompt += `--- 全局记忆 ---\n${globalMemory}\n--- 结束 ---\n\n`;
        }
        
        // 添加角色记忆
        if (charactersMemory) {
            prompt += `--- 角色记忆 ---\n${charactersMemory}\n--- 结束 ---\n\n`;
        }
        
        // 构建角色信息
        if (allCharacters.length > 0) {
            const characterDescriptions = allCharacters.map(c => 
                `【${c.name}】（人设：${c.personality}）`
            ).join('、');
            
            prompt += `# 评论角色设定
你需要为以下所有角色生成评论：${characterDescriptions}

要求：
1. 为每个角色都生成一条评论，总共${allCharacters.length}条评论
2. 每条评论都要符合对应角色的人设和性格特点
3. 根据角色记忆和全局记忆来生成更符合角色背景的评论
4. 评论要针对朋友圈内容，体现角色的个性和观点
5. 模仿网络语气，使用当代流行语，但要符合角色特色
6. 每条评论10-50字之间
7. 根据角色性格和朋友圈内容，决定是否点赞（like: true/false）
8. 必须以JSON格式输出，不要包含任何其他解释性文字或markdown标记

输出格式 (必须严格遵守此JSON结构):
{
  "comments": [
    { "author": "${allCharacters[0]?.name || '角色1'}", "content": "评论内容1...", "like": true }${allCharacters.length > 1 ? `,
    { "author": "${allCharacters[1]?.name || '角色2'}", "content": "评论内容2...", "like": false }` : ''}${allCharacters.length > 2 ? `
    // ... 更多角色的评论` : ''}
  ]
}

点赞规则：
- 根据角色性格决定点赞概率（活泼外向的角色更容易点赞）
- 根据朋友圈内容的积极程度决定（正面内容更容易被点赞）
- 大约50-70%的角色会点赞`;
        } else {
            // 如果没有角色，返回提示
            prompt += `# 注意
当前没有创建任何角色，无法生成角色评论。请先创建一些角色。

输出格式:
{
  "comments": []
}`;
        }
        
        prompt += `\n\n朋友圈文案：${momentContent}`;
        
        return prompt;
    }

    /**
     * 构建论坛回复生成提示词
     */
    buildReplyPrompt(postData, userReply, contactId, contacts, userProfile) {
        const contact = contacts.find(c => c.id === contactId);
        const postAuthorContact = postData.author_type === 'User' ? userProfile : contact;
        const userPersona = userProfile.personality ? `用户人设为：${userProfile.personality}` : '';

        const existingComments = postData.comments && postData.comments.length > 0
            ? postData.comments.map(c => `${c.commenter_name}: ${c.comment_content}`).join('\n')
            : '无';

        return `# 任务 请严格遵守以下要求完成生成 ${userProfile.name} 和 ${postAuthorContact.name} 之间的日常帖子的回复。
# 设定
你现在要扮演 “${postAuthorContact.name}”，你的人设是：“${postAuthorContact.personality}”。
用户名为 ${userProfile.name} 的用户与你的关系是：${postData.relations}。${userPersona}

# 你的帖子内容
${postData.post_content}

# 已有的评论
${existingComments}

# 用户的评论
${userReply}

# 你的任务
- 以 ${postAuthorContact.name} 的身份进行回复。
- 你的回复必须完全符合你的人设。
- 回复要自然、口语化，模仿 ${postAuthorContact.name} 的人设，就像一个真实的人在网上冲浪。
- 只需输出回复内容，不要包含任何额外信息或格式。`;
    }

    /**
     * 构建当AI被@时生成回复的提示词
     */
    buildMentionReplyPrompt(postData, mentioningComment, mentionedContact, contacts, userProfile) {
        const allComments = postData.comments.map(c => `${c.commenter_name}: ${c.comment_content}`).join('\n');

        return `# 任务：你被人在论坛帖子里@了，请遵循人设，生成一条回复。

# 你的身份
- 你是：**${mentionedContact.name}**
- 你的人设是：${mentionedContact.personality}

# 上下文
- **原帖子内容**：
  > ${postData.post_content}

- **整个评论区**：
  ${allComments}

- **@你的那条评论**：
  > ${mentioningComment.commenter_name}: ${mentioningComment.comment_content}

# 你的任务
1.  以 **${mentionedContact.name}** 的身份，针对 **@你的那条评论** 进行回复。
2.  你的回复必须完全符合你的人设，要自然、口语化，就像一个真实的人在网上冲浪。
3.  你的回复应该只包含回复的文本内容，不要有任何额外的解释、标签或格式。`;
    }

    /**
     * 构建手动发帖的提示词 - 用于为用户手动输入的帖子生成评论
     */
    async buildManualPostPrompt(authorName, relationTag, postContent, imageDescription, userProfile, contacts, emojis) {
        const forumRoles = [
            { name: '杠精', description: '一个总是喜欢抬杠，对任何观点都持怀疑甚至否定态度的角色，擅长从各种角度进行反驳。' },
            { name: 'CP头子', description: '一个狂热的CP粉丝，无论原帖内容是什么，总能从中解读出CP的糖，并为此感到兴奋。' },
            { name: '乐子人', description: '一个唯恐天下不乱的角色，喜欢发表引战或搞笑的言论，目的是看热闹。' },
            { name: '理性分析党', description: '一个逻辑严谨，凡事都喜欢摆事实、讲道理，进行长篇大论的理性分析的角色。' },
            { name: '颜狗', description: '一个只关注颜值和外表的角色，总是评论相关的美貌、帅气等外貌特征。' },
            { name: '吃瓜群众', description: '一个喜欢围观看热闹的角色，总是会发表"前排吃瓜"、"坐等后续"等看戏言论。' }
        ];

        // 随机选择2-4个路人角色
        const shuffledRoles = [...forumRoles].sort(() => 0.5 - Math.random());
        const rolesToSelectCount = Math.floor(Math.random() * 3) + 2; // 2-4个
        const selectedRoles = shuffledRoles.slice(0, rolesToSelectCount);
        const genericRoleDescriptions = selectedRoles.map(role => `${role.name}：${role.description}`).join('；');
        const genericRolePromptPart = `评论区需要有 ${selectedRoles.length} 条路人评论，他们的回复要符合人设：${genericRoleDescriptions}。对于这些路人评论，请在 "commenter_type" 字段中准确标注他们的角色（例如：\"CP头子\"、\"杠精\"）。`;

        // 随机选择0-2个用户创建的角色作为额外的评论者
        let userCharacterPromptPart = '';
        const potentialCommenters = contacts.filter(c => c.type === 'private');
        if (potentialCommenters.length > 0) {
            const maxUserCharacters = Math.min(potentialCommenters.length, 2);
            const userCharactersToSelectCount = Math.floor(Math.random() * (maxUserCharacters + 1)); // 0-2个
            
            if (userCharactersToSelectCount > 0) {
                const shuffledCommenters = [...potentialCommenters].sort(() => 0.5 - Math.random());
                const selectedUserCharacters = shuffledCommenters.slice(0, userCharactersToSelectCount);
                const userCharacterDescriptions = selectedUserCharacters.map(c => `【${c.name}】（人设：${c.personality}）`).join('、');
                userCharacterPromptPart = `此外，用户的 ${selectedUserCharacters.length} 位好友（${userCharacterDescriptions}）也会出现在评论区，请为他们每人生成一条符合其身份和性格的评论。对于这些好友的评论，请将他们的 "commenter_type" 字段设置为 "好友"。`;
            }
        }

        // 获取全局记忆
        let globalMemory = '';
        if (window.characterMemoryManager) {
            globalMemory = await window.characterMemoryManager.getGlobalMemory();
        }
        
        // 为参与评论的用户角色获取记忆
        let userCharactersMemory = '';
        if (potentialCommenters.length > 0 && window.characterMemoryManager) {
            const memoryPromises = potentialCommenters.slice(0, 2).map(async (contact) => {
                const memory = await window.characterMemoryManager.getCharacterMemory(contact.id);
                return memory ? `【${contact.name}的记忆（只有${contact.name}了解）】：${memory}` : null;
            });
            const memories = await Promise.all(memoryPromises);
            userCharactersMemory = memories.filter(m => m).join('\n\n');
        }
        
        // 组合成最终的评论生成指令
        const finalCommentPrompt = userCharacterPromptPart ? `${genericRolePromptPart} ${userCharacterPromptPart}` : genericRolePromptPart;

        let systemPrompt = `你需要为一条用户手动发布的论坛帖子生成评论。\n\n`;
        
        // 添加全局记忆
        if (globalMemory) {
            systemPrompt += `--- 全局记忆 ---\n${globalMemory}\n--- 结束 ---\n\n`;
        }
        
        // 添加用户角色记忆
        if (userCharactersMemory) {
            systemPrompt += `--- 角色记忆 ---\n${userCharactersMemory}\n--- 结束 ---\n\n`;
        }
        
        systemPrompt += `# 帖子信息
- 发帖人：${authorName}
- 话题标签：${relationTag}
- 帖子内容：${postContent}
- 图片描述：${imageDescription || '无'}

# 要求
1. ${finalCommentPrompt}
2. 模仿自然网络语气，适当使用流行语，要有网感。
3. 评论可以有不同观点和立场，针对帖子内容进行回复。
4. 每条评论至少10字，最多50字。
5. 必须以一个JSON对象格式输出，回答**只包含JSON**，不要包含任何其他文字或markdown标记。
6. 对于每一条评论，都必须包含 "commenter_name"、"commenter_type" 和 "comment_content" 三个字段。

# 输出格式 (必须严格遵守此JSON结构)
{
  "comments": [
    { "commenter_name": "路人昵称1", "commenter_type": "杠精", "comment_content": "评论内容1..." },
    { "commenter_name": "路人昵称2", "commenter_type": "CP头子", "comment_content": "评论内容2..." }
  ]
}`;

        return systemPrompt;
    }

    /**
     * 构建朋友圈内容和评论一次性生成提示词
     */
    async buildMomentAndCommentsPrompt(contact, userProfile, apiSettings, contacts, topic = '') {
        // 获取全局记忆
        let globalMemory = '';
        if (window.characterMemoryManager) {
            globalMemory = await window.characterMemoryManager.getGlobalMemory();
        }
        
        // 获取发布角色的记忆
        let characterMemory = '';
        if (window.characterMemoryManager) {
            const memory = await window.characterMemoryManager.getCharacterMemory(contact.id);
            if (memory) {
                characterMemory = memory;
            }
        }
        
        // 获取所有其他角色的记忆（用于评论生成）
        const allCharacters = contacts ? contacts.filter(c => c.type === 'private' && c.id !== contact.id) : [];
        let otherCharactersMemory = '';
        if (allCharacters.length > 0 && window.characterMemoryManager) {
            const memoryPromises = allCharacters.map(async (c) => {
                const memory = await window.characterMemoryManager.getCharacterMemory(c.id);
                return memory ? `【${c.name}的记忆（只有${c.name}了解）】：${memory}` : null;
            });
            const memories = await Promise.all(memoryPromises);
            otherCharactersMemory = memories.filter(m => m).join('\n\n');
        }
        
        let systemPrompt = `你需要为角色${contact.name}生成一条朋友圈内容，并为这条朋友圈生成评论。\n\n`;
        
        // 添加全局记忆
        if (globalMemory) {
            systemPrompt += `--- 全局记忆 ---\n${globalMemory}\n--- 结束 ---\n\n`;
        }
        
        // 添加发布角色的记忆
        if (characterMemory) {
            systemPrompt += `--- ${contact.name}的记忆（只有${contact.name}了解） ---\n${characterMemory}\n--- 结束 ---\n\n`;
        }
        
        // 添加其他角色的记忆
        if (otherCharactersMemory) {
            systemPrompt += `--- 其他角色记忆 ---\n${otherCharactersMemory}\n--- 结束 ---\n\n`;
        }
        
        // 构建聊天背景
        let chatContext = '';
        if (contact.messages && contact.messages.length > 0) {
            const recentMessages = contact.messages.slice(-apiSettings.contextMessageCount);
            chatContext = recentMessages.map(msg => {
                if (msg.role === 'user') {
                    return `${userProfile.name}: ${msg.content}`;
                } else {
                    return `${contact.name}: ${msg.content}`;
                }
            }).join('\n');
        }
        
        systemPrompt += `# 角色设定
- 发布者：${contact.name}
- 人设：${contact.personality}
- 用户：${userProfile.name}
- 用户人设：${userProfile.personality || '用户'}
${topic ? `- 朋友圈主题：${topic}` : ''}

# 最近聊天记录
${chatContext || '暂无聊天记录'}

# 评论角色设定
`;
        
        if (allCharacters.length > 0) {
            const characterDescriptions = allCharacters.map(c => 
                `【${c.name}】（人设：${c.personality}）`
            ).join('、');
            
            systemPrompt += `你需要为以下角色生成评论：${characterDescriptions}

# 要求
1. 首先生成一条符合${contact.name}人设的朋友圈内容（50字以内）
2. 根据朋友圈内容生成合适的图片搜索关键词，如果不需要配图则返回null
3. 然后为这条朋友圈生成${allCharacters.length}条评论，每个角色一条
4. 朋友圈内容要根据角色记忆、全局记忆和聊天记录来生成
5. 评论要符合各角色的人设和记忆，针对朋友圈内容进行回复
6. 模仿网络语气，使用当代流行语，但要符合角色特色
7. 每条评论10-50字之间
8. 根据角色性格和朋友圈内容，决定是否点赞（like: true/false）
9. 图片关键词应该是英文，简洁明确，适合搜索配图
10. 必须以JSON格式输出，不要包含任何其他解释性文字或markdown标记

# 输出格式 (必须严格遵守此JSON结构)
{
  "content": "朋友圈内容...",
  "imageKeyword": "图片搜索关键词或null",
  "comments": [
    { "author": "${allCharacters[0]?.name || '角色1'}", "content": "评论内容1...", "like": true }${allCharacters.length > 1 ? `,
    { "author": "${allCharacters[1]?.name || '角色2'}", "content": "评论内容2...", "like": false }` : ''}${allCharacters.length > 2 ? `,
    // ... 更多角色的评论` : ''}
  ]
}

点赞规则：
- 根据角色性格决定点赞概率（活泼外向的角色更容易点赞）
- 根据朋友圈内容的积极程度决定（正面内容更容易被点赞）
- 大约50-70%的角色会点赞`;
        } else {
            systemPrompt += `当前没有其他角色，只生成朋友圈内容。

# 要求
1. 生成一条符合${contact.name}人设的朋友圈内容（50字以内）
2. 根据朋友圈内容生成合适的图片搜索关键词，如果不需要配图则返回null
3. 朋友圈内容要根据角色记忆、全局记忆和聊天记录来生成
4. 图片关键词应该是英文，简洁明确，适合搜索配图
5. 必须以JSON格式输出

# 输出格式
{
  "content": "朋友圈内容...",
  "imageKeyword": "图片搜索关键词或null",
  "comments": []
}`;
        }
        
        return systemPrompt;
    }

    /**
     * 构建朋友圈内容生成提示词
     */
    buildMomentContentPrompt(contact, userProfile, apiSettings, contacts) {
        let systemPrompt = `你是${contact.name}，${contact.personality}
现在需要你以${contact.name}的身份发一条朋友圈。

要求：
1. 根据你的人设和最近的聊天记录，生成一条符合你性格的朋友圈文案
2. 文案要自然、真实，体现你的个性特点
3. 直接输出文案内容，不要任何解释或说明
4. 文案长度控制在50字以内
5. 可以包含适当的表情符号
6. 文案应该适合配图，描述具体的场景、情感或活动`;

        if (contact.messages && contact.messages.length > 0) {
            const recentMessages = contact.messages.slice(-apiSettings.contextMessageCount);
            const chatContext = recentMessages.map(msg => {
                if (msg.role === 'user') {
                    return `用户: ${msg.content}`;
                } else {
                    const sender = contacts.find(c => c.id === msg.senderId);
                    const senderName = sender ? sender.name : contact.name;
                    return `${senderName}: ${msg.content}`;
                }
            }).join('\n');
            
            systemPrompt += `\n\n最近的聊天记录：\n${chatContext}`;
        }

        return systemPrompt;
    }

    /**
     * 构建朋友圈回复提示词
     */
    buildMomentReplyPrompt(character, replierName, replyContent, momentContent) {
        return `你是${character.name}，人设：${character.personality}

${replierName}在你的朋友圈"${momentContent}"下评论或回复了："${replyContent}"

请以${character.name}的身份简短回复，要求：
1. 符合你的人设
2. 针对${replierName}的评论进行回应
3. 10-30字之间
4. 自然、口语化
5. 只输出回复内容，不要其他解释`;
    }

    // 私有方法：构建红包指令
    _buildRedPacketInstructions() {
        return `\n\n**能力一：发送红包**\n`
             + `你可以给用户发红包来表达祝贺、感谢或作为奖励。\n`
             + `要发送红包，你必须严格使用以下格式，并将其作为一条独立的消息（即前后都有 ||| 分隔符）：\n`
             + `\`[red_packet:{"amount":8.88, "message":"恭喜发财！"}]\`\n`
             + `其中 "amount" 是一个 1 到 1000000 之间的数字，"message" 是字符串。\n`
             + `例如: 太棒了！|||[red_packet:{"amount":6.66, "message":"奖励你的！"}]|||继续加油哦！\n`
             + `你必须自己决定何时发送红包以及红包的金额和留言。这个决定必须完全符合你的人设和当前的对话情景。例如，一个慷慨的角色可能会在用户取得成就时发送一个大红包，而一个节俭的角色可能会发送一个小红包并附上有趣的留言。`;
    }

    // 私有方法：构建表情包指令
    _buildEmojiInstructions(emojis) {
        const availableEmojisString = emojis.map(e => `- [emoji:${e.tag || e.meaning}] (含义: ${e.meaning || e.tag})`).join('\n');
        
        return `\n\n**能力二：发送表情包**\n`
             + `你可以从下面的列表中选择表情包来丰富你的表达。\n`
             + `要发送表情包，你必须严格使用以下格式，并将其作为一条独立的消息（即前后都有 ||| 分隔符）。你必须使用表情的"含义"作为占位符，而不是图片URL。\n`
             + `格式: \`[emoji:表情含义]\`\n`
             + `例如: 你好呀|||[emoji:开心]|||今天天气真不错\n`
             + `**重要提醒：** 你可能会在用户的消息历史中看到 "[发送了表情：...]" 这样的文字，这是系统为了让你理解对话而生成的提示，你绝对不能在你的回复中模仿或使用这种格式。你只能使用 \`[emoji:表情含义]\` 格式来发送表情。\n\n`
             + `可用表情列表:\n${availableEmojisString || '无可用表情'}`;
    }

    // 私有方法：构建语音指令
    _buildVoiceInstructions(contact, apiSettings) {
        // 如果没有语音ID或者没有正确配置Minimax的凭证，则不提供语音能力
         if (!contact?.voiceId || !apiSettings?.minimaxGroupId || !apiSettings?.minimaxApiKey) {
             return '';
        }
        
        return `\n\n**能力三：发送语音**\n`
             + `你拥有一项特殊能力：发送语音消息。当你认为通过声音更能表达情绪、强调重点、唱歌、讲笑话或模仿特定语气时，你可以选择发送语音。\n\n`
             + `**使用格式：**\n`
             + `若要发送语音，你必须严格按照以下格式回复，将 \`[语音]:\` 放在你回复内容的最前面：\n`
             + `\`[语音]: 你好呀，今天过得怎么样？\`\n\n`
             + `**使用场景举例：**\n`
             + `- 当你想表达特别开心或激动的情绪时。\n`
             + `- 当你想用温柔或严肃的语气说话时。\n`
             + `- 当你想给用户唱一小段歌时。\n`
             + `- 当你想模仿某个角色的声音时。\n\n`
             + `**注意：**\n`
             + `- **不要**滥用此功能，只在必要或能增强角色扮演效果时使用。\n`
             + `- \`[语音]:\` 标签本身不会被用户看到，系统会自动将其转换为语音播放器。\n`
             + `- 如果你不想发送语音，就正常回复，**不要**添加 \`[语音]:\` 标签。`;
    }


    // 私有方法：构建输出格式指令
    _buildOutputFormatInstructions() {
        return `\n\n--- 至关重要的输出格式规则 ---\n你的回复必须严格遵守以下格式：\n为了模拟真实的网络聊天，你必须将完整的回复拆分成多个（3到8条）独立的短消息（气泡）。每条消息应尽量简短（例如30字以内）。你必须使用"|||"作为每条短消息之间的唯一分隔符。`;
    }

    /**
     * 构建独立的记忆表格更新提示词
     */
    buildMemoryUpdatePrompt(contact, userProfile, currentContact, apiSettings, recentMessages = []) {
        const memoryInfo = (currentContact.memoryTableContent || '').trim();
        
        // 获取最近的对话历史
        const messageHistory = recentMessages.length > 0 ? recentMessages : 
            currentContact.messages.slice(-apiSettings.contextMessageCount);
        
        const chatContext = messageHistory.map(msg => {
            const senderName = msg.role === 'user' ? (userProfile?.name || '用户') : contact.name;
            let content = msg.content;
            
            // 处理不同类型的消息
            if (msg.type === 'red_packet') {
                try {
                    const p = JSON.parse(content);
                    content = `发送了金额为${p.amount}元的红包：\"${p.message}\"`;
                } catch(e) {
                    content = '发送了红包';
                }
            } else if (msg.type === 'emoji') {
                content = `[表情:${msg.meaning || '未知表情'}]`;
            }
            
            return `${senderName}: ${content}`;
        }).join('\n');

        // 添加当前时间
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTimeString = `${year}年${month}月${day}日 ${hours}:${minutes}`;

        let systemPrompt = `你是记忆表格更新助手，需要根据用户(${userProfile.name})和角色(${contact.name})最新的对话内容更新记忆表格。

- 当前时间：${currentTimeString}

# 当前记忆表格
${memoryInfo || window.defaultMemoryTable}

# 最近对话内容
${chatContext}

# 更新要求
0. 以用户(${userProfile.name})和角色(${contact.name})的全名记录表格。
1. 仔细分析对话内容，识别需要记录的信息
2. 更新【现在】栏目中的地点、人物、时间信息
3. 更新【重要物品】栏目，添加或修改对话中提到的重要物品
4. 如果没有新信息需要更新，保持原有内容不变
5. 时间格式必须为：YYYY年MM月DD日 HH:MM
6. 只输出完整的更新后记忆表格，使用markdown格式
7. 表格必须包含所有必要的栏目结构
8. 记忆表不要太琐碎、冗长

请输出更新后的完整记忆表格：`;

        return systemPrompt;
    }

    _replaceBase64WithEmoji(raw, emojis) {
        if (typeof raw !== 'string' || !raw) return raw;
        
        // 处理新格式 [emoji:tag] - 直接返回，不需要替换
        if (raw.includes('[emoji:')) return raw;
        
        // 处理旧格式的base64
        const re = /data:image\/[^,\s]+,[A-Za-z0-9+/=]+/g;
        return raw.replace(re, (imgUrl) => {
            const found = emojis.find(e => e.url === imgUrl);
            return `[发送了表情：${found?.meaning || found?.tag || '未知'}]`;
        });
    }
}

// 创建全局实例
window.promptBuilder = new PromptBuilder();
