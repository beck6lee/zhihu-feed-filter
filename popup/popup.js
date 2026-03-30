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
  for (var i = state.keywords.length - 1; i >= 0; i--) {
    var kw = state.keywords[i];
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
  }
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
