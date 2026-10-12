#!/usr/bin/env bash
# Membangun zip Magisk module KangManis per-ABI.
# Env yang dibutuhkan:
#   ANDROID_NDK_HOME : path Android NDK
#   NMDIR            : hasil ekstrak nodejs-mobile android (berisi bin/ dan include/)
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$PKG_DIR/../.." && pwd)"
NMDIR="${NMDIR:?set NMDIR ke folder nodejs-mobile android}"
NDK="${ANDROID_NDK_HOME:?set ANDROID_NDK_HOME}"
API=23
OUTDIR="${OUTDIR:-$ROOT/packaging/build/magisk}"
PAYLOAD="$ROOT/packaging/build/payload"
SKELETON="$PKG_DIR/module"

echo "== Merakit payload Magisk =="
TARGET=magisk OUT="$PAYLOAD" bash "$ROOT/packaging/assemble-payload.sh"

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

declare -A TOOLCHAIN=(
  [arm64-v8a]="aarch64-linux-android"
  [armeabi-v7a]="armv7a-linux-androideabi"
  [x86_64]="x86_64-linux-android"
)
declare -A STLTRIPLE=(
  [arm64-v8a]="aarch64-linux-android"
  [armeabi-v7a]="arm-linux-androideabi"
  [x86_64]="x86_64-linux-android"
)

for abi in arm64-v8a armeabi-v7a x86_64; do
  echo "== [$abi] build launcher =="
  work="$OUTDIR/$abi"
  stage="$work/stage"
  mkdir -p "$stage/bin"

  cmake -S "$PKG_DIR/launcher" -B "$work/cmake" \
    -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI="$abi" \
    -DANDROID_PLATFORM="android-$API" \
    -DANDROID_STL=c++_shared \
    -DNODE_INCLUDE="${NODE_INCLUDE:-$NMDIR/include/node}" \
    -DNODE_LIB="$NMDIR/bin/$abi/libnode.so" \
    -DCMAKE_BUILD_TYPE=Release
  cmake --build "$work/cmake" -j"$(nproc)"

  find "$work/cmake" -name launcher -type f -exec cp {} "$stage/bin/launcher" \;
  if [ ! -f "$stage/bin/launcher" ]; then
    echo "launcher tidak ditemukan untuk $abi" >&2
    exit 1
  fi

  if command -v patchelf >/dev/null 2>&1; then
    patchelf --set-rpath '$ORIGIN' "$stage/bin/launcher" || true
  fi

  cp "$NMDIR/bin/$abi/libnode.so" "$stage/bin/libnode.so"
  cp "$NDK/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/${STLTRIPLE[$abi]}/libc++_shared.so" \
     "$stage/bin/libc++_shared.so"

  # skeleton module + payload + bin
  cp -r "$SKELETON/." "$stage/"
  mkdir -p "$stage/app"
  cp -r "$PAYLOAD/." "$stage/app/"

  echo "$abi" > "$stage/abi"

  chmod 0755 "$stage/service.sh" "$stage/post-fs-data.sh" "$stage/uninstall.sh" "$stage/customize.sh" "$stage/bin/launcher"

  # zip (isi di root)
  (
    cd "$stage"
    zip -r -q "$OUTDIR/kangmanis-magisk-$abi.zip" .
  )
  echo "-> $OUTDIR/kangmanis-magisk-$abi.zip"
done

echo "== Selesai =="
ls -lh "$OUTDIR"/*.zip
