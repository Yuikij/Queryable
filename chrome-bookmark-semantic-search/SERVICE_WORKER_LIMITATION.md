# ⚠️ Service Worker 限制说明

## 问题

Chrome Extension Manifest V3 的 Service Worker 有严格的限制：

```
❌ 不支持 import() 动态导入
❌ 不支持 eval()
❌ 不支持从 node_modules 导入
❌ 限制使用外部脚本
```

这导致无法直接在 Service Worker 中使用 Transformers.js 等需要动态加载的库。

## 当前方案：使用 TF-IDF 版本

鉴于 Service Worker 的限制，**当前默认使用 TF-IDF 向量搜索版本**：

```json
// manifest.json
{
  "background": {
    "service_worker": "background_pure_vector.js"
  }
}
```

### TF-IDF 版本特点

#### ✅ 优势
- ✅ 无需外部依赖
- ✅ 完全符合 Service Worker 规范
- ✅ 初始化更快（~3分钟）
- ✅ 支持中英文混合搜索
- ✅ 纯数学算法，无需模型下载

#### ⚠️ 限制
- ❌ 只能匹配字面词汇
- ❌ 不理解抽象概念
- ❌ 不支持情感查询
- ❌ 同义词匹配能力弱

### 适用场景

TF-IDF 版本适合：
```
✅ 精确搜索："JavaScript"、"Python"
✅ 技术词汇："API"、"Docker"、"Git"
✅ 书签标题匹配
✅ 快速部署，无需配置
```

不适合：
```
❌ 抽象概念："排解忧虑"、"类似孤独"
❌ 情感查询："心情不好"、"需要放松"
❌ 意图搜索："对学习有帮助"
```

---

## 语义搜索解决方案

如果您需要**真正的语义理解**（像 Queryable 一样），有以下方案：

### 方案1: 使用打包工具（推荐）

使用 webpack 或 rollup 将 Transformers.js 打包成单个文件。

#### 步骤

1. **安装打包工具**
```bash
npm install --save-dev webpack webpack-cli
```

2. **配置 webpack**
```javascript
// webpack.config.js
module.exports = {
  entry: './src/background_semantic_entry.js',
  output: {
    filename: 'background_semantic_bundled.js',
    path: __dirname
  },
  mode: 'production'
};
```

3. **创建入口文件**
```javascript
// src/background_semantic_entry.js
import { pipeline, env } from '@xenova/transformers';

// 导出到全局
self.transformers = { pipeline, env };

// 然后引入原始的 background_semantic.js 逻辑
```

4. **打包**
```bash
npx webpack
```

5. **更新 manifest.json**
```json
{
  "background": {
    "service_worker": "background_semantic_bundled.js"
  }
}
```

### 方案2: 使用 Background Page（旧版）

如果可以接受 Manifest V2，可以使用 Background Page：

```json
// manifest.json (V2)
{
  "manifest_version": 2,
  "background": {
    "page": "background.html"
  }
}
```

```html
<!-- background.html -->
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="background_semantic.js"></script>
</head>
</html>
```

但这需要降级到 Manifest V2，不建议。

### 方案3: 混合架构

使用 TF-IDF 作为基础，通过 popup 页面调用语义API：

```javascript
// popup.js 中可以使用 ES modules
import { pipeline } from '@xenova/transformers';

// 在 popup 中进行语义编码
const embedder = await pipeline('feature-extraction', 'model-name');
const embedding = await embedder(query);

// 发送给 background 进行搜索
chrome.runtime.sendMessage({
  type: 'SEMANTIC_SEARCH',
  embedding: Array.from(embedding.data)
});
```

但这会导致 popup 关闭后功能失效。

### 方案4: 使用外部服务

调用外部 API（如 OpenAI Embeddings）：

```javascript
async function getEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });
  
  const data = await response.json();
  return data.data[0].embedding;
}
```

但这需要网络连接和 API 密钥，不再完全本地化。

---

## 推荐方案总结

| 方案 | 难度 | 语义理解 | 本地化 | 推荐度 |
|------|------|---------|--------|--------|
| **TF-IDF (当前)** | ⭐ | ❌ | ✅ | ⭐⭐⭐⭐ |
| **Webpack 打包** | ⭐⭐⭐ | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| **Manifest V2** | ⭐⭐ | ✅ | ✅ | ⭐⭐ |
| **混合架构** | ⭐⭐⭐⭐ | ✅ | ✅ | ⭐⭐⭐ |
| **外部API** | ⭐⭐ | ✅ | ❌ | ⭐⭐⭐ |

## 当前使用建议

### 快速开始：使用 TF-IDF 版本

```bash
# 1. 重新加载扩展
chrome://extensions/ → 重新加载

# 2. 等待初始化（~3分钟）

# 3. 搜索测试
输入: "JavaScript"
输入: "Python 教程"
输入: "机器学习"
```

### 升级到语义搜索

如果您需要语义理解，建议：

1. **学习 webpack** - 最佳长期方案
2. **等待浏览器支持** - Chrome 团队可能会放宽限制
3. **使用外部API** - 如果可以接受联网

---

## 技术细节

### 为什么 Service Worker 有这些限制？

Service Worker 设计目标：
- 安全性优先
- 防止恶意代码注入
- 限制资源消耗
- 确保可预测的行为

这些限制是为了：
- 防止 eval() 执行不可信代码
- 防止动态加载恶意脚本
- 确保扩展行为可审计

### Queryable 如何解决？

Queryable 是原生 iOS 应用，不受浏览器限制：
- 可以直接使用 Swift
- 可以加载 CoreML 模型
- 没有 Service Worker 限制

### 未来展望

Chrome 团队正在讨论放宽某些限制：
- 允许受信任的 CDN
- 支持特定的动态加载
- 改进扩展沙箱机制

参考：https://github.com/w3c/ServiceWorker/issues/1356

---

## 总结

### 当前状态
✅ **TF-IDF 版本可用** - 适合基础搜索需求

### 未来计划
🔄 提供 webpack 打包版本（需要用户自行打包）
🔄 探索其他技术方案
🔄 等待浏览器支持改进

### 建议
- 日常使用：TF-IDF 版本
- 高级需求：考虑打包方案
- 学习参考：查看 background_semantic.js 源码

---

**感谢理解！** 

虽然有技术限制，但我们提供的 TF-IDF 版本仍然是一个强大的本地搜索引擎。🚀
