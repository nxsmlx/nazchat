#!/bin/sh
set -eu
LC_ALL=C
export LC_ALL
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}
BT="$SDK/build-tools/36.0.0"
PLAT="$SDK/platforms/android-36/android.jar"
B="$ROOT/nazchat-apk"
MANIFEST="$B/AndroidManifest.xml"
AAPT2=${AAPT2:-$BT/aapt2}
ZIPALIGN=${ZIPALIGN:-$BT/zipalign}
APKSIGNER_JAR=${APKSIGNER_JAR:-$BT/lib/apksigner.jar}
UNSIGNED_ONLY=${UNSIGNED_ONLY:-0}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

# Read literal attributes from the opening manifest tag using POSIX awk.
# Handles multiline tags, whitespace around '=' and either quote style.
manifest_attr() {
  awk -v attr="$1" '
    BEGIN { RS = ">"; quote = sprintf("%c", 39) }
    /<manifest[[:space:]]/ {
      text = $0
      sub(/^.*<manifest[[:space:]]+/, "", text)
      pattern = "(^|[[:space:]])" attr "[[:space:]]*=[[:space:]]*[\"" quote "]"
      if (match(text, pattern)) {
        delimiter = substr(text, RSTART + RLENGTH - 1, 1)
        value = substr(text, RSTART + RLENGTH)
        end = index(value, delimiter)
        if (end > 0) { print substr(value, 1, end - 1); found = 1 }
      }
      exit
    }
    END { if (!found) exit 1 }
  ' "$MANIFEST"
}

# Only return certificate digests after apksigner successfully verifies the APK.
# Fail closed if the output format is unexpected; compare all current signers.
signer_digests() {
  report=$(java -jar "$APKSIGNER_JAR" verify --print-certs "$1") || return 1
  digests=$(printf '%s\n' "$report" | awk '
    /^Signer #[0-9]+ certificate SHA-256 digest: / {
      digest = $NF
      if (length(digest) != 64 || digest ~ /[^0-9a-fA-F]/) invalid = 1
      print tolower(digest)
      count++
    }
    END { if (!count || invalid) exit 1 }
  ') || return 1
  printf '%s\n' "$digests" | sort
}

case "$UNSIGNED_ONLY" in
  0|1) ;;
  *) fail 'UNSIGNED_ONLY must be 0 or 1.' ;;
esac

# Never consult a keystore or signing passwords in unsigned mode.
if [ "$UNSIGNED_ONLY" = 0 ]; then
  KEYSTORE_PATH=${KEYSTORE_PATH:-$B/nazchat.keystore}
  [ -f "$KEYSTORE_PATH" ] || fail 'Existing release keystore required; no key will be generated.'
  [ -n "${KEYSTORE_PASSWORD:-}" ] || fail 'Set KEYSTORE_PASSWORD in the local environment.'
  [ -n "${KEY_PASSWORD:-}" ] || fail 'Set KEY_PASSWORD in the local environment.'
  export KEYSTORE_PASSWORD KEY_PASSWORD
  [ -f "$APKSIGNER_JAR" ] || fail "Missing apksigner JAR: $APKSIGNER_JAR"
  [ ! -L "$ROOT/NazChat.apk" ] || fail 'Refusing to replace a symlink at NazChat.apk.'
  [ ! -d "$ROOT/NazChat.apk" ] || fail 'NazChat.apk must not be a directory.'
  if [ -f "$ROOT/NazChat.apk" ]; then
    signer_digests "$ROOT/NazChat.apk" >/dev/null || fail 'Existing root APK could not be verified; preserving it.'
  fi
fi

[ -f "$PLAT" ] || fail "Missing SDK platform: $PLAT"
[ -f "$BT/lib/d8.jar" ] || fail "Missing D8: $BT/lib/d8.jar"
command -v "$AAPT2" >/dev/null 2>&1 || fail 'AAPT2 not found; set AAPT2 to a compatible native executable.'
command -v "$ZIPALIGN" >/dev/null 2>&1 || fail 'zipalign not found; set ZIPALIGN to a compatible native executable.'

