# ⚠️ Service Worker + ONNX Runtime 根本性限制

## 🚫 问题总结

经过多次尝试，我们发现 **ONNX Runtime 无法在 Chrome Extension Service Worker 中运行**。

这不是配置问题，而是根本性的架构限制。

## 🔍 技术原因

### ONNX Runtime 需要的 API

ONNX Runtime (onnxruntime-web) 依赖以下 API：

1. **`URL.createObjectURL`** - 创建 Blob URL 来加载 WASM 文件
2. **`Worker` API** - 在多线程模式下创建 Web Worker
3. **DOM APIs** - 某些内部操作需要 DOM 环境

### Service Worker 的限制

Chrome Extension Manifest V3 的 Service Worker 环境：

| API | 是否可用 | ONNX Runtime 是否需要 |
|-----|---------|---------------------|
| `URL.createObjectURL` | ❌ | ✅ 必需 |
| `Worker` API | ❌ | ✅ 多线程需要 |
| DOM APIs | ❌ | ⚠️  部分需要 |
| `WebAssembly` | ✅ (需要 CSP) | ✅ 必需 |
| `fetch` | ✅ | ✅ 下载模型 |
| `IndexedDB` | ✅ | ⚠️  缓存使用 |

**结论**: `URL.createObjectURL` 缺失导致 ONNX Runtime 无法加载 WASM 文件。

## 🔧 尝试过的解决方案

### ❌ 方案 1: 配置 `proxy: false`
```javascript
ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;
```
**结果**: 配置在运行时设置太晚，ONNX Runtime 已经决定使用哪个 WASM 文件。

### ❌ 方案 2: 禁用 SIMD
```javascript
ort.env.wasm.simd = false;
```
**结果**: 仍然需要 `URL.createObjectURL` 来加载基础版本的 WASM。

### ❌ 方案 3: Polyfill `URL.createObjectURL`
```javascript
URL.createObjectURL = function(blob) {
  return 'blob:polyfill-' + Math.random();
};
```
**结果**: Polyfill 返回假 URL，ONNX Runtime 实际尝试加载时失败。

### ❌ 方案 4: Webpack 打包 WASM
**结果**: ONNX Runtime 在运行时动态加载 WASM，打包无法解决。

### ❌ 方案 5: 在导入前配置
```javascript
import * as ort from 'onnxruntime-web';
ort.env.wasm.proxy = false; // 在导入 Transformers.js 之前
import { pipeline } from '@xenova/transformers';
```
**结果**: 配置仍然不影响 WASM 文件的选择和加载方式。

## ✅ 可行的解决方案

### 方案 A: Offscreen Document（推荐）

Chrome Extension 官方推荐的解决方案。

#### 架构
```
Service Worker (background.js)
    ↓ 消息传递
Offscreen Document (offscreen.html + offscreen.js)
    ↓ 有完整的 DOM 环境
可以使用 URL.createObjectURL
    ↓
ONNX Runtime + Transformers.js 正常运行
```

#### 实现步骤

1. **创建 Offscreen Document**

```html
<!-- offscreen.html -->
<!DOCTYPE html>
<html>
<head>
  <script src="offscreen.js"></script>
</head>
<body></body>
</html>
```

2. **在 Offscreen Document 中运行 ONNX Runtime**

```javascript
// offscreen.js
import { pipeline } from '@xenova/transformers';

let embedder = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INITIALIZE') {
    initializeModel().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'EMBED') {
    embedText(message.text).then(embedding => {
      sendResponse({ embedding });
    });
    return true;
  }
});

async function initializeModel() {
  embedder = await pipeline(
    'feature-extraction',
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
  );
}

async function embedText(text) {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
```

3. **Service Worker 创建和通信**

```javascript
// background.js
let offscreenDocCreated = false;

async function createOffscreenDoc() {
  if (offscreenDocCreated) return;
  
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run ML models with ONNX Runtime'
  });
  
  offscreenDocCreated = true;
}

async function embedText(text) {
  await createOffscreenDoc();
  
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'EMBED', text },
      (response) => resolve(response.embedding)
    );
  });
}
```

