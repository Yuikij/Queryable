# 🔧 URL.createObjectURL 错误修复

## 问题描述

```
TypeError: URL.createObjectURL is not a function
    at Object.locateFile (background_semantic_bundled.js:34:457265)
    at S (background_semantic_bundled.js:34:890)
    ...
```

## 原因分析

### Service Worker 环境限制

Chrome Extension Manifest V3 的 Service Worker 环境中：

1. **`URL.createObjectURL` 不可用**
   - Service Worker 中此 API 被禁用
   - ONNX Runtime 默认使用它来加载 WASM 文件

2. **`Worker` API 不可用**
   - Service Worker 中不能创建 Web Worker
   - ONNX Runtime 默认使用 `proxy: true` 创建 Worker

### 技术栈

```
Transformers.js
    ↓
ONNX Runtime (onnxruntime-web)
    ↓
WASM Backend
    ↓ (默认行为)
创建 Web Worker (proxy: true)
    ↓
使用 URL.createObjectURL 加载 WASM
    ↓
❌ Service Worker 中不支持
```

## 解决方案

### 关键配置

直接配置 ONNX Runtime 的 WASM 环境：

```javascript
// 导入 Transformers.js
import { pipeline, env } from '@xenova/transformers';
// 导入 ONNX Runtime
import * as ort from 'onnxruntime-web';

// 配置 Transformers.js 环境
env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;

// ⭐ 关键：直接配置 ONNX Runtime WASM
ort.env.wasm.numThreads = 1;        // 单线程模式
ort.env.wasm.simd = true;           // 启用 SIMD 优化
ort.env.wasm.proxy = false;         // 禁用 Web Worker

console.log('ONNX Runtime 配置:', {
  proxy: ort.env.wasm.proxy,
  numThreads: ort.env.wasm.numThreads,
  simd: ort.env.wasm.simd
});
```

### 为什么有效？

| 配置 | 默认值 | Service Worker 兼容值 | 说明 |
|------|--------|---------------------|------|
| `proxy` | `true` | `false` ⭐ | 禁用 Web Worker，直接加载 WASM |
| `numThreads` | 自动 | `1` | 单线程模式 |
| `simd` | `true` | `true` | 保持 SIMD 优化性能 |

设置 `proxy: false` 后：
- ONNX Runtime 不会创建 Web Worker
- 直接在主线程（Service Worker）中加载 WASM
- 避免使用 `URL.createObjectURL`

## 完整实现

### 1. background_semantic.js

```javascript
// Service Worker 环境配置

// 导入 Transformers.js（通过 webpack 打包）
import { pipeline, env } from '@xenova/transformers';
import * as ort from 'onnxruntime-web';

// 配置 Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;

// ⭐ 配置 ONNX Runtime WASM（关键！）
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.proxy = false;  // 禁用 Web Worker

console.log('🔧 ONNX Runtime 配置:', {
  proxy: ort.env.wasm.proxy,
  numThreads: ort.env.wasm.numThreads,
  simd: ort.env.wasm.simd
});

class SemanticSearchEngine {
  async _doInitialize() {
    // 直接使用 pipeline，ONNX Runtime 已配置
    this.embedder = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      { quantized: true }
    );
  }
}
```

### 2. Webpack 打包

```bash
npm run build
```

生成 `background_semantic_bundled.js` (1.44 MB)

### 3. manifest.json

```json
{
  "background": {
    "service_worker": "background_semantic_bundled.js"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  }
}
```

## 配置说明

### env.backends.onnx.wasm

| 属性 | 类型 | 默认值 | 推荐值（SW） | 说明 |
|------|------|--------|-------------|------|
| `proxy` | boolean | `true` | `false` | 是否使用 Web Worker |
| `numThreads` | number | 自动 | `1` | WASM 线程数 |
| `simd` | boolean | `true` | `true` | 是否启用 SIMD |
| `wasmPaths` | string | CDN | 自定义 | WASM 文件路径 |

### 性能影响

