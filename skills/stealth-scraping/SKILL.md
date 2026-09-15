---
name: stealth-scraping
description: Stealth web scraping stack with CloakBrowser (source-patched stealth Chromium, Playwright-compatible) and scrapling (modern Scrapy alternative with curl_cffi TLS fingerprinting, patchright browser automation, and auto-rotating fingerprints). Use when scraping anti-bot protected sites, Cloudflare/PerimeterX/Akamai behind, Douyin/Xiaohongshu social media content extraction, needing browser fingerprint spoofing, TLS JA3/JA4 fingerprint impersonation, or extracting data from JS-heavy dynamic pages without detection. Includes dedicated Douyin (抖音) note/video original-image downloader and Xiaohongshu (小红书) text scraper templates with verified anti-detection workarounds.
---

# Stealth Scraping Stack — CloakBrowser + scrapling

## 环境状态（已全局安装）

| 组件 | 版本 | 用途 |
|---|---|---|
| **scrapling[all]** | 0.4.15 | 现代抓取框架：HTTP(TLS指纹) + 浏览器(隐身) + 指纹自动轮换 |
| **CloakBrowser** | 0.5.10 | C++源码级修改的隐身 Chromium，Playwright API 兼容 |
| **patchright** | 1.62.3 | Playwright 分支，scrapling 浏览器后端 |
| **curl_cffi** | 0.16.3 | TLS/JA3/JA4 指纹模拟，scrapling HTTP 后端 |
| **browserforge** | 1.2.4 | 浏览器指纹生成（Canvas/WebGL/Audio/Fonts 等） |

环境变量 `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright` 已写入 `~/.bashrc`。

---

## 何时使用本 Skill

- 目标站点有 Cloudflare / PerimeterX / Akamai / DataDome 等反爬
- 需要 TLS 指纹伪装（JA3/JA4 匹配真实浏览器）
- 需要浏览器指纹伪装（navigator、Canvas、WebGL、Audio、Fonts、WebRTC）
- JS 重渲染页面，纯 HTTP 拿不到数据
- 需要登录态保持、交互操作（点击、滚动、表单）
- 大规模并发抓取，需要自动轮换指纹和代理

**不适用**：静态 HTML 页面、公开 API、简单抓取——用 `scraping` skill 的 `http get` 即可，不必上浏览器。

---

## 工具选择决策

```
目标站点
  │
  ├─ 纯静态 / 公开 API ──────────────→ scrapling.Fetcher（curl_cffi，轻量快）
  │
  ├─ 有 TLS 指纹检测但无 JS 挑战 ────→ scrapling.Fetcher + impersonate 参数
  │
  ├─ JS 渲染 / 轻度反爬 ─────────────→ scrapling.StealthyFetcher（patchright + 指纹轮换）
  │
  ├─ 强反爬 / Cloudflare Turnstile ──→ CloakBrowser（源码级隐身 Chromium）
  │
  └─ 需要复杂交互 / 持久会话 ─────────→ CloakBrowser（完整 Playwright API）
```

---

## 快速开始

### 1. scrapling — HTTP Fetcher（TLS 指纹伪装）

```python
from scrapling import Fetcher

# 自动 impersonate Chrome 131 的 TLS 指纹（JA3/JA4）
resp = Fetcher.get(
    'https://target.com',
    impersonate='chrome131',  # 可选: chrome131, chrome120, firefox120, safari17, edge131 等
    follow_redirects=True,
    timeout=30,
)
print(resp.status)
print(resp.text[:500])

# POST + 自定义 headers
resp = Fetcher.post(
    'https://target.com/api',
    impersonate='chrome131',
    json={'key': 'value'},
    headers={'X-Custom': 'value'},
)
```

### 2. scrapling — StealthyFetcher（浏览器 + 自动指纹轮换）

```python
from scrapling import StealthyFetcher

# 每次请求自动生成新的浏览器指纹（Canvas/WebGL/Audio/Fonts/Navigator）
page = StealthyFetcher.fetch(
    'https://target.com',
    headless=True,
    network_idle=True,        # 等待网络空闲
    timeout=60,
    user_agent='random',      # 随机 UA
)

# CSS 选择器提取
titles = page.css('h1.title')
for t in titles:
    print(t.text)

# 等待元素出现后抓取
page = StealthyFetcher.fetch(
    'https://target.com',
    headless=True,
    wait_selector='div.product-list',
    timeout=60,
)
```

