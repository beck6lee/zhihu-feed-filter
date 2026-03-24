# 知乎过滤插件 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that hides Zhihu feed items matching user-defined keywords or known ad patterns.

**Architecture:** A content script (`content.js`) loads rules from `chrome.storage.sync`, then uses a `MutationObserver` to intercept newly inserted feed items and hide matches. A popup (`popup/popup.js`) provides keyword management and toggle controls, writing changes to storage and messaging the content script to re-filter.

**Tech Stack:** Vanilla JS (ES5-compatible), Chrome Manifest V3, Jest + jsdom for unit tests, jimp for icon generation.

---

## File Map

| File | Responsibility |
|------|---------------|
| `manifest.json` | Extension manifest (MV3), declares permissions and content script |
| `content.js` | Filter engine + MutationObserver + startup sequence + message listener |
| `popup/popup.html` | Popup markup |
| `popup/popup.js` | Popup UI logic: render state, add/remove keywords, toggle switches, notify content script |
| `popup/popup.css` | Popup styles |
| `icons/icon16.png` | 16×16 toolbar icon |
| `icons/icon48.png` | 48×48 extension management icon |
| `icons/icon128.png` | 128×128 Chrome Web Store icon |
| `generate-icons.js` | Dev script: generates placeholder PNG icons via jimp |
| `package.json` | Jest config + dev dependencies (jest, jimp) |
| `tests/filter.test.js` | Unit tests for content.js filter functions |
| `tests/popup.test.js` | Unit tests for popup.js validation logic |

---

