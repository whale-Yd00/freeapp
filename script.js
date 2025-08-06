// --- 通用文件上传函数 ---
async function handleFileUpload(inputId, targetUrlInputId, statusElementId) {
    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];
    const statusElement = document.getElementById(statusElementId);
    const targetUrlInput = document.getElementById(targetUrlInputId);

    if (!file) {
        showToast('请先选择一个文件');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件');
        fileInput.value = '';
        return;
    }

    if (statusElement) statusElement.textContent = '上传中...';
    
    // 使用 FileReader 将图片转为 Base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        targetUrlInput.value = reader.result;
        if (statusElement) statusElement.textContent = '上传成功！';
        showToast('图片已加载');
    };
    reader.onerror = (error) => {
        console.error('文件读取失败:', error);
        if (statusElement) statusElement.textContent = '读取失败';
        showToast(`读取失败: ${error.message}`);
    };
}

// --- 全局状态 ---
let contacts = [];
let currentContact = null;
let editingContact = null;
let apiSettings = {
    url: '',
    key: '',
    model: '',
    secondaryModel: 'sync_with_primary', // 新增：次要模型
    contextMessageCount: 10
};
let emojis = [];
let backgrounds = {};
let userProfile = {
    name: '我的昵称',
    avatar: '',
    personality: '' 
};
let moments = [];
let weiboPosts = [];

const RELATION_PRESETS = {
    'CP': 'CP（两者互为情侣）',
    'CB': 'CB（友情、亲情等非恋爱的亲密关系）', 
    '好友': '好友',
    '宿敌': '宿敌（两者互为能持续永恒的较量，长期的敌人，天生的对手，命中注定的竞争者）'
};

let hashtagCache = {};

let audio = null;
let db = null; // IndexedDB 实例 
let playlist = [];
let currentSongIndex = -1;
let isPlaying = false;
let lyricTimer = null;
let currentObjectUrl = null;

// --- 标志位与分页加载状态 ---
let isEmojiGridRendered = false;
let isMomentsRendered = false;
let isMusicPlayerInitialized = false;
let isIndexedDBReady = false; 
const MESSAGES_PER_PAGE = 15;
let currentlyDisplayedMessageCount = 0;
let isLoadingMoreMessages = false;


// --- 初始化 ---
async function init() {
    await openDB(); // 确保IndexedDB先打开
    await loadDataFromDB(); // 从IndexedDB加载数据

    renderContactList();
    updateUserProfileUI();
    updateContextIndicator();
    
    // 绑定基础事件
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
    
    setTimeout(() => {
        const hint = document.getElementById('featureHint');
        if (hint) {
            hint.style.display = 'block';
            setTimeout(() => {
                hint.style.display = 'none';
            }, 5000);
        }
    }, 1000);

    // Check for update announcements
    const unreadAnnouncements = await announcementManager.getUnread();
    if (unreadAnnouncements.length > 0) {
        const modalBody = document.getElementById('updateModalBody');
        
        // To display chronologically, reverse the array (since newest is first)
        // and join content.
        const combinedContent = unreadAnnouncements.reverse()
            .map(ann => ann.content)
            .join('<hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">');
        
        modalBody.innerHTML = marked.parse(combinedContent);
        showModal('updateModal');

        document.getElementById('updateModalCloseBtn').onclick = () => {
            closeModal('updateModal');
            const idsToMark = unreadAnnouncements.map(ann => ann.id);
            announcementManager.markAsSeen(idsToMark);
        };
    }
}