### 3. CloakBrowser — 源码级隐身 Chromium（Playwright API）

```python
from cloakbrowser import launch

# launch() 返回 Playwright 兼容的 Browser 对象
browser = launch(headless=True)
context = browser.new_context(
    user_agent='Mozilla/5.0 ...',
    locale='zh-CN',
    timezone_id='Asia/Shanghai',
)
page = context.new_page()
page.goto('https://target.com', wait_until='networkidle')

# 完整 Playwright API 可用
page.wait_for_selector('div.content')
data = page.eval_on_selector_all('.item', '''
    elements => elements.map(e => ({
        title: e.querySelector('h2').textContent,
        price: e.querySelector('.price').textContent,
    }))
''')

# 截图 / PDF
page.screenshot(path='result.png', full_page=True)

browser.close()
```

### 4. CloakBrowser 异步模式

```python
import asyncio
from cloakbrowser import launch_async

async def main():
    browser = await launch_async(headless=True)
    page = await browser.new_page()
    await page.goto('https://target.com')
    await page.wait_for_selector('div.content')
    title = await page.title()
    print(title)
    await browser.close()

asyncio.run(main())
```

---

## 常见场景模板

### 场景 A：绕过 Cloudflare 抓取列表页

```python
from scrapling import StealthyFetcher
import time

def scrape_list(url, pages=5):
    results = []
    for i in range(1, pages + 1):
        page = StealthyFetcher.fetch(
            f'{url}?page={i}',
            headless=True,
            wait_selector='div.product-card',
            network_idle=True,
            # 注意: StealthyFetcher 的 timeout 单位是毫秒，60000 = 60秒
        )
        items = page.css('div.product-card')
        for item in items:
            results.append({
                'title': item.css_first('h3').text if item.css_first('h3') else None,
                'link': item.css_first('a').attributes.get('href'),
            })
        time.sleep(2)  # 礼貌延迟
    return results
```

### 场景 B：需要登录的会话抓取（CloakBrowser）

```python
from cloakbrowser import launch

browser = launch(headless=True)
context = browser.new_context()
page = context.new_page()

# 登录
page.goto('https://target.com/login')
page.fill('input[name="username"]', 'user')
page.fill('input[name="password"]', 'pass')
page.click('button[type="submit"]')
page.wait_for_url('**/dashboard')

# 抓取需要登录的页面
page.goto('https://target.com/protected-data')
page.wait_for_selector('table.data')
rows = page.eval_on_selector_all('table.data tr', '''
    rows => rows.map(r => Array.from(r.cells).map(c => c.textContent))
''')

# 保存会话状态，下次复用
context.storage_state(path='auth_state.json')
browser.close()

# 下次直接加载会话
browser = launch(headless=True)
context = browser.new_context(storage_state='auth_state.json')
```

### 场景 C：并发抓取 + 代理轮换

```python
from scrapling import Fetcher
from concurrent.futures import ThreadPoolExecutor

proxies = [
    'http://user:pass@proxy1:8080',
    'http://user:pass@proxy2:8080',
    'http://user:pass@proxy3:8080',
]

def fetch_with_proxy(url, proxy):
    return Fetcher.get(
        url,
        impersonate='chrome131',
        proxy=proxy,
        timeout=30,
    )

urls = ['https://target.com/page/1', 'https://target.com/page/2']
with ThreadPoolExecutor(max_workers=3) as ex:
    results = list(ex.map(
        lambda u: fetch_with_proxy(u, proxies[hash(u) % len(proxies)]),
        urls
    ))
```

### 场景 D：CloakBrowser + 代理

```python
from cloakbrowser import launch

browser = launch(
    headless=True,
    proxy={
        'server': 'http://proxy:8080',
        'username': 'user',
        'password': 'pass',
    },
)
page = browser.new_page()
page.goto('https://target.com')
browser.close()
```

### 场景 E：抖音图文/视频专项抓取

**关键坑**：抖音短链 `v.douyin.com/xxx` 跳转到移动分享页（`iesdouyin.com/share/...`），该页面**故意不注入图文内容**，显示"请在抖音内观看"。必须换成桌面版 URL 才能拿到内容。