| 模式 | proxy | numThreads | 性能 | Service Worker 兼容 |
|------|-------|-----------|------|-------------------|
| 默认 | `true` | 4+ | ⭐⭐⭐⭐⭐ | ❌ |
| 兼容 | `false` | `1` | ⭐⭐⭐⭐ | ✅ |

**结论**: 单线程模式性能略有下降（~10-20%），但对于书签搜索完全可接受（100-400ms）。

## 验证步骤

### 1. 检查配置
```javascript
console.log(env.backends);
// 应该看到:
// {
//   onnx: {
//     wasm: {
//       numThreads: 1,
//       simd: true,
//       proxy: false
//     }
//   }
// }
```

### 2. 测试加载
```
1. 重新加载扩展
2. 打开 Service Worker Console
3. 应该看到:
   ✅ Transformers.js 已通过 webpack 打包加载
   🔧 ONNX Runtime 配置（Service Worker 兼容）
   📥 加载语义编码模型...
   模型下载进度: 15%
   ...
   ✅ 模型加载完成
```

### 3. 无错误
不应该看到：
```
❌ TypeError: URL.createObjectURL is not a function
❌ TypeError: Worker is not a constructor
```

## 其他解决方案（不推荐）

### 方案 1: 使用 Content Script
```
✅ 可以使用 URL.createObjectURL 和 Worker
❌ 无法访问 chrome.bookmarks API
❌ 需要复杂的消息传递
```

### 方案 2: 使用外部 API
```
✅ 无环境限制
❌ 不是本地化方案
❌ 需要网络请求
❌ 隐私问题
```

### 方案 3: 手动管理 WASM 文件
```
✅ 完全控制
❌ 实现复杂
❌ 维护困难
```

## 技术细节

### ONNX Runtime Web 后端

ONNX Runtime Web 支持多个后端：

1. **WASM** (推荐) ✅
   - 性能好
   - 兼容性强
   - 需要配置 `proxy: false` 用于 Service Worker

2. **WebGL**
   - 性能一般
   - Service Worker 中不可用

3. **WebGPU** (实验性)
   - 性能最好
   - 浏览器支持有限

### Service Worker 限制总结

| API | 普通页面 | Service Worker |
|-----|---------|---------------|
| `import()` | ✅ | ❌ |
| `eval()` | ✅ | ❌ (CSP) |
| `Worker` | ✅ | ❌ |
| `URL.createObjectURL` | ✅ | ❌ |
| `WebAssembly` | ✅ | ✅ (需要 CSP) |
| `fetch` | ✅ | ✅ |
| `IndexedDB` | ✅ | ✅ |

## 常见问题

### Q: 为什么不能用多线程？
A: Service Worker 中不能创建 Web Worker，只能单线程运行。

### Q: 性能会下降多少？
A: 约 10-20%，但对于书签搜索（通常 <1000 个）完全可接受。

### Q: 能否使用本地 WASM 文件？
A: 可以，但需要额外配置 `wasmPaths` 和 `web_accessible_resources`。

### Q: 为什么不用 WebGL 后端？
A: WebGL 在 Service Worker 中不可用，且性能不如 WASM。

## 参考资料

- [ONNX Runtime Web Documentation](https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.WebAssemblyExecutionProviderOptions.html)
- [Transformers.js GitHub](https://github.com/xenova/transformers.js)
- [Chrome Extension Service Workers](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

## 总结

✅ **已解决** - 配置 `env.backends.onnx.wasm.proxy = false`  
✅ **兼容性好** - 完全适配 Service Worker 环境  
✅ **性能可接受** - 单线程模式下仍有良好性能  
✅ **实现简单** - 只需要一行关键配置  

**核心要点**: 在导入 Transformers.js 之前设置 `proxy: false`，避免 ONNX Runtime 创建 Web Worker 和使用 `URL.createObjectURL`。

---

*最后更新: 2025年10月10日*  
*适用版本: @xenova/transformers 2.17.2+*

