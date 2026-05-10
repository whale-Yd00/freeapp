/*
 * [Whale-LLT]
 * Copyright (C) [2025] [Xuan Jing]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
class PromptBuilder {
    constructor() {
        this.INNER_OS_MARKER = '\n\n【角色沉浸要求】在你的思考过程（<think>标签内）中，请遵守以下规则：\n1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如"（心想：……）"或"(内心OS：……)"\n2. 用第一人称描写角色的内心感受，例如"我心想""我觉得""我暗自"等\n3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复';
        this.NO_INNER_OS_MARKER = '\n\n【思维模式要求】在你的思考过程（<think>标签内）中，请遵守以下规则：\n1. 禁止使用圆括号包裹内心独白，例如"（心想：……）"或"(内心OS：……)"，所有分析内容直接陈述即可\n2. 禁止以角色第一人称描写内心活动，例如"我心想""我觉得""我暗自"等，请用分析性语言替代\n3. 思考内容应聚焦于剧情走向分析和回复内容规划，不要在思考中进行角色扮演式的内心戏表演';
        this.defaultMemoryTable = 
`# 角色设定
- 姓名：
- 性格特点：
- 性别：
- 说话风格：
- 职业：

# 用户设定
- 姓名：
- 性别：
- 与角色的关系：
- 用户性格：

# 背景设定
- 时间地点：
- 事件：

## 📋 记忆表格

### 【现在】
| 项目 | 内容 |
|------|------|
| 地点 | 未知 |
| 人物 | 未知 |
| 时间 | 未知 |

### 【未来】
| 约定事项 | 详细内容 |
|----------|----------|

### 【过去】
| 人物 | 事件 | 地点 | 时间 |
|------|------|------|------|

### 【重要物品】
| 物品名称 | 物品描述 | 重要原因 |
|----------|----------|----------|
`;
    }
    
    /**
     * 新增：一个辅助函数，用于将毫秒差转换为人类可读的字符串
     * @param {number} ms - 毫秒时间差
     * @returns {string} - 格式化后的时间差字符串
     */
    _formatTimeDifference(ms) {
        if (ms < 60000) return '不到一分钟'; // 小于1分钟
        const minutes = Math.floor(ms / 60000);
        if (minutes < 60) return `${minutes}分钟`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `大约${hours}小时`;
        const days = Math.floor(hours / 24);
        return `${days}天`;
    }
    
    /**
     * 构建聊天对话的系统提示词
     */
    buildChatPrompt(contact, userProfile, currentContact, apiSettings, emojis, window, turnContext = []) {
        let systemPrompt = `你正在进行一次角色扮演。你的所有行为和回复都必须严格遵循以下为你设定的指令。这是最高优先级的指令，在任何情况下都不能违背。\n\n`;

        // 彻底移除旧的 <memory_table> 强制包裹要求
        systemPrompt += `--- [绝对核心指令：输出格式] ---\n`;
        systemPrompt += `你的唯一任务是扮演角色并生成特定格式的聊天文本。聊天内容中，**每一个气泡（每一句话）占一行**。绝对不能输出任何不符合此格式的文本。\n\n`;
        systemPrompt += this._buildOutputFormatInstructions();
        systemPrompt += this._buildMultiBubbleChatInstructions();

        // 核心身份与记忆
        systemPrompt += `--- [核心身份与记忆] ---\n`;
        systemPrompt += `你是${contact.name}，你的人设是：${contact.personality}。\n`;
        const userPersona = userProfile.personality ? `用户的人设是：${userProfile.personality}。` : '';
        systemPrompt += `用户的名字是${userProfile.name}。${userPersona}\n`;
        systemPrompt += `你必须根据你的人设、记忆、用户的人设和当前对话内容来回复。\n`;

        // 群聊特定指令
        if (currentContact.type === 'group') {
            const memberNames = currentContact.members.map(id => contacts.find(c => c.id === id)?.name || '未知成员');
            systemPrompt += `--- [群聊场景指令] ---\n`;
            systemPrompt += `你现在在一个名为"${currentContact.name}"的群聊中。群成员有：${userProfile.name} (用户), ${memberNames.join(', ')}。\n`;
            systemPrompt += `你的任务是根据自己的人设、记忆表格和用户人设，对**本回合**中在你之前其他人的**完整发言**进行回应，然后发表你自己的**完整观点**，以推动群聊进行。可以赞同、反驳、开玩笑、或者提出新的话题。\n`;
            systemPrompt += `你的发言需要自然地融入对话，就像一个真正在参与群聊的人。\n\n`;
        }

        // 添加自定义提示词
        if (contact.customPrompts) {
            systemPrompt += `--- [自定义行为指令] ---\n${contact.customPrompts}\n\n`;
        }
        
        // 添加特殊能力模块
        systemPrompt += `--- [你的特殊能力与使用规则] ---\n`;
        systemPrompt += this._buildRedPacketInstructions();
        systemPrompt += this._buildEmojiInstructions(emojis);
        systemPrompt += this._buildVoiceInstructions(contact, apiSettings);

        return systemPrompt;
    }

    /**
     * 【已修复】构建发送给API的消息历史记录
     */
    buildMessageHistory(currentContact, apiSettings, userProfile, contacts, contact, emojis, turnContext = [], includeRuntimeContext = true, retrievedMemoryFacts = [], options = {}) {
        const {
            includeFullMemoryTableInMainPrompt = false,
            memoryPreviewMaxChars = 0,
            keepLatestUserMessageLast = true
        } = options || {};

        const messages = [];
        // 1. 获取用户设置的基础上下文长度（例如 30）
        const baseCount = apiSettings.contextMessageCount;
        
        // 2. 设定缓冲步长：固定为 50 条，减少高频互动时的截断频率
        const step = 50;
        
        // 3. 计算当前消息总数
        const total = currentContact.messages.length;
        
        // 4. 计算超出的部分
        const over = Math.max(0, total - baseCount);
        
        // 5. 计算应该丢弃的消息数量（按 step 步进）
        let dropCount = Math.floor(over / step) * step;
        
        // 6. 【关键安全策略】如果截断后，剩下的第一条消息是 AI(assistant) 发的，
        // 则少截断一条，确保丢弃后留下的上下文始终以 User 消息开头
        if (dropCount > 0 && dropCount < total) {
            if (currentContact.messages[dropCount].role === 'assistant') {
                dropCount -= 1;
            }
        }
        
        // 7. 进行截取
        const recentMessages = currentContact.messages.slice(dropCount);
        
        recentMessages.forEach(msg => {
            // 根据角色获取发送者名称
            const senderName = msg.role === 'user' 
                ? (userProfile?.name || '用户') 
                : (contacts.find(c => c.id === msg.senderId)?.name || contact.name);
            
            let content = ''; // 初始化内容变量

            // 根据消息类型处理内容
            if (msg.type === 'red_packet') {
                try {
                    const p = JSON.parse(msg.content);
                    // 1. 判断红包发送者是谁
                    const packetSenderText = msg.role === 'user' ? '用户' : '你'; // 对AI来说，assistant就是"你"
                    
                    // 2. 构建正确的描述文本
                    const packetContent = `[${packetSenderText}发送了一个金额为${p.amount}元的红包，留言："${p.message}"]`;

                    // 3. 使用消息本身的 role，而不是写死的 'user'
                    messages.push({
                        role: msg.role,
                        content: packetContent
                    });
                } catch (e) {
                    const packetSenderText = msg.role === 'user' ? '用户' : '你';
                    messages.push({
                        role: msg.role, // 同样修正这里的 role
                        content: `[${packetSenderText}发送了一个红包]`
                    });
                }
                return; // 处理完后跳过后续逻辑，进入下一条消息循环
            }
            
            // ====================== 核心修改点在这里 ======================
            if (msg.type === 'emoji') {
                // 对于新格式的表情消息，msg.content 本身就是表情的含义，例如 "开心"
                // 我们直接用它来构建AI看的懂的标签
                content = `<emoji>${msg.content}</emoji>`;
            } 
            // 对于文本消息，我们检查里面是否包含旧的Base64格式表情并替换
            else if (msg.type === 'text') {
                content = this._replaceBase64WithEmoji(msg.content, emojis);
            }
            // ====================== 修改结束 ======================
            
            // 构建最终的消息内容（群聊时加上发言人前缀）
            const finalContent = currentContact.type === 'group' ? `${senderName}: ${content}` : content;
            
            // 确保内容不为空再添加到历史记录
            if (finalContent && finalContent.trim()) {
                messages.push({ 
                    role: msg.role, 
                    content: finalContent 
                });
            }
        });

        // 群聊的上下文逻辑保持不变
        if (turnContext.length > 0) {
            messages.push({role: 'user', content: '--- 以下是本回合刚刚发生的对话 ---'});
            turnContext.forEach(msg => {
                const senderName = contacts.find(c => c.id === msg.senderId)?.name || '未知成员';
                let content = '';

                if (msg.type === 'emoji') {
                    // 同样需要修正这里的逻辑
                    content = `<emoji>${msg.content}</emoji>`;
                } else if (msg.type === 'text') {
                    content = this._replaceBase64WithEmoji(msg.content, emojis);
                } else if (msg.type === 'red_packet') {
                    try {
                        const p = JSON.parse(msg.content);
                        // 根据发送者角色决定文本
                        const senderVerb = msg.role === 'user' ? '发送' : '回赠';
                        content = `${senderVerb}了金额为${p.amount}元的红包："${p.message}"`;
                    } catch(e) {
                        const senderVerb = msg.role === 'user' ? '发送' : '回赠';
                        content = `${senderVerb}了红包`;
                    }
                }
                
                if (content && content.trim()) {
                    messages.push({ 
                        role: msg.role, 
                        content: `${senderName}: ${content}` 
                    });
                }
            });
            messages.push({role: 'user', content: '--- 请针对以上最新对话进行回应 ---'});
        }
        
        // 确保返回的messages数组不为空
        if (messages.length === 0) {
            messages.push({ role: 'user', content: '开始对话' });
        }

        if (includeRuntimeContext) {
            const runtimeContextBlock = this._buildRuntimeContextBlock(currentContact);
            const thinkMode = currentContact?.thinkMode || 'default';
            let thinkMarker = '';
            if (thinkMode === 'inner_os') {
                thinkMarker = this.INNER_OS_MARKER;
            } else if (thinkMode === 'no_inner_os') {
                thinkMarker = this.NO_INNER_OS_MARKER;
            }

            let memoryContext = '';
            const memoryInfoRaw = (currentContact.memoryTableContent || '').trim();

            if (includeFullMemoryTableInMainPrompt && memoryInfoRaw) {
                let memoryInfo;
                if (memoryPreviewMaxChars > 0) {
                    if (memoryInfoRaw.length > memoryPreviewMaxChars) {
                        const headLen = Math.floor(memoryPreviewMaxChars * 0.6);
                        const tailLen = Math.floor(memoryPreviewMaxChars * 0.4);
                        memoryInfo = memoryInfoRaw.slice(0, headLen) + '\n...\n' + memoryInfoRaw.slice(-tailLen);
                    } else {
                        memoryInfo = memoryInfoRaw;
                    }
                } else {
                    memoryInfo = memoryInfoRaw;
                }

                memoryContext = `\n\n--- [当前记忆摘要] ---\n以下是当前记忆的精简视图，仅供参考，不要直接复制输出：\n<current_memory_summary>\n${memoryInfo}\n</current_memory_summary>\n`;
            }

            let relevantFactsSection = '';
            if (Array.isArray(retrievedMemoryFacts) && retrievedMemoryFacts.length > 0 && typeof window.buildRelevantMemoryFactsBlock === 'function') {
                relevantFactsSection = '\n\n' + window.buildRelevantMemoryFactsBlock(retrievedMemoryFacts);
            }

            const extraContext = `${memoryContext}${relevantFactsSection}${runtimeContextBlock}${thinkMarker}`.trim();
            if (extraContext) {
                const runtimeMessages = [
                    { role: 'assistant', content: '（系统环境检测正常，我已读取最新记忆与时间状态）' },
                    { role: 'user', content: `[System Context / 系统实时状态]\n${extraContext}` }
                ];

                if (keepLatestUserMessageLast) {
                    let insertIndex = -1;
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i].role === 'user') {
                            insertIndex = i;
                            break;
                        }
                    }
                    if (insertIndex >= 0) {
                        messages.splice(insertIndex, 0, ...runtimeMessages);
                    } else {
                        messages.push(...runtimeMessages);
                    }
                } else {
                    messages.push(...runtimeMessages);
                }
            }
        }

        return messages;
    }

    _buildRuntimeContextBlock(currentContact) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours();
        const currentTimeString = `${year}年${month}月${day}日 ${hours}点左右`;

        let timeOfDayDescription = '现在';
        if (hours >= 23 || hours < 5) timeOfDayDescription = '深夜';
        else if (hours >= 18) timeOfDayDescription = '晚上';
        else if (hours >= 14) timeOfDayDescription = '下午';
        else if (hours >= 11) timeOfDayDescription = '中午';
        else if (hours >= 5) timeOfDayDescription = '早上';

        let timeGapPrompt = '';
        const messageHistory = currentContact?.messages;
        if (messageHistory && messageHistory.length > 0) {
            const lastMessage = messageHistory[messageHistory.length - 1];
            const lastMessageTime = new Date(lastMessage.time);
            const timeDiff = now.getTime() - lastMessageTime.getTime();

            if (timeDiff > 120000) {
                const timeGapString = this._formatTimeDifference(timeDiff);
                timeGapPrompt = `[重要系统指令：距离你们上次对话已经过去了"${timeGapString}"。你要根据这个时间间隔，结合你的性格做出自然的反应。例如，如果很久没聊，可以表示惊讶或思念；如果只是几分钟，就正常衔接对话。]\n`;
            }
        }

        let runtimeContext = `\n\n--- [实时情景信息] ---\n`;
        runtimeContext += `[重要系统指令：当前的标准北京时间是"${currentTimeString}"，现在是**${timeOfDayDescription}**。你要结合这个具体时间点和时段（例如深夜、下午）来进行回复，让对话更真实。例如，在深夜关心用户或提醒TA早点休息。]\n`;
        runtimeContext += timeGapPrompt;

        if (window.currentMusicInfo && window.currentMusicInfo.isPlaying) {
            runtimeContext += `[系统提示：用户正在听歌，当前歌曲是《${window.currentMusicInfo.songName}》，正在播放的歌词是："${window.currentMusicInfo.lyric}"]\n`;
        }

        return `${runtimeContext}\n`;
    }

    buildWeiboPrompt(contactId, hashtag, count, contact, userProfile, contacts, emojis, memoryTableContent) {
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
        let selectedUserCharacters = [];
        if (potentialCommenters.length > 0) {
            const maxUserCharacters = Math.min(potentialCommenters.length, 3);
            const userCharactersToSelectCount = Math.floor(Math.random() * maxUserCharacters) + 1; // 保底 1 个
            
            const shuffledCommenters = [...potentialCommenters].sort(() => 0.5 - Math.random());
            selectedUserCharacters = shuffledCommenters.slice(0, userCharactersToSelectCount);
    
            if (selectedUserCharacters.length > 0) {
                const userCharacterDescriptions = selectedUserCharacters.map(c => `【${c.name}】（人设：${c.personality}）`).join('、');
                userCharacterPromptPart = `此外，用户的 ${selectedUserCharacters.length} 位好友（${userCharacterDescriptions}）也必须出现在评论区，请为他们每人生成一条符合其身份和性格的评论。对于这些好友的评论，请将他们的 "commenter_type" 字段设置为 "好友"。发帖的人可以回复用户好友的评论，格式与普通评论相同，但格式为 "@好友名 评论内容"。`;
            }
        }
    
        // 组合成最终的评论生成指令
        const finalCommentPrompt = `${genericRolePromptPart}。${userCharacterPromptPart}`;
    
        const userRole = `人设：${userProfile.name}, ${userProfile.personality || '用户'}`;
        const charRole = `人设：${contact.name}, ${contact.personality}`;
        
        // 【核心修复】在这里加上这一行代码
        const recentMessages = (contact.messages || []).slice(-10);
        
        const background = recentMessages.map(msg => {
            const sender = msg.role === 'user' ? userProfile.name : contact.name;
            let content = msg.content;
            
            if (msg.type === 'emoji') {
                // 直接使用msg.content作为表情含义
                content = `<emoji>${msg.content}</emoji>`;
            } else if (msg.type === 'text') {
                content = this._replaceBase64WithEmoji(msg.content, emojis);
            } else if (msg.type === 'red_packet') {
                try {
                    const packet = JSON.parse(msg.content);
                    // 根据消息角色决定动词
                    const actionVerb = msg.role === 'user' ? '发送' : '回赠';
                    content = `[${actionVerb}了红包：${packet.message}，金额：${packet.amount}]`;
                } catch(e) {
                    const actionVerb = msg.role === 'user' ? '发送' : '回赠';
                    content = `[${actionVerb}了红包]`;
                }
            }
            
            return `${sender}: ${content}`;
        }).join('\n');
    
        const systemPrompt = `# 角色与背景
- **你的身份**: 你是 ${contact.name}，人设是: ${contact.personality}。
- **互动对象**: ${userProfile.name}。
- **核心任务**: 分析下方的【记忆表格】和【最近对话】，深刻理解你与用户的关系和情感，然后创作帖子的核心内容。

- **【记忆表格】**:
${memoryTableContent || '无共同记忆。'}

- **【最近对话背景】**: 
${background}

# 你的输出任务
你的唯一任务是生成一个**纯粹的JSON数据对象**，用于填充一个已有的帖子模板。你绝对不能输出任何JSON之外的文字、解释或Markdown标记。

请生成以下字段对应的内容：

1.  \`post_content\`: (字符串) 帖子的正文内容。
2.  \`image_description\`: (字符串) 配图的文字描述。
3.  \`source_topic\`: (字符串) 一个符合帖子主题的、有趣的"研究社"名称 (例如: "深夜食堂", "遗迹探索")。
4.  \`comments\`: (JSON数组) 一个包含 ${selectedRoles.length} 到 ${selectedRoles.length + (selectedUserCharacters ? selectedUserCharacters.length : 0)} 条评论的数组。每条评论都必须是一个包含 \`commenter_name\`, \`commenter_type\`, \`comment_content\` 三个字段的对象。

# 评论者要求
${finalCommentPrompt}

# 输出格式 (必须严格遵守此JSON结构)
{
  "post_content": "...",
  "image_description": "...",
  "source_topic": "...",
  "comments": [
    { "commenter_name": "...", "commenter_type": "...", "comment_content": "..." }
  ]
}`;
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
     * 构建朋友圈评论生成提示词
     */
    buildCommentsPrompt(momentContent) {
        return `你是一个朋友圈评论生成器，需要根据朋友圈文案生成3-5条路人评论。
要求：
1. 根据文案内容生成3-5条相关评论
2. 路人角色类型包括：CP头子、乐子人、搅混水的、理性分析党、颜狗等
3. 模仿网络语气，使用当代流行语。
4. 评论要有不同观点和立场
5. 每条评论至少15字
6. 评论者名称使用：路人甲、小明、小红、隔壁老王、神秘网友、热心市民、吃瓜群众等
7. 必须以一个JSON对象格式输出，不要包含任何其他解释性文字或markdown标记。

输出格式 (必须严格遵守此JSON结构):
{
  "comments": [
    { "author": "路人甲", "content": "评论内容1..." },
    { "author": "小明", "content": "评论内容2..." }
  ]
}

朋友圈文案：${momentContent}`;
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
    buildManualPostPrompt(authorName, relationTag, postContent, imageDescription, userProfile, contacts, emojis) {
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

        // 组合成最终的评论生成指令
        const finalCommentPrompt = userCharacterPromptPart ? `${genericRolePromptPart} ${userCharacterPromptPart}` : genericRolePromptPart;

        const systemPrompt = `你需要为一条用户手动发布的论坛帖子生成评论。

# 帖子信息
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

    // 私有方法：构建红包指令
    _buildRedPacketInstructions() {
        return `\n\n**能力一：发送红包**\n`
             + `你可以给用户发红包来表达祝贺、感谢或作为奖励。\n`
             + `要发送红包，你必须严格使用以下格式，并将其作为单独的一行输出：\n`
             + `\`[red_packet:{"amount":8.88, "message":"恭喜发财！"}]\`\n`
             + `其中 "amount" 是一个 1 到 1000000 之间的数字，"message" 是字符串。\n`
             + `例如:\n太棒了！\n[red_packet:{"amount":6.66, "message":"奖励你的！"}]\n继续加油哦！\n`
             + `你必须自己决定何时发送红包以及红包的金额和留言。这个决定必须完全符合你的人设和当前的对话情景。例如，一个慷慨的角色可能会在用户取得成就时发送一个大红包，而一个节俭的角色可能会发送一个小红包并附上有趣的留言。`;
    }

    // 私有方法：构建表情包指令
    _buildEmojiInstructions(emojis) {
        // 只提取表情含义列表，不包含URL
        const emojiMeanings = emojis.map(e => e.meaning);
        const availableEmojisString = emojiMeanings.join(', ');
        
        return `\n\n**能力二：发送表情包**\n`
             + `你可以使用以下表情含义来丰富你的表达：${availableEmojisString}\n`
             + `要发送表情包，你必须严格使用以下格式，并将其作为单独的一行输出。\n`
             + `格式: \`<emoji>表情含义</emoji>\`\n`
             + `例如:\n你好呀\n<emoji>开心</emoji>\n今天天气真不错\n`
             + `**重要提醒：** 你可能会在用户的消息历史中看到 "[发送了表情：...]" 这样的文字，这是系统为了让你理解对话而生成的提示，你绝对不能在你的回复中模仿或使用这种格式。你只能使用 \`<emoji>表情含义</emoji>\` 格式来发送表情。`;
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
             + `若要发送语音，你必须严格按照以下格式回复，将包含 \`[语音]:\` 标签的内容单独作为一行输出：\n`
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


    // 私有方法：构建输出格式指令 (去除了记忆表相关的强制要求)
    _buildOutputFormatInstructions() {
        return `\n\n--- [🚨 终极防漏指令：输出格式] ---\n
警告：你的每一次回复，必须严格按照以下格式输出：
聊天内容中，**每一个气泡（每一句话）占一行**。
如果有特殊的内心独白或动作神态，请按照之前的【思考模式要求】使用括号标注。
绝对不要输出任何无关的系统代码或标签！`;
    }

    _buildMultiBubbleChatInstructions() {
        return `

--- [多气泡日常聊天强制规则] ---
1. 每次回复必须拆成至少 5 条聊天气泡，也就是至少 5 行有效输出。
2. 每一行就是一个独立气泡；禁止把多条气泡写在同一行。
3. 每条气泡以 10-25 个词为宜；中文可理解为 10-25 个自然词语/短语，尽量控制在 15-45 个汉字左右。
4. 语气要像真实日常聊天：自然、口语化、有停顿感，可以接话、追问、吐槽、表达轻微情绪。
5. 不要写成作文、旁白、总结、长段落；不要使用编号、项目符号、Markdown 标题或解释格式。
6. <emoji>表情含义</emoji> 和 [red_packet:{...}] 必须单独占一行，可以算作一条气泡，但不要为了凑数滥用。
7. 默认输出 5-8 行。除非系统另有更高优先级要求，否则不得少于 5 行。
8. 输出中不要出现“气泡1”“第1条”“以下是回复”等元说明，只输出角色真正会发出的聊天内容。
`;
    }

    /**
     * 新增：构建副模型专属的后台记忆更新提示词
     */
    buildMemoryUpdatePrompt(contact, userProfile) {
        return `你是一个后台记忆整理引擎。
你的任务是冷酷、客观地分析用户(${userProfile.name})和角色(${contact.name})的最新对话，提取对长期对话有用的结构化事实，并（可选）输出兼容旧版的 Markdown 记忆表增量。

【优先输出】你必须首先输出 \`<memory_ops>\`…\`</memory_ops>\`，内部为一个 JSON 对象（不要在外面套数组）。格式如下（字段必须齐全；无内容时用空数组）：
<memory_ops>
{
  "entities": [
    {
      "name": "实体名",
      "type": "person | place | item | event | concept | relationship | preference | promise | other",
      "aliases": [],
      "description": "简短说明"
    }
  ],
  "facts_to_add": [
    {
      "subject": "主体实体名",
      "predicate": "关系/属性名，例如 current_location, likes, promised, owns, relationship_with_user",
      "object": "客体或属性值",
      "factText": "自然语言事实描述",
      "type": "profile | current_state | past_event | future_plan | relationship | item | preference | emotional_core | other",
      "timeScope": "current | long_term | past | future | temporary",
      "confidence": 0.85,
      "importance": 0.6
    }
  ],
  "facts_to_invalidate": [
    {
      "subject": "主体实体名",
      "predicate": "需要失效的关系/属性名",
      "reason": "为什么旧事实失效"
    }
  ]
}
</memory_ops>

记录原则：
- 只记录对长期对话有用的事实；不要记录普通寒暄、一次性无意义动作。
- 用户偏好、关系变化、约定、重要物品、地点状态、身份设定、情绪核心优先。
- 若新事实明显替代旧事实，必须在 facts_to_invalidate 中写明被替代的 subject+predicate。
- \`<memory_ops>\` 之外不要输出任何解释或对话。

【兼容旧版】为保持 Markdown 记忆表更新，请在 \`<memory_ops>\` 之后（或最后一行）同时输出 \`<memory_diff>\`…\`</memory_diff>\`，内部为 JSON 数组（操作格式不变）。若无表格变更，必须输出：\`<memory_diff>[]</memory_diff>\`。

memory_diff 支持的操作示例：
[
  {"op": "update", "section": "现在", "key": "地点", "value": "新地点"},
  {"op": "append", "section": "过去", "line": "| 人物 | 事件 | 地点 | 时间 |"},
  {"op": "delete", "section": "现在", "keyword": "旧地点"}
]

输出顺序要求：先完整的 \`<memory_ops>\` 块，再 \`<memory_diff>\` 块；不要颠倒。`;
    }

    _replaceBase64WithEmoji(raw, emojis) {
        if (typeof raw !== 'string' || !raw) return raw;
        const re = /data:image\/[^,\s]+,[A-Za-z0-9+/=]+/g;
        return raw.replace(re, (imgUrl) => {
        const found = emojis.find(e => e.url === imgUrl);
        return `[发送了表情：${found?.meaning || '未知'}]`;
        });
    }
    
    /**
     * 构建待办事项提醒的提示词
     * @param {Object} character - 角色信息
     * @param {Object} userProfile - 用户信息
     * @param {string} taskText - 待办事项内容
     * @param {string} taskDate - 待办事项日期时间
     * @returns {string} - 完整的提示词
     */
    buildTodoReminderPrompt(character, userProfile, taskText, taskDate) {
        return `
# 角色
你是一个AI角色，正在与用户互动。

## 你的信息
- **你的名字**: ${character.name}
- **你的性格和背景**: ${character.personality}

## 你的记忆
这是你和用户之间的关键记忆，请在生成内容时参考：
<memory_table>
${character.memoryTableContent || '暂无特别记忆'}
</memory_table>

## 用户信息
- **用户昵称**: ${userProfile.name}
- **用户设定**: ${userProfile.personality || '用户未设置详细信息'}

# 任务
请你扮演 ${character.name}，用 Ta 的人设、口吻和性格，为我生成一条关于待办事项的提醒。
- 待办事项是: "${taskText}"
- 这件事计划在 ${new Date(taskDate).toLocaleString('zh-CN')} 左右完成。
- 你的任务是生成一句简短、口语化、符合人设的提醒。
- **重要：不要在回复中明确提及具体的日期或时间**，而是用更自然的方式表达提醒，比如"待会儿别忘了..."或"下午记得要去做..."。就好像朋友间的口头提醒一样。

# 要求
1.  **语气**: 必须完全符合你的角色设定（${character.personality}）。
2.  **简洁**: 提醒语必须在50个字以内。
3.  **内容**: 提醒语需要自然地提及待办事项的核心内容"${taskText}"。
4.  **格式**: 直接输出提醒语，不要包含任何前缀、标签或多余的解释。

请现在根据你的角色，为上述任务生成一句简短、自然的提醒语。
`;
    }
}

// 创建全局实例
window.promptBuilder = new PromptBuilder();