**抓取流程**：短链解析 ID → 拼桌面版 URL → CloakBrowser 桌面 UA 渲染 → 提取

```python
from cloakbrowser import launch
import re, time, json

def scrape_douyin(share_url):
    """
    抓取抖音图文笔记或视频。
    share_url: v.douyin.com/xxx 短链 或 完整分享链接
    返回: 标题、正文、作者、互动数据、图片列表等
    """
    browser = launch(headless=True)
    context = browser.new_context(
        locale='zh-CN',
        timezone_id='Asia/Shanghai',
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    )
    page = context.new_page()

    # Step 1: 访问短链，从重定向 URL 中提取 item_id
    page.goto(share_url, wait_until='domcontentloaded', timeout=60000)
    time.sleep(2)
    final_url = page.url

    # 从 URL 提取 ID（支持 /note/xxx 和 /video/xxx）
    m = re.search(r'/(?:note|video)/(\d+)', final_url)
    if not m:
        # 尝试从页面元数据中提取
        item_id = page.evaluate('''() => {
            const m = location.pathname.match(/\\/(?:note|video)\\/(\\d+)/);
            return m ? m[1] : null;
        }''')
    else:
        item_id = m.group(1)

    if not item_id:
        browser.close()
        return {'error': '无法提取 item_id', 'final_url': final_url}

    # 判断是图文(note)还是视频(video)
    content_type = 'note' if '/note/' in final_url else 'video'
    desktop_url = f'https://www.douyin.com/{content_type}/{item_id}'

    # Step 2: 访问桌面版页面，等待 JS 渲染
    page.goto(desktop_url, wait_until='domcontentloaded', timeout=60000)
    time.sleep(5)  # 等待内容加载

    # Step 3: 提取内容
    result = page.evaluate('''() => {
        const data = {};

        // 标题
        const titleEl = document.querySelector('h1, [data-e2e="note-detail-title"]');
        data.title = titleEl ? titleEl.innerText.trim() : document.title;

        // 正文描述
        const descEl = document.querySelector('[data-e2e="note-detail-desc"], .YWxMhXzZ, .note-content');
        data.description = descEl ? descEl.innerText.trim() : '';

        // 作者
        const authorEl = document.querySelector('[data-e2e="user-info"] .username, .author-info .nickname');
        data.author = authorEl ? authorEl.innerText.trim() : '';

        // 互动数据
        const stats = {};
        document.querySelectorAll('[data-e2e]').forEach(el => {
            const key = el.getAttribute('data-e2e');
            if (key && key.includes('-count') || key === 'like-count' || key === 'comment-count' || key === 'collect-count' || key === 'share-count') {
                stats[key] = el.innerText.trim();
            }
        });
        data.stats = stats;

        // 图文笔记的图片列表
        data.images = Array.from(document.querySelectorAll('.note-img, img[src*="p3-pc-sign"]')).map(img => img.src);

        // 发布时间
        const timeEl = document.querySelector('[data-e2e="note-detail-time"], .publish-time');
        data.publish_time = timeEl ? timeEl.innerText.trim() : '';

        return data;
    }''')

    result['item_id'] = item_id
    result['content_type'] = content_type
    result['url'] = desktop_url

    browser.close()
    return result

# 使用示例
result = scrape_douyin('https://v.douyin.com/DrETP9nHQ-E/')
print(json.dumps(result, ensure_ascii=False, indent=2))
```

**抖音抓取要点**：
- 必须用桌面版 URL `www.douyin.com/note/{id}` 或 `www.douyin.com/video/{id}`，移动分享页拿不到内容
- 必须用桌面 UA（1920x1080 + Chrome），移动 UA 会被限制
- CloakBrowser 比 StealthyFetcher 更稳（抖音有强指纹检测）
- **图文原图下载必须用浏览器上下文**（`context.request.get()`），用 requests/Fetcher 会 403 防盗链
- 图文是懒加载轮播，必须模拟滑动（`page.keyboard.press('ArrowRight')`）才能加载全部图片
- 过滤原图 URL：包含 `biz_tag=aweme_images` 且不含 `image-cut` 的才是笔记原图
- 视频地址从 `<video>` 标签的 `src` 或页面注入数据（`_ROUTER_DATA`）中提取，同样用浏览器上下文下载

