# 🧠 语义增强方案 - 理解抽象查询

## 问题场景

用户希望通过**抽象概念**搜索书签：
- "类似孤独" → 希望找到关于独处、孤独感、寂寞的内容
- "排解忧虑" → 希望找到心理健康、放松、冥想相关内容
- "对学习有帮助" → 希望找到教育、课程、知识类资源

**当前问题**：TF-IDF只能匹配字面词汇，无法理解抽象语义。

## 🎯 解决方案：语义扩展层

### 方案A：情感/概念映射表（轻量级）

#### 实现原理
为抽象查询添加具体词汇映射：

```javascript
const semanticExpansion = {
  // 情感类
  '孤独|寂寞|孤单': ['独处', '一个人', '孤独', '寂寞', 'alone', 'lonely', 'solitude', '独自', '单身'],
  
  '忧虑|焦虑|担心|压力': ['心理', '冥想', '放松', 'meditation', 'mindfulness', '减压', '心理健康', 'mental health', '焦虑', 'anxiety', '压力管理'],
  
  '快乐|开心|愉悦': ['娱乐', '有趣', 'fun', 'happy', 'joy', '搞笑', '幽默', '游戏', '音乐'],
  
  '悲伤|难过|沮丧': ['治愈', '安慰', 'healing', '心情', '情绪', 'emotion', '抑郁', 'depression'],
  
  // 功能类
  '学习|提升|进步': ['教育', '课程', '教程', 'course', 'tutorial', 'education', '知识', '技能', 'skill', '学习'],
  
  '工作|职场|效率': ['生产力', 'productivity', '工具', 'tool', '效率', 'efficiency', '管理', 'management', '职场'],
  
  '健康|养生|运动': ['健身', 'fitness', '营养', 'nutrition', '运动', 'exercise', '瑜伽', 'yoga', '健康'],
  
  '赚钱|理财|投资': ['金融', 'finance', '投资', 'investment', '理财', '股票', 'stock', '经济'],
  
  '创意|灵感|设计': ['设计', 'design', '创意', 'creative', '艺术', 'art', '灵感', 'inspiration', 'ui', 'ux'],
  
  // 场景类
  '睡前|失眠|睡觉': ['睡眠', 'sleep', '助眠', '放松', 'relax', '冥想', '白噪音', 'asmr'],
  
  '通勤|路上|无聊': ['播客', 'podcast', '有声书', 'audiobook', '音乐', '电台', 'radio'],
  
  '周末|休息|放松': ['娱乐', '电影', 'movie', '游戏', 'game', '旅游', 'travel', '休闲'],
};
```

#### 使用方式
```javascript
// 查询预处理时自动扩展
原始查询: "类似孤独的书签"
→ 检测到"孤独"关键词
→ 扩展为: "孤独 独处 一个人 寂寞 alone lonely solitude"
→ 向量化搜索
```

### 方案B：基于网页内容的深度匹配（已有）

由于插件已经抓取网页内容，实际上：
- 心理健康网站的内容中会包含"焦虑"、"压力"等词
- 冥想类网站会包含"放松"、"减压"等词
- 教育网站会包含"学习"、"知识"等词

**优化点**：
1. 增加网页内容权重
2. 扩展内容抓取深度（当前只有2000字符）
3. 智能提取关键段落

## 🚀 实施建议

### 推荐：混合方案
```javascript
1. 添加语义映射表（轻量，立即见效）
2. 优化网页内容权重（充分利用现有数据）
3. 增加查询扩展逻辑
```

### 实现步骤

#### Step 1: 添加语义扩展器
```javascript
expandSemanticQuery(query) {
  let expandedTerms = [query];
  
  for (const [pattern, expansions] of Object.entries(semanticExpansion)) {
    const keywords = pattern.split('|');
    if (keywords.some(kw => query.includes(kw))) {
      expandedTerms.push(...expansions);
      break; // 只匹配第一个分类
    }
  }
  
  return expandedTerms.join(' ');
}
```

#### Step 2: 修改查询流程
```javascript
async searchBookmarks(query, topK = 10) {
  // 语义扩展
  const expandedQuery = this.expandSemanticQuery(query);
  console.log(`原始查询: "${query}"`);
  console.log(`扩展查询: "${expandedQuery}"`);
  
  // 使用扩展后的查询进行向量搜索
  const q = this.queryToSparseWeights(expandedQuery);
  // ... 后续逻辑不变
}
```

#### Step 3: 增强网页内容权重
```javascript
// 在构建向量时，对网页内容词汇增加权重
const pageContentTerms = this.preprocessText(pageContent);
for (const term of pageContentTerms) {
  termFreq.set(term, (termFreq.get(term) || 0) + 1.5); // 1.5x权重
}
```

## 📊 效果预期

### 示例查询效果

#### 查询："排解忧虑的书签"

**扩展为**：
```
"排解忧虑 心理 冥想 放松 meditation mindfulness 减压 心理健康 mental health 焦虑 anxiety 压力管理"
```

**匹配结果**（按相关度）：
1. ✅ Headspace.com - 冥想和正念练习
2. ✅ 心理健康博客 - 焦虑管理技巧  
3. ✅ Calm.app - 睡眠和放松音乐
4. ✅ Psychology Today - 心理学文章

#### 查询："类似孤独"

**扩展为**：
```
"孤独 独处 一个人 寂寞 alone lonely solitude 独自"
```

**匹配结果**：
1. ✅ 孤独的美学 - 独处艺术博客
2. ✅ 一个人的生活指南
3. ✅ Solitude and Self-Discovery
4. ✅ 独处时光推荐活动

#### 查询："对学习有帮助的书签"

**扩展为**：
```
"学习 教育 课程 教程 course tutorial education 知识 技能 skill"
```

**匹配结果**：
1. ✅ Coursera - 在线课程平台
2. ✅ 学习方法论 - 效率提升
3. ✅ Khan Academy - 免费教育资源
4. ✅ 编程学习路线图

## 🔧 技术细节

### 扩展词库管理
```javascript
// 支持动态添加
addSemanticMapping(concept, keywords) {
  this.semanticExpansion[concept] = keywords;
}

// 支持用户自定义（未来功能）
chrome.storage.sync.get('customSemantics', (data) => {
  if (data.customSemantics) {
    Object.assign(this.semanticExpansion, data.customSemantics);
  }
});
```

### 权重调优
```javascript
// 平衡原始查询和扩展词的权重
const originalWeight = 2.0;  // 原始词汇权重更高
const expandedWeight = 1.0;  // 扩展词汇辅助作用

// 在向量化时应用权重
if (isOriginalTerm) {
  weight *= originalWeight;
} else {
  weight *= expandedWeight;  
}
```

## ⚠️ 注意事项

1. **过度扩展风险**：扩展词太多可能导致结果不精确
2. **语义漂移**：需要持续优化映射表
3. **性能影响**：扩展后词汇数量增加，计算量略增

## 🎯 总结

**当前状态**：只能字面匹配
**增强后**：理解抽象语义

**投入产出比**：
- 开发时间：1-2小时
- 代码量：~100行
- 效果提升：显著（抽象查询从0结果→准确结果）

是否需要我立即实现这个增强功能？

