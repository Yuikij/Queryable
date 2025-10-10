// Chrome Extension Background Script - Service Worker
// 使用 Offscreen Document 运行语义搜索引擎

console.log('🚀 Background Service Worker 启动（Offscreen Document 模式）');

// Offscreen Document 管理
class OffscreenManager {
  constructor() {
    this.creating = null;
    this.isCreated = false;
  }

  async setupOffscreenDocument() {
    // 避免重复创建
    if (this.creating) {
      await this.creating;
      return;
    }

    if (this.isCreated) {
      return;
    }

    this.creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run ML models (ONNX Runtime + Transformers.js) for semantic bookmark search'
    });

    try {
      await this.creating;
      this.creating = null;
      this.isCreated = true;
      console.log('✅ Offscreen Document 已创建');
    } catch (error) {
      console.error('❌ 创建 Offscreen Document 失败:', error);
      this.creating = null;
      throw error;
    }
  }

  async sendMessage(message) {
    await this.setupOffscreenDocument();
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

const offscreenManager = new OffscreenManager();

// 语义搜索引擎（代理到 Offscreen Document）
class SemanticSearchEngine {
  constructor() {
    this.isInitialized = false;
    this.embeddings = new Map(); // bookmarkId → embedding array
    this.bookmarkData = new Map(); // bookmarkId → bookmark info
    this.initProgress = { current: 0, total: 0, status: 'ready' };
    this.dbPromise = null;
  }

  async initialize() {
    try {
      console.log('🚀 开始初始化语义搜索引擎...');
      this.initProgress.status = 'loading_model';

      // 初始化 Offscreen Document 中的模型
      const response = await offscreenManager.sendMessage({
        type: 'OFFSCREEN_INITIALIZE'
      });

      if (!response.success) {
        throw new Error(response.error || '初始化失败');
      }

      console.log('✅ Offscreen Document 模型加载完成');

      // 获取所有书签
      this.initProgress.status = 'loading_bookmarks';
      const bookmarks = await this.getAllBookmarks();
      this.initProgress.total = bookmarks.length;
      console.log(`📚 找到 ${bookmarks.length} 个书签`);

      // 计算书签签名
      const signature = await this.computeBookmarksSignature(bookmarks);
      console.log(`🔑 书签签名: ${signature}`);

      // 尝试从缓存加载
      const loadResult = await this.loadEmbeddings(signature, bookmarks);
      
      if (loadResult.loaded) {
        this.isInitialized = true;
        this.initProgress.status = 'completed';
        this.initProgress.current = this.initProgress.total;
        console.log('✅ 已从缓存加载语义索引');
        return true;
      }

      // 检查增量更新
      if (loadResult.canIncremental) {
        console.log(`🔄 增量更新: 新增 ${loadResult.added.length}, 删除 ${loadResult.removed.length}`);
        await this.incrementalUpdate(loadResult.added, loadResult.removed, bookmarks);
        await this.saveEmbeddings(signature);
        
        this.isInitialized = true;
        this.initProgress.status = 'completed';
        this.initProgress.current = this.initProgress.total;
        console.log('✅ 增量更新完成');
        return true;
      }

      // 完全重建索引
      console.log('🔨 构建全新的语义索引...');
      this.initProgress.status = 'building_index';
      
      await this.buildEmbeddings(bookmarks);
      await this.saveEmbeddings(signature);

      this.isInitialized = true;
      this.initProgress.status = 'completed';
      this.initProgress.current = this.initProgress.total;
      console.log('✅ 语义索引构建完成');

      return true;
    } catch (error) {
      console.error('❌ 初始化失败:', error);
      this.initProgress.status = 'error';
      throw error;
    }
  }

  async buildEmbeddings(bookmarks) {
    this.embeddings.clear();
    this.bookmarkData.clear();

    // 准备文本
    const texts = bookmarks.map(bm => `${bm.title || ''} ${bm.url || ''}`);
    
    console.log(`📊 开始编码 ${texts.length} 个书签...`);

    // 批量编码（委托给 Offscreen Document）
    const response = await offscreenManager.sendMessage({
      type: 'OFFSCREEN_EMBED_BATCH',
      texts: texts
    });

    if (!response.success) {
      throw new Error(response.error || '批量编码失败');
    }

    const embeddings = response.embeddings;

    // 存储结果
    bookmarks.forEach((bm, i) => {
      this.embeddings.set(bm.id, embeddings[i]);
      this.bookmarkData.set(bm.id, {
        id: bm.id,
        title: bm.title,
        url: bm.url,
        dateAdded: bm.dateAdded
      });
      this.initProgress.current = i + 1;
    });

    console.log(`✅ 成功编码 ${embeddings.length} 个书签`);
  }

  async searchBookmarks(query, topK = 20) {
    if (!this.isInitialized) {
      throw new Error('搜索引擎未初始化');
    }

    console.log('🔍 ===== 开始语义搜索 =====');
    console.log('📝 查询文本:', query);
    console.log('📚 书签总数:', this.embeddings.size);

    // 编码查询文本（委托给 Offscreen Document）
    console.log('🧠 正在使用 Sentence-BERT 编码查询文本...');
    const startTime = Date.now();
    
    const response = await offscreenManager.sendMessage({
      type: 'OFFSCREEN_EMBED_TEXT',
      text: query
    });

    if (!response.success) {
      throw new Error(response.error || '查询编码失败');
    }

    const queryEmbedding = response.embedding;
    const encodeTime = Date.now() - startTime;
    
    console.log('✅ 查询编码完成，耗时:', encodeTime + 'ms');
    console.log('📊 查询向量维度:', queryEmbedding.length);
    console.log('🔢 查询向量（前10维）:', queryEmbedding.slice(0, 10).map(v => v.toFixed(4)));

    // 计算相似度
    console.log('🧮 计算余弦相似度...');
    const calcStart = Date.now();
    const results = [];
    
    for (const [bookmarkId, embedding] of this.embeddings.entries()) {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      const bookmark = this.bookmarkData.get(bookmarkId);
      
      results.push({
        ...bookmark,
        score: similarity
      });
    }

    const calcTime = Date.now() - calcStart;
    console.log('✅ 相似度计算完成，耗时:', calcTime + 'ms');

    // 排序并返回 top-K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);
    
    console.log('🎯 ===== 搜索结果 (Top ' + Math.min(topK, results.length) + ') =====');
    topResults.slice(0, 5).forEach((r, i) => {
      console.log(`${i + 1}. [${(r.score * 100).toFixed(2)}%] ${r.title}`);
      console.log(`   URL: ${r.url}`);
    });
    console.log('⏱️  总耗时:', (Date.now() - startTime) + 'ms');
    console.log('🔍 ===== 搜索完成 =====\n');

    return topResults;
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ... 其他辅助方法（getAllBookmarks, computeBookmarksSignature, 等）
  async getAllBookmarks() {
    const getAllBookmarksRecursive = (nodes) => {
      let bookmarks = [];
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push(node);
        }
        if (node.children) {
          bookmarks = bookmarks.concat(getAllBookmarksRecursive(node.children));
        }
      }
      return bookmarks;
    };

    const tree = await chrome.bookmarks.getTree();
    return getAllBookmarksRecursive(tree);
  }

  async computeBookmarksSignature(bookmarks) {
    // 使用书签的 id, title, url 计算签名
    const dataStr = bookmarks
      .map(bm => `${bm.id}|${bm.title}|${bm.url}`)
      .sort()
      .join('\n');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(dataStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async incrementalUpdate(addedBookmarks, removedIds, allBookmarks) {
    // 删除已移除的书签
    for (const id of removedIds) {
      this.embeddings.delete(id);
      this.bookmarkData.delete(id);
    }

    // 为新增书签生成嵌入
    if (addedBookmarks.length > 0) {
      const texts = addedBookmarks.map(bm => `${bm.title || ''} ${bm.url || ''}`);
      
      const response = await offscreenManager.sendMessage({
        type: 'OFFSCREEN_EMBED_BATCH',
        texts: texts
      });

      if (!response.success) {
        throw new Error(response.error || '增量编码失败');
      }

      const embeddings = response.embeddings;

      addedBookmarks.forEach((bm, i) => {
        this.embeddings.set(bm.id, embeddings[i]);
        this.bookmarkData.set(bm.id, {
          id: bm.id,
          title: bm.title,
          url: bm.url,
          dateAdded: bm.dateAdded
        });
      });
    }
  }

  // IndexedDB 操作
  openDatabase() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('SemanticSearchDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings');
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
      };
    });

    return this.dbPromise;
  }

  async loadEmbeddings(currentSignature, currentBookmarks) {
    try {
      const db = await this.openDatabase();
      
      // 读取保存的签名
      const savedSignature = await this.idbReq(
        db.transaction(['metadata'], 'readonly')
          .objectStore('metadata')
          .get('signature')
      );

      // 读取嵌入数据
      const savedData = await this.idbReq(
        db.transaction(['embeddings'], 'readonly')
          .objectStore('embeddings')
          .get('all')
      );

      if (!savedSignature || !savedData) {
        return { loaded: false, canIncremental: false };
      }

      // 签名完全匹配 - 直接加载
      if (savedSignature === currentSignature) {
        this.embeddings = new Map(savedData.embeddings);
        this.bookmarkData = new Map(savedData.bookmarkData);
        return { loaded: true };
      }

      // 签名不匹配 - 检查是否可以增量更新
      const savedIds = new Set(savedData.bookmarkData.map(([id]) => id));
      const currentIds = new Set(currentBookmarks.map(bm => bm.id));

      const removedIds = [...savedIds].filter(id => !currentIds.has(id));
      const addedIds = [...currentIds].filter(id => !savedIds.has(id));

      // 如果变化不大（< 20%），使用增量更新
      const changeRatio = (removedIds.length + addedIds.length) / currentBookmarks.length;
      if (changeRatio < 0.2) {
        this.embeddings = new Map(savedData.embeddings);
        this.bookmarkData = new Map(savedData.bookmarkData);

        const addedBookmarks = currentBookmarks.filter(bm => addedIds.includes(bm.id));

        return {
          loaded: false,
          canIncremental: true,
          added: addedBookmarks,
          removed: removedIds
        };
      }

      return { loaded: false, canIncremental: false };
    } catch (error) {
      console.error('❌ 从缓存加载失败:', error);
      return { loaded: false, canIncremental: false };
    }
  }

  async saveEmbeddings(signature) {
    try {
      const db = await this.openDatabase();

      // 保存签名
      await this.idbReq(
        db.transaction(['metadata'], 'readwrite')
          .objectStore('metadata')
          .put(signature, 'signature')
      );

      // 保存嵌入数据
      const data = {
        embeddings: Array.from(this.embeddings.entries()),
        bookmarkData: Array.from(this.bookmarkData.entries())
      };

      await this.idbReq(
        db.transaction(['embeddings'], 'readwrite')
          .objectStore('embeddings')
          .put(data, 'all')
      );

      console.log('💾 语义索引已保存到 IndexedDB');
    } catch (error) {
      console.error('❌ 保存到 IndexedDB 失败:', error);
    }
  }

  idbReq(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// 创建引擎实例
const searchEngine = new SemanticSearchEngine();

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 兼容两种消息格式：type 和 action
  const messageType = request.type || request.action;

  // 忽略来自 Offscreen Document 的内部消息（进度通知等）
  if (messageType === 'MODEL_PROGRESS' || messageType === 'EMBED_PROGRESS') {
    console.log(`📊 进度更新: ${messageType}`, request);
    return false; // 不需要响应
  }

  console.log('📨 收到请求:', messageType);

  // 获取初始化状态
  if (messageType === 'GET_INIT_STATUS' || messageType === 'isInitialized') {
    sendResponse({
      success: true,
      isInitialized: searchEngine.isInitialized,
      progress: searchEngine.initProgress
    });
    return false;
  }

  // 初始化引擎
  if (messageType === 'INITIALIZE_ENGINE' || messageType === 'initialize') {
    searchEngine.initialize()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // 搜索
  if (messageType === 'SEARCH_BOOKMARKS' || messageType === 'SEARCH' || messageType === 'search') {
    searchEngine.searchBookmarks(request.query, request.topK || 20)
      .then(results => {
        sendResponse({ success: true, results });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // 获取进度
  if (messageType === 'GET_INIT_PROGRESS' || messageType === 'getProgress') {
    sendResponse({
      success: true,
      progress: searchEngine.initProgress
    });
    return false;
  }

  // 未知消息类型
  console.warn('⚠️  未知的消息类型:', messageType);
  sendResponse({
    success: false,
    error: '未知的消息类型: ' + messageType
  });
  return false;
});

console.log('✅ Background Service Worker 就绪（Offscreen Document 模式）');

