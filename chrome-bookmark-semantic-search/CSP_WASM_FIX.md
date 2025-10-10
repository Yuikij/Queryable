# 🔧 CSP WebAssembly 修复

## 问题

```
Error: no available backend found. ERR: [wasm] RuntimeError: 
Aborted(CompileError: WebAssembly.instantiate(): Refused to compile 
or instantiate WebAssembly module because neither 'wasm-eval' nor 
'unsafe-eval' is an allowed source of script in the following 
Content Security Policy directive: "script-src 'self'")
```

## 原因

Chrome Extension Manifest V3 默认的 Content Security Policy (CSP) **不允许 WebAssembly**。

Transformers.js 使用 ONNX Runtime，而 ONNX Runtime 需要 WebAssembly 来运行模型推理。

## 解决方案

在 `manifest.json` 中添加 `wasm-unsafe-eval` 权限。

### 修改前
```json
{
  "manifest_version": 3,
  // ... 其他配置
}
```

### 修改后
```json
{
  "manifest_version": 3,
  // ... 其他配置
  
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  }
}
```

## 说明

### `wasm-unsafe-eval`
- Chrome 从版本 103 开始支持
- 专门用于允许 WebAssembly
- 比 `unsafe-eval` 更安全（只允许 WASM，不允许 eval）

### 为什么需要？
```
Transformers.js → ONNX Runtime → WebAssembly
                                      ↑
                              需要 wasm-unsafe-eval
```

ONNX Runtime 使用 WebAssembly 来：
1. 加载神经网络模型
2. 执行高性能推理计算
3. 运行 Sentence-BERT 模型

### 安全性
- ✅ `wasm-unsafe-eval` 是安全的
- ✅ 只允许 WebAssembly，不允许 eval()
- ✅ Chrome 官方推荐的做法
- ✅ 专为 ML 模型设计

## 使用步骤

### 1. 确认修改
检查 `manifest.json` 是否包含：
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

### 2. 重新加载扩展
```
chrome://extensions/ → 重新加载
```

### 3. 验证
打开 service worker console，应该看到：
```
✅ Transformers.js 已通过 webpack 打包加载
🚀 开始初始化语义搜索引擎...
📥 加载语义编码模型...
模型下载进度: 15%
...
✅ 模型加载完成
```

## 技术细节

### Manifest V3 CSP 演进

#### Chrome < 103
```json
// 不支持 wasm-unsafe-eval
// 只能使用 unsafe-eval（不安全）
"content_security_policy": {
  "extension_pages": "script-src 'self' 'unsafe-eval'; object-src 'self';"
}
```

#### Chrome >= 103 (推荐)
```json
// 支持 wasm-unsafe-eval
// 更安全，只允许 WASM
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

### ONNX Runtime 后端

ONNX Runtime 支持多个后端：
1. **WASM** - 需要 `wasm-unsafe-eval` ✅ 推荐
2. **WebGL** - 不需要特殊权限，但性能较差
3. **WebGPU** - 实验性，支持有限

当前配置使用 WASM 后端，提供最佳性能和兼容性。

### 浏览器兼容性

| 浏览器 | wasm-unsafe-eval 支持 |
|--------|---------------------|
| Chrome 103+ | ✅ 支持 |
| Edge 103+ | ✅ 支持 |
| Firefox | ❌ 不同的 CSP 语法 |
| Safari | ❌ 不支持扩展 V3 |

## 常见问题

### Q: 为什么需要 unsafe-eval？
A: 不需要！我们使用 `wasm-unsafe-eval`，它更安全，只允许 WebAssembly。

### Q: 这样安全吗？
A: 是的。`wasm-unsafe-eval` 是 Chrome 官方为 ML 模型设计的，比 `unsafe-eval` 安全得多。

### Q: 能否避免使用？
A: 如果要使用 ONNX Runtime 和 Transformers.js，必须使用。这是运行深度学习模型的标准做法。

### Q: 有替代方案吗？
A: 
1. 使用 WebGL 后端（性能差）
2. 使用外部 API（不本地化）
3. 不使用深度学习模型（回退到 TF-IDF）

## 参考资料

- [Chrome CSP for WebAssembly](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/api/js/)
- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)

## 总结

✅ **已修复** - 添加 `wasm-unsafe-eval` 到 CSP
✅ **安全可靠** - Chrome 官方推荐的方案
✅ **必要配置** - 运行 Transformers.js 所需

**现在重新加载扩展即可正常使用！** 🎉
