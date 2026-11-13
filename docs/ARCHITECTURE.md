# BiliBiliMApp 架构说明

> 面向要在这个仓库里继续写 Hook 的人。所有结论来自对仓库源码的静态阅读（未运行目标 App）。

## 1. 项目性质

| 项 | 值 |
| --- | --- |
| 形态 | **MonkeyDev 静态注入**（非越狱）。把 `libBiliBiliMDDylib.dylib` 塞进官方 `.app` 的 `Frameworks/`，再改 `LC_LOAD_DYLIB`，最后整包重签 |
| 目标 App | 哔哩哔哩 iOS，Bundle ID `tv.danmaku.bilianime`（见 `project.pbxproj`）|
| 最低系统 | iOS 13.0 |
| 语言 | Objective-C / Objective-C++，少量 Swift（倍速模块）|
| 两个 Target | `BiliBiliMD` = 宿主壳（产物 IPA 用它的包名）；`BiliBiliMDDylib` = 注入的动态库，`INSTALL_PATH = @executable_path/Frameworks/libBiliBiliMDDylib.dylib` |

`BiliBiliMD/TargetApp/` 只放一个 `.gitkeep`，脱壳后的 `bili-universal.app` 要自己丢进去（见 `BUILD.md`）。

## 2. 源码与编译单元的关系（最容易踩的坑）

```
BiliBiliMDDylib/Logos/**/Foo.xm   ← 手写源（Logos 方言）
        │  logos.pl / MonkeyDev 预处理
        ▼
BiliBiliMDDylib/Logos/**/Foo.mm   ← 生成物，但**已被提交进仓库，且是唯一被编译的东西**
```

- `project.pbxproj` 的 Sources 阶段收录 **19 个 `.mm`**，`.xm` **一个都不在**。
- 因此：**只改 `.xm` 不重新生成 `.mm`，编译出来的二进制不会有任何变化**，而且不会报错——这是本仓库最大的静默失败点。
- `Logos/Launch/NJLaunchAd.x` 是例外：它用 CaptainHook（`CHConstructor`/`CHHook*`），不经 Logos。
- 校验手段：`node tools/audit-logos-pipeline.js`（比对 `.xm` 声明的 `%hook`/`%new`/`%property` 与 `.mm` 里实际注册的 `MSHookMessageEx`/`class_addMethod`，并检查 `.mm` 是否都在 Sources 里）。

`%property` 会被 Logos 展开成 `getter + setter` 两个 `class_addMethod`，审计脚本已按此规则处理。

## 3. 运行时分层

```
┌──────────────────────────────────────────────────────────┐
│ 待机面（数据层）                                          │
│  BFCRequest -initWithRequest:...  ← NJNetworkService.xm   │
│      └─ 响应体交给 NJApiDataManger                        │
│            └─ URL → NJApiDataItem 子类（责任链）           │
│                  protobuf 反序列化 → 过滤 → 回填          │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ 已渲染面（视图层）                                        │
│  %hook UIView 子类：-initWithFrame: 返回 nil              │
│                    -layoutSubviews 里 removeFromSuperview │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ 横切面                                                    │
│  设置注入 / 缓存 / 版本兼容(ASLR+偏移) / 日志 / 账号      │
└──────────────────────────────────────────────────────────┘
```

### 3.1 数据层：URL 路由器

`Logos/Network/NJApiDataManger.m` 是核心：

- `itemClasses` 里注册一批 `NJApiDataItem` 子类；
- 每个子类用 `url` 属性声明自己负责的接口路径；
- `-handleWithData:response:` 拿到原始 `NSData`（protobuf），解析 → 删广告条目 → 重新序列化 → 返回。

新增「某接口返回列表里的某种卡片」的过滤，**优先在这里加一个 `NJApiDataItem` 子类**，比 hook 视图稳，且不受 UI 改版影响。

现有 10 个数据项：推荐流、直播索引、直播二级列表、番剧、搜索广场、首页版块、详情页 UP 主推荐、分享频道、我的、竖屏、皮肤。

### 3.2 视图层：三种拦截手法

1. `-initWithFrame:` / `-initWithDataSource:` 直接 `return nil;` —— 最省事，但要求调用方对 nil 有保护，遇到不判空的地方会崩（历史上 `BBLiveFullScreenFloatPanelView` 就为此加了 `if (!component) return;`，注释写着「修复8.76.0奔溃」）。
2. `-layoutSubviews` 里 `%orig` 之后再 `removeFromSuperview` —— 适合「容器里某个子视图」。
3. 重写数据源方法返回空（如 `-popularRankEntryViews` 返回 nil）。

### 3.3 版本兼容层

`Logos/Tool/AppCompatible/`：`NJAppCompatibleDispatcher` 按 `NJPluginInfo.appVersion` 精确匹配 handler，目前只有 `8.41.0` 和 `8.76.0` 两个。

Handler 做的事（`NJAppCompatible_8_76_0_Handler.m`）：

- `aslr + 0x114699400` → `MSHookFunction` 改「最大播放速度」函数；
- `aslr + 0x10481EDA4` → 改全屏播放速度数组生成函数；
- `aslr + 0x11E6ACA98` / `0x11E65FA00` → **直接写进程内存**，把硬编码的倍速字符串表（`0.5 / 0.75 / 1.0 / 1.25 / 1.5 / 2.0`，「2.0」后面的字节被改成 `3.0`）改写掉。