// --- IndexedDB 核心函数 ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WhaleLLTDB', 4);

        request.onupgradeneeded = event => {
            const db = event.target.result;
            // 音乐播放器相关的ObjectStore
            if (!db.objectStoreNames.contains('songs')) {
                db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
            }
            // 聊天助手相关的ObjectStore
            if (!db.objectStoreNames.contains('contacts')) {
                db.createObjectStore('contacts', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('apiSettings')) {
                db.createObjectStore('apiSettings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('emojis')) {
                db.createObjectStore('emojis', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('backgrounds')) {
                db.createObjectStore('backgrounds', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('userProfile')) {
                db.createObjectStore('userProfile', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('moments')) {
                db.createObjectStore('moments', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('weiboPosts')) {
                db.createObjectStore('weiboPosts', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('hashtagCache')) {
                db.createObjectStore('hashtagCache', { keyPath: 'id' });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            isIndexedDBReady = true; // 标记IndexedDB已准备就绪
            resolve(db);
        };

        request.onerror = event => {
            console.error('IndexedDB 打开失败:', event.target.errorCode);
            showToast('数据存储初始化失败');
            reject('IndexedDB error');
        };
    });
}

async function loadDataFromDB() {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法加载数据。');
        return;
    }
    try {
        const transaction = db.transaction(['contacts', 'apiSettings', 'emojis', 'backgrounds', 'userProfile', 'moments', 'weiboPosts', 'hashtagCache'], 'readonly');
        
        const contactsStore = transaction.objectStore('contacts');
        const apiSettingsStore = transaction.objectStore('apiSettings');
        const emojisStore = transaction.objectStore('emojis');
        const backgroundsStore = transaction.objectStore('backgrounds');
        const userProfileStore = transaction.objectStore('userProfile');
        const momentsStore = transaction.objectStore('moments');
        const weiboPostsStore = transaction.objectStore('weiboPosts');
        
        contacts = (await promisifyRequest(contactsStore.getAll())) || [];
        // 迁移旧数据格式或添加默认值
        contacts.forEach(contact => {
            if (contact.type === undefined) contact.type = 'private';
            window.memoryTableManager.initContactMemoryTable(contact);
            if (contact.messages) {
                contact.messages.forEach(msg => {
                    if (msg.role === 'user' && msg.senderId === undefined) msg.senderId = 'user';
                    else if (msg.role === 'assistant' && msg.senderId === undefined) msg.senderId = contact.id;
                });
            }
        });

        const savedApiSettings = (await promisifyRequest(apiSettingsStore.get('settings'))) || {};
        apiSettings = { ...apiSettings, ...savedApiSettings };
        if (apiSettings.contextMessageCount === undefined) apiSettings.contextMessageCount = 10;

        emojis = (await promisifyRequest(emojisStore.getAll())) || [];
        backgrounds = (await promisifyRequest(backgroundsStore.get('backgroundsMap'))) || {};
        const savedUserProfile = (await promisifyRequest(userProfileStore.get('profile'))) || {};
        userProfile = { ...userProfile, ...savedUserProfile };
        if (userProfile.personality === undefined) {
            userProfile.personality = '';
        }
        moments = (await promisifyRequest(momentsStore.getAll())) || [];
        weiboPosts = (await promisifyRequest(weiboPostsStore.getAll())) || [];

        // 加载hashtag缓存
        const hashtagCacheStore = transaction.objectStore('hashtagCache');
        const savedHashtagCache = (await promisifyRequest(hashtagCacheStore.get('cache'))) || {};
        hashtagCache = savedHashtagCache;

    } catch (error) {
        console.error('从IndexedDB加载数据失败:', error);
        showToast('加载数据失败');
    }
}

async function saveDataToDB() {
    if (!isIndexedDBReady) {
        console.warn('IndexedDB 未准备好，无法保存数据。');
        return;
    }
    try {
        const transaction = db.transaction(['contacts', 'apiSettings', 'emojis', 'backgrounds', 'userProfile', 'moments', 'hashtagCache'], 'readwrite');
        
        const contactsStore = transaction.objectStore('contacts');
        const apiSettingsStore = transaction.objectStore('apiSettings');
        const emojisStore = transaction.objectStore('emojis');
        const backgroundsStore = transaction.objectStore('backgrounds');
        const userProfileStore = transaction.objectStore('userProfile');
        const momentsStore = transaction.objectStore('moments');
        
        // 清空contacts，然后重新添加，确保数据最新
        await promisifyRequest(contactsStore.clear());
        for (const contact of contacts) {
            await promisifyRequest(contactsStore.put(contact));
        }

        await promisifyRequest(apiSettingsStore.put({ id: 'settings', ...apiSettings }));
        
        await promisifyRequest(emojisStore.clear());
        for (const emoji of emojis) {
            await promisifyRequest(emojisStore.put(emoji));
        }

        await promisifyRequest(backgroundsStore.put({ id: 'backgroundsMap', ...backgrounds }));
        await promisifyRequest(userProfileStore.put({ id: 'profile', ...userProfile }));
        
        await promisifyRequest(momentsStore.clear());
        for (const moment of moments) {
            await promisifyRequest(momentsStore.put(moment));
        }

        // 保存hashtag缓存
        const hashtagCacheStore = transaction.objectStore('hashtagCache');
        await promisifyRequest(hashtagCacheStore.put({ id: 'cache', ...hashtagCache }));

        await promisifyTransaction(transaction); // 等待所有操作完成
    } catch (error) {
        console.error('保存数据到IndexedDB失败:', error);
        showToast('保存数据失败');
    }
}

// 辅助函数：将IndexedDB请求转换为Promise
function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 辅助函数：将IndexedDB事务转换为Promise
function promisifyTransaction(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// --- 论坛功能 ---

function formatTime(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const postTime = new Date(timestamp);
    const diff = now.getTime() - postTime.getTime();

    const diffMinutes = Math.floor(diff / (1000 * 60));
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays < 1) {
        if (diffHours < 1) {
            return `${Math.max(1, diffMinutes)}分钟前`;
        }
        return `${diffHours}小时前`;
    } else if (diffDays < 2) {
        return '1天前';
    } else {
        const isSameYear = now.getFullYear() === postTime.getFullYear();
        const month = (postTime.getMonth() + 1).toString().padStart(2, '0');
        const day = postTime.getDate().toString().padStart(2, '0');
        
        if (isSameYear) {
            const hours = postTime.getHours().toString().padStart(2, '0');
            const minutes = postTime.getMinutes().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        } else {
            return `${postTime.getFullYear()}-${month}-${day}`;
        }
    }
}

// --- 页面导航 ---
const pageIds = ['contactListPage', 'weiboPage', 'momentsPage', 'profilePage', 'chatPage', 'dataManagementPage'];

function showPage(pageIdToShow) {
    // Hide all main pages and the chat page
    pageIds.forEach(pageId => {
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('active');
        }
    });

    // Show the requested page
    const pageToShow = document.getElementById(pageIdToShow);
    if (pageToShow) {
        pageToShow.classList.add('active');
    }

    // Update the active state of the bottom navigation buttons
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    const navMapping = ['contactListPage', 'weiboPage', 'momentsPage', 'profilePage'];
    navItems.forEach((item, index) => {
        // This relies on the order in the HTML, which is correct.
        if (navMapping[index] === pageIdToShow) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // --- Lazy Loading/Rendering ---
    // Render Weibo posts when the page is shown
    if (pageIdToShow === 'weiboPage') {
        renderAllWeiboPosts();
    }
    // Render Moments only on the first time it's opened
    if (pageIdToShow === 'momentsPage' && !isMomentsRendered) {
        renderMomentsList();
        isMomentsRendered = true;
    }

    if (pageIdToShow === 'dataManagementPage') {
        refreshDatabaseStats();
    }   
}

function showGeneratePostModal() {
    const select = document.getElementById('postGenCharacterSelect');
    select.innerHTML = '<option value="">请选择...</option>'; // Reset
    contacts.forEach(contact => {
        if (contact.type === 'private') {
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = contact.name;
            select.appendChild(option);
        }
    });
    
    // 重置关系选择
    const relationSelect = document.getElementById('postGenRelations');
    relationSelect.value = '';
    handleRelationChange();
    
    showModal('generatePostModal');
}

// 新增：处理关系选择变化
function handleRelationChange() {
    const relationSelect = document.getElementById('postGenRelations');
    const customRelationInput = document.getElementById('postGenCustomRelation');
    
    if (relationSelect.value === 'custom') {
        customRelationInput.parentElement.style.display = 'block'; // 显示父级 .form-group
        customRelationInput.required = true;
    } else {
        customRelationInput.parentElement.style.display = 'none'; // 隐藏父级 .form-group
        customRelationInput.required = false;
        customRelationInput.value = '';
    }
}

// 新增：处理角色选择变化，加载hashtag缓存
function handleCharacterChange() {
    const contactId = document.getElementById('postGenCharacterSelect').value;
    const hashtagInput = document.getElementById('postGenHashtag');
    
    if (contactId && hashtagCache[contactId]) {
        hashtagInput.value = hashtagCache[contactId];
    } else {
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
            // 默认hashtag为 #A & B#
            hashtagInput.value = `${contact.name} & ${userProfile.name}`;
        }
    }
}

async function handleGeneratePost(event) {
    event.preventDefault();
    const contactId = document.getElementById('postGenCharacterSelect').value;
    const relationSelect = document.getElementById('postGenRelations');
    const customRelationInput = document.getElementById('postGenCustomRelation');
    const hashtagInput = document.getElementById('postGenHashtag');
    const count = document.getElementById('postGenCount').value;

    if (!contactId) {
        showToast('请选择角色');
        return;
    }

    let relations;
    let relationDescription;
    
    if (relationSelect.value === 'custom') {
        if (!customRelationInput.value.trim()) {
            showToast('请填写自定义关系');
            return;
        }
        relations = customRelationInput.value.trim();
        relationDescription = relations; // 自定义关系直接使用用户输入
    } else {
        if (!relationSelect.value) {
            showToast('请选择关系类型');
            return;
        }
        relations = relationSelect.value;
        relationDescription = RELATION_PRESETS[relations];
    }

    const hashtag = hashtagInput.value.trim();
    if (!hashtag) {
        showToast('请填写话题标签');
        return;
    }

    // 缓存hashtag
    hashtagCache[contactId] = hashtag;
    await saveDataToDB();

    closeModal('generatePostModal');
    await generateWeiboPosts(contactId, relations, relationDescription, hashtag, count);
}

async function saveWeiboPost(postData) {
    if (!isIndexedDBReady) {
        console.error('IndexedDB not ready, cannot save post.');
        showToast('数据库错误，无法保存帖子');
        return;
    }
    try {
        const transaction = db.transaction(['weiboPosts'], 'readwrite');
        const store = transaction.objectStore('weiboPosts');
        await promisifyRequest(store.add(postData));
        await promisifyTransaction(transaction);
    } catch (error) {
        console.error('Failed to save Weibo post to DB:', error);
        showToast('保存帖子失败');
    }
}

async function generateWeiboPosts(contactId, relations, relationDescription, hashtag, count = 1) {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) {
        showToast('未找到指定的聊天对象');
        return;
    }
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先在设置中配置API');
        return;
    }
    
    const container = document.getElementById('weiboContainer');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-text';
    loadingIndicator.textContent = '正在生成论坛内容...';
    container.prepend(loadingIndicator);

    const systemPrompt = window.promptBuilder.buildWeiboPrompt(
        contactId, 
        relations, 
        relationDescription,
        hashtag,
        count, 
        contact, 
        userProfile, 
        contacts,
        emojis
    );

    try {
        const payload = {
            model: apiSettings.model,
            messages: [{ role: 'user', content: systemPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.7
        };

        const apiUrl = `${apiSettings.url}/chat/completions`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiSettings.key}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        const jsonText = data.choices[0].message.content;
        
        if (!jsonText) {
            throw new Error("AI未返回有效内容");
        }
        
        const weiboData = JSON.parse(jsonText);

        // --- 时间戳注入 ---
        const now = Date.now();
        // 主楼时间设为2-5分钟前
        const postCreatedAt = new Date(now - (Math.random() * 3 + 2) * 60 * 1000);
        let lastCommentTime = postCreatedAt.getTime();

        weiboData.posts.forEach(post => {
            post.timestamp = postCreatedAt.toISOString(); // 给主楼加时间戳
            if (post.comments && Array.isArray(post.comments)) {
                post.comments.forEach(comment => {
                    // 回复时间在主楼和现在之间，且比上一条晚一点
                    const newCommentTimestamp = lastCommentTime + (Math.random() * 2 * 60 * 1000); // 0-2分钟后
                    lastCommentTime = newCommentTimestamp;
                    comment.timestamp = new Date(Math.min(newCommentTimestamp, now)).toISOString(); // 不超过当前时间
                });
            }
        });
        // --- 时间戳注入结束 ---
        
        const newPost = {
            id: Date.now(),
            contactId: contactId,
            relations: relations,
            relationDescription: relationDescription,
            hashtag: hashtag,
            data: weiboData,
            createdAt: postCreatedAt.toISOString()
        };

        await saveWeiboPost(newPost);
        weiboPosts.push(newPost); // Update in-memory array
        renderAllWeiboPosts();
        showToast('帖子已刷新！');

    } catch (error) {
        console.error('生成论坛失败:', error);
        showToast('生成论坛失败: ' + error.message);
    } finally {
        loadingIndicator.remove();
    }
}


function renderAllWeiboPosts() {
    const container = document.getElementById('weiboContainer');
    container.innerHTML = '';

    if (!weiboPosts || weiboPosts.length === 0) {
        container.innerHTML = '<div class="loading-text">还没有任何帖子，点击右上角“+”来生成吧！</div>';
        return;
    }

    // Sort posts by creation date, newest first
    const sortedPosts = weiboPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    sortedPosts.forEach(storedPost => {
        renderSingleWeiboPost(storedPost);
    });
}

function renderSingleWeiboPost(storedPost) {
    const container = document.getElementById('weiboContainer');
    const contact = contacts.find(c => c.id === storedPost.contactId);
    if (!contact) return; // Don't render if contact is deleted

    const data = storedPost.data;

    if (!data || !data.posts || !Array.isArray(data.posts)) {
        return;
    }

    data.posts.forEach((post, index) => {
        const postAuthorContact = post.author_type === 'User' ? userProfile : contact;
        const postAuthorNickname = post.author_type === 'User' ? userProfile.name : contact.name;
        const postAuthorAvatar = postAuthorContact.avatar;
        const otherPartyName = post.author_type === 'User' ? contact.name : userProfile.name;

        const postElement = document.createElement('div');
        postElement.className = 'post';
        // Use a composite key of storedPost.id and the index to uniquely identify each post
        const postHtmlId = `weibo-post-${storedPost.id}-${index}`;
        postElement.id = postHtmlId;

        let commentsHtml = '';
        if (post.comments && Array.isArray(post.comments)) {
            post.comments.forEach(comment => {
                const commenterType = comment.commenter_type ? ` (${comment.commenter_type})` : '';
                commentsHtml += `
                    <div class="comment">
                        <span class="comment-user">${comment.commenter_name}${commenterType}:</span>
                        <span class="comment-content">${comment.comment_content}</span>
                        <span class="comment-time">${formatTime(comment.timestamp)}</span>
                    </div>
                `;
            });
        }
        
        postElement.innerHTML = `
            <div class="post-header">
                <div class="avatar">
                    ${postAuthorAvatar ? `<img src="${postAuthorAvatar}" alt="${postAuthorNickname[0]}">` : postAuthorNickname[0]}
                </div>
                <div class="post-info">
                    <div class="user-name">
                        ${postAuthorNickname}
                        <span class="vip-badge">${post.author_type === 'User' ? '会员' : '蓝星'}</span>
                    </div>
                    <div class="post-time">${formatTime(post.timestamp)}</div>
                    <div class="post-source">来自 ${storedPost.relations} 研究所</div>
                </div>
                <div class="post-menu" onclick="toggleWeiboMenu(event, '${storedPost.id}', ${index})">
                    ...
                    <div class="post-menu-dropdown" id="weibo-menu-${storedPost.id}-${index}">
                        <div class="menu-item" onclick="deleteWeiboPost('${storedPost.id}', ${index})">删除</div>
                    </div>
                </div>
            </div>
            <div class="post-content">
                <a href="#" class="hashtag">#${storedPost.hashtag || data.relation_tag}#</a>
                ${post.post_content}
                <a href="#" class="mention">@${otherPartyName}</a>
            </div>
            <div class="post-image-desc">
                ${post.image_description}
            </div>
            <div class="post-actions">
                <a href="#" class="action-btn-weibo">
                    <span class="action-icon">🔄</span>
                    <span>${Math.floor(Math.random() * 500)}</span>
                </a>
                <a href="#" class="action-btn-weibo" onclick="showReplyBox('${postHtmlId}')">
                    <span class="action-icon">💬</span>
                    <span>${post.comments ? post.comments.length : 0}</span>
                </a>
                <a href="#" class="action-btn-weibo">
                    <span class="action-icon">👍</span>
                    <span>${Math.floor(Math.random() * 5000)}</span>
                </a>
            </div>
            <div class="comments-section" onclick="showReplyBox('${postHtmlId}')">
                ${commentsHtml}
            </div>
        `;
        container.appendChild(postElement);
    });
}

function showReplyBox(postHtmlId) {
    const postElement = document.getElementById(postHtmlId);
    if (!postElement) return;

    let replyBox = postElement.querySelector('.reply-box');
    if (replyBox) {
        replyBox.querySelector('textarea').focus();
        return;
    }

    const commentsSection = postElement.querySelector('.comments-section');
    
    replyBox = document.createElement('div');
    replyBox.className = 'reply-box';
    replyBox.innerHTML = `
        <textarea class="reply-input" placeholder="输入你的回复..."></textarea>
        <button class="reply-button">回复</button>
    `;
    
    commentsSection.appendChild(replyBox);
    const replyInput = replyBox.querySelector('.reply-input');
    const replyButton = replyBox.querySelector('.reply-button');

    replyInput.focus();

    replyButton.onclick = async () => {
        const replyContent = replyInput.value.trim();
        if (!replyContent) {
            showToast('回复内容不能为空');
            return;
        }

        // --- Find the target post ---
        const storedPostId = parseInt(postHtmlId.split('-')[2], 10);
        const postIndex = parseInt(postHtmlId.split('-')[3], 10);
        const storedPost = weiboPosts.find(p => p.id === storedPostId);
        if (!storedPost) {
            showToast('错误：找不到原始帖子');
            return;
        }
        const postData = storedPost.data.posts[postIndex];
        const postAuthorContact = contacts.find(c => c.id === storedPost.contactId);
        if (!postAuthorContact) {
            showToast('错误：找不到帖子作者信息');
            return;
        }
        const postAuthorNickname = postData.author_type === 'User' ? userProfile.name : postAuthorContact.name;

        // --- 如果是回复自己的帖子，只保存不调用AI ---
        if (postAuthorNickname === userProfile.name) {
            const userComment = {
                commenter_name: userProfile.name,
                commenter_type: '楼主',
                comment_content: replyContent,
                timestamp: new Date().toISOString()
            };

            if (!postData.comments) {
                postData.comments = [];
            }
            postData.comments.push(userComment);

            await updateWeiboPost(storedPost);
            showToast('已回复');
            renderAllWeiboPosts();
            return;
        }
        

        // Disable input and button
        replyInput.disabled = true;
        replyButton.disabled = true;
        replyButton.textContent = '请稍后...';

        // --- Create temporary UI elements for immediate feedback ---
        const userCommentElement = document.createElement('div');
        userCommentElement.className = 'comment';
        userCommentElement.innerHTML = `
            <span class="comment-user">${userProfile.name} (你):</span>
            <span class="comment-content">${replyContent}</span>
            <span class="comment-time">刚刚</span>
        `;
        commentsSection.insertBefore(userCommentElement, replyBox);

        const aiPlaceholderElement = document.createElement('div');
        aiPlaceholderElement.className = 'comment';
        aiPlaceholderElement.innerHTML = `
            <span class="comment-user">${postAuthorNickname}:</span>
            <span class="comment-content">...</span>
        `;
        commentsSection.insertBefore(aiPlaceholderElement, replyBox);
        
        try {
            // --- Get AI Reply ---
            const aiReplyContent = await getAIReply(postData, replyContent, storedPost.contactId);
            
            // --- Create comment objects ---
            const userComment = {
                commenter_name: userProfile.name,
                commenter_type: '你',
                comment_content: replyContent,
                timestamp: new Date().toISOString()
            };
            const aiComment = {
                commenter_name: postAuthorNickname,
                commenter_type: '楼主',
                comment_content: aiReplyContent,
                timestamp: new Date().toISOString()
            };

            // --- Update data structure ---
            if (!postData.comments) {
                postData.comments = [];
            }
            postData.comments.push(userComment);
            postData.comments.push(aiComment);

            // --- Save to DB ---
            await updateWeiboPost(storedPost);

            // --- Re-render the entire post for consistency ---
            showToast('回复成功！');
            renderAllWeiboPosts(); // This will redraw everything correctly from the source of truth

        } catch (error) {
            // --- Handle failure ---
            showToast(`生成失败: ${error.message}`);
            console.error('AI回复生成失败:', error);
            // Re-render to remove temporary elements
            renderAllWeiboPosts();
        }
    };
}

async function getAIReply(postData, userReply, contactId) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        throw new Error('API未配置');
    }

    const systemPrompt = window.promptBuilder.buildReplyPrompt(postData, userReply, contactId, contacts, userProfile);
    const data = await window.apiService.callOpenAIAPI(
        apiSettings.url,
        apiSettings.key,
        apiSettings.model,
        [{ role: 'user', content: systemPrompt }],
        { temperature: 0.7 }
    );

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message.content) {
        throw new Error('AI未返回有效回复');
    }
    
    return data.choices[0].message.content.trim();
}