4. **更新 manifest.json**

```json
{
  "manifest_version": 3,
  "permissions": [
    "offscreen"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "web_accessible_resources": [{
    "resources": ["offscreen.html"],
    "matches": ["<all_urls>"]
  }]
}
```

#### 优点
- ✅ 官方推荐方案
- ✅ 完整的 DOM 环境
- ✅ 可以使用所有 Web APIs
- ✅ 不需要修改 ONNX Runtime

#### 缺点
- ❌ 实现复杂（需要消息传递）
- ❌ 性能略有损失（跨上下文通信）
- ❌ 需要 Chrome 109+ (offscreen API)

### 方案 B: 使用外部 API

将语义搜索委托给外部服务。

```javascript
async function embedText(text) {
  const response = await fetch('https://api.example.com/embed', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
  return await response.json();
}
```

#### 优点
- ✅ 实现简单
- ✅ 无浏览器限制
- ✅ 可以使用更大的模型

#### 缺点
- ❌ 不是本地化方案
- ❌ 需要网络请求
- ❌ 隐私问题
- ❌ 成本问题

### 方案 C: 混合方案（当前使用）

在 Service Worker 中使用 TF-IDF，提供基础搜索功能。

```javascript
// background_pure_vector.js
class TFIDFSearchEngine {
  // 使用 TF-IDF 算法
  // 不需要 ONNX Runtime
  // 可以在 Service Worker 中运行
}
```

#### 优点
- ✅ 完全本地化
- ✅ 无需额外权限
- ✅ 快速实现
- ✅ 可以立即使用

#### 缺点
- ❌ 无法理解语义
- ❌ 只能关键词匹配
- ❌ 不支持抽象查询

## 📊 方案对比

| 方案 | 语义理解 | 本地化 | 实现复杂度 | Chrome 版本 |
|------|---------|--------|----------|-----------|
| Offscreen Doc | ✅ | ✅ | 🔴 高 | Chrome 109+ |
| 外部 API | ✅ | ❌ | 🟢 低 | 全部 |
| TF-IDF | ❌ | ✅ | 🟢 低 | 全部 |
| Hybrid | ⚠️  部分 | ✅ | 🟡 中 | 全部 |

## 🎯 推荐路线

### 短期（当前）
使用 **TF-IDF** (方案 C)：
- 立即可用
- 提供基础搜索功能
- 支持关键词匹配

### 中期（推荐）
实现 **Offscreen Document** (方案 A)：
- 真正的语义理解
- 完全本地化
- Chrome 官方推荐

### 长期（可选）
提供 **混合方案**：
- TF-IDF 作为后备
- Offscreen Document 作为主要方案
- 自动降级机制

## 📝 当前状态

- ✅ TF-IDF 搜索引擎已实现
- ✅ IndexedDB 持久化已实现
- ✅ 增量更新已实现
- ❌ 语义搜索暂时不可用（Service Worker 限制）
- 🚧 Offscreen Document 方案待实现

## 🔗 参考资料

- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/offscreen/)
- [Service Worker Limitations](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/api/js/)
- [Transformers.js](https://huggingface.co/docs/transformers.js)

## 💡 总结

**核心问题**: Service Worker 缺少 `URL.createObjectURL` → ONNX Runtime 无法加载 WASM → Transformers.js 无法运行。

**唯一解决方案**: 使用 Offscreen Document 提供完整的 DOM 环境。

**当前方案**: 暂时使用 TF-IDF，提供基础搜索功能。

**未来计划**: 实现 Offscreen Document，支持真正的语义搜索。

---

*最后更新: 2025年10月10日*  
*问题根源: Chrome Extension Service Worker 架构限制*  
*解决时间: 需要重新架构，预计 1-2 天开发时间*

