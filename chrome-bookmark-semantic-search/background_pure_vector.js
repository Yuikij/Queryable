// Chrome Extension Background Script - 纯向量相似度搜索
// 使用轻量级的TF-IDF + 余弦相似度实现真正的向量搜索

class PureVectorSearchEngine {
  constructor() {
    this.isInitialized = false;
    this.bookmarkVectors = new Map();
    this.bookmarkData = new Map();
    this.vocabulary = new Map(); // 词汇表
    this.idfValues = new Map();  // IDF值
    this.initializationPromise = null;
    this.initProgress = { current: 0, total: 0, status: 'ready' }; // 持久化进度
    // 稀疏倒排索引与文档范数（受Queryable启发的高效索引结构）
    this.invertedIndex = new Map(); // term -> Array<{ id: string, w: number }> (文档归一化权重)
    this.docNorms = new Map();      // docId -> number (文档向量范数)
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
      console.log('开始初始化纯向量搜索引擎...');
      this.initProgress.status = 'initializing';
      
      // 获取所有书签
      const bookmarks = await this.getAllBookmarks();
      this.initProgress.total = bookmarks.length;
      this.initProgress.status = 'fetching_content';
      
      // 构建词汇表和计算TF-IDF
      await this.buildVocabularyAndVectors(bookmarks);
      
      this.isInitialized = true;
      this.initProgress.status = 'completed';
      this.initProgress.current = this.initProgress.total;
      console.log(`纯向量搜索引擎初始化完成，处理了 ${bookmarks.length} 个书签`);
      
      return true;
    } catch (error) {
      console.error('初始化失败:', error);
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

  // 完全基于模型的文本预处理：纯数学方法，无预定义规则
  preprocessText(text) {
    // 中文分词：提取所有可能的字符组合
    const chineseWords = this.extractChineseWords(text);
    
    // 英文分词：提取所有有效单词
    const englishText = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // 保留中英文字符
      .replace(/\s+/g, ' ')
      .trim();
    
    const englishWords = englishText
      .split(' ')
      .filter(word => /^[a-z0-9]+$/.test(word)) // 只保留英文数字
      .filter(word => word.length > 0); // 移除所有硬编码过滤条件
    
    // 返回所有提取的词汇，让TF-IDF算法决定重要性
    return [...chineseWords, ...englishWords];
  }

  // 纯数学方法的CJK分词：提取所有可能的字符组合（含中文/日文假名）
  extractChineseWords(text) {
    const chineseChars = [];
    // 包含：中文汉字、日文平假名/片假名、半角片假名
    const chineseText = text.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uFF65-\uFF9F]+/g);
    
    if (chineseText) {
      for (const segment of chineseText) {
        // 提取单字 - 不使用任何过滤条件
        for (const char of segment) {
          chineseChars.push(char);
        }
        
        // 提取双字词组 - 不使用任何过滤条件
        for (let i = 0; i < segment.length - 1; i++) {
          const word = segment.substring(i, i + 2);
          chineseChars.push(word);
        }
        
        // 提取三字词组 - 不使用任何过滤条件
        for (let i = 0; i < segment.length - 2; i++) {
          const word = segment.substring(i, i + 3);
          chineseChars.push(word);
        }
      }
    }
    
