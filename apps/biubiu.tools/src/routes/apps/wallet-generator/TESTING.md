# 钱包批量生成器 · 测试脚本（Chrome DevTools MCP）

> 给 code agent 的指令：**参考本文档，用 Chrome DevTools MCP 把这个应用完整测试一遍**，
> 逐项执行「测试用例」并对照「预期」记录通过/失败 + 截图。发现不符立即报告，不要假设通过。

应用：`/apps/wallet-generator`（钱包批量生成器）。纯前端、零网络、确定性派生。
入口路由：`apps/biubiu.tools/src/routes/apps/wallet-generator/+page.svelte`。

---

## 0. 前置

1. 确认 dev server 在跑：`curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/apps/wallet-generator` 应为 `200`。
   - 没跑就 `cd apps/biubiu.tools && bun run dev`（或问用户）。
2. 测试 URL：`http://localhost:5173/apps/wallet-generator`
3. 桌面视口先用 `1440x900`（`resize_page`）。

### ⚠️ Chrome DevTools MCP 的 profile 锁（本环境高频踩坑，务必先读）

本环境里 MCP 会反复重连并重新锁定它自己的 Chrome profile，症状是工具调用报：
`The browser is already running for .../chrome-devtools-mcp/chrome-profile` 或 `Connection closed`。

恢复手顺（按需重复）：
```bash
# 仅清锁（Chrome 还活着时，优先用这个，成功率最高）
rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/SingletonLock"
# 彻底重置（连不上时）
pkill -9 -f "chrome-devtools-mcp/chrome-profile"; sleep 2
rm -f "$HOME/.cache/chrome-devtools-mcp/chrome-profile/Singleton"*; sleep 2
```
经验法则：**清锁后通常只稳定够跑 1～2 个 MCP 调用**，然后可能又被重连锁住。
因此 —— **不要靠一长串 click 串联操作**，而是把"填值 + 点击"打包进 `navigate_page` 的
`initScript` 里一次完成，再单独截图。下面用例已按这个思路写。

---

## 1. 通用工具用法

- 进入页面 + 预置状态：`navigate_page({ url, type:'url', initScript })`
- 强制主题：`initScript` 里 `localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' }))`（或 `'dark'`）。
  主题通过 `<html data-theme>` 生效，per-field 合并默认值，所以只写 theme 是安全的。
- 截图：`take_screenshot({ fullPage:true })`
- 读结构 + 拿元素 uid：`take_snapshot()`，再 `click({uid})` / `fill({uid,value})`
- 跑断言/取状态：`evaluate_script({ function })`，返回 JSON
- 控制台 / 网络：`list_console_messages()`、`list_network_requests()`
- 响应式：`resize_page({width,height})`

**Svelte 5 绑定注意**：直接 `el.value=...` 不会触发 `bind:value`。要用原生 setter + 派发 input：
```js
const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
set.call(el, 'xxx'); el.dispatchEvent(new Event('input',{bubbles:true}));
```

### 把"走到第 2 步并生成"打包成一个 initScript（推荐）
```js
// navigate_page 的 initScript：load 后自动填短语→继续→选 100→生成
try { localStorage.setItem('biubiu-settings', JSON.stringify({ theme:'light' })); } catch(e){}
window.addEventListener('load', () => {
  const click = (t) => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===t); b&&b.click(); return !!b; };
  setTimeout(() => {
    const ta = document.querySelector('#wg-pass');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    set.call(ta, 'correct horse battery staple mountain river ocean'); ta.dispatchEvent(new Event('input',{bubbles:true}));
    setTimeout(()=>{ click('继续'); setTimeout(()=>{ click('100'); setTimeout(()=>click('生成'),150); },250); },250);
  }, 500);
});
```
导航后等 ~1.5s 再 `take_screenshot` 即可拿到"已生成 100 个钱包"的结果页。

---

## 2. 测试用例（逐条执行 + 截图 + 记录）

### A. 首屏 / 空状态（第 1 步）
预期：
- 标题「钱包批量生成器」+ 副标题一句话说明。
- 安全提示是**紧凑**的一行图标 + 标题 + 小字说明（不是占满屏的大色块）。
- 步骤条：`1 秘密` 高亮，`2 钱包` 灰且不可点。
- 「秘密短语」textarea 为空，占位文案可见。
- 强度条灰、右侧文字「请输入短语」。
- 「助记词长度」默认选中 `24 词`。
- 「高级选项」**默认折叠**，右侧 summary 显示 `EVM · BIP44`。
- 「继续」按钮**禁用**（灰）。

### B. 强度计 + 短语输入
- 输入 `123` → 强度条红、文案「弱——极易被暴力破解 · 约 N 位」。
- 清空再输入一段长随机串 → 变绿「强」，bits 增大。
- 输入任意非空 → 「继续」变为可点。

### C. 高级选项（折叠区）
- 点「高级选项」展开：出现「派生出的助记词」（默认隐藏，点「显示」可见、「复制」可复制）、
  「链」(静态 `EVM`，不是下拉)、「HD 派生路径」下拉（BIP44 / Ledger Live / Legacy）。
- 改 HD 路径 → summary 应带一个小圆点（marked，表示非默认）。

