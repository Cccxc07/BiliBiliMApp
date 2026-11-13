#!/bin/bash
#
# build-dylib.command —— 只编译 libBiliBiliMDDylib.dylib（给巨魔注入器用）
#
# 特点：不需要脱壳 App、不打包 IPA、不改目标二进制，产物就是一个 .dylib。
#
# 用法：
#   chmod +x build-dylib.command
#   ./build-dylib.command
#
# 前置：macOS + Xcode + MonkeyDev（默认 /opt/MonkeyDev）+ Theos（默认 /opt/theos）
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"

echo "==> 工程根目录: $ROOT"

command -v xcodebuild >/dev/null 2>&1 || { echo "!! 未找到 xcodebuild，请先装 Xcode"; exit 1; }

if [ ! -d "/opt/MonkeyDev" ]; then
  echo "!! 未检测到 /opt/MonkeyDev"
  echo "   安装: git clone https://github.com/AloneMonkey/MonkeyDev.git && cd MonkeyDev && ./install.sh"
  exit 1
fi
[ -d "/opt/theos" ] || echo "==> 提示: 未检测到 /opt/theos，若报 substrate 头文件缺失再装 Theos"

# 管线自检：.xm 与 .mm 是否一致（防止改了源却没生成）
if command -v node >/dev/null 2>&1; then
  echo "==> 检查 Logos 管线一致性"
  node tools/audit-logos-pipeline.js || {
    echo "!! 管线审计未通过：.xm 与 .mm 不一致，先按 docs/BUILD.md 第 4 节处理"
    exit 1
  }
fi

DYLIB_NAME="libBiliBiliMDDylib.dylib"

echo "==> 编译 dylib（Release 配置，避免依赖 LookinServer / Cycript 运行时）"
xcodebuild \
  -project BiliBiliMD.xcodeproj \
  -target BiliBiliMDDylib \
  -configuration Release \
  -sdk iphoneos \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

# ---------- 找产物 ----------
CANDIDATES=(
  "$ROOT/build/Release-iphoneos/$DYLIB_NAME"
  "$ROOT/build/Release-iphoneos/BiliBiliMDDylib/$DYLIB_NAME"
)
FOUND=""
for c in "${CANDIDATES[@]}"; do
  if [ -f "$c" ]; then FOUND="$c"; break; fi
done
if [ -z "$FOUND" ]; then
  FOUND="$(find "$ROOT/build" ~/Library/Developer/Xcode/DerivedData -name "$DYLIB_NAME" -newermt '-15 minutes' -print -quit 2>/dev/null || true)"
fi
if [ -z "$FOUND" ]; then
  echo "!! 没找到 $DYLIB_NAME，请到 Xcode 的 Products 目录确认"
  exit 1
fi

OUT="$HOME/Desktop/$DYLIB_NAME"
cp -f "$FOUND" "$OUT"

echo ""
echo "=================================================="
echo " 产物: $OUT"
echo "=================================================="
if command -v lipo >/dev/null 2>&1; then
  echo -n " 架构: "; lipo -info "$OUT" || true
fi
echo " 大小: $(du -h "$OUT" | cut -f1)"
echo ""
echo " 下一步（无需 Mac）："
echo "   1. 把 $DYLIB_NAME 传到手机（微信/QQ/AirDrop 都可以）"
echo "   2. TrollFools 里选中哔哩哔哩 → 注入 → 选择这个 dylib"
echo "   3. 杀掉哔哩哔哩进程重开，进 我的 → 设置，应看到「直播间-保留观看人数/醒目留言」"
echo ""