### 抖音视频+图文原图完整下载脚本

```python
from cloakbrowser import launch
import re, time, os

def download_douyin_media(share_url, output_dir='./douyin_output'):
    """
    输入抖音短链，自动下载视频文件或图文原图。
    返回: {'type': 'video'|'note', 'files': [...], 'title': str}
    """
    os.makedirs(output_dir, exist_ok=True)
    browser = launch(headless=True)
    context = browser.new_context(
        locale='zh-CN', timezone_id='Asia/Shanghai',
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    )
    page = context.new_page()

    # Step 1: 短链解析 ID
    page.goto(share_url, wait_until='domcontentloaded', timeout=60000)
    time.sleep(2)
    m = re.search(r'/(note|video)/(\d+)', page.url)
    content_type, item_id = m.group(1), m.group(2)

    # Step 2: 访问桌面版
    page.goto(f'https://www.douyin.com/{content_type}/{item_id}',
              wait_until='domcontentloaded', timeout=60000)
    time.sleep(5)
    title = page.title()

    save_dir = os.path.join(output_dir, item_id)
    os.makedirs(save_dir, exist_ok=True)
    downloaded = []

    if content_type == 'video':
        # === 视频下载 ===
        video_url = page.evaluate('() => document.querySelector("video")?.src')
        if video_url:
            resp = context.request.get(video_url, headers={'Referer': 'https://www.douyin.com/'})
            if resp.ok:
                path = os.path.join(save_dir, 'video.mp4')
                with open(path, 'wb') as f:
                    f.write(resp.body())
                downloaded.append(path)
                print(f'视频下载: {len(resp.body())//1024//1024}MB')

    else:
        # === 图文原图下载 ===
        # 滑动轮播加载全部图片（懒加载）
        for _ in range(15):
            page.keyboard.press('ArrowRight')
            time.sleep(0.6)
        time.sleep(1)

        # 收集原图URL
        image_urls = page.evaluate('''() => {
            const urls = [];
            document.querySelectorAll('img').forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src && src.includes('biz_tag=aweme_images') &&
                    !src.includes('image-cut') && src.startsWith('http'))
                    urls.push(src);
            });
            return [...new Set(urls)];
        }''')

        # 用浏览器上下文下载（带cookie，绕过防盗链）
        for i, url in enumerate(image_urls, 1):
            resp = context.request.get(url, headers={
                'Referer': 'https://www.douyin.com/',
                'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
            })
            if resp.ok:
                ext = '.png' if '.png' in url else '.jpeg'
                path = os.path.join(save_dir, f'{i:02d}{ext}')
                with open(path, 'wb') as f:
                    f.write(resp.body())
                downloaded.append(path)
                print(f'  原图 [{i}/{len(image_urls)}]: {len(resp.body())//1024}KB')

    browser.close()
    return {'type': content_type, 'item_id': item_id, 'title': title, 'files': downloaded}

# 使用
result = download_douyin_media('https://v.douyin.com/DrETP9nHQ-E/')
print(f'完成: {result["type"]} {result["item_id"]}, {len(result["files"])} 个文件')
```

### 小红书（xiaohongshu.com）图文抓取

```python
from cloakbrowser import launch
import re, time, os, json

def scrape_xiaohongshu(share_url, output_dir='./xhs_output'):
    """
    输入小红书短链或详情页URL，提取笔记文字内容。
    注意：原图下载受限（见下方说明），文字内容可完整提取。
    """
    os.makedirs(output_dir, exist_ok=True)
    browser = launch(headless=True)
    context = browser.new_context(
        locale='zh-CN', timezone_id='Asia/Shanghai',
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    )
    page = context.new_page()

    # 短链跟随重定向到详情页
    page.goto(share_url, wait_until='domcontentloaded', timeout=60000)
    time.sleep(5)

    # 提取笔记ID
    m = re.search(r'/item/([a-f0-9]+)', page.url)
    note_id = m.group(1) if m else 'unknown'

    # 提取文字内容（页面渲染后直接从DOM取）
    data = page.evaluate('''() => {
        const text = document.body.innerText;
        // 标题通常在笔记详情区顶部
        const titleEl = document.querySelector('#detail-title, .title, [class*="title"]');
        return {
            title: titleEl?.textContent?.trim() || '',
            fullText: text,
            url: location.href
        };
    }''')

    # 保存文字内容
    save_path = os.path.join(output_dir, f'{note_id}_content.txt')
    with open(save_path, 'w', encoding='utf-8') as f:
        f.write(f"标题: {data['title']}\\n")
        f.write(f"链接: {data['url']}\\n\\n")
        f.write(data['fullText'])

    browser.close()
    return {'note_id': note_id, 'title': data['title'], 'content_file': save_path}
```

