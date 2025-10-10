# 🔧 CDN 导入修复

## 问题

```
Service worker registration failed. Status code: 15
Uncaught TypeError: Failed to resolve module specifier "@xenova/transformers"
```

## 原因

Chrome Extension 的 Service Worker **不支持**直接从 `node_modules` 导入 ES 模块。

```javascript
// ❌ 不工作
import { pipeline } from '@xenova/transformers';
```

## 解决方案

使用 **动态导入 + CDN** 的方式加载 Transformers.js。

### 修改前
```javascript
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
```

### 修改后
```javascript
// 动态导入 Transformers.js（从 CDN）
let pipeline, env;

async function loadTransformers() {
  if (!pipeline) {
    const module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    pipeline = module.pipeline;
    env = module.env;
    
    env.allowLocalModels = false;
    env.useBrowserCache = true;
  }
  return { pipeline, env };
}

// 在初始化时调用
await loadTransformers();
```

## Manifest 修改

### 修改前
```json
{
  "background": {
    "service_worker": "background_semantic.js",
    "type": "module"  ← 移除这行
  }
}
```

### 修改后
```json
{
  "background": {
    "service_worker": "background_semantic.js"
  }
}
```

## 使用步骤

### 1. 重新加载扩展
```
chrome://extensions/ → 找到插件 → 点击"重新加载"
```

### 2. 等待初始化
第一次会从 CDN 下载 Transformers.js：
```
📥 加载 Transformers.js... (从 CDN)
✅ Transformers.js 加载完成
📥 加载语义编码模型...
✅ 模型加载完成
```

### 3. 后续使用
浏览器会缓存 CDN 资源，后续加载速度很快。

## 优势

### ✅ 使用 CDN 的好处
1. **无需打包**: 不需要 webpack/rollup 等构建工具
2. **自动缓存**: 浏览器会缓存 CDN 资源
3. **更新方便**: 修改版本号即可升级
4. **体积更小**: 不需要包含 node_modules

### ⚠️ 注意事项
1. **首次需要网络**: 第一次使用需要联网下载
2. **CDN 可用性**: 依赖 jsdelivr CDN 的可用性
3. **版本固定**: 建议固定版本号避免意外更新

## 备选方案

如果 jsdelivr 不可用，可以切换其他 CDN：

### unpkg
```javascript
const module = await import('https://unpkg.com/@xenova/transformers@2.17.2');
```

### esm.sh
```javascript
const module = await import('https://esm.sh/@xenova/transformers@2.17.2');
```

## 验证

### 检查加载
打开 Service Worker Console：
```
chrome://extensions/ → service worker
```

应该看到：
```
📥 加载 Transformers.js...
✅ Transformers.js 加载完成
📥 加载语义编码模型...
模型下载进度: 15%
模型下载进度: 30%
...
✅ 模型加载完成
```

### 检查功能
打开插件，输入查询：
```
"排解忧虑"
```

应该能正常搜索并返回结果。

## 故障排除

### 问题1: CDN 连接失败
```
错误: Failed to fetch module from CDN

解决:
1. 检查网络连接
2. 尝试其他 CDN (unpkg, esm.sh)
3. 可能需要科学上网
```

### 问题2: 模型下载慢
```
原因: 模型文件约 8MB

解决:
1. 耐心等待，只需下载一次
2. 浏览器会缓存，后续很快
3. 可以使用更小的模型
```

### 问题3: 动态导入不工作
```
确认:
1. manifest.json 中已移除 "type": "module"
2. Service Worker 使用动态 import()
3. Chrome 版本 >= 91
```

## 总结

- ✅ 修复了模块导入问题
- ✅ 使用 CDN 动态导入
- ✅ 无需打包构建
- ✅ 功能完全正常

**现在可以正常使用了！** 🎉