function toggleWeiboMenu(event, storedPostId, postIndex) {
    event.stopPropagation();
    const menu = document.getElementById(`weibo-menu-${storedPostId}-${postIndex}`);
    
    // Close all other menus
    document.querySelectorAll('.post-menu-dropdown').forEach(m => {
        if (m.id !== menu.id) {
            m.style.display = 'none';
        }
    });

    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

// Close dropdown when clicking anywhere else
window.addEventListener('click', (event) => {
    if (!event.target.matches('.post-menu')) {
        document.querySelectorAll('.post-menu-dropdown').forEach(m => {
            m.style.display = 'none';
        });
    }
});


async function deleteWeiboPost(storedPostId, postIndex) {
    // Convert storedPostId to the correct type if necessary, assuming it's a number from the template
    const numericStoredPostId = parseInt(storedPostId, 10);

    // Find the specific post group in the in-memory weiboPosts array
    const postGroupIndex = weiboPosts.findIndex(p => p.id === numericStoredPostId);
    
    if (postGroupIndex > -1) {
        // The specific post to be deleted
        const postGroup = weiboPosts[postGroupIndex];
        
        // Remove the specific post from the 'posts' array within the group
        if (postGroup.data && postGroup.data.posts && postGroup.data.posts.length > postIndex) {
            postGroup.data.posts.splice(postIndex, 1);
        }

        // If this was the last post in the group, remove the entire group
        if (postGroup.data.posts.length === 0) {
            weiboPosts.splice(postGroupIndex, 1);
            // Also delete the entire entry from IndexedDB
            if (isIndexedDBReady) {
                try {
                    const transaction = db.transaction(['weiboPosts'], 'readwrite');
                    const store = transaction.objectStore('weiboPosts');
                    await promisifyRequest(store.delete(numericStoredPostId));
                    await promisifyTransaction(transaction);
                } catch (error) {
                    console.error('Failed to delete Weibo post group from DB:', error);
                    showToast('从数据库删除帖子失败');
                    // Optional: Add back the data to memory to maintain consistency
                    return;
                }
            }
        } else {
            // Otherwise, just update the modified group in IndexedDB
            await updateWeiboPost(postGroup);
        }
    }

    // Re-render the UI
    renderAllWeiboPosts();
    showToast('帖子已删除');
}

async function updateWeiboPost(postToUpdate) {
    if (!isIndexedDBReady) {
        console.error('IndexedDB not ready, cannot update post.');
        showToast('数据库错误，无法更新帖子');
        return;
    }
    try {
        const transaction = db.transaction(['weiboPosts'], 'readwrite');
        const store = transaction.objectStore('weiboPosts');
        await promisifyRequest(store.put(postToUpdate));
        await promisifyTransaction(transaction);
    } catch (error) {
        console.error('Failed to update Weibo post in DB:', error);
        showToast('更新帖子失败');
    }
}



// --- 朋友圈功能 ---

function showPublishMomentModal() {
    document.getElementById('publishMomentModal').style.display = 'block';
    document.getElementById('momentPreview').style.display = 'none';
    document.getElementById('publishMomentBtn').disabled = true;
}

function closePublishMomentModal() {
    document.getElementById('publishMomentModal').style.display = 'none';
}

/**
 * @description 根据聊天记录和角色信息生成朋友圈内容
 * @changes **MODIFIED**: Changed API request to be compatible with OpenAI format.
 */
async function generateMomentContent() {
    if (!currentContact) {
        showToast('请先选择一个联系人');
        return;
    }

    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先设置API');
        return;
    }

    const generateBtn = document.querySelector('.generate-moment-btn');
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';

    try {
        const systemPrompt = window.promptBuilder.buildMomentContentPrompt(currentContact, userProfile, apiSettings, contacts);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.8 }
        );

        const momentContent = data.choices[0].message.content.trim() || '';

        let imageUrl = null;
        const unsplashKey = document.getElementById('unsplashApiKey').value.trim();
        if (unsplashKey) {
            imageUrl = await fetchMatchingImageForPublish(momentContent, unsplashKey);
        }

        const comments = await generateAIComments(momentContent);

        const moment = {
            id: Date.now().toString(),
            authorName: currentContact.name,
            authorAvatar: currentContact.avatar,
            content: momentContent,
            image: imageUrl,
            time: new Date().toISOString(),
            likes: 0,
            comments: comments
        };

        moments.unshift(moment);
        await saveDataToDB();
        renderMomentsList();
        closePublishMomentModal();
        showToast('朋友圈发布成功');

    } catch (error) {
        console.error('生成朋友圈失败:', error);
        showToast('生成失败: ' + error.message);
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '生成朋友圈';
    }
}

/**
 * @description 根据内容生成图片搜索关键词，并调用 Unsplash API 获取图片
 * @changes No changes to this function itself, but its dependency `generateImageSearchQuery` is updated.
 */