这类改动**强绑定 app 版本**，换版本必须重新定位偏移；`NJPlaybackRateWriteMemoryTool` + `NJChangePlaybackRateTool` 负责实际的 `mach_vm_protect` / `vm_write`。

### 3.4 设置注入

```
%hook BBPhoneSettingMainVC / BBHD2PhoneSettingMainVC
   ├─ numberOfSectionsInTableView:      +1 组
   ├─ tableView:viewForHeaderInSection: 分组头
   ├─ tableView:didSelectRowAtIndexPath: 转发给 NJSettingBizHandler
   └─ nj_injectDatas（%property 缓存）  ← NJSettingInjectDataProvider 提供数组
```

- 数据：`NJSettingSkullViewModel`（基类）/`NJSettingSwitchViewModel`（带 `saveKey`）/`NJInlineSettingModel`（单选）。
- 持久化：`NJSettingCache`（YYCache 包装），键见 `NJCommonDefine.h`。
- 交互：`NJSettingBizHandler` → 写缓存 → `rebootTip`（弹「重启应用生效」）。
- **开关只在二进制加载时读取一次**（都在 `%ctor` 里判定），改完必须杀进程重启。

### 3.5 账号与网络工具

- `NJAccount.xm`：给 `BFCAccount` 挂 `%new` 方法（`nj_isLogin` / `nj_isVip` / `nj_getCookieBiliJct` / `nj_accessKey`），供启动任务使用。
- `NJApiRequest`：直接用 App 自己的 `BFCApiOptions`/`BFCApiRequest` 发请求（大会员福利、每日经验），并用 `NJDailyTaskManager` 做每日去重。

## 4. Hook 清单（按文件）

| 文件 | 覆盖面 | 主要目标类 |
| --- | --- | --- |
| `Home/rcmd/NJRcmdAd` | 首页推荐流、评分弹窗、推送引导、+号气泡、未成年弹窗 | `BBPegasusViewController`、`BFCStoreScorePopupManager` 等 |
| `Home/Tab/NJTabAd` | 首页搜索框轮换热词 | `BAPIAppInterfaceV1DefaultWordsReply` |
| `Home/HotTopic/NJHotTopicAd` | 热搜/热门卡片 | `BAPIAppCardV1Card`、`BAPIAppShowPopularV1PopularReply` |
| `Home/Live/NJLiveDetailAd` | 直播详情页 15 个类：收入面板、预约、TopBar 榜单入口、人气榜、分区榜、右上入口、活动、功能卡、购物卡、吊坠、礼物动画、关注弹窗、`LynxView`、`BBLChronFunctionCard` | 见文件 |
| `Detail/NJDetailAd` | 详情页广告、相关推荐、播放器浮层 | `BBAdUGCContext`、`BAPIAppViewunite*` |
| `Detail/NJDetailPlayerAd` | 播放器内 UP 主标签、竖屏底部、Story 入口、DM 指令 | `BBPlayer*` |
| `Detail/VerticalMode/NJStoryAd` | 竖屏 Story 底部导流入口 | `BAPIAppStoryV1BottomDiversionEntranceReply` |
| `Dynamic/NJDynamicAd` | 动态 Tab 各类模块 | `BAPIAppDynamicV2*` |
| `Search/NJSearchResultAd` | 搜索结果卡片（广告/相关搜索） | `BAPIPolymerAppSearchV1SearchAllResponse` |
| `Detail/PlaybackRate/*` | 默认倍速、3 倍速、倍速内存补丁 | `BBPlayerPlayback`、`IJKFFMoviePlayerControllerFFPlay`、`NSArray` |
| `Launch/NJLaunchAd.x` | 开屏广告（CaptainHook 写法） | — |
| `Tool/Account/NJAccount` | 账号能力扩展 | `BFCAccount` |
| `Network/NJNetworkService` | 响应拦截入口 + 调试 description | `BFCRequest`、`BFCApiRequest` |
| `Setting/NJSetting`、`NJHD2Setting` | 设置页注入（手机 / HD2） | `BBPhoneSettingMainVC`、`BBHD2PhoneSettingMainVC` |
| `Tool/NJDebug` | protobuf 调试打印 | `GPBMessage` |
| `Logger/NJLogger` | **整段被注释**，当前无任何 hook | — |

## 5. 已知结构性风险

1. **`.mm` 是生成物却被当源文件维护** —— 手改 `.mm` 会在某次重新生成时被覆盖；只改 `.xm` 则完全不生效。
2. **`%ctor` 里一次性判定开关** —— 无法热切换，只能重启进程；用户感知为「改了没反应」。
3. **`return nil` 型 hook 缺调用方判空** —— 是「设置了就闪退」类 issue 的主要来源。
4. **视图层 hook 与 App 版本强耦合** —— 类被重命名/拆分后 hook 静默失效（`MSHookMessageEx` 对不存在的类返回失败，但代码不检查）。
5. **写内存/硬编码偏移** —— 只对 `8.41.0`、`8.76.0` 成立，其它版本必须禁用或重定位。

## 6. 相关文档

- `BUILD.md`：从零构建、重签、验证。
- `CHANGES.md`：2026-11 这次新增的三个细分开关。
- `tools/audit-logos-pipeline.js`：`.xm`/`.mm` 管线一致性审计，可直接进 CI。
