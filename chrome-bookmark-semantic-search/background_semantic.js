// Chrome Extension Background Script - 语义搜索引擎
// 使用 Transformers.js 实现真正的语义理解（像 Queryable 一样）

import { pipeline, env } from '@xenova/transformers';

// 配置 Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

class SemanticSearchEngine {
  constructor() {
    this.isInitialized = false;
    this.embedder = null;
    this.embeddings = new Map(); // bookmarkId → embedding array
    this.bookmarkData = new Map(); // bookmarkId → bookmark info
    this.initializationPromise = null;
    this.initProgress = { current: 0, total: 0, status: 'ready' };
    this.dbPromise = null;
  }

  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    try {
      console.log('🚀 开始初始化语义搜索引擎...');
      this.initProgress.status = 'loading_model';

      // 1. 加载语义模型
      console.log('📥 加载语义编码模型...');
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        { 
          quantized: true,  // 使用量化版本减小体积
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              console.log(`模型下载进度: ${Math.round(progress.progress)}%`);
            }
          }
        }
      );
      console.log('✅ 模型加载完成');

      // 2. 获取所有书签
      this.initProgress.status = 'loading_bookmarks';
      const bookmarks = await this.getAllBookmarks();
      this.initProgress.total = bookmarks.length;
      console.log(`📚 找到 ${bookmarks.length} 个书签`);

      // 3. 计算书签签名
      const signature = await this.computeBookmarksSignature(bookmarks);
      console.log(`🔑 书签签名: ${signature}`);

      // 4. 尝试从缓存加载
      const loadResult = await this.loadEmbeddings(signature, bookmarks);
      
      if (loadResult.loaded) {
        this.isInitialized = true;
        this.initProgress.status = 'completed';
        this.initProgress.current = this.initProgress.total;
        console.log('✅ 已从缓存加载语义索引');
        return true;
      }

      // 5. 检查增量更新
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

      // 6. 完全重建索引
      console.log('🔨 构建全新的语义索引...');
      this.initProgress.status = 'building_embeddings';
      await this.buildEmbeddings(bookmarks);
      await this.saveEmbeddings(signature);

      this.isInitialized = true;
      this.initProgress.status = 'completed';
      this.initProgress.current = this.initProgress.total;
      console.log(`✅ 语义索引构建完成，共 ${bookmarks.length} 个书签`);

      return true;
    } catch (error) {
      console.error('❌ 初始化失败:', error);
      this.initProgress.status = 'error';
      throw error;
    }
  }

  async getAllBookmarks() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        const bookmarks = [];
        
        function extractBookmarks(nodes) {
          for (const node of nodes) {
            if (node.url) {
              bookmarks.push({
                id: node.id,
                title: node.title || '',
                url: node.url,
                dateAdded: node.dateAdded
              });
            }
            if (node.children) {
              extractBookmarks(node.children);
            }
          }
        }
        
        extractBookmarks(bookmarkTreeNodes);
        resolve(bookmarks);
      });
    });
  }

  // 获取网页内容
  async fetchPageContent(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) return '';
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return '';
      
      const html = await response.text();
      return this.extractTextFromHtml(html);
    } catch (error) {
      return '';
    }
  }

  extractTextFromHtml(html) {
    try {
      const cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const maxLength = 512; // 限制长度以提高编码速度
      return cleanHtml.length > maxLength ? 
        cleanHtml.substring(0, maxLength) : 
        cleanHtml;
    } catch (error) {
      return '';
    }
  }

  // 构建语义嵌入
  async buildEmbeddings(bookmarks) {
    console.log('🔨 开始构建语义嵌入向量...');
    
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      
      try {
        // 获取网页内容
        const pageContent = await this.fetchPageContent(bookmark.url);
        
        // 组合文本：标题 + 网页内容
        const text = `${bookmark.title} ${pageContent}`.trim().slice(0, 512);
        
        // 生成语义嵌入向量
        const output = await this.embedder(text, {
          pooling: 'mean',
          normalize: true
        });
        
        // 保存嵌入向量（转为普通数组以便存储）
        this.embeddings.set(bookmark.id, Array.from(output.data));
        
        // 保存书签信息
        this.bookmarkData.set(bookmark.id, {
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url
        });
        
        // 更新进度
        this.initProgress.current = i + 1;
        if ((i + 1) % 10 === 0) {
          console.log(`📊 进度: ${i + 1}/${bookmarks.length}`);
        }
        
        // 防止过快请求
        if (i % 5 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.warn(`⚠️ 处理书签失败 [${bookmark.title}]:`, error.message);
      }
    }
    
    console.log('✅ 语义嵌入构建完成');
  }

  // 语义搜索
  async searchBookmarks(query, topK = 20) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`🔍 语义搜索: "${query}"`);
      
      // 1. 编码查询文本
      const queryOutput = await this.embedder(query, {
        pooling: 'mean',
        normalize: true
      });
      const queryEmbedding = Array.from(queryOutput.data);

      // 2. 计算与所有书签的相似度
      const similarities = [];
      for (const [id, bookmarkEmbedding] of this.embeddings) {
        const similarity = this.cosineSimilarity(queryEmbedding, bookmarkEmbedding);
        const bookmark = this.bookmarkData.get(id);
        similarities.push({ ...bookmark, similarity });
      }

      // 3. 排序并返回 Top-K
      const results = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

      console.log(`✅ 找到 ${results.length} 个相关书签`);
      console.log('Top 3 相似度:', results.slice(0, 3).map(r => ({
        title: r.title,
        similarity: r.similarity.toFixed(4)
      })));

      return results;
    } catch (error) {
      console.error('❌ 搜索失败:', error);
      throw error;
    }
  }

  // 余弦相似度计算（向量已归一化，点积即相似度）
  cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  // ======= 持久化相关方法 =======
  
  async computeBookmarksSignature(bookmarks) {
    const payload = bookmarks
      .map(b => `${b.id}|${b.title}|${b.url}`)
      .sort()
      .join('\n');
    return this.hashString(payload);
  }

  hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      hash >>>= 0;
    }
    return ('0000000' + hash.toString(16)).slice(-8);
  }

  detectBookmarkChanges(currentBookmarks, cachedBookmarkIds) {
    const currentIds = new Set(currentBookmarks.map(b => b.id));
    const cachedIds = new Set(cachedBookmarkIds);

    const added = currentBookmarks.filter(b => !cachedIds.has(b.id));
    const removed = [...cachedIds].filter(id => !currentIds.has(id));

    return { added, removed };
  }

  async openDatabase() {
    if (this.dbPromise) return this.dbPromise;
    
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('SemanticSearchDB', 1);
      
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    return this.dbPromise;
  }

  idbReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async loadEmbeddings(signature, currentBookmarks) {
    try {
      const db = await this.openDatabase();

      const metaTx = db.transaction('meta', 'readonly');
      const meta = await this.idbReq(metaTx.objectStore('meta').get('meta'));

      if (!meta) {
        console.log('⚠️ 未找到缓存的嵌入向量');
        return { loaded: false, canIncremental: false };
      }

      console.log(`📋 缓存签名: ${meta.signature}, 当前签名: ${signature}`);

      // 签名完全匹配 - 直接加载
      if (meta.signature === signature) {
        console.log('✅ 签名匹配，加载缓存...');
        await this._loadEmbeddingData(db);
        return { loaded: true, canIncremental: false };
      }

      // 签名不匹配 - 检查是否可以增量更新
      const cachedBookmarkIds = meta.bookmarkIds || [];
      const changes = this.detectBookmarkChanges(currentBookmarks, cachedBookmarkIds);
      const changeRatio = (changes.added.length + changes.removed.length) / currentBookmarks.length;

      if (changeRatio < 0.2 && cachedBookmarkIds.length > 0) {
        console.log(`📊 变化率: ${(changeRatio * 100).toFixed(1)}%, 可进行增量更新`);
        await this._loadEmbeddingData(db);
        return {
          loaded: false,
          canIncremental: true,
          added: changes.added,
          removed: changes.removed
        };
      }

      console.log(`⚠️ 变化率过大 (${(changeRatio * 100).toFixed(1)}%), 需要完全重建`);
      return { loaded: false, canIncremental: false };

    } catch (e) {
      console.warn('❌ 加载缓存失败:', e.message);
      return { loaded: false, canIncremental: false };
    }
  }

  async _loadEmbeddingData(db) {
    const readAll = async (storeName) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      return await this.idbReq(req) || [];
    };

    const [embRows, bookmarkRows] = await Promise.all([
      readAll('embeddings'),
      readAll('bookmarks')
    ]);

    this.embeddings = new Map();
    for (const row of embRows) {
      this.embeddings.set(row.id, row.embedding);
    }

    this.bookmarkData = new Map();
    for (const row of bookmarkRows) {
      this.bookmarkData.set(row.id, row);
    }

    console.log(`✅ 加载了 ${this.embeddings.size} 个嵌入向量`);
  }

  async saveEmbeddings(signature) {
    try {
      const db = await this.openDatabase();

      // 清空旧数据
      const clearTx = db.transaction(['embeddings', 'bookmarks'], 'readwrite');
      await Promise.all([
        this.idbReq(clearTx.objectStore('embeddings').clear()),
        this.idbReq(clearTx.objectStore('bookmarks').clear())
      ]);
      await new Promise(resolve => { clearTx.oncomplete = () => resolve(); });

      // 保存元数据
      const metaTx = db.transaction('meta', 'readwrite');
      const bookmarkIds = Array.from(this.bookmarkData.keys());
      await this.idbReq(metaTx.objectStore('meta').put({
        key: 'meta',
        signature,
        bookmarkIds,
        createdAt: Date.now(),
        count: this.embeddings.size
      }));
      await new Promise(resolve => { metaTx.oncomplete = () => resolve(); });

      // 保存嵌入向量
      const embTx = db.transaction('embeddings', 'readwrite');
      const embStore = embTx.objectStore('embeddings');
      for (const [id, embedding] of this.embeddings) {
        embStore.put({ id, embedding });
      }
      await new Promise(resolve => { embTx.oncomplete = () => resolve(); });

      // 保存书签数据
      const bookmarkTx = db.transaction('bookmarks', 'readwrite');
      const bookmarkStore = bookmarkTx.objectStore('bookmarks');
      for (const [id, bookmark] of this.bookmarkData) {
        bookmarkStore.put(bookmark);
      }
      await new Promise(resolve => { bookmarkTx.oncomplete = () => resolve(); });

      console.log('✅ 嵌入向量已保存到缓存');
    } catch (e) {
      console.warn('⚠️ 保存失败（不影响搜索）:', e.message);
    }
  }

  async incrementalUpdate(addedBookmarks, removedIds, allBookmarks) {
    console.log(`🔄 增量更新: 新增 ${addedBookmarks.length}, 删除 ${removedIds.length}`);

    // 删除已移除的书签
    for (const id of removedIds) {
      this.embeddings.delete(id);
      this.bookmarkData.delete(id);
    }

    // 添加新书签
    for (const bookmark of addedBookmarks) {
      try {
        const pageContent = await this.fetchPageContent(bookmark.url);
        const text = `${bookmark.title} ${pageContent}`.trim().slice(0, 512);
        
        const output = await this.embedder(text, {
          pooling: 'mean',
          normalize: true
        });
        
        this.embeddings.set(bookmark.id, Array.from(output.data));
        this.bookmarkData.set(bookmark.id, {
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url
        });
      } catch (error) {
        console.warn(`⚠️ 处理新书签失败 [${bookmark.title}]:`, error.message);
      }
    }

    console.log('✅ 增量更新完成');
  }
}

// 创建全局搜索引擎实例
const searchEngine = new SemanticSearchEngine();

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 收到消息:', request);

  switch (request.type) {
    case 'SEARCH_BOOKMARKS':
      searchEngine.searchBookmarks(request.query, request.topK || 20)
        .then(results => {
          sendResponse({ success: true, results });
        })
        .catch(error => {
          console.error('搜索错误:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'INITIALIZE_ENGINE':
      searchEngine.initialize()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('初始化错误:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'GET_INIT_STATUS':
      sendResponse({ 
        success: true, 
        isInitialized: searchEngine.isInitialized,
        progress: searchEngine.initProgress
      });
      return true;

    case 'GET_INIT_PROGRESS':
      sendResponse({
        success: true,
        progress: searchEngine.initProgress
      });
      return true;

    default:
      sendResponse({ success: false, error: '未知消息类型' });
  }
});

// Extension启动时预加载
chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 浏览器启动，预加载语义搜索引擎...');
  searchEngine.initialize().catch(console.error);
});

console.log('✅ 语义搜索引擎已加载');
