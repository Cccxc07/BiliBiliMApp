# 构建、注入与验证

> 只在 macOS + Xcode 上可完成。Windows/Linux 可以读代码、跑审计脚本，但编译不出 IPA。

## 1. 一次性准备

```bash
# 1) MonkeyDev（提供 libsubstrate / cycript / Xcode 模板）
#    https://github.com/AloneMonkey/MonkeyDev
#    默认安装路径 /opt/MonkeyDev

# 2) 视图调试框架（二选一）
#    Lookin（默认）：把 LookinServer.framework 放到 /opt/MonkeyDev/Frameworks
#    Reveal：改 BiliBiliMDDylib Target 的 Other Linker Flags，
#            把 -framework LookinServer 换成 -framework RevealServer

# 3) 脱壳的哔哩哔哩
#    Releases 里下 bili-universal.app-xxx.zip，解压得到 bili-universal.app
#    放到：BiliBiliMApp/BiliBiliMD/TargetApp/
```

`TargetApp/` 在仓库里只有一个 `.gitkeep`，脱壳包不进版本库。

## 2. 构建

```bash
open BiliBiliMD.xcodeproj
# Scheme 选 BiliBiliMDDylib，目标设备选真机
# Cmd+R
```

产物落在 `LatestBuild/`（`LatestBuild` 文件里记的是作者本机 DerivedData 路径，仅供参考）。
命令行等价写法见 `BiliBiliMD/Scripts/quick-resign.sh`：

```bash
xcodebuild MONKEYDEV_INSERT_DYLIB=YES | xcpretty
cd LatestBuild && ./createIPA.command          # 产出 Target.ipa
```

`MONKEYDEV_INSERT_DYLIB` 控制是否把 dylib 真正注入到 `TargetApp` 的可执行文件里：

- `NO`：只编 dylib，用于越狱环境/别的注入方式；
- `YES`：注入 + 改 `LC_LOAD_DYLIB`，得到可分发的整包。

## 3. 装到非越狱设备

IPA 用的是官方包名 `tv.danmaku.bilianime`：

- 方案 A：先卸载官方客户端，再装这个；
- 方案 B：改包名后安装，可与官方共存（注意改包名后部分服务可能异常）。

重签工具：iOS App Signer / Sideloadly / SideStore / AltStore 均可。

## 4. 改完 Hook 之后必须做的事

**这是本仓库最容易翻车的地方。**

```
Logos/**/X.xm   ← 你改这个
Logos/**/X.mm   ← pbxproj 只编译这个
```

只改 `.xm` ⇒ 编译通过 ⇒ 行为毫无变化。两条路任选：

### 路线 A：重新生成（推荐，保持 .xm 为唯一真源）

```bash
# Theos 的 logos.pl；MonkeyDev 自带一份，路径通常是 $MonkeyDevTheosPath/bin/logos.pl
THEOS_BIN=${THEOS:-/opt/theos}/bin/logos.pl

find BiliBiliMDDylib -name '*.xm' | while read -r f; do
  "$THEOS_BIN" "$f" > "${f%.xm}.mm"
done
```

注意：重新生成会覆盖作者手工微调过的 `.mm`，`#line` 指令里的绝对路径也会变。生成后跑一遍审计：

```bash
node tools/audit-logos-pipeline.js
```

### 路线 B：同步手改 `.mm`

按 Logos 的展开规则手写等价代码。规则：

| `.xm` 写法 | `.mm` 里的落点 |
| --- | --- |
| `%hook C` + `- (id)foo:(id)a` | `MSHookMessageEx(class, @selector(foo:), (IMP)&_logos_method$G$C$foo$, (IMP*)&_logos_orig$G$C$foo$)` |
| `%new - (void)bar` | `class_addMethod(class, @selector(bar), (IMP)&..., _typeEncoding)` |
| `%property (nonatomic,strong) id p` | 两个 `class_addMethod`：`p` / `setP:` |
| `%orig` | `_logos_orig$G$C$selector$(self, _cmd, ...)` |
| `%ctor { ... }` | `static __attribute__((constructor)) void _logosLocalCtor_xxxxxxxx(...)` |

改完同样跑审计脚本，它会把「`.xm` 声明了但 `.mm` 没注册」的点全部列出来。

## 5. 验证清单

装好之后按顺序过一遍：

1. **插件是否加载**：`设置 → 我的 → 设置`，能看到「版本 / 官网 / 总开关」分组 ⇒ dylib 已注入。
2. **总开关关闭**：设置项不出现、广告恢复 ⇒ hook 的 `%ctor` 判定正常。
3. **开屏 / 首页信息流 / 详情页 / 直播 / 搜索 / 动态** 各刷一遍，看广告是否消失、有无闪退。
4. **倍速功能**（仅 8.41.0 / 8.76.0）：播放页 → 倍速菜单，应出现 `3.0`。
5. **崩溃复现**：`设置 → 隐私 → 分析与改进 → 分析数据`，找 `BiliBiliMD-*.ips` 或 `JetsamEvent`。

## 6. 常见故障对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 编译过了但功能没变 | 只改了 `.xm` | 见第 4 节 |
| 启动即闪退 | 目标 App 未脱壳 / 架构不匹配 / `LC_LOAD_DYLIB` 路径错 | 换脱壳包；确认 `INSTALL_PATH` 与注入路径一致 |
| 某页面点进去就崩 | `return nil` 型 hook 撞上不判空的调用方 | 改成 `layoutSubviews` 里移除，或保留原值 |
| 设置里改开关无反应 | 开关只在 `%ctor` 读一次 | 杀进程重启 |
| 找不到 `LookinServer` 链接错误 | 未安装 Lookin | 装框架或换 Reveal |
| 报 `CocoaLumberjack.h` 找不到 | `MDMethodTrace.m` 里的 `#ifdef USE_DDLOG` 分支被打开 | 保持 `USE_DDLOG` 未定义即可；真要开就加 Pod |
| 版本兼容 handler 不生效 | 当前版本不在 `itemClasses` 里 | 加一个 `NJAppCompatible_x_y_z_Handler` |
| 倍速导致崩溃 | 偏移是按 8.41/8.76 定的 | 其它版本禁用兼容层 |

## 7. 提交前自检

```bash
node tools/audit-logos-pipeline.js || echo "管线漂移，先修再提交"
```

CI 同样跑这条（`.github/workflows/hook-pipeline.yml`），只依赖 Node，不需要 macOS。