    return chineseChars;
  }

  // 完全基于模型的词汇处理，不使用任何预定义词汇表
  isStopWord(word) {
    // 移除所有硬编码规则，让TF-IDF算法自然处理词汇重要性
    return false;
  }

  // 从URL中提取有意义的词汇
  extractUrlKeywords(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const pathname = urlObj.pathname;
      const search = urlObj.search;
      
      // 提取域名关键词
      const domainWords = domain.split('.').filter(part => part.length > 2);
      
      // 提取路径关键词
      const pathWords = pathname
        .split('/')
        .filter(part => part.length > 2)
        .map(part => part.replace(/[-_]/g, ' '))
        .join(' ')
        .split(' ')
        .filter(word => word.length > 2);
      
      // 提取查询参数关键词
      const searchWords = search
        .replace(/[?&=]/g, ' ')
        .replace(/\+/g, ' ')
        .split(' ')
        .filter(word => word.length > 2);
      
      return [...domainWords, ...pathWords, ...searchWords];
    } catch {
      return [];
    }
  }

  // 获取网页内容
  async fetchPageContent(url) {
    try {
      console.log(`获取页面内容: ${url}`);
      
      // 设置超时和错误处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        console.log(`跳过非HTML内容: ${contentType}`);
        return '';
      }
      
      const html = await response.text();
      return this.extractTextFromHtml(html);
      
    } catch (error) {
      console.log(`获取页面内容失败 ${url}:`, error.message);
      return ''; // 失败时返回空字符串，不影响其他内容
    }
  }

  // 从HTML中提取纯文本内容
  extractTextFromHtml(html) {
    try {
      // 移除script和style标签
      const cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ') // 移除所有HTML标签
        .replace(/\s+/g, ' ') // 合并空白字符
        .trim();
      
      // 限制文本长度，避免过长内容
      const maxLength = 2000;
      return cleanHtml.length > maxLength ? 
        cleanHtml.substring(0, maxLength) + '...' : 
        cleanHtml;
      
    } catch (error) {
      console.log('HTML解析失败:', error);
      return '';
    }
  }

  // 构建词汇表、计算IDF，并建立稀疏倒排索引（更高效，受Queryable启发）
  async buildVocabularyAndVectors(bookmarks) {
    console.log('构建词汇表和获取网页内容...');
    
    // 第一遍：收集所有词汇，构建词汇表，获取网页内容
    const documentTerms = [];
    const documentContents = []; // 存储完整内容
    const termDocumentFreq = new Map(); // 记录每个词出现在多少个文档中
    
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      
      // 提取书签标题
      const title = bookmark.title || '';
      console.log(`处理书签 ${i+1}/${bookmarks.length}: ${title}`);
      
      // 更新进度
      this.initProgress.current = i + 1;
      this.initProgress.status = `fetching_content`;
      
      // 提取URL关键词
      const urlKeywords = this.extractUrlKeywords(bookmark.url);
      
      // 获取网页实际内容
      const pageContent = await this.fetchPageContent(bookmark.url);
      
      // 组合所有文本内容：标题 + URL关键词 + 网页内容
      const allText = `${title} ${urlKeywords.join(' ')} ${pageContent}`;
      
      // 分词处理
      const terms = this.preprocessText(allText);
      documentTerms.push(terms);
      
      // 存储完整文档内容供后续使用
      const documentContent = {
        id: bookmark.id,
        title: title,
        url: bookmark.url,
        urlKeywords: urlKeywords,
        pageContent: pageContent,
        allText: allText,
        terms: terms
      };
      documentContents.push(documentContent);
      
      // 统计词汇表和文档频率
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        if (!this.vocabulary.has(term)) {
          this.vocabulary.set(term, this.vocabulary.size);
        }
        termDocumentFreq.set(term, (termDocumentFreq.get(term) || 0) + 1);
      }
      
      // 存储增强的书签数据
      this.bookmarkData.set(bookmark.id, {
        ...bookmark,
        pageContent: pageContent,
        urlKeywords: urlKeywords,
        fullText: allText
      });
      
      // 不再发送广播消息，改用轮询机制
      
      // 每处理10个书签暂停一下，避免过于频繁的请求
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`词汇表大小: ${this.vocabulary.size}`);
    
    // 计算IDF值
    const totalDocuments = bookmarks.length;
    for (const [term, docFreq] of termDocumentFreq.entries()) {
      const idf = Math.log(totalDocuments / docFreq);
      this.idfValues.set(term, idf);
    }
    
    console.log('建立倒排索引与文档范数...');
    this.initProgress.status = 'building_vectors';

    // 第二遍：为每个文档构建稀疏向量，并写入倒排索引
    for (let i = 0; i < documentContents.length; i++) {
      const docContent = documentContents[i];
      const terms = docContent.terms;

      // 计算TF值
      const termFreq = new Map();
      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }

      // 计算未归一化权重并累计范数平方
      const sparseWeights = new Map(); // term -> weight
      let normSquared = 0;
      for (const [term, tf] of termFreq.entries()) {
        const idf = this.idfValues.get(term) || 0;
        const weight = tf * idf;
        if (weight !== 0) {
          sparseWeights.set(term, weight);
          normSquared += weight * weight;
        }
      }

      const norm = Math.sqrt(normSquared) || 1;
      this.docNorms.set(docContent.id, norm);

      // 写入倒排索引（存储归一化权重）
      for (const [term, weight] of sparseWeights.entries()) {
        const normalized = weight / norm;
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, []);
        }
        this.invertedIndex.get(term).push({ id: docContent.id, w: normalized });
      }
    }

    console.log('倒排索引构建完成');
  }

  // 将查询转换为稀疏权重映射：term -> 归一化权重
  queryToSparseWeights(query) {
    const processedQuery = this.preprocessQuery(query);
    const terms = this.preprocessText(processedQuery);

    console.log(`原始查询: "${query}"`);
    console.log(`处理后查询: "${processedQuery}"`);
    console.log(`提取词汇: [${terms.join(', ')}]`);

    // 计算TF
    const termFreq = new Map();
    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    // 计算未归一化权重并累计范数平方
    const sparseWeights = new Map(); // term -> weight
    let normSquared = 0;
    for (const [term, tf] of termFreq.entries()) {
      if (!this.idfValues.has(term)) continue; // 词不在词汇表中直接跳过
      const idf = this.idfValues.get(term) || 0;
      const weight = tf * idf;
      if (weight !== 0) {
        sparseWeights.set(term, weight);
        normSquared += weight * weight;
      }
    }

    const norm = Math.sqrt(normSquared) || 1;

    // 归一化
    for (const [term, weight] of sparseWeights.entries()) {
      sparseWeights.set(term, weight / norm);
    }

    return sparseWeights;
  }

  // 完全基于模型的查询处理，不做任何预定义规则处理
  preprocessQuery(query) {
    // 直接返回原始查询，让向量算法自然处理所有词汇
    return query;
  }

  // 计算余弦相似度
  cosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }
    
    return dotProduct; // 因为向量已经归一化，余弦相似度就是点积
  }

  // 纯向量搜索（使用倒排索引的稀疏点积）
  async searchBookmarks(query, topK = 10) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log(`搜索查询: "${query}"`);
      // 稀疏查询向量
      const q = this.queryToSparseWeights(query); // Map term -> weight

      // 稀疏点积评分：只累加查询出现的term的倒排列表
      const scores = new Map(); // docId -> score (点积)
      for (const [term, qw] of q.entries()) {
        const posting = this.invertedIndex.get(term);
        if (!posting) continue;
        for (const { id, w } of posting) {
          scores.set(id, (scores.get(id) || 0) + qw * w);
        }
      }

      // 构建结果并过滤低分
      const similarities = [];
      for (const [docId, score] of scores.entries()) {
        if (score > 0.01) {
          const bookmark = this.bookmarkData.get(docId);
          similarities.push({ ...bookmark, similarity: score });
        }
      }

      // 排序与topK
      similarities.sort((a, b) => b.similarity - a.similarity);
      const results = similarities.slice(0, topK);
      
      console.log(`找到 ${results.length} 个相关书签`);
      console.log('Top 3 相似度:', results.slice(0, 3).map(r => ({ title: r.title, similarity: r.similarity.toFixed(4) })));
      
      return results;
      
    } catch (error) {
      console.error('搜索失败:', error);
      throw error;
    }
  }
}

// 创建全局搜索引擎实例
const searchEngine = new PureVectorSearchEngine();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);

  switch (request.type) {
    case 'SEARCH_BOOKMARKS':
      searchEngine.searchBookmarks(request.query, request.topK || 10)
        .then(results => {
          sendResponse({ success: true, results });
        })
        .catch(error => {
          console.error('搜索错误:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开放

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

// Extension安装时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('纯向量搜索插件已安装');
});

// Extension启动时预加载
chrome.runtime.onStartup.addListener(() => {
  console.log('开始预加载向量搜索引擎...');
  searchEngine.initialize().catch(console.error);
});

console.log('纯向量搜索引擎已加载');
