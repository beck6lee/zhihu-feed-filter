# 知乎过滤插件设计文档

**日期：** 2026-03-24
**状态：** 已批准

---

## 概述

一个 Chrome 浏览器扩展，用于过滤知乎页面中的指定内容。支持关键词匹配和广告自动识别，命中的内容直接隐藏。用户通过 Popup 弹窗管理过滤规则。

---

## 架构

```
zhihu-filter/
├── manifest.json          # Chrome 扩展清单 (Manifest V3)
├── content.js             # 注入知乎页面的内容脚本
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── icons/
    └── icon.png
```

### 核心流程

1. **content.js** 在 `zhihu.com` 页面加载时启动，创建 `MutationObserver` 监听 `#root`（知乎的 React 挂载点）
2. 每次有新节点插入时，遍历 feed item，检查是否命中关键词或广告特征，命中则设置 `display: none`
3. **popup.js** 负责读写 `chrome.storage.sync` 中的关键词列表，变更后通过 `chrome.tabs.sendMessage` 通知 content.js 重新过滤当前页面
4. **chrome.storage.sync** 作为唯一数据源，确保规则在多设备间同步

---

## 过滤逻辑

### 关键词匹配

- content.js 从 `chrome.storage.sync` 读取关键词数组
- 对每个 feed item 提取标题 + 摘要文本
- 逐一检查是否包含任意关键词（大小写不敏感）
- 命中则对该 feed item 的顶层容器元素设置 `display: none`

### 广告自动识别

知乎广告/推广内容通过以下 CSS 选择器匹配（硬编码，用户无需配置）：

- `[data-za-detail-view-name="FeedAdCard"]` — 信息流广告卡片
- `.ContentItem-Ad` — 内容广告标记
- 包含"赞助"、"推广"文字的标签节点

### MutationObserver

```js
observer.observe(document.getElementById('root'), {
  childList: true,
  subtree: true
})
```

每次回调中批量处理新增节点，避免重复处理已隐藏的元素。

---

## Popup 界面

### 功能

- 顶部：插件总开关（启用/禁用）
- 中部：关键词列表，每条右侧有删除按钮
- 底部：输入框 + "添加"按钮（支持回车）
- 广告自动过滤开关（默认开启）

### 数据结构

存储在 `chrome.storage.sync`：

```js
{
  enabled: true,        // 插件总开关
  blockAds: true,       // 广告自动识别开关
  keywords: []          // 关键词列表（字符串数组）
}
```

### 交互细节

- 关键词变更后立即保存，同时发消息给当前标签页的 content.js 触发重新过滤
- Popup 宽度 320px，简洁单列布局

---

## 目标浏览器

Chrome / Chromium（Manifest V3）

---

## 不在范围内

- Firefox 支持
- 用户屏蔽（按用户名过滤）
- 质量阈值过滤（点赞数等）
- 内容折叠或模糊遮罩（仅支持直接隐藏）