### D. 派生确定性 + 失效不变量（关键）
- 记下当前助记词；切 `12 词` ↔ `24 词`，助记词应随之变化。
- **失效不变量**：先生成钱包（见 F），再「返回」第 1 步、改短语 / 改词数 / 改 HD 路径，
  再「继续」回第 2 步 → **钱包表必须已清空**（不能残留旧短语派生的地址）。

### E. 向导导航
- 「继续」→ 进入第 2 步（钱包）。
- 「返回」或点步骤条上的 `1 秘密` → 回到第 1 步，输入保留。

### F. 批量生成（第 2 步 · 批量生成 tab）
- 顶部：`数量` 输入 + 「生成」主按钮；下面一排快捷 chip `100 / 1000 / 10000`；右侧小字「每批最多 100,000 个钱包」。
- 点 chip 只**填入数量**，不直接生成；点「生成」才执行（单一动作，路径清晰）。
- 数量输入非法（清空 / 输入 `abc`）→ 输入框红边 + 「生成」禁用。
- 大批量（如 1000）时出现进度条 `生成…N%`，结束后消失。
- 「起始序号」在「高级选项」折叠区内（summary 显示 `起始序号 0`，>0 时带圆点）。

### G. 结果表
- 表头：`# / 路径 / 地址 / 私钥`。
- 私钥默认掩码（圆点），点「显示私钥」→ 明文；再点「隐藏私钥」恢复。
- **逐行复制**：鼠标悬停某行，地址列出现复制按钮；点击图标变 ✓（1.5s 后还原）。私钥列在「显示私钥」后也有复制按钮。
- 生成 1000 个 → 每页 50 行、底部分页「上一页 / 第 X 页，共 Y 页 / 下一页」可翻页。

### H. 导出 / 下载（高危确认）
- 「下载地址」→ 立即下载 `wallets-addresses.txt`（不含私钥，无需确认）。
- 「下载私钥」「下载全部」→ **弹确认框**（标题「导出明文私钥？」+ 风险说明 + 「仍然下载」/「取消」）。
  - 点「取消」→ 不下载；点「仍然下载」→ 下载对应文件。
- 校验：`list_network_requests()` 期间应**无任何网络请求**（全程离线）。

### I. 导出 xpub（tab：导出 xpub）
- 显示一段说明 + 二维码（白底）+ 「账户路径 m/44'/60'/0'」「指纹 0x…」「扩展公钥 xpub…」+「复制」。
- 切换短语，二维码 / 指纹 / xpub 应随之更新。

### J. 扫码签名（tab：扫码签名）
- 空闲态：说明文案 + 「扫描请求」按钮。
- 点「扫描请求」→ 申请摄像头权限并弹出扫码浮层（顶部百分比 + 关闭 ×）。无摄像头/拒绝授权时应有内联错误提示（红色 alert + 图标），不是只在 console。

### K. 响应式
- `resize_page(390,844)`（手机）：各区块纵向堆叠、无横向溢出；结果表可横向滚动；快捷 chip 不挤压换行错乱；底部分隔线在窄屏隐藏。
- `resize_page(768,1024)`（平板）：布局正常。

### L. 双主题（务必都测）
对 A / F / G / I 至少各截一张 **light** 和 **dark**：
- 卡片：浅色下为白底 + 1px 边框 + 轻阴影（不是灰蒙/绿蒙的玻璃感）；深色下为深色面板。
- 不能有「白底白字 / 灰底灰字」看不清的地方。
- 安全提示、错误 alert、强度色（红/黄/绿）在两个主题都清晰。
- 切换：`navigate_page` initScript 里写 `theme:'light'` 或 `'dark'`。

### M. i18n（多语言）
- 切换语言（右上角设置或 `localStorage` 语言项），页面文案应全部翻译，**不得出现裸 key**（如 `wg.gen.max`、`wg.advanced`）。
  注意：HTML 里嵌入的消息目录 JSON 里**会**出现这些 key，那是正常的 hydration 数据，不算 bug——只看**可见渲染文本**。

### N. 控制台 / 错误
- 全流程 `list_console_messages()` 无报错。
- 生成、导出、切 tab 全程零网络请求（离线保证）。

---

## 3. 验收清单（汇总）
- [ ] 新用户首屏一眼明白「干什么 / 下一步点哪」；第 1 步只剩核心（短语+词数+继续），高级项收起。
- [ ] 安全提示克制不喧嚣；不像工业控制面板。
- [ ] 改短语/词数/路径后旧结果自动清空（无陈旧地址）。
- [ ] 非法数量被拦截并有反馈；批量有进度与分页。
- [ ] 明文私钥导出有确认；地址导出免确认；全程离线。
- [ ] 逐行复制、显示/隐藏私钥、xpub 复制都正常。
- [ ] light + dark 都无对比度问题；移动端无溢出。
- [ ] 无裸 i18n key；无 console 报错。

---

## 4. 已知坑
- **profile 锁**：见 §0，先清 `SingletonLock`；连不上再彻底 `pkill`。一次清锁≈1~2 次调用。
- **扫码签名**需要真实摄像头权限；headless / 无摄像头环境只验证「空闲态 UI + 错误提示」即可。
- **QR / 摄像头画面**用了 `#fff`/`#000`/视频黑底，这是功能性需求（二维码必须黑白），不算「硬编码颜色」违规。
- **派生算法 1:1 兼容旧工具（SHA256/MD5），严禁"修正"**——同短语必须产出字节一致的地址，改了会导致用户已有资金对不上。