async function fetchMatchingImageForPublish(content, apiKey) {
    try {
        let searchQuery = await generateImageSearchQuery(content);
        if (!searchQuery) {
            searchQuery = extractImageKeywords(content);
        }
        // 这是直接从浏览器向Unsplash API发起的请求
        const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=3&orientation=landscape`, {
            headers: {
                'Authorization': `Client-ID ${apiKey}`
            }
        });
        if (!response.ok) throw new Error('Unsplash API请求失败');
        const data = await response.json();
        return (data.results && data.results.length > 0) ? data.results[0].urls.regular : null;
    } catch (error) {
        console.error('获取配图失败:', error);
        return null;
    }
}

/**
 * @description 调用 API 生成图片搜索关键词
 * @changes **MODIFIED**: Changed API request to be compatible with OpenAI format.
 */
async function generateImageSearchQuery(content) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) return null;
    try {
        const systemPrompt = window.promptBuilder.buildImageSearchPrompt(content);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { temperature: 0.5 }
        );
        return data.choices[0].message.content.trim() || null;
    } catch (error) {
        console.error('AI关键词生成失败:', error);
        return null;
    }
}


function extractImageKeywords(content) {
    const emotionMap = { '开心': 'happy sunshine joy', '难过': 'sad rain melancholy', '兴奋': 'excited celebration party', '平静': 'peaceful calm nature', '浪漫': 'romantic sunset flowers', '怀念': 'nostalgic vintage memories' };
    const sceneMap = { '咖啡': 'coffee cafe cozy', '旅行': 'travel landscape adventure', '美食': 'food delicious cooking', '工作': 'office workspace productivity', '运动': 'sports fitness outdoor', '读书': 'books reading library', '音乐': 'music instruments concert', '电影': 'cinema movie theater', '购物': 'shopping fashion style', '聚会': 'party friends celebration' };
    let keywords = [];
    for (const [chinese, english] of Object.entries(emotionMap)) { if (content.includes(chinese)) { keywords.push(english); break; } }
    for (const [chinese, english] of Object.entries(sceneMap)) { if (content.includes(chinese)) { keywords.push(english); break; } }
    if (keywords.length === 0) keywords.push('lifestyle daily life aesthetic');
    return keywords.join(' ');
}

/**
 * @description 调用 API 生成朋友圈评论
 * @changes **MODIFIED**: Changed API request to be compatible with OpenAI format.
 */
async function generateAIComments(momentContent) {
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        return [];
    }
    try {
        const systemPrompt = window.promptBuilder.buildCommentsPrompt(momentContent);
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            [{ role: 'user', content: systemPrompt }],
            { response_format: { type: "json_object" }, temperature: 0.9 }
        );
        
        const jsonText = data.choices[0].message.content;
        if (!jsonText) {
            throw new Error("AI未返回有效的JSON格式");
        }

        const commentsData = JSON.parse(jsonText);
        return commentsData.comments.map(comment => ({
            author: comment.author,
            content: comment.content,
            time: new Date(Date.now() - Math.floor(Math.random() * 600000)).toISOString()
        }));
    } catch (error) {
        console.error('AI评论生成失败:', error);
        return [];
    }
}


async function publishMoment() {
    const content = document.getElementById('momentPreviewContent').textContent;
    const imageElement = document.getElementById('momentPreviewImage');
    const imageUrl = imageElement.style.display === 'block' ? imageElement.src : null;
    if (!content) {
        showToast('请先生成朋友圈内容');
        return;
    }
    const publishBtn = document.getElementById('publishMomentBtn');
    publishBtn.disabled = true;
    publishBtn.textContent = '发布中...';
    try {
        const comments = await generateAIComments(content);
        const moment = { id: Date.now().toString(), authorName: currentContact.name, authorAvatar: currentContact.avatar, content, image: imageUrl, time: new Date().toISOString(), likes: 0, comments };
        moments.unshift(moment);
        await saveDataToDB(); // 使用IndexedDB保存
        renderMomentsList();
        closePublishMomentModal();
        showToast('朋友圈发布成功');
    } catch (error) {
        console.error('发布朋友圈失败:', error);
        showToast('发布失败: ' + error.message);
    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = '发布';
    }
}

function renderMomentsList() {
    const momentsEmpty = document.getElementById('momentsEmpty');
    const momentsList = document.getElementById('momentsList');
    if (moments.length === 0) { 
        momentsEmpty.style.display = 'block';
        momentsList.style.display = 'none';
    } else {
        momentsEmpty.style.display = 'none';
        momentsList.style.display = 'block';
        momentsList.innerHTML = '';
        moments.forEach(moment => {
            const momentDiv = document.createElement('div');
            momentDiv.className = 'moment-item';
            let avatarContent = moment.authorAvatar ? `<img src="${moment.authorAvatar}">` : moment.authorName[0];
            let imageContent = moment.image ? `<img src="${moment.image}" class="moment-image">` : '';
            let commentsContent = '';
            if (moment.comments && moment.comments.length > 0) {
                commentsContent = `<div style="margin-top: 10px; padding-top: 10px; border-top: 0.5px solid #eee;">${moment.comments.map(comment => `<div style="font-size: 13px; color: #576b95; margin-bottom: 4px;"><span>${comment.author}: </span><span style="color: #333;">${comment.content}</span></div>`).join('')}</div>`;
            }
            momentDiv.innerHTML = `<div class="moment-header"><div class="moment-avatar">${avatarContent}</div><div class="moment-info"><div class="moment-name">${moment.authorName}</div><div class="moment-time">${formatContactListTime(moment.time)}</div></div></div><div class="moment-content">${moment.content}</div>${imageContent}${commentsContent}`;
            momentsList.appendChild(momentDiv);
        });
    }
}

// --- 音乐播放器 (懒加载) ---
function lazyInitMusicPlayer() {
    // 确保只初始化一次
    if (isMusicPlayerInitialized) return;
    isMusicPlayerInitialized = true;

    initMusicPlayer();
}

async function initMusicPlayer() {
    try {
        // DB已经由init()打开，这里不需要再次打开
        await loadPlaylistFromDB();
    } catch (error) {
        console.error("Failed to initialize music player:", error);
        showToast("无法加载音乐库");
    }

    document.getElementById('closeMusicModal').addEventListener('click', closeMusicModal);
    document.getElementById('progressBar').addEventListener('click', seekMusic);
    window.addEventListener('click', (event) => { if (event.target === document.getElementById('musicModal')) closeMusicModal(); });
    
    audio = new Audio();
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', onSongEnded);
    audio.addEventListener('loadedmetadata', onMetadataLoaded);
}

async function loadPlaylistFromDB() {
    return new Promise((resolve, reject) => {
        if (!isIndexedDBReady) { // 确保DB已准备好
            reject('IndexedDB not ready');
            return;
        }
        const transaction = db.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        const request = store.getAll();

        request.onsuccess = () => {
            playlist = request.result.map(song => ({
                id: song.id,
                name: song.name,
                lyrics: song.lyrics,
            }));
            renderPlaylist();
            resolve();
        };

        request.onerror = (event) => {
            console.error('Failed to load playlist from DB:', event.target.error);
            reject('Failed to load playlist');
        };
    });
}

async function saveSong() {
    const nameInput = document.getElementById('songName');
    const musicFileInput = document.getElementById('musicFileUpload');
    const lrcFileInput = document.getElementById('lrcFile');

    const musicFile = musicFileInput.files[0];
    const lrcFile = lrcFileInput.files[0];

    if (!musicFile) {
        showToast('请选择一个音乐文件');
        return;
    }

    const songName = nameInput.value.trim() || musicFile.name.replace(/\.[^/.]+$/, "");

    let lyrics = [];
    if (lrcFile) {
        try {
            const lrcText = await lrcFile.text();
            lyrics = parseLRC(lrcText);
        } catch (e) {
            showToast('歌词文件读取失败，将不带歌词保存。');
        }
    }
    
    const songRecord = {
        name: songName,
        music: musicFile, 
        lyrics: lyrics
    };

    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法保存歌曲。');
        return;
    }

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const request = store.add(songRecord);

    request.onsuccess = async () => {
        showToast(`歌曲 "${songName}" 已成功保存到本地`);
        clearAddForm();
        await loadPlaylistFromDB(); 
    };

    request.onerror = (event) => {
        console.error('Failed to save song to DB:', event.target.error);
        showToast('保存歌曲失败');
    };
}

async function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    
    const songInfo = playlist[index];
    currentSongIndex = index;

    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }

    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法播放歌曲。');
        return;
    }

    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const request = store.get(songInfo.id);

    request.onsuccess = (event) => {
        const songRecord = event.target.result;
        if (songRecord && songRecord.music) {
            currentObjectUrl = URL.createObjectURL(songRecord.music);
            audio.src = currentObjectUrl;
            audio.play().then(() => {
                isPlaying = true;
                updatePlayButton();
                document.getElementById('currentSongInfo').style.display = 'block';
                document.getElementById('currentSongName').textContent = songRecord.name;
                currentLyrics = songRecord.lyrics || [];
                currentLyricIndex = -1;
                if (currentLyrics.length > 0) startLyricSync();
                else document.getElementById('currentLyric').textContent = '暂无歌词';
                renderPlaylist();
            }).catch(error => showToast('播放失败: ' + error.message));
        } else {
            showToast('无法从数据库中找到歌曲文件');
        }
    };

    request.onerror = (event) => {
        console.error("Error fetching song from DB:", event.target.error);
        showToast('播放歌曲时出错');
    };
}

async function deleteSong(index) {
    showConfirmDialog('删除确认', '确定要永久删除这首歌吗？', async () => {
        const songInfo = playlist[index];
        
        if (!isIndexedDBReady) {
            showToast('数据库未准备好，无法删除歌曲。');
            return;
        }

        const transaction = db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        const request = store.delete(songInfo.id);

        request.onsuccess = async () => {
            showToast(`歌曲 "${songInfo.name}" 已删除`);
            if (index === currentSongIndex) {
                stopMusic();
                currentSongIndex = -1;
                document.getElementById('currentSongInfo').style.display = 'none';
            }
            await loadPlaylistFromDB();
        };

        request.onerror = (event) => {
            console.error('Failed to delete song from DB:', event.target.error);
            showToast('删除歌曲失败');
        };
    });
}

function showMusicModal() {
    lazyInitMusicPlayer(); // 第一次点击时才初始化
    document.getElementById('musicModal').style.display = 'block';
    renderPlaylist();
}

function closeMusicModal() {
    document.getElementById('musicModal').style.display = 'none';
}

function renderPlaylist() {
    const container = document.getElementById('playlistContainer');
    if (!playlist || playlist.length === 0) { 
        container.innerHTML = '<p style="text-align: center; color: #999;">暂无歌曲，请从下方上传</p>'; 
        return; 
    }
    container.innerHTML = '';
    playlist.forEach((song, index) => {
        const songDiv = document.createElement('div');
        songDiv.className = 'song-item';
        if (index === currentSongIndex) songDiv.classList.add('active');
        songDiv.innerHTML = `<span onclick="playSong(${index})" style="flex: 1;">${song.name}</span><span class="delete-song" onclick="deleteSong(${index})">×</span>`;
        container.appendChild(songDiv);
    });
}

function parseLRC(lrcContent) {
    const lines = lrcContent.split(/\r?\n/);
    const lyrics = [];
    const timeRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    lines.forEach(line => {
        if (!line.trim()) return;
        let match;
        let lastIndex = 0;
        const times = [];
        while ((match = timeRegex.exec(line)) !== null) {
            const totalSeconds = parseInt(match[1]) * 60 + parseInt(match[2]) + (match[3] ? parseInt(match[3].padEnd(3, '0')) / 1000 : 0);
            times.push(totalSeconds);
            lastIndex = match.index + match[0].length;
        }
        if (times.length > 0) {
            const text = line.substring(lastIndex).trim();
            if (text) times.forEach(time => lyrics.push({ time, text }));
        }
    });
    lyrics.sort((a, b) => a.time - b.time);
    return lyrics;
}

function startLyricSync() {
    stopLyricSync();
    lyricTimer = setInterval(() => { if (!audio.paused && currentLyrics.length > 0) updateLyrics(); }, 100);
}

function stopLyricSync() {
    if (lyricTimer) clearInterval(lyricTimer);
    lyricTimer = null;
}

function updateLyrics() {
    const currentTime = audio.currentTime;
    let newIndex = -1;
    for (let i = currentLyrics.length - 1; i >= 0; i--) {
        if (currentTime >= currentLyrics[i].time) { newIndex = i; break; }
    }
    if (newIndex !== currentLyricIndex && newIndex >= 0) {
        currentLyricIndex = newIndex;
        const lyricText = currentLyrics[newIndex].text;
        document.getElementById('currentLyric').textContent = lyricText;
        sendLyricToAI(lyricText);
    }
}

function sendLyricToAI(lyricText) {
    if (currentSongIndex > -1) {
         window.currentMusicInfo = { songName: playlist[currentSongIndex]?.name || '', lyric: lyricText, isPlaying };
    }
}

function togglePlay() {
    if (audio.src) {
        if (audio.paused) { audio.play(); isPlaying = true; startLyricSync(); }
        else { audio.pause(); isPlaying = false; stopLyricSync(); }
        updatePlayButton();
    }
}

function stopMusic() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    currentLyricIndex = -1;
    stopLyricSync();
    updatePlayButton();
    document.getElementById('currentLyric').textContent = '等待歌词...';
    window.currentMusicInfo = null;
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
}

function updatePlayButton() {
    document.getElementById('playPauseBtn').textContent = isPlaying ? '⏸️ 暂停' : '▶️ 播放';
}

function updateProgress() {
    if (audio.duration) {
        document.getElementById('progressFill').style.width = (audio.currentTime / audio.duration) * 100 + '%';
        document.getElementById('currentTime').textContent = formatMusicTime(audio.currentTime);
    }
}

function onMetadataLoaded() {
    document.getElementById('totalTime').textContent = formatMusicTime(audio.duration);
}

function onSongEnded() {
    isPlaying = false;
    updatePlayButton();
    stopLyricSync();
    window.currentMusicInfo = null;
}

function seekMusic(event) {
    if (audio.duration) {
        const rect = event.currentTarget.getBoundingClientRect();
        audio.currentTime = ((event.clientX - rect.left) / rect.width) * audio.duration;
    }
}

function toggleLyricsDisplay() {
    document.getElementById('floatingLyrics').style.display = document.getElementById('showLyrics').checked ? 'block' : 'none';
}

function clearAddForm() {
    document.getElementById('songName').value = '';
    document.getElementById('musicFileUpload').value = '';
    document.getElementById('lrcFile').value = '';
}

function formatMusicTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffInSeconds = (now - postTime) / 1000;
    const diffInMinutes = diffInSeconds / 60;
    const diffInHours = diffInMinutes / 60;

    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfPostTime = new Date(postTime.getFullYear(), postTime.getMonth(), postTime.getDate());
    const diffInDays = (startOfNow - startOfPostTime) / (1000 * 60 * 60 * 24);

    if (diffInDays < 1) { // Today
        if (diffInMinutes < 1) return "刚刚";
        if (diffInMinutes < 60) return `${Math.floor(diffInMinutes)}分钟前`;
        return `${Math.floor(diffInHours)}小时前`;
    } else if (diffInDays < 2) { // Yesterday
        return "1天前";
    } else { // 2 days ago or more
        const isThisYear = now.getFullYear() === postTime.getFullYear();
        const month = (postTime.getMonth() + 1).toString().padStart(2, '0');
        const day = postTime.getDate().toString().padStart(2, '0');
        if (isThisYear) {
            const hours = postTime.getHours().toString().padStart(2, '0');
            const minutes = postTime.getMinutes().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        } else {
            return `${postTime.getFullYear()}-${month}-${day}`;
        }
    }
}

// --- UI 更新 & 交互 ---
function updateContextIndicator() {
    const indicator = document.getElementById('contextIndicator');
    if (indicator) indicator.innerHTML = `上下文: ${apiSettings.contextMessageCount}条`;
}

function updateContextValue(value) {
    document.getElementById('contextValue').textContent = value + '条';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function showTopNotification(message) {
    const notification = document.getElementById('topNotification');
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 1500);
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
    if (modalId === 'apiSettingsModal') {
        document.getElementById('contextSlider').value = apiSettings.contextMessageCount;
        document.getElementById('contextValue').textContent = apiSettings.contextMessageCount + '条';
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (modalId === 'addContactModal') {
        editingContact = null;
        document.getElementById('contactModalTitle').textContent = '添加AI助手';
        document.getElementById('contactName').value = '';
        document.getElementById('contactAvatar').value = '';
        document.getElementById('contactPersonality').value = '';
        document.getElementById('customPrompts').value = '';
    }
}

function showAddContactModal() {
    editingContact = null;
    document.getElementById('contactModalTitle').textContent = '添加AI助手';
    showModal('addContactModal');
}

function showEditContactModal() {
    if (!currentContact) { showToast('请先选择联系人'); return; }
    editingContact = currentContact;
    document.getElementById('contactModalTitle').textContent = '编辑AI助手';
    document.getElementById('contactName').value = currentContact.name;
    document.getElementById('contactAvatar').value = currentContact.avatar || '';
    document.getElementById('contactPersonality').value = currentContact.personality;
    document.getElementById('customPrompts').value = currentContact.customPrompts || '';
    showModal('addContactModal');
    toggleSettingsMenu();
}

function showApiSettingsModal() {
    document.getElementById('apiUrl').value = apiSettings.url;
    document.getElementById('apiKey').value = apiSettings.key;

    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');

    // 重置并填充
    primarySelect.innerHTML = '<option value="">请先测试连接</option>';
    secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
    
    // 如果已有设置，则自动尝试获取模型列表
    if (apiSettings.url && apiSettings.key) {
        // 临时显示已保存的选项
        if (apiSettings.model) {
            primarySelect.innerHTML = `<option value="${apiSettings.model}">${apiSettings.model}</option>`;
        }
        if (apiSettings.secondaryModel && apiSettings.secondaryModel !== 'sync_with_primary') {
             secondarySelect.innerHTML = `
                <option value="sync_with_primary">与主模型保持一致</option>
                <option value="${apiSettings.secondaryModel}">${apiSettings.secondaryModel}</option>`;
        }
        testApiConnection(); // 自动测试连接并填充列表
    }
    
    // 确保在显示模态框时绑定事件
    primarySelect.onchange = handlePrimaryModelChange;

    showModal('apiSettingsModal');
}

function showBackgroundModal() {
    if (!currentContact) { showToast('请先选择联系人'); return; }
    document.getElementById('backgroundUrl').value = backgrounds[currentContact.id] || '';
    showModal('backgroundModal');
    toggleSettingsMenu();
}

function showAddEmojiModal() {
    showModal('addEmojiModal');
    toggleEmojiPanel(true);
}

function showRedPacketModal() {
    showModal('redPacketModal');
}

function showEditProfileModal() {
    document.getElementById('profileNameInput').value = userProfile.name;
    document.getElementById('profileAvatarInput').value = userProfile.avatar || '';
    document.getElementById('profilePersonality').value = userProfile.personality || '';
    showModal('editProfileModal');
}

function showCreateGroupModal() {
    const memberList = document.getElementById('groupMemberList');
    memberList.innerHTML = '';
    contacts.forEach(contact => {
        if (contact.type !== 'group') {
            const item = document.createElement('div');
            item.className = 'group-member-item';
            item.innerHTML = `<div class="group-member-avatar">${contact.avatar ? `<img src="${contact.avatar}">` : contact.name[0]}</div><div class="group-member-name">${contact.name}</div><div class="group-member-checkbox">✓</div>`;
            item.onclick = () => {
                item.classList.toggle('selected');
                item.querySelector('.group-member-checkbox').classList.toggle('selected');
            };
            memberList.appendChild(item);
        }
    });
    showModal('createGroupModal');
}

// --- 数据保存与处理 ---
async function saveContact(event) {
    event.preventDefault();
    const contactData = {
        name: document.getElementById('contactName').value,
        avatar: document.getElementById('contactAvatar').value,
        personality: document.getElementById('contactPersonality').value,
        customPrompts: document.getElementById('customPrompts').value
    };
    if (editingContact) {
        Object.assign(editingContact, contactData);
        showToast('修改成功');
    } else {
        const contact = { id: Date.now().toString(), ...contactData, messages: [], lastMessage: '点击开始聊天', lastTime: formatContactListTime(new Date().toISOString()), type: 'private', memoryTableContent: defaultMemoryTable };
        contacts.unshift(contact);
        showToast('添加成功');
    }
    await saveDataToDB(); // 使用IndexedDB保存
    renderContactList();
    closeModal('addContactModal');
    event.target.reset();
}

async function createGroup(event) {
    event.preventDefault();
    const groupName = document.getElementById('groupName').value;
    if (!groupName) { showToast('请输入群聊名称'); return; }
    const selectedItems = document.querySelectorAll('.group-member-item.selected');
    if (selectedItems.length < 2) { showToast('请至少选择两个成员'); return; }
    const memberIds = [];
    selectedItems.forEach(item => {
        const name = item.querySelector('.group-member-name').textContent;
        const contact = contacts.find(c => c.name === name && c.type === 'private');
        if (contact) memberIds.push(contact.id);
    });
    const group = { id: 'group_' + Date.now().toString(), name: groupName, members: memberIds, messages: [], lastMessage: '群聊已创建', lastTime: formatContactListTime(new Date().toISOString()), type: 'group', memoryTableContent: defaultMemoryTable };
    contacts.unshift(group);
    await saveDataToDB(); // 使用IndexedDB保存
    renderContactList();
    closeModal('createGroupModal');
    showToast('群聊创建成功');
}

function importPrompts(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            document.getElementById('customPrompts').value = JSON.stringify(JSON.parse(e.target.result), null, 2);
            showToast('导入成功');
        } catch (error) {
            showToast('导入失败：文件格式错误');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function saveProfile(event) {
    event.preventDefault();
    userProfile.name = document.getElementById('profileNameInput').value;
    userProfile.avatar = document.getElementById('profileAvatarInput').value;
    userProfile.personality = document.getElementById('profilePersonality').value;
    await saveDataToDB(); // 使用IndexedDB保存
    updateUserProfileUI();
    closeModal('editProfileModal');
    showToast('保存成功');
}

function updateUserProfileUI() {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    userName.textContent = userProfile.name;
    userAvatar.innerHTML = userProfile.avatar ? `<img src="${userProfile.avatar}">` : (userProfile.name[0] || '我');
}

function renderContactList() {
    const contactList = document.getElementById('contactList');
    contactList.innerHTML = '';
    contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        if (contact.type === 'group') {
            item.innerHTML = `<div class="group-avatar"><div class="group-avatar-inner">${getGroupAvatarContent(contact)}</div></div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${contact.lastTime}</div>`;
        } else {
            item.innerHTML = `<div class="contact-avatar">${contact.avatar ? `<img src="${contact.avatar}">` : contact.name[0]}</div><div class="contact-info"><div class="contact-name">${contact.name}</div><div class="contact-message">${contact.lastMessage}</div></div><div class="contact-time">${contact.lastTime}</div>`;
        }
        item.onclick = () => openChat(contact);

        // 添加长按事件监听器来删除联系人/群聊
        let pressTimer;
        item.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                showConfirmDialog('删除确认', `确定要删除 "${contact.name}" 吗？此操作不可撤销。`, () => {
                    deleteContact(contact.id);
                });
            }, 700); // 长按700毫秒触发
        });
        item.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        item.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });
        // 对于非触摸设备，也可以添加右键菜单
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showConfirmDialog('删除确认', `确定要删除 "${contact.name}" 吗？此操作不可撤销。`, () => {
                deleteContact(contact.id);
            });
        });

        contactList.appendChild(item);
    });
}

function getGroupAvatarContent(group) {
    const memberAvatars = group.members.slice(0, 4).map(id => contacts.find(c => c.id === id)).filter(Boolean);
    let avatarContent = '';
    for (let i = 0; i < 4; i++) {
        if (i < memberAvatars.length) {
            const member = memberAvatars[i];
            avatarContent += `<div class="group-avatar-item">${member.avatar ? `<img src="${member.avatar}">` : member.name[0]}</div>`;
        } else {
            avatarContent += `<div class="group-avatar-item"></div>`;
        }
    }
    return avatarContent;
}

// --- 聊天核心逻辑 ---
function openChat(contact) {
    currentContact = contact;
    window.memoryTableManager.setCurrentContact(contact);
    document.getElementById('chatTitle').textContent = contact.name;
    showPage('chatPage');
    
    // 重置消息加载状态
    currentlyDisplayedMessageCount = 0; 
    
    renderMessages(true); // 初始加载
    
    updateContextIndicator();
    const chatMessagesEl = document.getElementById('chatMessages');
    chatMessagesEl.style.backgroundImage = backgrounds[contact.id] ? `url(${backgrounds[contact.id]})` : 'none';
    
    // 移除旧的监听器
    chatMessagesEl.onscroll = null; 
    // 添加新的滚动监听器
    chatMessagesEl.onscroll = () => {
        if (chatMessagesEl.scrollTop === 0 && !isLoadingMoreMessages && currentContact.messages.length > currentlyDisplayedMessageCount) {
            loadMoreMessages();
        }
    };

    toggleMemoryPanel(true);
}

function closeChatPage() {
    showPage('contactListPage');
    
    // 清理工作
    const chatMessagesEl = document.getElementById('chatMessages');
    chatMessagesEl.onscroll = null; // 移除监听器
    currentContact = null;
    toggleEmojiPanel(true);
    toggleSettingsMenu(true);
    toggleMemoryPanel(true);
}

function renderMessages(isInitialLoad = false) {
    if (!currentContact) return;
    const chatMessages = document.getElementById('chatMessages');
    const allMessages = currentContact.messages;

    // 确定要渲染的消息
    if (isInitialLoad) {
        currentlyDisplayedMessageCount = Math.min(allMessages.length, MESSAGES_PER_PAGE);
    }
    const messagesToRender = allMessages.slice(allMessages.length - currentlyDisplayedMessageCount);

    // 保存滚动位置
    const oldScrollHeight = chatMessages.scrollHeight;
    const oldScrollTop = chatMessages.scrollTop;

    // 清空并重新渲染
    chatMessages.innerHTML = '';

    // 如果还有更多消息，显示"加载更多"按钮
    if (allMessages.length > currentlyDisplayedMessageCount) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.className = 'load-more-messages';
        loadMoreDiv.textContent = '加载更早的消息...';
        loadMoreDiv.onclick = loadMoreMessages;
        chatMessages.appendChild(loadMoreDiv);
    }
    
    if (currentContact.type === 'group') {
        const hint = document.createElement('div');
        hint.className = 'group-info-hint';
        hint.textContent = `群聊成员: ${getGroupMembersText()}`;
        chatMessages.appendChild(hint);
    }

    let lastTimestamp = null;
    messagesToRender.forEach((msg, index) => {
        const originalIndex = allMessages.length - currentlyDisplayedMessageCount + index;
        const currentMsgTime = new Date(msg.time);

        if (!lastTimestamp || currentMsgTime - lastTimestamp > 5 * 60 * 1000) {
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'message-timestamp';
            timestampDiv.textContent = formatChatTimestamp(msg.time);
            chatMessages.appendChild(timestampDiv);
            lastTimestamp = currentMsgTime;
        }

        const msgDiv = document.createElement('div');
        if (msg.role === 'system') return;
        
        msgDiv.className = `message ${msg.role === 'user' ? 'sent' : 'received'}`;
        msgDiv.dataset.messageIndex = originalIndex;

        let contentHtml = '';
        if (msg.type === 'emoji') {
            contentHtml = `<img src="${msg.content}" class="message-emoji">`;
        } else if (msg.type === 'red_packet') {
            const packet = JSON.parse(msg.content);
            contentHtml = `<div class="message-content red-packet" onclick="showToast('红包金额: ${packet.amount}')"><div class="red-packet-body"><svg class="red-packet-icon" viewBox="0 0 1024 1024"><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32zM731.2 565.2H603.9c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8zM419.8 565.2H292.5c-4.4 0-8 3.6-8 8v128.3c0 4.4 3.6 8 8 8h127.3c4.4 0 8-3.6 8-8V573.2c0-4.4-3.6-8-8-8z" fill="#FEFEFE"></path><path d="M872.4 240H151.6c-17.7 0-32 14.3-32 32v64h784v-64c0-17.7-14.3-32-32-32z" fill="#FCD4B3"></path><path d="M512 432c-48.6 0-88 39.4-88 88s39.4 88 88 88 88-39.4 88-88-39.4-88-88-88z m0 152c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64-64z" fill="#FCD4B3"></path><path d="M840.4 304H183.6c-17.7 0-32 14.3-32 32v552c0 17.7 14.3 32 32 32h656.8c17.7 0 32-14.3 32-32V336c0-17.7-14.3-32-32-32z m-32 552H215.6V368h624.8v488z" fill="#F37666"></path><path d="M512 128c-112.5 0-204 91.5-204 204s91.5 204 204 204 204-91.5 204-204-91.5-204-204-204z m0 384c-99.4 0-180-80.6-180-180s80.6-180 180-180 180 80.6 180 180-80.6 180-180 180z" fill="#F37666"></path><path d="M512 456c-35.3 0-64 28.7-64 64s28.7 64 64 64 64 28.7 64 64-28.7-64-64-64z m16.4 76.4c-2.3 2.3-5.4 3.6-8.5 3.6h-15.8c-3.1 0-6.2-1.3-8.5-3.6s-3.6-5.4-3.6-8.5v-27.8c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12v27.8c0.1 3.1-1.2 6.2-3.5 8.5z" fill="#F37666"></path></svg><div class="red-packet-text"><div>${packet.message || '恭喜发财，大吉大利！'}</div><div>领取红包</div></div></div><div class="red-packet-footer">AI红包</div></div>`;
        } else {
            let processedContent = msg.content;
            const emojiTagRegex = /\[(?:emoji|发送了表情)[:：]([^\]]+)\]/g;
            const standaloneEmojiMatch = processedContent.trim().match(/^\[(?:emoji|发送了表情)[:：]([^\]]+)\]$/);
            if (standaloneEmojiMatch) {
                 const emojiName = standaloneEmojiMatch[1];
                 const foundEmoji = emojis.find(e => e.meaning === emojiName);
                 if(foundEmoji) {
                    contentHtml = `<img src="${foundEmoji.url}" class="message-emoji">`;
                 } else {
                    contentHtml = `<div class="message-content">${processedContent}</div>`;
                 }
            } else {
                processedContent = processedContent.replace(/\n/g, '<br>');
                processedContent = processedContent.replace(emojiTagRegex, (match, name) => {
                    const foundEmoji = emojis.find(e => e.meaning === name);
                    return foundEmoji ? `<img src="${foundEmoji.url}" style="max-width: 100px; max-height: 100px; border-radius: 8px; vertical-align: middle; margin: 2px;">` : match;
                });
                contentHtml = `<div class="message-content">${processedContent}</div>`;
            }
        }

        let avatarContent = '';
        if (msg.role === 'user') {
            avatarContent = userProfile.avatar ? `<img src="${userProfile.avatar}">` : (userProfile.name[0] || '我');
        } else {
            const sender = contacts.find(c => c.id === msg.senderId);
            avatarContent = sender ? (sender.avatar ? `<img src="${sender.avatar}">` : sender.name[0]) : '?';
        }

        if (currentContact.type === 'group' && msg.role !== 'user') {
            const sender = contacts.find(c => c.id === msg.senderId);
            const senderName = sender ? sender.name : '未知';
            msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble"><div class="group-message-header"><div class="group-message-name">${senderName}</div></div>${contentHtml}</div>`;
        } else {
            msgDiv.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble">${contentHtml}</div>`;
        }

        let msgPressTimer;
        msgDiv.addEventListener('touchstart', () => { msgPressTimer = setTimeout(() => { showConfirmDialog('删除消息', '确定要删除这条消息吗？此操作不可撤销。', () => deleteMessage(originalIndex)); }, 700); });
        msgDiv.addEventListener('touchend', () => clearTimeout(msgPressTimer));
        msgDiv.addEventListener('touchmove', () => clearTimeout(msgPressTimer));
        msgDiv.addEventListener('contextmenu', (e) => { e.preventDefault(); showConfirmDialog('删除消息', '确定要删除这条消息吗？此操作不可撤销。', () => deleteMessage(originalIndex)); });
        
        chatMessages.appendChild(msgDiv);
    });

    // 调整滚动位置
    if (isInitialLoad) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
        chatMessages.scrollTop = chatMessages.scrollHeight - oldScrollHeight;
    }
}