**小红书抓取要点与已知限制**：
- **文字内容可完整提取**：标题、正文、作者、互动数据（赞/藏/评）在页面渲染后直接从 DOM 获取
- **原图下载受限**（截至2026-09）：
  - 图片URL为动态签名，时效性强（几分钟后即403），必须页面加载后立即提取并下载
  - 笔记详情页内嵌推荐流（`.note-item` / `.cover.mask.ld`），全局 `img` 搜索会混入大量推荐封面
  - 笔记主图容器特殊（非普通 `img` 标签，可能是懒加载/虚拟列表渲染），CSS 选择器难以精确定位
  - 频繁访问触发登录弹窗，此后笔记内容不再加载（反爬机制）
  - `__INITIAL_STATE__` 含 `undefined` 非标准JSON，无法直接 `JSON.parse`
- **建议**：原图需求优先用抖音（已完全跑通）；小红书仅抓文字内容，或用截图方式获取图片区域
- 必须用桌面 UA + 桌面视口，移动UA会被限制

---

## 工具选型原则：从轻到重，够用就停

```
能直接调 API ──────────────→ 用 Fetcher（curl_cffi，最轻量）
  ↓ API 有签名/反爬
能用 HTTP + TLS指纹 ────────→ Fetcher + impersonate
  ↓ 需要 JS 渲染
能用 StealthyFetcher ───────→ patchright + 自动指纹轮换
  ↓ 强反爬 / Cloudflare / 抖音
必须上 CloakBrowser ────────→ 源码级隐身 Chromium
  ↓ 需要登录态 / 复杂交互
接管真实 Chrome（CDP）──────→ browser-use / web-access 模式
```

**核心原则**：能不开浏览器就不开，能不登录就不登录。效率和稳定性优先，上重武器前先试轻量方案。

---

## 反检测要点

1. **TLS 指纹**：scrapling `Fetcher` 的 `impersonate` 参数模拟真实浏览器 JA3/JA4，比 requests/httpx 安全得多
2. **浏览器指纹**：`StealthyFetcher` 每次自动轮换 Canvas/WebGL/Audio/Fonts/Navigator 指纹
3. **源码级隐身**：CloakBrowser 的 Chromium 在 C++ 层面修改了指纹，不是 JS 注入，能通过大部分检测
4. **行为模拟**：用 `page.mouse.move()`、`page.mouse.wheel()` 模拟人类滚动，不要瞬间跳转
5. **请求节奏**：加随机延迟 `time.sleep(random.uniform(1, 3))`，不要固定间隔
6. **Referer**：scrapling 默认带 Google Referer，可自定义

---

## 注意事项

- CloakBrowser 免费版限制 1 个并发会话；多并发需购买 key（`cloakbrowser login`）
- scrapling 的 `StealthyFetcher` 每次启动浏览器，适合中低规模；极高并发用 `Fetcher` + 代理池
- headless 模式下部分站点仍能检测，必要时用 `headless=False` + XVFB
- 遵守目标站点 `robots.txt` 和法律法规，仅抓取公开数据
- 大文件下载用 `Fetcher`（流式），不要用浏览器

---

## 验证安装

```bash
python3 -c "import scrapling; print('scrapling', scrapling.__version__)"
python3 -c "import cloakbrowser; print('cloakbrowser', cloakbrowser.__version__)"
```

## 相关 Skill

- **scraping**：轻量静态抓取（nushell http get + query web），适合无反爬站点
- **browser-task**：真实浏览器 GUI 自动化，适合需要登录授权的复杂交互
