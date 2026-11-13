# 变更记录：解除对直播「观看人数 / 醒目留言」的误杀 + 两个细分开关

日期：2026-11-13
对应 issue：**#42**（观看人数、SC 醒目留言被一起屏蔽）、**#44 / #39-1**（搜索框热词）、**#12**（相关搜索）

## 0. 一句话结论

作者原版为了最大化去广告，把直播间里承载「人气/观看人数」和「醒目留言卡片」的几个类**整体 `return nil`** 了，所以这两样东西跟着一起消失。本次把这类「可能误伤」的 hook 全部收进一个开关，**默认 = 保留**；纯广告类的 hook 保持屏蔽不变。

## 1. 为什么会误伤

原始实现是这样（`Logos/Home/Live/NJLiveDetailAd.xm`）：

```objc
%hook BBLiveBasePopularRankEntryView          // 人气榜入口，同时也承载人气/人数显示
- (id)initWithFrame:(CGRect)frame { return nil; }
%end

%hook LynxView                                // 通用渲染容器，榜单/活动/部分卡片都走它
- (id)init { return nil; }
%end

%hook BBLiveFunctionCardTaskManager           // 弹幕下方「功能卡」总管理器
- (id)init { return nil; }
%end

%hook BBLChronFunctionCard                    // 弹幕底部带计时功能卡
- (id)initWithStore:(id)store { return nil; }
%end
```

问题在于：

| 被 nil 掉的类 | 作者以为的用途 | 实际还承载 |
| --- | --- | --- |
| `BBLiveBasePopularRankEntryView` / `BBLiveBasePopularHotRankEntryView` | 人气榜入口（广告位） | **观看人数 / 人气值显示** |
| `BBLiveVerticalPanelViewController -popularRankEntryViews` | 榜单列表 | 榜单 + 人数面板 |
| `BBLivePoliticalFullScreenTopBar` / `BBLiveVerticalTopBar` 里摘掉 `userRankListEntryView` | 贡献榜入口 | 顶部人数/人气那一整排 |
| `LynxView` | 热门榜、人气榜 | 任何 Lynx 渲染的卡片，**醒目留言容器也在这里** |
| `BBLiveFunctionCardTaskManager` / `BBLChronFunctionCard` | 游戏赛程卡等「功能卡」 | **醒目留言（SC）卡片**，带倒计时的那种 |

类名都叫 `FunctionCard` / `LynxView`，看着像广告，其实是被复用的通用容器 —— 一刀切就必然连坐。

## 2. 改法

新增一个开关 **「直播间-保留观看人数/醒目留言」**，默认**开**。

- 开（默认）：上面那些可能误伤的 hook 全部 `return %orig`，即**不拦截**，人数和 SC 正常显示；
- 关：回到作者原版行为，全部屏蔽。

真正只属于广告的 hook 不动，继续屏蔽：收入/礼物面板、预约按钮与弹窗、右上角活动入口、右下角活动、购物说明卡与购物推荐卡、顶部吊坠、礼物动画、关注弹窗、分区榜、混合榜。

### 行为对照

| 内容 | 本版默认 | 把开关关掉 |
| --- | --- | --- |
| 观看人数 / 人气值 | ✅ 显示 | ❌ 消失（作者原版） |
| 醒目留言（SC） | ✅ 显示 | ❌ 消失（作者原版） |
| 人气榜 / 热门榜入口 | ✅ 显示 | ❌ 屏蔽 |
| 贡献榜入口（topBar 右侧） | ✅ 显示 | ❌ 屏蔽 |
| 游戏赛程等功能卡 | ✅ 显示 | ❌ 屏蔽 |
| 收入面板 / 预约 / 活动 / 购物卡 / 吊坠 / 礼物动画 / 关注弹窗 | ❌ 屏蔽 | ❌ 屏蔽 |

> 取舍说明：`LynxView` 和 `FunctionCardTaskManager` 是通用容器，无法只靠类名区分「榜单广告」与「醒目留言」，所以要保住 SC 就必须把它们放行，代价是榜单类内容会回来。这是「保住人数和 SC」的必然成本，而不是没处理干净。

## 3. 三个开关总览（本仓库整体）

沿用约定：**开关打开 = 执行去广告动作**。

| 设置项 | 默认 | 开 | 关 |
| --- | --- | --- | --- |
| 首页搜索框-热词 | 开 | 清空轮换热词 | 保留 B 站热词 |
| 搜索结果-相关搜索 | 开 | 过滤「相关搜索」卡片 | 保留相关搜索（广告卡片仍过滤） |
| **直播间-保留观看人数/醒目留言** | **开** | **不屏蔽人数与 SC** | 恢复作者原版的激进屏蔽 |

第三个开关的语义是「保留」，和另外两个相反，这是刻意的：它的默认值必须让用户看到人数和 SC。

## 4. 改动清单

### 4.1 存储层

`BiliBiliMDDylib/Logos/Tool/NJCommonDefine.h`

```objc
#define NJ_LIVE_KEEP_AUDIENCE_KEY   @"NJ_LIVE_KEEP_AUDIENCE_KEY"
#define NJ_LIVE_KEEP_AUDIENCE_VALUE (![NJ_SETTING_CACHE containsObjectForKey:NJ_LIVE_KEEP_AUDIENCE_KEY] || \
                                     [(NSNumber *)[NJ_SETTING_CACHE objectForKey:NJ_LIVE_KEEP_AUDIENCE_KEY] boolValue])
```