function loadMoreMessages() {
    if (isLoadingMoreMessages) return;
    isLoadingMoreMessages = true;

    const chatMessages = document.getElementById('chatMessages');
    const loadMoreButton = chatMessages.querySelector('.load-more-messages');
    if (loadMoreButton) {
        loadMoreButton.textContent = '正在加载...';
    }

    setTimeout(() => {
        const allMessages = currentContact.messages;
        const newCount = Math.min(allMessages.length, currentlyDisplayedMessageCount + MESSAGES_PER_PAGE);
        
        if (newCount > currentlyDisplayedMessageCount) {
            currentlyDisplayedMessageCount = newCount;
            renderMessages(false); // 重新渲染，非初始加载
        }
        
        isLoadingMoreMessages = false;
    }, 500);
}

function getGroupMembersText() {
    if (!currentContact || currentContact.type !== 'group') return '';
    return currentContact.members.map(id => contacts.find(c => c.id === id)?.name || '未知').join('、');
}

async function sendUserMessage() {
    if (!currentContact) return;
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (!content) return;
    const userMessage = { role: 'user', content, type: 'text', time: new Date().toISOString(), senderId: 'user' };
    currentContact.messages.push(userMessage);
    
    // 如果消息总数超过了当前显示的条数，增加显示条数以包含新消息
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }

    currentContact.lastMessage = content;
    currentContact.lastTime = formatContactListTime(new Date().toISOString());
    input.value = '';
    input.style.height = 'auto';
    renderMessages(true); // 重新渲染并滚动到底部
    renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    input.focus();
}

