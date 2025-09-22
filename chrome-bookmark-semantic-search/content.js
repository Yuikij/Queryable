// Content Script for Chrome Bookmark Semantic Search Extension
// 这个脚本可以用于未来扩展功能，比如从页面内容中提取更多语义信息

console.log('智能书签搜索插件内容脚本已加载');

// 为未来扩展预留的功能：页面内容分析
class PageContentAnalyzer {
  constructor() {
    this.isAnalyzing = false;
  }

  // 提取页面主要内容用于书签语义增强
  extractPageContent() {
    const content = {
      title: document.title,
      description: this.getMetaDescription(),
      keywords: this.getMetaKeywords(),
      headings: this.getHeadings(),
      mainContent: this.getMainContent()
    };

    return content;
  }

  getMetaDescription() {
    const meta = document.querySelector('meta[name="description"]');
    return meta ? meta.getAttribute('content') : '';
  }

  getMetaKeywords() {
    const meta = document.querySelector('meta[name="keywords"]');
    return meta ? meta.getAttribute('content') : '';
  }

  getHeadings() {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    headingElements.forEach(heading => {
      const text = heading.textContent.trim();
      if (text.length > 0) {
        headings.push(text);
      }
    });

    return headings.slice(0, 10); // 限制数量
  }

  getMainContent() {
    // 尝试提取主要内容区域
    const selectors = [
      'main',
      '[role="main"]',
      '.main-content',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return this.cleanText(element.textContent);
      }
    }

    // 如果没有找到主要内容区域，提取body中的文本
    const bodyText = this.cleanText(document.body.textContent);
    return bodyText.substring(0, 1000); // 限制长度
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ') // 合并空白字符
      .replace(/[\n\r\t]/g, ' ') // 替换换行符和制表符
      .trim();
  }
}

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYZE_PAGE_CONTENT') {
    const analyzer = new PageContentAnalyzer();
    const content = analyzer.extractPageContent();
    sendResponse({ success: true, content });
  }
});

// 可选：在页面加载完成后自动分析内容（如果需要）
if (document.readyState === 'complete') {
  // 页面已完全加载
} else {
  window.addEventListener('load', () => {
    // 页面加载完成后的处理
  });
}
