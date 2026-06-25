# biubiu.tools — SEO 实践指南

> 配套文件:[DISTRIBUTION.md](./DISTRIBUTION.md)(外链/目录提交清单)。
> 本文是**总纲**:心智模型 + 关键词→内容方法 + 每周节奏。

## 0. 心智模型:SEO 是飞轮,不是清单

```
       关键词研究 ──→ 建页面(匹配意图)──→ 收录 ──→ 排名
          ↑                                          │ ↑
          │                              外链/权重 ──┘ │
          └──── 测量(GSC)→ 加倍赢家页 ────────────────┘
```

三个**持续运转**的引擎:

| 引擎 | 干什么 | 关键真相 |
|------|--------|----------|
| **内容(场内)** | 关键词 → 建页面 | 80% 的持续工作量在这,且**无限**。每个关键词=一个潜在页面。 |
| **权重(场外)** | 赚外链 | 目录=地基(封顶 ~30–80)。真正无限的外链靠"值得被链接的内容"赚。 |
| **测量** | GSC 看数据 | 不是设置完就走;是看什么在动→加倍。 |

**常见错误认知:**
- ❌ "收录是确定的" → 收录**也吃权重**,新域名被限量收录(证据:200/2600)。
- ❌ "外链=提交导航站" → 那只是地基层,很快封顶;过了靠内容赚链接。
- ❌ "排名不确定" → 大部分可控:**只挑能赢的词**,排名就变确定。
- ❌ "能做的事很少" → 内容引擎是无限的,你还有一大片页面没建。

## 1. 找热词(免费,GSC 优先)

1. **GSC → Performance → Queries(第一来源,你已有数据)**
   - 你的 470 次曝光 = 你正在展示的真实词。
   - 重点:**排名 8–20 的"临门一脚"词** → 优先建/优化对应页,最快见效。
2. **免费扩展**:Google 自动补全 · People Also Ask · Google Keyword Planner · Bing Webmaster · AnswerThePublic · Google Trends。
3. **抄对手**:免费工具查 chainlist.org / revoke.cash 排哪些词。
4. **挖论坛**:`site:reddit.com [话题]`、`site:ethereum.stackexchange.com [话题]` → 真问题=真词+选题。

**筛词三问**:① 我有页面答它吗(意图)?② 有人搜吗(量,不用大)?③ 新域名能排吗(竞争)?
> 竞争度判断:page 1 全是 DR70+ 巨头 → 跳过;出现论坛/老页面/弱站 → 能打。
> **永远优先长尾**:`shibarium rpc url` ✅、`how to add zksync to metamask` ✅;`ethereum rpc` ❌(chainlist 占死)。

## 2. 关键词意图 → 页面类型(内容方法论)

| 搜索意图 | 词的特征(修饰语) | 该建的页面类型 | 你的例子 |
|----------|-------------------|----------------|----------|
| 导航/交易 | `[链] rpc`、`[链] chain id` | 程序化页(已有) | `/chains/[id]` |
| 认知/教程 | `how to add X to metamask`、`what is chain id` | How-to 指南 / 术语表 | `/guides/add-network-to-metamask` |
| 对比/考虑 | `chainlist alternative`、`X vs Y` | 对比/替代页(转化最高) | `/alternatives/chainlist` |
| 实施 | `how to revoke approvals`、`batch send tokens` | 工具落地页 + how-to | `/revoke` + 指南 |

**你的杀手锏:工具本身就是内容。** 每篇 how-to 自然收尾于"用我们的免费工具一键完成"——内容+产品合一,且能用 AI 批量生成。

**对你 ROI 从高到低**:① how-to 指南(内容+产品) ② 对比/替代页(转化高) ③ 术语表(易排名+AI爱引用)。
**别写**:没有受众的思想随笔——对你 ROI 最低。

## 3. 你的内容支柱(那片"没建的面")

围绕 4 个支柱,每个 = 1 个枢纽页 + N 个子页(how-to/术语/对比):

1. **EVM 链/网络**(已有 2600 页)→ 扩 how-to:`add X to metamask`、`X gas fee`、`X block time`。
2. **钱包安全**(revoke / sweep)→ `how to revoke token approvals`、`secure a hacked wallet`、`is this approval safe`。
3. **转移资金/代币**(token sender / balance)→ `batch send tokens`、`check balance across chains`、`airdrop tokens`。
4. **开发者/合约交互**(contract caller)→ `call contract function online`、`etherscan write contract alternative`。

> 每个支柱内的页面互相内链(枢纽↔子页)→ SEO 复利。

## 4. 每周节奏(≈3–4 h,全异步,你定一个固定时段)

| 步骤 | 动作 |
|------|------|
| **测量(15 min)** | GSC 记录 avg position + 找新的 8–20 名"临门一脚"词,填进 [DISTRIBUTION.md](./DISTRIBUTION.md) 日志 |
| **场内(2 h)** | 建 **1 个**新页面(how-to / 对比 / 术语),对准本周挑中的赢词。用 Claude Code 批量生成 |
| **场外(1 h)** | 提交 **5 个**目录/awesome-list(见 DISTRIBUTION.md) |
| **加倍** | 看哪页排名在涨 → 优化它的标题/内容/内链,或给它引一条外链 |

## 5. 铁律(别两周就放弃)

- **领先指标按周看(avg position、收录数、外链域名数);用户/点击按月看。90 天内不准用点击判生死。**
- **只进能赢的赛道**(长尾、低竞争),别跟巨头硬刚头部词。
- **一个页面 = 一个主关键词簇**,标题/H1/首段/URL 都放那个词。
- **内容为人也为 AI**:单 H1、FAQ、对比表 → 既排名又被 ChatGPT/Perplexity 引用。
- **别瞎忙**:不写没受众的随笔,不提交 DR<10 的垃圾站,不每周改老页面标题。
