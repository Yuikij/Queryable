# Chrome 智能书签搜索插件 🧠

## 🎯 功能概述

**真正理解语义的书签搜索引擎** - 受 [Queryable](https://github.com/mazzzystar/Queryable) 启发，使用 CLIP 同款技术实现文本语义理解。

### 🌟 核心特性

- **🧠 真正的语义理解**: 基于 Sentence-BERT 深度学习模型，像人类一样理解查询意图
- **🔍 抽象概念搜索**: 支持"排解忧虑"、"类似孤独"、"对学习有帮助"等抽象查询
- **🌐 跨语言理解**: 中文查询匹配英文内容，英文查询匹配中文内容
- **🔒 完全本地化**: 所有计算在本地进行，保护隐私，无需网络
- **⚡ 智能缓存**: 首次初始化后秒级加载，支持增量更新
- **📊 相关度排序**: 精确的语义相似度计算和排序

## 🚀 技术架构

### 核心技术
- **前端**: Chrome Extension Manifest V3
- **AI模型**: TensorFlow.js + Universal Sentence Encoder
- **存储**: Chrome Storage API + IndexedDB
- **计算**: 本地向量计算和余弦相似度

### 架构设计
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Popup UI      │    │  Background     │    │  Content Script │
│   (popup.js)    │◄──►│  Service Worker │◄──►│  (content.js)   │
│                 │    │  (background.js)│    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                        ┌─────────────────┐
                        │  TensorFlow.js  │
                        │  语义模型       │
                        └─────────────────┘
```

## 📦 安装方法

### 开发者模式安装

1. **下载源码**
   ```bash
   git clone [repository-url]
   cd chrome-bookmark-semantic-search
   ```

2. **打开Chrome扩展页面**
   - 在Chrome中访问 `chrome://extensions/`
   - 开启"开发者模式"

3. **加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

4. **等待初始化**
   - 首次使用会自动下载和加载AI模型
   - 处理现有书签建立索引

## 🔧 使用方法

### 基本搜索

1. **打开插件**: 点击浏览器工具栏中的插件图标
2. **输入查询**: 在搜索框中输入要搜索的内容
3. **查看结果**: 系统会显示按相关度排序的书签
4. **打开书签**: 点击任意结果即可在新标签页中打开

### 搜索示例

- **课本**: 找到教育、学习、在线课程相关的书签
- **编程**: 找到代码、开发、技术文档相关的书签  
- **设计**: 找到UI/UX、图形设计、创意工具相关的书签
- **新闻**: 找到新闻网站、资讯平台相关的书签

### 高级功能

- **实时搜索**: 输入时自动搜索，无需手动触发
- **相关度显示**: 每个结果显示与搜索词的相关度百分比
- **智能排序**: 结果按语义相似度自动排序

## 🧠 语义搜索原理

### 模型选择
- **Universal Sentence Encoder**: Google开发的轻量级语义编码模型
- **多语言支持**: 支持中文、英文等多种语言
- **高效计算**: 针对浏览器环境优化

### 处理流程

1. **书签预处理**
   ```
   书签标题 + 域名 + URL关键词 → 组合文本
   ```

2. **向量化**
   ```
   文本 → Universal Sentence Encoder → 512维向量
   ```

3. **搜索计算**
   ```
   查询文本 → 向量 → 余弦相似度计算 → 排序结果
   ```

### 相似度计算
```javascript
// 余弦相似度公式
similarity = (A · B) / (||A|| × ||B||)
```

## 📊 性能特点

### 内存优化
- **批量处理**: 每次处理20个书签，避免内存溢出
- **及时释放**: TensorFlow张量使用后立即释放
- **增量更新**: 支持新书签的增量处理

### 速度优化
- **本地计算**: 无网络延迟
- **向量缓存**: 书签向量预计算并缓存
- **防抖搜索**: 避免频繁计算

### 准确性
- **语义理解**: 真正理解搜索意图
- **上下文感知**: 考虑标题、URL、域名等多维信息
- **相关度排序**: 精确的相似度计算

## 🛠️ 开发指南

### 项目结构
```
chrome-bookmark-semantic-search/
├── manifest.json          # 扩展配置文件
├── popup.html             # 弹窗界面
├── popup.js               # 弹窗逻辑
├── background.js          # 后台服务工作者
├── content.js             # 内容脚本
├── icons/                 # 图标文件
└── README.md             # 说明文档
```

### 核心类

#### BookmarkSemanticSearchEngine
```javascript
class BookmarkSemanticSearchEngine {
  async initialize()              // 初始化模型和处理书签
  async searchBookmarks(query)    // 语义搜索
  cosineSimilarity(vecA, vecB)   // 相似度计算
}
```

#### BookmarkSearchUI
```javascript
class BookmarkSearchUI {
  async performSearch()          // 执行搜索
  displayResults(bookmarks)      // 显示结果
  updateInitProgress(progress)   // 更新初始化进度
}
```

### 扩展开发

1. **添加新的语义特征**
   ```javascript
   // 在background.js中扩展文本提取
   const texts = bookmarks.map(bookmark => {
     // 添加更多语义信息
     return `${title} ${domain} ${keywords} ${description}`;
   });
   ```

2. **优化搜索算法**
   ```javascript
   // 可以实验不同的相似度计算方法
   euclideanDistance(vecA, vecB)  // 欧几里得距离
   dotProduct(vecA, vecB)         // 点积相似度
   ```

3. **添加搜索过滤器**
   ```javascript
   // 按时间、域名等维度过滤
   filterByDomain(results, domain)
   filterByDateRange(results, startDate, endDate)
   ```

## 🔒 隐私保护

### 本地计算
- **无数据传输**: 所有计算在本地浏览器中进行
- **离线可用**: 不依赖任何外部服务
- **数据安全**: 书签数据不会离开设备

### 权限说明
- `bookmarks`: 读取书签数据
- `storage`: 缓存计算结果
- `activeTab`: 打开搜索结果
- `scripting`: 内容脚本注入

## 🐛 故障排除

### 常见问题

1. **初始化失败**
   - 检查网络连接（首次需要下载模型）
   - 清除浏览器缓存后重试
   - 确保Chrome版本支持Manifest V3

2. **搜索结果不准确**
   - 增加更多相关书签以提升模型效果
   - 尝试使用更具体的搜索词
   - 检查书签标题是否包含有意义的信息

3. **性能问题**
   - 如果书签数量过多（>10000），考虑分批处理
   - 关闭不必要的浏览器标签页释放内存
   - 重启浏览器重置内存状态

### 调试模式
```javascript
// 在background.js中启用详细日志
console.log('调试信息:', debugInfo);
```

## 🔄 更新日志

### v1.0.0 (初始版本)
- ✅ 基本语义搜索功能
- ✅ Universal Sentence Encoder集成
- ✅ 本地向量存储和计算
- ✅ 实时搜索界面
- ✅ 相关度排序

### 计划功能
- 🔄 支持搜索历史
- 🔄 书签分类建议
- 🔄 多语言界面
- 🔄 高级搜索过滤器
- 🔄 导出搜索结果

## 📞 支持和反馈

如果您遇到问题或有改进建议，请：

1. 查看本文档的故障排除部分
2. 检查浏览器开发者工具中的错误信息
3. 提供详细的错误描述和复现步骤

## 📄 许可证

本项目基于MIT许可证开源，详情请参见LICENSE文件。

---

*这个插件展示了如何在浏览器环境中实现真正的语义搜索，为用户提供更智能的书签管理体验。*