async function sendMessage() {
    if (!currentContact) return;
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (content) await sendUserMessage();
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) { showToast('请先设置API'); return; }
    if (currentContact.messages.length === 0 && !content) return;
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    try {
        if (currentContact.type === 'group') {
            await sendGroupMessage();
        } else {
            showTypingIndicator();
            const { replies, newMemoryTable } = await callAPI(currentContact);
            hideTypingIndicator();
            if (newMemoryTable) {
                currentContact.memoryTableContent = newMemoryTable;
                await saveDataToDB();
            }
            if (!replies || replies.length === 0) { showTopNotification('AI没有返回有效回复'); return; }
            for (const response of replies) {
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
                const aiMessage = { role: 'assistant', content: response.content, type: response.type, time: new Date().toISOString(), senderId: currentContact.id };
                currentContact.messages.push(aiMessage);
                if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                    currentlyDisplayedMessageCount++;
                }
                currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : (response.type === 'emoji' ? '[表情]' : '[红包]');
                currentContact.lastTime = formatContactListTime(new Date().toISOString());
                renderMessages(true); // 重新渲染并滚动到底部
                renderContactList();
                await saveDataToDB();
            }
        }
    } catch (error) {
        console.error('发送消息错误:', error);
        showToast('发送失败：' + error.message);
        hideTypingIndicator();
    } finally {
        sendBtn.disabled = false;
    }
}