键不存在即视为 `YES`，所以老用户升级后自动是「保留」，无需迁移缓存。

### 4.2 设置项

- `NJSettingDefine.h`：`#define NJ_LIVE_KEEP_AUDIENCE_BIZ_ID @"liveKeepAudience"`
- `NJSettingInjectDataProvider.m`：在「竖屏模式」之后插入一行开关，标题「直播间-保留观看人数/醒目留言」

### 4.3 Hook 侧（`Logos/Home/Live/NJLiveDetailAd.xm` 与 `.mm` 同步）

共 **15 处**守卫，全部等价于「开关打开就走原实现」：

| 类 / 方法 | 数量 | 打开时的行为 |
| --- | --- | --- |
| `BBLivePoliticalFullScreenTopBar -layoutSubviews` / `-_updateUserRankListEntryViewIfNeed` | 2 | 不再摘掉 `userRankListEntryView` |
| `BBLiveVerticalTopBar -layoutSubviews` / `-_updateUserRankListEntryViewIfNeed` | 2 | 同上 |
| `BBLiveBasePopularHotRankEntryView -initWithFrame:` | 1 | `return %orig` |
| `BBLiveBasePopularRankEntryView -initWithFrame:` | 1 | `return %orig` |
| `BBLiveVerticalPanelViewController -popularRankEntryViews` | 1 | `return %orig` |
| `BBLiveFunctionCardTaskManager -init` | 1 | `return %orig` |
| `LynxView -initWithCoder:` / `-init` / `-initWithFrame:` / `-initWithBuilderBlock:` / `-initWithoutRender` | 5 | `return %orig` |
| `BBLChronFunctionCard -initWithStore:` / `-init` | 2 | `return %orig` |

### 4.4 另外两个开关（上一轮已加，未变）

- 首页搜索框-热词：`NJTabAd` 的 `%ctor` 增加 `NJ_HOME_SEARCH_HOT_WORD_VALUE` 判定；
- 搜索结果-相关搜索：`nj_filterCardTypes` 里按开关移除 `related_search`，广告卡片永远过滤。

### 4.5 工具与文档

| 文件 | 说明 |
| --- | --- |
| `tools/audit-logos-pipeline.js` | `.xm` ↔ `.mm` 一致性审计，有漂移退出码 1 |
| `tools/make-patch.js` | 生成与原始仓库的 diff |
| `tools/audit-report.json` | 审计结果 |
| `.github/workflows/hook-pipeline.yml` | CI 跑审计（只需 Node） |
| `docs/ARCHITECTURE.md` / `docs/BUILD.md` | 架构说明、构建与注入手册 |
| `docs/PATCH.patch` | 全部改动的 diff |

## 5. 验证（需要真机）

1. 装包，进直播间，先看**右上角/顶部是否能看见人气（观看人数）**；
2. 等一条**醒目留言**（或找正在发 SC 的直播间），确认 SC 卡片出现且带倒计时；
3. 顺手确认广告仍被拦住：收入面板、预约按钮、右上角活动入口、礼物动画、关注弹窗；
4. 若第 2 步 SC 仍不出现，说明还有别的类参与渲染 —— 把 `BBLiveVerticalCenterBar` 与 `BBLiveFullScreenFloatPanelView` 的 hook 临时注释掉再试（见 `CHANGES.md` 第 7 节），或把 `%hook BBLChronFunctionCard` / `LynxView` 之外的候选贴出来，我按同样方式补守卫；
5. 把开关关掉、重启，确认回到作者原版行为（人数和 SC 消失）—— 这一步用于证明开关本身生效。

## 6. 回滚

- 用户侧：设置里把「直播间-保留观看人数/醒目留言」关掉；
- 代码侧：`git checkout -- BiliBiliMDDylib/Logos/Home/Live`（`.xm` 与 `.mm` 必须一起回滚，否则源与产物漂移）。

## 7. 若 SC 仍未出现，下一步排查顺序

按「越可能影响 SC」排序，逐个把这些 hook 也纳入开关：

1. `BBLiveVerticalCenterBar -_showShoppingRecommendViewWithInfo:completion:`（弹幕下方卡片区，目前是空实现 = 拦截）
2. `BBLiveFullScreenFloatPanelView -registerComponent:`（面板组件注册，目前只挡了 nil）
3. `BBLiveShoppingExplainCardViewModel -initWithDataSource:tracker:`
4. `BBLiveBaseAnimationView -initWithFrame:`（礼物动画，可能与 SC 入场动画共用）

定位方法（真机 + Xcode Console）：

```objc
// 临时加在 %ctor 里，确认类是否真的被创建
NSLog(@"[NJ-Live] popRank=%p lynx=%p chron=%p",
      objc_getClass("BBLiveBasePopularRankEntryView"),
      objc_getClass("LynxView"),
      objc_getClass("BBLChronFunctionCard"));
```

再配合 `设置 → 隐私 → 分析与改进 → 分析数据` 里的崩溃日志比对。