## Chunk 1: Scaffold + Content Script

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `manifest.json`
- Create: `generate-icons.js`
- Create: `icons/` (via generate-icons.js)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "zhihu-filter",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "generate-icons": "node generate-icons.js"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0",
    "jimp": "^0.22.0"
  },
  "jest": {
    "testEnvironment": "jsdom"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "知乎过滤",
  "version": "1.0.0",
  "description": "过滤知乎页面中的广告和关键词内容",
  "permissions": ["storage", "tabs", "activeTab"],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["*://*.zhihu.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 4: Create `generate-icons.js`**

```javascript
// generate-icons.js — run once to create placeholder PNG icons
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

async function main() {
  const dir = path.join(__dirname, 'icons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  for (const size of [16, 48, 128]) {
    // Solid #0084FF blue square
    const img = new Jimp(size, size, 0x0084FFFF);
    await img.writeAsync(path.join(dir, `icon${size}.png`));
    console.log(`Created icon${size}.png`);
  }
}

main().catch(console.error);
```

- [ ] **Step 5: Generate icons**

Run: `npm run generate-icons`
Expected: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` created.

- [ ] **Step 6: Commit**

```bash
git add manifest.json package.json package-lock.json generate-icons.js icons/
git commit -m "chore: project scaffold — manifest, package.json, icons"
```

---

### Task 2: Filter engine — keyword matching (TDD)

**Files:**
- Create: `tests/filter.test.js` (keyword tests only)
- Create: `content.js` (filter functions + conditional export)

- [ ] **Step 1: Create `tests/filter.test.js` with failing keyword tests**

```javascript
// tests/filter.test.js

// Mock chrome API before requiring content.js
global.chrome = {
  storage: { sync: { get: jest.fn((keys, cb) => cb({})), set: jest.fn() } },
  runtime: { onMessage: { addListener: jest.fn() }, lastError: null }
};

const { shouldHideByKeyword, extractText } = require('../content.js');

function makeEl(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild;
}

describe('extractText', () => {
  test('extracts title text', () => {
    const el = makeEl('<div><div class="ContentItem-title">这是标题</div></div>');
    expect(extractText(el)).toContain('这是标题');
  });

  test('extracts excerpt text', () => {
    const el = makeEl('<div><div class="ContentItem-excerpt">这是摘要</div></div>');
    expect(extractText(el)).toContain('这是摘要');
  });

  test('returns empty string when no text elements found', () => {
    const el = makeEl('<div><span>其他内容</span></div>');
    expect(extractText(el)).toBe('');
  });
});

describe('shouldHideByKeyword', () => {
  test('returns false when keywords array is empty', () => {
    const el = makeEl('<div><div class="ContentItem-title">正常内容</div></div>');
    expect(shouldHideByKeyword(el, [])).toBe(false);
  });

  test('returns true when title contains a keyword', () => {
    const el = makeEl('<div><div class="ContentItem-title">营销推广内容</div></div>');
    expect(shouldHideByKeyword(el, ['营销'])).toBe(true);
  });

  test('returns true when excerpt contains a keyword', () => {
    const el = makeEl('<div><div class="ContentItem-excerpt">这是广告文案</div></div>');
    expect(shouldHideByKeyword(el, ['广告'])).toBe(true);
  });

  test('is case-insensitive for latin characters', () => {
    const el = makeEl('<div><div class="ContentItem-title">Hello World</div></div>');
    expect(shouldHideByKeyword(el, ['hello'])).toBe(true);
  });

  test('returns false when no keyword matches', () => {
    const el = makeEl('<div><div class="ContentItem-title">正常问题标题</div></div>');
    expect(shouldHideByKeyword(el, ['广告', '推广', '营销'])).toBe(false);
  });

  test('returns true if any one keyword matches (OR logic)', () => {
    const el = makeEl('<div><div class="ContentItem-title">推广活动介绍</div></div>');
    expect(shouldHideByKeyword(el, ['广告', '推广'])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx jest tests/filter.test.js --no-coverage`
Expected: FAIL — `Cannot find module '../content.js'`

- [ ] **Step 3: Create `content.js` with `extractText` and `shouldHideByKeyword`**

```javascript
// content.js

// ==================== Constants ====================

var DEFAULT_RULES = { enabled: true, blockAds: true, keywords: [] };

var AD_SELECTORS = [
  '[data-za-detail-view-name="FeedAdCard"]',
  '.ContentItem-Ad'
];

var AD_LABEL_TEXTS = ['赞助', '推广'];

var FEED_SELECTOR = '.ContentItem, .QuestionItem, [data-zop], .TopstoryItem';

// ==================== Runtime State ====================

var rules = { enabled: true, blockAds: true, keywords: [] };
var observer = null;

// ==================== Filter Functions ====================

function extractText(el) {
  var titleEl = el.querySelector('.ContentItem-title, .QuestionItem-title, h2');
  var excerptEl = el.querySelector('.ContentItem-excerpt, .RichText');
  var title = titleEl ? titleEl.textContent : '';
  var excerpt = excerptEl ? excerptEl.textContent : '';
  return (title + ' ' + excerpt).toLowerCase();
}

function shouldHideByKeyword(el, keywords) {
  if (!keywords || keywords.length === 0) return false;
  var text = extractText(el);
  return keywords.some(function(kw) {
    return text.indexOf(kw.toLowerCase()) !== -1;
  });
}

function shouldHideAd(el) {
  for (var i = 0; i < AD_SELECTORS.length; i++) {
    var sel = AD_SELECTORS[i];
    if (el.matches && el.matches(sel)) return true;
    if (el.querySelector(sel)) return true;
  }
  var spans = el.querySelectorAll('span, a, em');
  for (var j = 0; j < spans.length; j++) {
    if (AD_LABEL_TEXTS.indexOf(spans[j].textContent.trim()) !== -1) return true;
  }
  return false;
}

function shouldHide(el) {
  if (rules.blockAds && shouldHideAd(el)) return true;
  if (rules.keywords.length > 0 && shouldHideByKeyword(el, rules.keywords)) return true;
  return false;
}

// ==================== DOM Manipulation ====================

function processItem(el) {
  if (el.hasAttribute('data-zf-filtered')) return;
  if (shouldHide(el)) {
    el.style.display = 'none';
    el.setAttribute('data-zf-filtered', 'hidden');
  } else {
    el.setAttribute('data-zf-filtered', 'visible');
  }
}

function getFeedItems() {
  return document.querySelectorAll(FEED_SELECTOR);
}

function filterAll() {
  var items = getFeedItems();
  for (var i = 0; i < items.length; i++) {
    processItem(items[i]);
  }
}

function resetAndRefilter() {
  var marked = document.querySelectorAll('[data-zf-filtered]');
  for (var i = 0; i < marked.length; i++) {
    if (marked[i].getAttribute('data-zf-filtered') === 'hidden') {
      marked[i].style.display = '';
    }
    marked[i].removeAttribute('data-zf-filtered');
  }
  filterAll();
}

// ==================== Observer ====================

function startObserver() {
  var root = document.getElementById('root');
  if (!root) return;
  observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue; // ELEMENT_NODE
        if (node.matches && node.matches(FEED_SELECTOR)) processItem(node);
        var descendants = node.querySelectorAll ? node.querySelectorAll(FEED_SELECTOR) : [];
        for (var k = 0; k < descendants.length; k++) {
          processItem(descendants[k]);
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// ==================== Enable / Disable ====================

function disable() {
  stopObserver();
  var hidden = document.querySelectorAll('[data-zf-filtered="hidden"]');
  for (var i = 0; i < hidden.length; i++) {
    hidden[i].style.display = '';
    hidden[i].removeAttribute('data-zf-filtered');
  }
  var visible = document.querySelectorAll('[data-zf-filtered="visible"]');
  for (var i = 0; i < visible.length; i++) {
    visible[i].removeAttribute('data-zf-filtered');
  }
}

function enable() {
  filterAll();
  startObserver();
}

// ==================== Init ====================

function initDefaults(stored) {
  var merged = Object.assign({}, DEFAULT_RULES, stored);
  if (Object.keys(stored).length === 0) {
    chrome.storage.sync.set(DEFAULT_RULES);
  }
  return merged;
}

// ==================== Startup ====================

chrome.storage.sync.get(null, function(stored) {
  rules = initDefaults(stored);
  if (rules.enabled) {
    filterAll();
    startObserver();
  }
});

// ==================== Message Listener ====================

chrome.runtime.onMessage.addListener(function(message) {
  if (message.type !== 'UPDATE_RULES') return;
  var prevEnabled = rules.enabled;
  rules = message.rules;
  if (!rules.enabled) {
    disable();
  } else if (!prevEnabled && rules.enabled) {
    enable();
  } else {
    resetAndRefilter();
  }
});

// ==================== Test Export ====================

if (typeof module !== 'undefined') {
  module.exports = {
    extractText: extractText,
    shouldHideByKeyword: shouldHideByKeyword,
    shouldHideAd: shouldHideAd,
    shouldHide: shouldHide,
    initDefaults: initDefaults
  };
}
```

- [ ] **Step 4: Run keyword tests — verify they pass**

Run: `npx jest tests/filter.test.js --no-coverage`
Expected: All `extractText` and `shouldHideByKeyword` tests PASS. (Ad tests don't exist yet — that's fine.)

- [ ] **Step 5: Commit**

```bash
git add content.js tests/filter.test.js
git commit -m "feat: filter engine — extractText and shouldHideByKeyword (TDD)"
```

---

### Task 3: Filter engine — ad detection (TDD)

**Files:**
- Modify: `tests/filter.test.js` (add ad detection + initDefaults tests)

Note: `shouldHideAd` is already implemented in `content.js` from Task 2. We write the tests now to verify the implementation.

- [ ] **Step 1: Add ad detection and initDefaults tests to `tests/filter.test.js`**

Append after the existing `shouldHideByKeyword` describe block:

```javascript
describe('shouldHideAd', () => {
  test('returns true for element with FeedAdCard attribute', () => {
    const el = makeEl('<div data-za-detail-view-name="FeedAdCard"><p>广告</p></div>');
    expect(shouldHideAd(el)).toBe(true);
  });

  test('returns true for element with ContentItem-Ad class', () => {
    const el = makeEl('<div class="ContentItem-Ad"><p>推广</p></div>');
    expect(shouldHideAd(el)).toBe(true);
  });

  test('returns true when a child contains the ad label "赞助"', () => {
    const el = makeEl('<div><span>赞助</span><p>一些内容</p></div>');
    expect(shouldHideAd(el)).toBe(true);
  });

  test('returns true when a child contains the ad label "推广"', () => {
    const el = makeEl('<div><a>推广</a><p>内容</p></div>');
    expect(shouldHideAd(el)).toBe(true);
  });

  test('returns false for normal content with no ad markers', () => {
    const el = makeEl('<div class="ContentItem"><h2>普通问题</h2><p>正常回答内容</p></div>');
    expect(shouldHideAd(el)).toBe(false);
  });

  test('does not match partial text (e.g. "推广" inside longer string)', () => {
    const el = makeEl('<div><span>这不是推广内容</span></div>');
    // textContent.trim() !== '推广', so should NOT match
    expect(shouldHideAd(el)).toBe(false);
  });
});

describe('initDefaults', () => {
  test('returns default values when storage is empty', () => {
    const result = initDefaults({});
    expect(result).toEqual({ enabled: true, blockAds: true, keywords: [] });
  });

  test('preserves stored enabled=false', () => {
    const result = initDefaults({ enabled: false, blockAds: true, keywords: [] });
    expect(result.enabled).toBe(false);
  });

  test('preserves stored keywords', () => {
    const result = initDefaults({ enabled: true, blockAds: false, keywords: ['test'] });
    expect(result.keywords).toEqual(['test']);
    expect(result.blockAds).toBe(false);
  });
});
```

Add `shouldHideAd` and `initDefaults` to the destructured import at the top:

```javascript
const { shouldHideByKeyword, extractText, shouldHideAd, initDefaults } = require('../content.js');
```

- [ ] **Step 2: Run all filter tests — verify they pass**

Run: `npx jest tests/filter.test.js --no-coverage`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/filter.test.js
git commit -m "test: ad detection and initDefaults tests for content.js"
```

---

## Chunk 2: Popup

### Task 4: Popup HTML + CSS

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`

- [ ] **Step 1: Create `popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>知乎过滤</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <div class="row">
      <label for="toggle-enabled">启用过滤</label>
      <label class="switch">
        <input type="checkbox" id="toggle-enabled">
        <span class="slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="toggle-ads">自动屏蔽广告</label>
      <label class="switch">
        <input type="checkbox" id="toggle-ads">
        <span class="slider"></span>
      </label>
    </div>

    <div class="section-title">关键词列表</div>
    <div id="keyword-list"></div>

    <div class="add-row">
      <input type="text" id="keyword-input" placeholder="输入关键词…" maxlength="100">
      <button id="add-btn">添加</button>
    </div>
    <div id="keyword-error" class="error" aria-live="polite"></div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup/popup.css`**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #333;
  background: #fff;
}

.container {
  padding: 12px 16px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}

/* Toggle switch */
.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  background: #ccc;
  border-radius: 22px;
  cursor: pointer;
  transition: background 0.2s;
}

.slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

input:checked + .slider {
  background: #0084ff;
}

input:checked + .slider::before {
  transform: translateX(18px);
}

/* Keyword list */
.section-title {
  font-size: 12px;
  color: #999;
  margin: 12px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.keyword-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
}

.keyword-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.keyword-item button {
  background: none;
  border: none;
  color: #bbb;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
  flex-shrink: 0;
}

.keyword-item button:hover {
  color: #e53935;
}

/* Add row */
.add-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.add-row input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.add-row input:focus {
  border-color: #0084ff;
}

.add-row button {
  padding: 7px 14px;
  background: #0084ff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}

.add-row button:hover {
  background: #006acc;
}

/* Error */
.error {
  color: #e53935;
  font-size: 12px;
  margin-top: 6px;
  min-height: 18px;
}
```

- [ ] **Step 3: Verify layout by loading the extension**

Load the extension in Chrome (chrome://extensions → "Load unpacked" → select project folder). Click the toolbar icon to open the popup. Verify:
- Two toggle rows show at top
- "关键词列表" section title appears
- Input + "添加" button show at bottom
- Layout is 320px wide

- [ ] **Step 4: Commit**

```bash
git add popup/
git commit -m "feat: popup HTML and CSS layout"
```

---

### Task 5: Popup validation logic (TDD)

**Files:**
- Create: `popup/popup.js` (validateKeyword function + conditional export)
- Create: `tests/popup.test.js`

- [ ] **Step 1: Create `tests/popup.test.js` with failing validation tests**

```javascript
// tests/popup.test.js

// Set up a minimal DOM before loading popup.js
document.body.innerHTML = `
  <input type="checkbox" id="toggle-enabled">
  <input type="checkbox" id="toggle-ads">
  <div id="keyword-list"></div>
  <input type="text" id="keyword-input">
  <button id="add-btn"></button>
  <div id="keyword-error"></div>
`;

global.chrome = {
  storage: { sync: { get: jest.fn(), set: jest.fn() } },
  tabs: { query: jest.fn(), sendMessage: jest.fn() },
  runtime: { lastError: null }
};

const { validateKeyword } = require('../popup/popup.js');

describe('validateKeyword', () => {
  test('rejects empty string', () => {
    const result = validateKeyword('', []);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('rejects whitespace-only string', () => {
    const result = validateKeyword('   ', []);
    expect(result.valid).toBe(false);
  });

  test('rejects keyword longer than 100 characters', () => {
    const long = 'a'.repeat(101);
    const result = validateKeyword(long, []);
    expect(result.valid).toBe(false);
  });

  test('accepts keyword of exactly 100 characters', () => {
    const exact = 'a'.repeat(100);
    const result = validateKeyword(exact, []);
    expect(result.valid).toBe(true);
  });

  test('rejects when keyword list is at 100-item capacity', () => {
    const existing = Array.from({ length: 100 }, (_, i) => `kw${i}`);
    const result = validateKeyword('new', existing);
    expect(result.valid).toBe(false);
  });

  test('accepts when keyword list has 99 items', () => {
    const existing = Array.from({ length: 99 }, (_, i) => `kw${i}`);
    const result = validateKeyword('new', existing);
    expect(result.valid).toBe(true);
  });

  test('rejects duplicate keyword', () => {
    const result = validateKeyword('广告', ['广告', '推广']);
    expect(result.valid).toBe(false);
  });

  test('accepts valid unique keyword', () => {
    const result = validateKeyword('营销', ['广告']);
    expect(result.valid).toBe(true);
    expect(result.value).toBe('营销');
  });

  test('trims whitespace and returns trimmed value', () => {
    const result = validateKeyword('  营销  ', []);
    expect(result.valid).toBe(true);
    expect(result.value).toBe('营销');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx jest tests/popup.test.js --no-coverage`
Expected: FAIL — `Cannot find module '../popup/popup.js'`

- [ ] **Step 3: Create `popup/popup.js` with `validateKeyword` and full popup logic**

```javascript
// popup/popup.js

var MAX_KEYWORDS = 100;
var MAX_KEYWORD_LENGTH = 100;

// ==================== Validation ====================

function validateKeyword(keyword, existing) {
  var trimmed = keyword.trim();
  if (!trimmed) {
    return { valid: false, error: '关键词不能为空' };
  }
  if (trimmed.length > MAX_KEYWORD_LENGTH) {
    return { valid: false, error: '关键词不能超过 ' + MAX_KEYWORD_LENGTH + ' 个字符' };
  }
  if (existing.length >= MAX_KEYWORDS) {
    return { valid: false, error: '最多添加 ' + MAX_KEYWORDS + ' 个关键词' };
  }
  if (existing.indexOf(trimmed) !== -1) {
    return { valid: false, error: '关键词已存在' };
  }
  return { valid: true, value: trimmed };
}

// ==================== Chrome Messaging ====================

function notifyContentScript(currentRules) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_RULES', rules: currentRules }, function() {
      // Ignore errors — tab may not be a zhihu.com page
      void chrome.runtime.lastError;
    });
  });
}

// ==================== State ====================

var state = { enabled: true, blockAds: true, keywords: [] };

function saveAndNotify() {
  chrome.storage.sync.set(state, function() {
    notifyContentScript(state);
  });
}

// ==================== Render ====================

function renderKeywords() {
  var list = document.getElementById('keyword-list');
  list.innerHTML = '';
  state.keywords.forEach(function(kw, i) {
    var item = document.createElement('div');
    item.className = 'keyword-item';
    var span = document.createElement('span');
    span.textContent = kw;
    var btn = document.createElement('button');
    btn.textContent = '×';
    btn.setAttribute('data-index', String(i));
    btn.setAttribute('aria-label', '删除 ' + kw);
    item.appendChild(span);
    item.appendChild(btn);
    list.appendChild(item);
  });
}

function renderState() {
  document.getElementById('toggle-enabled').checked = state.enabled;
  document.getElementById('toggle-ads').checked = state.blockAds;
  renderKeywords();
}

// ==================== Actions ====================

function addKeyword() {
  var input = document.getElementById('keyword-input');
  var errorEl = document.getElementById('keyword-error');
  var result = validateKeyword(input.value, state.keywords);
  if (!result.valid) {
    errorEl.textContent = result.error;
    return;
  }
  errorEl.textContent = '';
  state.keywords.push(result.value);
  input.value = '';
  renderKeywords();
  saveAndNotify();
}

function removeKeyword(index) {
  state.keywords.splice(index, 1);
  renderKeywords();
  saveAndNotify();
}

// ==================== Init ====================

document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.sync.get(null, function(stored) {
    state = Object.assign({ enabled: true, blockAds: true, keywords: [] }, stored);
    renderState();
  });

  document.getElementById('toggle-enabled').addEventListener('change', function(e) {
    state.enabled = e.target.checked;
    saveAndNotify();
  });

  document.getElementById('toggle-ads').addEventListener('change', function(e) {
    state.blockAds = e.target.checked;
    saveAndNotify();
  });

  document.getElementById('add-btn').addEventListener('click', addKeyword);

  document.getElementById('keyword-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') addKeyword();
  });

  document.getElementById('keyword-list').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-index]');
    if (btn) removeKeyword(parseInt(btn.getAttribute('data-index'), 10));
  });
});

// ==================== Test Export ====================

if (typeof module !== 'undefined') {
  module.exports = { validateKeyword: validateKeyword, notifyContentScript: notifyContentScript };
}
```

- [ ] **Step 4: Run popup tests — verify they pass**

Run: `npx jest tests/popup.test.js --no-coverage`
Expected: All tests PASS.

- [ ] **Step 5: Run all tests to verify nothing broken**

Run: `npx jest --no-coverage`
Expected: All tests in `tests/filter.test.js` and `tests/popup.test.js` PASS.

- [ ] **Step 6: Commit**

```bash
git add popup/popup.js tests/popup.test.js
git commit -m "feat: popup.js with validateKeyword (TDD) and full UI logic"
```

---

### Task 6: End-to-end manual verification

**Files:** None (manual test only)

- [ ] **Step 1: Load extension in Chrome**

Go to `chrome://extensions`, enable "Developer mode", click "Load unpacked", select the project root. Verify the extension loads without errors.

- [ ] **Step 2: Verify popup UI**

Open zhihu.com, click the extension icon. Verify:
- Both toggles are ON by default
- Keyword list is empty
- Adding "营销" creates a list item with a "×" button
- Clicking "×" removes the keyword
- Adding a duplicate shows an error message
- Adding an empty string shows an error message

- [ ] **Step 3: Verify ad filtering**

On zhihu.com feed, verify that known ad items (if any visible) disappear. Inspect the DOM for items with `data-zf-filtered="hidden"`.

- [ ] **Step 4: Verify keyword filtering**

Add a keyword that appears in a visible feed item title. Verify that item disappears immediately.

- [ ] **Step 5: Verify toggle off/on**

Toggle "启用过滤" off — verify hidden items reappear. Toggle back on — verify they hide again.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: end-to-end verified"
```
