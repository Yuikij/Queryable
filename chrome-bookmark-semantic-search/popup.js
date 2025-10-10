// Popup Script for Chrome Bookmark Semantic Search Extension

class BookmarkSearchUI {
  constructor() {
    this.searchInput = document.getElementById('searchInput');
    this.searchButton = document.getElementById('searchButton');
    this.status = document.getElementById('status');
    this.results = document.getElementById('results');
    this.initStatus = document.getElementById('initStatus');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    
    this.isSearching = false;
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.checkInitializationStatus();
  }

  setupEventListeners() {
    // 搜索按钮点击
    this.searchButton.addEventListener('click', () => this.performSearch());
    
    // 输入框回车搜索
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this.isSearching) {
        this.performSearch();
      }
    });

    // 输入框实时搜索（防抖）
    let searchTimeout;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      
      if (query.length >= 2) {
        searchTimeout = setTimeout(() => {
          this.performSearch();
        }, 500); // 500ms防抖
      } else {
        this.clearResults();
      }
    });

    // 使用轮询机制获取进度，不再监听广播消息
  }

  async checkInitializationStatus() {
    try {
      const response = await this.sendMessage({ type: 'GET_INIT_STATUS' });
      
      if (response.success) {
        if (response.isInitialized) {
          this.isInitialized = true;
          this.updateStatus('就绪 - 输入关键词开始搜索');
          this.searchInput.focus();
        } else if (response.progress && response.progress.status !== 'ready') {
          // 正在初始化中
          this.showInitProgress();
          this.displayOngoingProgress(response.progress);
          this.startProgressPolling();
        } else {
          await this.initializeEngine();
        }
      }
    } catch (error) {
      console.error('检查初始化状态失败:', error);
      this.updateStatus('初始化检查失败，请刷新插件');
    }
  }

  async initializeEngine() {
    this.showInitProgress();
    this.updateStatus('正在初始化语义搜索引擎...');
    
    try {
      const response = await this.sendMessage({ type: 'INITIALIZE_ENGINE' });
      
      if (response.success) {
        this.isInitialized = true;
        this.hideInitProgress();
        this.updateStatus('就绪 - 输入关键词开始搜索');
        this.searchInput.focus();
      } else {
        throw new Error(response.error || '初始化失败');
      }
    } catch (error) {
      console.error('初始化失败:', error);
      this.hideInitProgress();
      this.updateStatus('初始化失败: ' + error.message);
    }
  }

  showInitProgress() {
    this.initStatus.style.display = 'block';
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';
  }

  hideInitProgress() {
    this.initStatus.style.display = 'none';
  }

  updateInitProgress(progress) {
    this.progressFill.style.width = progress + '%';
    this.progressText.textContent = Math.round(progress) + '%';
  }

  displayOngoingProgress(progressInfo) {
    const percentage = progressInfo.total > 0 ? 
      (progressInfo.current / progressInfo.total) * 100 : 0;
    
    this.updateInitProgress(percentage);
    
    let statusText = '';
    switch (progressInfo.status) {
      case 'initializing':
        statusText = '正在初始化...';
        break;
      case 'fetching_content':
        statusText = `正在获取网页内容 (${progressInfo.current}/${progressInfo.total})`;
        break;
      case 'building_vectors':
        statusText = '正在构建向量...';
        break;
      case 'completed':
        statusText = '初始化完成！';
        break;
      case 'error':
        statusText = '初始化失败';
        break;
      default:
        statusText = '准备中...';
    }
    
    this.updateStatus(statusText);
  }

  startProgressPolling() {
    this.progressPollingInterval = setInterval(async () => {
      try {
        const response = await this.sendMessage({ type: 'GET_INIT_PROGRESS' });
        
        if (response.success) {
          const progress = response.progress;
          this.displayOngoingProgress(progress);
          
          if (progress.status === 'completed') {
            this.isInitialized = true;
            this.hideInitProgress();
            this.updateStatus('就绪 - 输入关键词开始搜索');
            this.searchInput.focus();
            this.stopProgressPolling();
          } else if (progress.status === 'error') {
            this.hideInitProgress();
            this.updateStatus('初始化失败，请重试');
            this.stopProgressPolling();
          }
        }
      } catch (error) {
        console.error('轮询进度失败:', error);
        this.stopProgressPolling();
      }
    }, 1000); // 每秒更新一次
  }

  stopProgressPolling() {
    if (this.progressPollingInterval) {
      clearInterval(this.progressPollingInterval);
      this.progressPollingInterval = null;
    }
  }

  async performSearch() {
    const query = this.searchInput.value.trim();
    
    if (!query) {
      this.clearResults();
      return;
    }

    if (!this.isInitialized) {
      this.updateStatus('正在初始化，请稍候...');
      return;
    }

    if (this.isSearching) {
      return;
    }

    this.isSearching = true;
    this.updateStatus('搜索中...');
    this.showLoading();

    try {
      const response = await this.sendMessage({
        type: 'SEARCH_BOOKMARKS',
        query: query,
        topK: 20
      });

      if (response.success) {
        this.displayResults(response.results, query);
        this.updateStatus(`找到 ${response.results.length} 个相关书签`);
      } else {
        throw new Error(response.error || '搜索失败');
      }
    } catch (error) {
      console.error('搜索失败:', error);
      this.updateStatus('搜索失败: ' + error.message);
      this.showError('搜索失败，请重试');
    } finally {
      this.isSearching = false;
    }
  }

  displayResults(bookmarks, query) {
    this.results.innerHTML = '';

    if (bookmarks.length === 0) {
      this.showNoResults(query);
      return;
    }

    bookmarks.forEach(bookmark => {
      const bookmarkElement = this.createBookmarkElement(bookmark);
      this.results.appendChild(bookmarkElement);
    });
  }

  createBookmarkElement(bookmark) {
    const div = document.createElement('div');
    div.className = 'bookmark-item';
    
    // 格式化相似度分数（兼容 score 和 similarity 字段）
    const similarity = bookmark.score || bookmark.similarity || 0;
    const similarityPercent = Math.round(similarity * 100);
    
    div.innerHTML = `
      <div class="bookmark-title">${this.escapeHtml(bookmark.title || '无标题')}</div>
      <div class="bookmark-url">${this.escapeHtml(bookmark.url)}</div>
      <div class="bookmark-similarity">相关度: ${similarityPercent}%</div>
    `;

    // 点击打开书签
    div.addEventListener('click', () => {
      chrome.tabs.create({ url: bookmark.url });
      window.close(); // 关闭popup
    });

    return div;
  }

  showLoading() {
    this.results.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div style="margin-top: 10px;">正在搜索...</div>
      </div>
    `;
  }

  showNoResults(query) {
    this.results.innerHTML = `
      <div class="no-results">
        <div>📚</div>
        <div style="margin-top: 10px;">
          没有找到与 "${this.escapeHtml(query)}" 相关的书签
        </div>
        <div style="margin-top: 5px; font-size: 12px; opacity: 0.7;">
          试试使用不同的关键词
        </div>
      </div>
    `;
  }

  showError(message) {
    this.results.innerHTML = `
      <div class="no-results">
        <div>❌</div>
        <div style="margin-top: 10px;">
          ${this.escapeHtml(message)}
        </div>
      </div>
    `;
  }

  clearResults() {
    this.results.innerHTML = '';
    this.updateStatus('输入关键词开始搜索');
  }

  updateStatus(message) {
    this.status.textContent = message;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sendMessage(message) {
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

// 清理函数，在页面卸载时停止轮询
window.addEventListener('beforeunload', () => {
  if (window.bookmarkSearchUI) {
    window.bookmarkSearchUI.stopProgressPolling();
  }
});

// 在DOM加载完成后初始化UI
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.bookmarkSearchUI = new BookmarkSearchUI();
  });
} else {
  window.bookmarkSearchUI = new BookmarkSearchUI();
}