async function sendGroupMessage() {
    if (!currentContact || currentContact.type !== 'group') return;
    let turnContext = []; 
    for (const memberId of currentContact.members) {
        const member = contacts.find(c => c.id === memberId);
        if (!member || member.type === 'group') continue;
        showTypingIndicator(member);
        try {
            const { replies, newMemoryTable } = await callAPI(member, turnContext);
            hideTypingIndicator();
            if (newMemoryTable) {
                window.memoryTableManager.updateContactMemoryTable(currentContact, newMemoryTable);
                await saveDataToDB();
            }
            if (!replies || replies.length === 0) continue;
            for (const response of replies) {
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
                const aiMessage = { role: 'assistant', content: response.content, type: response.type, time: new Date().toISOString(), senderId: member.id };
                currentContact.messages.push(aiMessage);
                if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                    currentlyDisplayedMessageCount++;
                }
                turnContext.push(aiMessage);
                currentContact.lastMessage = `${member.name}: ${response.type === 'text' ? response.content.substring(0, 15) + '...' : '[表情]'}`;
                currentContact.lastTime = formatContactListTime(new Date().toISOString());
                renderMessages(true); // 重新渲染并滚动到底部
                renderContactList();
                await saveDataToDB();
            }
        } catch (error) {
            console.error(`Error getting response from ${member.name}:`, error);
            hideTypingIndicator();
        }
    }
}

