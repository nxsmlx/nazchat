#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SDK=${ANDROID_HOME:-/opt/android-sdk}
BT="$SDK/build-tools/36.0.0"
PLAT="$SDK/platforms/android-36/android.jar"
B="$ROOT/nazchat-apk"

cp "$ROOT/nazchat/index.html" "$B/assets/index.html"
rm -rf "$B/obj" "$B/out"
mkdir -p "$B/obj" "$B/out"
javac -source 8 -target 8 -bootclasspath "$PLAT" -d "$B/obj" $(find "$B/src" -name '*.java')
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --lib "$PLAT" --output "$B/out" $(find "$B/obj" -name '*.class')
rm -f "$B/base.apk" "$B/NazChat.apk" "$B/compiled.flata"
"$BT/aapt2" compile --dir "$B/res" -o "$B/compiled.flata"
"$BT/aapt2" link -o "$B/base.apk" -I "$PLAT" \
  --manifest "$B/AndroidManifest.xml" --min-sdk-version 24 --target-sdk-version 34 \
  -A "$B/assets" "$B/compiled.flata" --version-code 13 --version-name 2.8.0
(cd "$B" && zip -qj base.apk out/classes.dex)
if [ -f "$B/nazchat.keystore" ]; then
  "$BT/apksigner" sign --ks "$B/nazchat.keystore" --ks-pass pass:nazchat123 --key-pass pass:nazchat123 --out "$B/NazChat.apk" "$B/base.apk"
else
  echo "Missing nazchat-apk/nazchat.keystore; generate a release key before signing." >&2
  exit 1
fi
cp "$B/NazChat.apk" "$ROOT/NazChat.apk"
"$BT/apksigner" verify "$ROOT/NazChat.apk"
echo "Built $ROOT/NazChat.apk"