PACKAGE_NAME=$(manifest_attr package) || fail 'Missing manifest package.'
VERSION_CODE=$(manifest_attr android:versionCode) || fail 'Missing manifest versionCode.'
VERSION_NAME=$(manifest_attr android:versionName) || fail 'Missing manifest versionName.'
[ "$PACKAGE_NAME" = com.nazchat.app ] || fail 'Package identity must remain com.nazchat.app.'
case "$VERSION_CODE" in
  ''|*[!0-9]*) fail 'Manifest versionCode must be a decimal integer.' ;;
esac
[ -n "$VERSION_NAME" ] || fail 'Manifest versionName must not be empty.'

mkdir -p "$B/assets"
cp "$ROOT/nazchat/index.html" "$B/assets/index.html"
rm -rf "$B/obj" "$B/out"
mkdir -p "$B/obj" "$B/out"
# Use relative paths so a workspace path containing spaces is safe. Project
# Java source filenames themselves must not contain whitespace or wildcards.
(
  cd "$B"
  javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLAT" -d obj $(find src -name '*.java')
  java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 \
    --lib "$PLAT" --output out $(find obj -name '*.class')
)
rm -f "$B/base.apk" "$B/unsigned.apk" "$B/compiled.flata" "$B/build-metadata.txt"
"$AAPT2" compile --dir "$B/res" -o "$B/compiled.flata"
"$AAPT2" link -o "$B/base.apk" -I "$PLAT" \
  --manifest "$MANIFEST" --min-sdk-version 24 --target-sdk-version 34 \
  -A "$B/assets" "$B/compiled.flata" --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"
(cd "$B" && zip -qj base.apk out/classes*.dex)
"$ZIPALIGN" -P 16 -f 4 "$B/base.apk" "$B/unsigned.apk"
"$ZIPALIGN" -c -P 16 4 "$B/unsigned.apk"
printf '%s\n' "package=$PACKAGE_NAME" "versionCode=$VERSION_CODE" \
  "versionName=$VERSION_NAME" 'compileSdk=36' 'buildTools=36.0.0' \
  'dexMinApi=24' > "$B/build-metadata.txt"

if [ "$UNSIGNED_ONLY" = 1 ]; then
  printf 'Built unsigned, aligned APK: %s\nRoot NazChat.apk was not changed.\n' "$B/unsigned.apk"
  exit 0
fi

# Password values never appear in command arguments. A multi-key keystore
# requires KEY_ALIAS; otherwise apksigner selects the sole key itself.
set -- sign --ks "$KEYSTORE_PATH" --ks-pass env:KEYSTORE_PASSWORD \
  --key-pass env:KEY_PASSWORD --v4-signing-enabled false
if [ -n "${KEY_ALIAS:-}" ]; then
  set -- "$@" --ks-key-alias "$KEY_ALIAS"
fi
# Remove only the old candidate path so signing cannot follow a stale symlink
# or overwrite the root APK through a hard-linked candidate.
rm -f "$B/NazChat.apk" "$B/NazChat.apk.idsig"
java -jar "$APKSIGNER_JAR" "$@" --out "$B/NazChat.apk" "$B/unsigned.apk"
"$ZIPALIGN" -c -P 16 4 "$B/NazChat.apk"
candidate_digests=$(signer_digests "$B/NazChat.apk") || fail 'Candidate APK verification failed; root APK was not changed.'

# Check again immediately before promotion. Never replace an existing release
# with an unverified APK or a different signing identity (no implicit rotation).
[ ! -L "$ROOT/NazChat.apk" ] || fail 'Refusing to replace a symlink at NazChat.apk.'
[ ! -d "$ROOT/NazChat.apk" ] || fail 'NazChat.apk must not be a directory.'
if [ -f "$ROOT/NazChat.apk" ]; then
  existing_digests=$(signer_digests "$ROOT/NazChat.apk") || fail 'Existing root APK verification failed; preserving it.'
  [ "$existing_digests" = "$candidate_digests" ] || fail 'Signing certificate mismatch; root APK was not changed.'
fi
PUBLISH_TMP=$(mktemp "$ROOT/.NazChat.apk.XXXXXX")
trap 'rm -f "$PUBLISH_TMP"' 0
trap 'exit 1' 1 2 15
cp "$B/NazChat.apk" "$PUBLISH_TMP"
chmod 644 "$PUBLISH_TMP"
mv -f "$PUBLISH_TMP" "$ROOT/NazChat.apk"
printf 'Built and verified %s (%s / %s)\n' "$ROOT/NazChat.apk" "$VERSION_NAME" "$VERSION_CODE"