function showTypingIndicator(contact = null) {
    const chatMessages = document.getElementById('chatMessages');
    let indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
    indicator = document.createElement('div');
    indicator.className = 'message received';
    indicator.id = 'typingIndicator';
    chatMessages.appendChild(indicator);
    const displayContact = contact || currentContact;
    let avatarContent = displayContact ? (displayContact.avatar ? `<img src="${displayContact.avatar}">` : displayContact.name[0]) : '';
    indicator.innerHTML = `<div class="message-avatar">${avatarContent}</div><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

/**
 * 通过我们的 Netlify Function 代理来调用 API。
 * @param {object} contact The contact object.
 * @param {array} turnContext Additional messages for group chat context.
 * @returns {object} The API response containing replies and the new memory table.
 */
async function callAPI(contact, turnContext = []) {
    try {
        // 1. 构建系统提示词
        const systemPrompt = window.promptBuilder.buildChatPrompt(
            contact, 
            userProfile, 
            currentContact, 
            apiSettings, 
            emojis, 
            window, 
            turnContext
        );

        // 2. 构建消息数组
        const messages = [{ role: 'system', content: systemPrompt }];
        const messageHistory = window.promptBuilder.buildMessageHistory(
            currentContact, 
            apiSettings, 
            userProfile, 
            contacts, 
            contact, 
            emojis, 
            turnContext
        );

        messages.push(...messageHistory);

        // 3. 调用API
        const data = await window.apiService.callOpenAIAPI(
            apiSettings.url,
            apiSettings.key,
            apiSettings.model,
            messages
        );

        // 4. 处理响应 - 只增加最小的错误检查
        if (!data) {
            console.error('API返回数据为空:', data);
            throw new Error('API返回数据为空');
        }

        let fullResponseText;
        if (data.choices && data.choices[0] && data.choices[0].message) {
            // 标准OpenAI格式
            fullResponseText = data.choices[0].message.content;
        } else if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            // Gemini API 格式
            fullResponseText = data.candidates[0].content.parts[0].text;
        } else if (data.content) {
            // 可能的替代格式
            fullResponseText = data.content;
        } else if (data.message) {
            // 另一种可能的格式
            fullResponseText = data.message;
        } else {
            // 检查是否是因为没有生成内容
            if (data.usage && data.usage.completion_tokens === 0) {
                console.warn('API没有生成任何内容，可能被过滤或模型限制');
                throw new Error('AI模型没有生成回复，可能是内容被过滤，请检查输入或稍后重试');
            }
            console.error('无法从API响应中提取内容:', data);
            throw new Error('API响应格式不支持，无法提取回复内容');
        }

        // 检查内容是否有效
        if (!fullResponseText || fullResponseText.trim() === '') {
            throw new Error('AI回复内容为空，请稍后重试');
        }
        
        const { memoryTable: newMemoryTable, cleanedResponse } = window.memoryTableManager.extractMemoryTableFromResponse(fullResponseText);
        
        if (!newMemoryTable) {
            console.warn("AI回复中未找到<memory_table>。");
        }
        
        let chatRepliesText = cleanedResponse;

        // 处理回复分割
        if (!chatRepliesText.includes('|||')) {
            const sentences = chatRepliesText.split(/([。！？\n])/).filter(Boolean);
            let tempReplies = [];
            for (let i = 0; i < sentences.length; i += 2) {
                let sentence = sentences[i];
                let punctuation = sentences[i+1] || '';
                tempReplies.push(sentence + punctuation);
            }
            chatRepliesText = tempReplies.join('|||');
        }
        
        const replies = chatRepliesText.split('|||').map(r => r.trim()).filter(r => r);
        const processedReplies = [];
        
        // 处理特殊消息类型（表情、红包等）
        const emojiNameRegex = /^\[(?:emoji|发送了表情)[:：]([^\]]+)\]$/;
        const redPacketRegex = /^\[red_packet:({.*})\]$/;

        for (const reply of replies) {
            const emojiMatch = reply.match(emojiNameRegex);
            const redPacketMatch = reply.match(redPacketRegex);

            if (emojiMatch) {
                const emojiName = emojiMatch[1];
                const foundEmoji = emojis.find(e => e.meaning === emojiName);
                if (foundEmoji) {
                    processedReplies.push({ type: 'emoji', content: foundEmoji.url });
                } else {
                    processedReplies.push({ type: 'text', content: reply });
                }
            } else if (redPacketMatch) {
                try {
                    const packetData = JSON.parse(redPacketMatch[1]);
                    if (typeof packetData.amount === 'number' && typeof packetData.message === 'string') {
                         processedReplies.push({ type: 'red_packet', content: JSON.stringify(packetData) });
                    } else {
                         processedReplies.push({ type: 'text', content: reply });
                    }
                } catch (e) {
                    processedReplies.push({ type: 'text', content: reply });
                }
            } else {
                processedReplies.push({ type: 'text', content: reply });
            }
        }
        
        return { replies: processedReplies, newMemoryTable };

    } catch (error) {
        console.error("API Call Error:", error);
        showToast("API 调用失败: " + error.message);
        throw error;
    }
}


async function testApiConnection() {
    const url = document.getElementById('apiUrl').value;
    const key = document.getElementById('apiKey').value;
    if (!url || !key) {
        showToast('请填写完整信息');
        return;
    }

    const primarySelect = document.getElementById('primaryModelSelect');
    const secondarySelect = document.getElementById('secondaryModelSelect');
    
    primarySelect.innerHTML = '<option>连接中...</option>';
    secondarySelect.innerHTML = '<option>连接中...</option>';
    primarySelect.disabled = true;
    secondarySelect.disabled = true;

    try {
        const data = await window.apiService.testConnection(url, key);
        const models = data.data ? data.data.map(m => m.id).sort() : [];

        if (models.length === 0) {
            showToast('连接成功，但未找到可用模型');
            primarySelect.innerHTML = '<option>无可用模型</option>';
            secondarySelect.innerHTML = '<option>无可用模型</option>';
            return;
        }

        // 填充主要模型
        primarySelect.innerHTML = '';
        models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            primarySelect.appendChild(option);
        });
        primarySelect.value = apiSettings.model;

        // 填充次要模型
        secondarySelect.innerHTML = '<option value="sync_with_primary">与主模型保持一致</option>';
        models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            secondarySelect.appendChild(option);
        });
        secondarySelect.value = apiSettings.secondaryModel || 'sync_with_primary';
        
        primarySelect.disabled = false;
        secondarySelect.disabled = false;
        showToast('连接成功');

    } catch (error) {
        primarySelect.innerHTML = '<option>连接失败</option>';
        secondarySelect.innerHTML = '<option>连接失败</option>';
        showToast(error.message);
    }
}

function handlePrimaryModelChange() {
    const primaryModel = document.getElementById('primaryModelSelect').value;
    const secondarySelect = document.getElementById('secondaryModelSelect');
    
    // 如果次要模型设置为“同步”，则在数据层面更新它
    if (apiSettings.secondaryModel === 'sync_with_primary') {
        // 不需要直接修改UI，保存时会处理
    }
}

async function saveApiSettings(event) {
    event.preventDefault();
    apiSettings.url = document.getElementById('apiUrl').value;
    apiSettings.key = document.getElementById('apiKey').value;
    apiSettings.model = document.getElementById('primaryModelSelect').value;
    apiSettings.secondaryModel = document.getElementById('secondaryModelSelect').value;
    apiSettings.contextMessageCount = parseInt(document.getElementById('contextSlider').value);
    
    await saveDataToDB();
    closeModal('apiSettingsModal');
    updateContextIndicator();
    showToast('设置已保存');
}

async function setBackground(event) {
    event.preventDefault();
    if (!currentContact) return;
    const url = document.getElementById('backgroundUrl').value;
    if (url) backgrounds[currentContact.id] = url;
    else delete backgrounds[currentContact.id];
    await saveDataToDB(); // 使用IndexedDB保存
    openChat(currentContact);
    closeModal('backgroundModal');
    showToast('背景设置成功');
}

async function addEmoji(event) {
    event.preventDefault();
    const meaning = document.getElementById('emojiMeaning').value.trim();
    if (emojis.some(e => e.meaning === meaning)) {
        showToast('该表情含义已存在，请使用其他名称。');
        return;
    }
    const emoji = { 
        id: Date.now().toString(), 
        url: document.getElementById('emojiUrl').value, 
        meaning: meaning
    };
    emojis.push(emoji);
    await saveDataToDB(); // 使用IndexedDB保存
    renderEmojiGrid();
    closeModal('addEmojiModal');
    showToast('表情添加成功');
    event.target.reset();
}

async function deleteEmoji(emojiId) {
    showConfirmDialog('删除确认', '确定要删除这个表情吗？', async () => {
        emojis = emojis.filter(e => e.id !== emojiId);
        await saveDataToDB(); // 使用IndexedDB保存
        renderEmojiGrid();
        showToast('表情已删除');
    });
}

function renderEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    emojis.forEach(emoji => {
        const item = document.createElement('div');
        item.className = 'emoji-item';
        item.innerHTML = `<img src="${emoji.url}"><div class="emoji-delete-btn" onclick="event.stopPropagation(); deleteEmoji('${emoji.id}')">×</div>`;
        item.onclick = () => sendEmoji(emoji);
        grid.appendChild(item);
    });
    const addBtn = document.createElement('div');
    addBtn.className = 'add-emoji-btn';
    addBtn.textContent = '+ 添加表情';
    addBtn.onclick = showAddEmojiModal;
    grid.appendChild(addBtn);
}

async function sendRedPacket(event) {
    event.preventDefault();
    if (!currentContact) return;
    const amount = document.getElementById('redPacketAmount').value;
    const message = document.getElementById('redPacketMessage').value || '恭喜发财，大吉大利！';
    if (amount <= 0) { showToast('红包金额必须大于0'); return; }
    const packetData = { amount: parseFloat(amount).toFixed(2), message };
    const packetMessage = { role: 'user', content: JSON.stringify(packetData), type: 'red_packet', time: new Date().toISOString(), senderId: 'user' };
    currentContact.messages.push(packetMessage);
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }
    currentContact.lastMessage = '[红包]';
    currentContact.lastTime = formatContactListTime(new Date().toISOString());
    renderMessages(true);
    renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    closeModal('redPacketModal');
    await sendMessage();
}

async function sendEmoji(emoji) {
    if (!currentContact) return;
    currentContact.messages.push({ role: 'user', content: emoji.url, type: 'emoji', time: new Date().toISOString(), senderId: 'user' });
    if (currentContact.messages.length > currentlyDisplayedMessageCount) {
        currentlyDisplayedMessageCount++;
    }
    currentContact.lastMessage = '[表情]';
    currentContact.lastTime = formatContactListTime(new Date().toISOString());
    renderMessages(true);
    renderContactList();
    await saveDataToDB(); // 使用IndexedDB保存
    toggleEmojiPanel(true);
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) { showToast('请先设置API'); return; }
    showTypingIndicator();
    try {
        const { replies, newMemoryTable } = await callAPI(currentContact);
        hideTypingIndicator();
        if (newMemoryTable) {
            window.memoryTableManager.updateContactMemoryTable(currentContact, newMemoryTable);
            await saveDataToDB();
        }
        if (!replies || replies.length === 0) { showTopNotification('AI没有返回有效回复'); return; }
        for (const response of replies) {
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
            const aiMessage = { role: 'assistant', content: response.content, type: response.type, time: new Date().toISOString(), senderId: currentContact.id };
            currentContact.messages.push(aiMessage);
            if (currentContact.messages.length > currentlyDisplayedMessageCount) {
                currentlyDisplayedMessageCount++;
            }
            currentContact.lastMessage = response.type === 'text' ? response.content.substring(0, 20) + '...' : '[表情]';
            currentContact.lastTime = formatContactListTime(new Date().toISOString());
            renderMessages(true);
            renderContactList();
            await saveDataToDB();
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('AI回复错误:', error);
        showToast('AI回复失败');
    }
}

function toggleEmojiPanel(forceClose = false) {
    const panel = document.getElementById('emojiPanel');
    if (forceClose) {
        panel.style.display = 'none';
        return;
    }
    const isVisible = panel.style.display === 'block';
    // 懒加载：第一次打开时才渲染
    if (!isVisible && !isEmojiGridRendered) {
        renderEmojiGrid();
        isEmojiGridRendered = true;
    }
    panel.style.display = isVisible ? 'none' : 'block';
}

function toggleSettingsMenu(forceClose = false) {
    const menu = document.getElementById('settingsMenu');
    menu.style.display = forceClose ? 'none' : (menu.style.display === 'block' ? 'none' : 'block');
}


async function clearMessages() {
    if (!currentContact) {
        showToast('请先选择一个聊天');
        return;
    }
    showConfirmDialog('清空聊天记录', '确定要清空当前聊天记录吗？此操作不可撤销。', async () => {
        currentContact.messages = [];
        currentlyDisplayedMessageCount = 0; // 重置计数
        currentContact.lastMessage = '暂无消息';
        currentContact.lastTime = formatContactListTime(new Date().toISOString());
        renderMessages(true); // 重新渲染
        renderContactList();
        await saveDataToDB();
        showToast('已清空聊天记录');
        toggleSettingsMenu(true);
    });
}

/**
 * 删除指定索引的消息
 * @param {number} messageIndex 要删除的消息的索引 (绝对索引)
 */
async function deleteMessage(messageIndex) {
    if (!currentContact || messageIndex === undefined || messageIndex < 0 || messageIndex >= currentContact.messages.length) {
        showToast('无效的消息索引或未选择聊天');
        return;
    }
    
    currentContact.messages.splice(messageIndex, 1);

    // 如果删除的是已显示的消息，则更新计数
    const displayedMessagesStartRange = currentContact.messages.length - currentlyDisplayedMessageCount;
    if (messageIndex >= displayedMessagesStartRange) {
        currentlyDisplayedMessageCount = Math.max(0, currentlyDisplayedMessageCount - 1);
    }
    
    if (currentContact.messages.length > 0) {
        const lastMsg = currentContact.messages[currentContact.messages.length - 1];
        currentContact.lastMessage = lastMsg.type === 'text' ? lastMsg.content.substring(0, 20) + '...' : (lastMsg.type === 'emoji' ? '[表情]' : '[红包]');
        currentContact.lastTime = formatContactListTime(lastMsg.time);
    } else {
        currentContact.lastMessage = '暂无消息';
        currentContact.lastTime = formatContactListTime(new Date().toISOString());
    }

    renderMessages(false); // 重新渲染，但不滚动到底部
    renderContactList();
    await saveDataToDB();
    showToast('消息已删除');
}


/**
 * 删除当前聊天对象（联系人或群聊）
 */
async function deleteCurrentContact() {
    if (!currentContact) {
        showToast('没有选中任何聊天对象');
        return;
    }
    showConfirmDialog('删除聊天对象', `确定要删除 "${currentContact.name}" 吗？此操作将永久删除所有聊天记录，不可撤销。`, async () => {
        await deleteContact(currentContact.id);
        showToast('聊天对象已删除');
        closeChatPage(); // 关闭聊天页面并返回联系人列表
    });
    toggleSettingsMenu(true); // 关闭设置菜单
}

/**
 * 从contacts数组和IndexedDB中删除指定ID的联系人或群聊
 * @param {string} contactId 要删除的联系人/群聊的ID
 */
async function deleteContact(contactId) {
    if (!isIndexedDBReady) {
        showToast('数据库未准备好，无法删除。');
        return;
    }

    const initialContactsLength = contacts.length;
    contacts = contacts.filter(c => c.id !== contactId);

    if (contacts.length === initialContactsLength) {
        // 如果长度没变，说明没找到该ID的联系人
        console.warn(`未找到ID为 ${contactId} 的联系人/群聊进行删除。`);
        showToast('未找到要删除的聊天对象');
        return;
    }

    try {
        const transaction = db.transaction(['contacts'], 'readwrite');
        const store = transaction.objectStore('contacts');
        await promisifyRequest(store.delete(contactId)); // 从IndexedDB删除

        // 如果删除的是当前正在聊天的对象，需要重置currentContact
        if (currentContact && currentContact.id === contactId) {
            currentContact = null;
        }

        renderContactList(); // 重新渲染联系人列表
        await saveDataToDB(); // 重新保存contacts数组到IndexedDB，确保数据同步
        showToast('聊天对象已删除');
    } catch (error) {
        console.error('删除联系人/群聊失败:', error);
        showToast('删除失败：' + error.message);
    }
}

/**
 * 显示自定义确认对话框
 * @param {string} title 对话框标题
 * @param {string} message 对话框消息
 * @param {function} onConfirm 用户点击确认按钮时执行的回调
 */
function showConfirmDialog(title, message, onConfirm) {
    const dialogId = 'customConfirmDialog';
    let dialog = document.getElementById(dialogId);
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = dialogId;
        dialog.className = 'modal'; // 复用modal的样式
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title" id="confirmDialogTitle"></div>
                    <div class="modal-close" onclick="closeModal('${dialogId}')">取消</div>
                </div>
                <div class="modal-body">
                    <p id="confirmDialogMessage" style="text-align: center; margin-bottom: 20px;"></p>
                    <div style="display: flex; justify-content: space-around; gap: 10px;">
                        <button class="form-submit" style="background-color: #ccc; flex: 1;" onclick="closeModal('${dialogId}')">取消</button>
                        <button class="form-submit delete-button" style="flex: 1;" id="confirmActionButton">确定</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }

    document.getElementById('confirmDialogTitle').textContent = title;
    document.getElementById('confirmDialogMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmActionButton');
    confirmBtn.onclick = () => {
        onConfirm();
        closeModal(dialogId);
    };

    showModal(dialogId);
}


function formatContactListTime(dateString) {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diff = now - d;
    
    if (diff < 3600000) {
         const minutes = Math.floor(diff / 60000);
         return minutes < 1 ? '刚刚' : `${minutes}分钟前`;
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (today.getTime() === messageDate.getTime()) {
         const hours = d.getHours().toString().padStart(2, '0');
         const minutes = d.getMinutes().toString().padStart(2, '0');
         return `${hours}:${minutes}`;
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatChatTimestamp(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const beijingTime = new Date(date.getTime());
    const hours = beijingTime.getHours().toString().padStart(2, '0');
    const minutes = beijingTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (messageDate.getTime() === today.getTime()) {
        return timeStr;
    }
    if (messageDate.getTime() === yesterday.getTime()) {
        return `昨天 ${timeStr}`;
    }
    if (now.getFullYear() === date.getFullYear()) {
        const month = (date.getMonth() + 1);
        const day = date.getDate();
        return `${month}月${day}日 ${timeStr}`;
    } else {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1);
        const day = date.getDate();
        return `${year}年${month}月${day}日 ${timeStr}`;
    }
}

// --- 事件监听 ---
document.getElementById('chatInput').addEventListener('keypress', async (e) => { // Make it async
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        await sendUserMessage(); // Await the user message
    } 
});

document.addEventListener('click', (e) => {
    const settingsMenu = document.getElementById('settingsMenu');
    // 确保点击的不是设置菜单本身或其触发按钮
    if (settingsMenu && settingsMenu.style.display === 'block' && 
        !settingsMenu.contains(e.target) && !e.target.closest('.chat-more')) {
        settingsMenu.style.display = 'none';
    }
});

// 监听DOMContentLoaded事件，这是执行所有JS代码的入口
document.addEventListener('DOMContentLoaded', init);