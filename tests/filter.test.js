// tests/filter.test.js

// Mock chrome API before requiring content.js
global.chrome = {
  storage: { sync: { get: jest.fn((keys, cb) => cb({})), set: jest.fn() } },
  runtime: { onMessage: { addListener: jest.fn() }, lastError: null }
};

const { shouldHideByKeyword, extractText, shouldHideAd, initDefaults } = require('../content.js');

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
