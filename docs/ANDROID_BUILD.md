# Build Android unsigned dan signing tempatan

## Sempadan keselamatan

- CI hanya menghasilkan APK **unsigned**; APK ini belum boleh dipasang sebagai kemas kini.
- Keystore asal dan kata laluan kekal pada mesin tempatan. Jangan masukkannya ke Git, GitHub Secrets, input workflow, log atau artifact.
- Workflow tidak menandatangani, menerbitkan release, menaikkan versi atau menggantikan `NazChat.apk` pada root repositori.
- Kekalkan package `com.nazchat.app` dan sijil signing asal untuk pemasangan sebagai kemas kini. Keystore baharu bukan pengganti keystore asal.
- `nazchat-apk/AndroidManifest.xml` ialah sumber `versionCode` dan `versionName`. Skrip membaca atribut menggunakan POSIX `awk`, tanpa Python. Pemilik release perlu menetapkan `versionCode` yang lebih tinggi sebelum build naik taraf; skrip tidak menaikkannya secara automatik.

## Toolchain

CI menggunakan `ubuntu-24.04` **x86_64**, Temurin **JDK 17**, platform **android-36**, dan Build Tools **36.0.0**. Aliran manual dikekalkan:

```text
javac (Java 8 bytecode) → D8 (--min-api 24) → aapt2 → zip → zipalign → [signing tempatan]
```

Compile SDK 36 tidak bermakna target SDK dinaikkan: tetapan aplikasi dalam manifest dikekalkan (minimum 24, target 34 pada masa dokumentasi ini ditulis). `zipalign -P 16 ... 4` dijalankan sebelum signing; jangan ubah kandungan ZIP atau jalankan alignment semula selepas signing.

Untuk build tempatan, sediakan JDK 17 (`java`, `javac`), `zip`, POSIX shell/utilities, Android SDK dan binari native `aapt2`/`zipalign` yang sesuai dengan mesin. SDK rasmi Linux menggunakan x86_64; ia tidak terus berjalan sebagai binari ARM Android.

| Pemboleh ubah | Kegunaan / lalai |
| --- | --- |
| `ANDROID_HOME` | Lokasi SDK; jika kosong, guna `ANDROID_SDK_ROOT`, kemudian `/opt/android-sdk` |
| `AAPT2` | Opsyen: laluan/binari native; lalai `$SDK/build-tools/36.0.0/aapt2` |
| `ZIPALIGN` | Opsyen: laluan/binari native yang menyokong `-P 16`; lalai `$SDK/build-tools/36.0.0/zipalign` |
| `APKSIGNER_JAR` | Opsyen signing tempatan; lalai `$SDK/build-tools/36.0.0/lib/apksigner.jar` |
| `UNSIGNED_ONLY` | `1`: berhenti selepas alignment; `0` (lalai): build dan sign tempatan |
| `KEYSTORE_PATH` | Keystore sedia ada untuk signing; lalai `nazchat-apk/nazchat.keystore` |
| `KEYSTORE_PASSWORD` | Wajib dalam environment untuk signing sahaja |
| `KEY_PASSWORD` | Wajib dalam environment untuk signing sahaja |
| `KEY_ALIAS` | Opsyen; wajib jika keystore mempunyai lebih daripada satu key |

Override binari menerima satu nama/laluan executable, bukan arahan shell beserta flags. Lokasi workspace boleh mengandungi ruang; nama fail sumber Java sendiri mesti bebas daripada whitespace dan wildcard.

## Build unsigned tempatan

Jalankan dari root repositori:

```sh
ANDROID_HOME=/path/to/android-sdk UNSIGNED_ONLY=1 sh build.sh
```

Aset produksi disalin semula setiap build melalui allowlist: `nazchat/index.html`, `studio.css`, `studio.js`, `comfort.js`, `provider-picker.js` dan direktori library terbundel `nazchat/vendor/` → `nazchat-apk/assets/` (direktori ini dijana dan tidak di-commit). Semua fail wajib wujud; symlink ditolak. `design-lab/` tidak dibungkus. App tidak memuatkan skrip dari CDN semasa runtime.

Output utama ialah `nazchat-apk/unsigned.apk`, sudah aligned. `nazchat-apk/build-metadata.txt` merekodkan package, versi dan toolchain. Dalam mod ini skrip tidak memerlukan/membaca keystore atau kata laluan, tidak menjalankan signing dan tidak menyentuh root `NazChat.apk`.

Jika perlu, tetapkan `AAPT2=/path/to/native/aapt2` dan `ZIPALIGN=/path/to/native/zipalign` dalam environment. Build biasa masih memerlukan platform JAR dan D8 daripada SDK 36.0.0.

## Jalankan CI secara manual

1. Pemilik repositori perlu menyemak dan commit/push fail workflow terlebih dahulu. `workflow_dispatch` perlu tersedia pada default branch untuk dicetuskan melalui GitHub.
2. Buka **Actions → Build Android (unsigned) → Run workflow**, pilih ref yang telah disemak, kemudian jalankan. Tiada input keystore atau kata laluan.
3. Workflow menyediakan JDK 17, memastikan lesen/pakej SDK melalui `sdkmanager`, kemudian menjalankan `sh build.sh` dengan `UNSIGNED_ONLY=1`.
4. CI memeriksa alignment dan metadata APK melalui `aapt2 dump badging`: package mesti `com.nazchat.app`, dan kedua-dua versi mesti sama dengan nilai manifest yang diekstrak oleh skrip. APK yang berjaya disahkan sebagai signed ditolak.
5. Muat turun artifact **`nazchat-unsigned-<run_id>-<run_attempt>`** daripada run yang berjaya, dalam tempoh **7 hari**.

Satu job mempunyai timeout **15 minit**, kebenaran token hanya `contents: read`, dan checkout menggunakan `persist-credentials: false`. Tiada push/PR trigger, signing secrets, cache keystore atau langkah publish. Action menggunakan tag rasmi `@v4` yang didokumenkan, bukan SHA yang tidak disahkan.

Artifact mengandungi fail berikut sahaja, pada root arkib:

- `unsigned.apk` — APK aligned, belum signed.
- `apksigner.jar` — alat Java daripada SDK Build Tools 36.0.0, **bukan keystore**; boleh dijalankan dengan JDK 17 tempatan tanpa binari x86_64.
- `build-metadata.txt` — package/versi, toolchain, commit SHA dan identiti run.
- `badging.txt` — output pemeriksaan package daripada `aapt2`.
- `SHA256SUMS` — checksum empat fail di atas.

Fail staging berada dalam `nazchat-apk/ci-artifact/` yang diabaikan Git. Upload menggunakan senarai laluan fail khusus, bukan seluruh workspace atau direktori `nazchat-apk/`. `.gitignore` bukan perlindungan terhadap fail rahsia yang sudah tracked; jangan force-add bahan signing.

## Sign artifact pada mesin tempatan

Agen utama/pemilik release melakukan langkah ini **selepas** keystore asal disahkan secara tempatan. Tidak perlu membina semula sumber atau memuat naik key ke CI.

1. Ekstrak artifact yang dipercayai ke `nazchat-apk/ci-artifact/`. Semak commit SHA/run dan versi dalam metadata dengan release yang dimaksudkan; jangan `source` metadata sebagai shell script.
2. Semak checksum, dan jika native `aapt2`/`zipalign` tersedia, ulangi pemeriksaan package/alignment. Checksum mengesan kerosakan pemindahan, bukan bukti kepercayaan jika artifact dan checksum kedua-duanya diganti.
3. Sediakan `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD` dan jika perlu `KEY_ALIAS` dalam environment tempatan melalui kaedah rahsia yang selamat. Jangan letakkan nilai kata laluan dalam command line, shell history, fail committed atau log; jangan gunakan `set -x`.
4. Contoh berikut dijalankan dari root repositori dalam shell tempatan, bukan GitHub Actions:

```sh
set -eu
ART="$PWD/nazchat-apk/ci-artifact"
: "${KEYSTORE_PATH:?Set the path to the verified original keystore locally}"
: "${KEYSTORE_PASSWORD:?Set the keystore password locally}"
: "${KEY_PASSWORD:?Set the key password locally}"
test -f "$KEYSTORE_PATH"
export KEYSTORE_PASSWORD KEY_PASSWORD
(cd "$ART" && sha256sum -c SHA256SUMS)

set -- sign --ks "$KEYSTORE_PATH" \
  --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEY_PASSWORD \
  --v4-signing-enabled false
if [ -n "${KEY_ALIAS:-}" ]; then
  set -- "$@" --ks-key-alias "$KEY_ALIAS"
fi
java -jar "$ART/apksigner.jar" "$@" \
  --out "$ART/NazChat-candidate.apk" "$ART/unsigned.apk"
java -jar "$ART/apksigner.jar" verify --verbose --print-certs \
  "$ART/NazChat-candidate.apk"
unset KEYSTORE_PASSWORD KEY_PASSWORD
```

`--v4-signing-enabled false` mengelakkan fail `.idsig` berasingan; signing v2/v3 dipilih oleh `apksigner` berdasarkan manifest. Jangan salin calon ke root dahulu.

### Sahkan identiti sebelum menggantikan APK sedia ada

Jika root `NazChat.apk` wujud, kedua-dua APK mesti lulus `apksigner verify`. Bandingkan **certificate SHA-256 digest** setiap signer (bukan checksum APK, public key digest atau source stamp). Jangan membenarkan key rotation secara tersirat. Contoh semakan tempatan:

```sh
set -eu
ART="$PWD/nazchat-apk/ci-artifact"
certificate_digests() {
  report=$(java -jar "$ART/apksigner.jar" verify --print-certs "$1") || return 1
  digests=$(printf '%s\n' "$report" | awk '
    /^Signer #[0-9]+ certificate SHA-256 digest: / {
      digest = $NF
      if (length(digest) != 64 || digest ~ /[^0-9a-fA-F]/) invalid = 1
      print tolower(digest)
      count++
    }
    END { if (!count || invalid) exit 1 }
  ') || return 1
  printf '%s\n' "$digests" | LC_ALL=C sort
}
old=$(certificate_digests NazChat.apk)
new=$(certificate_digests "$ART/NazChat-candidate.apk")
if [ "$old" != "$new" ]; then
  printf '%s\n' 'Certificate mismatch: preserve NazChat.apk; do not publish.' >&2
  exit 1
fi
printf '%s\n' 'Both APKs verify and the signing certificates match.'
```

Jika root APK tiada, dapatkan sijil rujukan daripada APK release dipercayai/aplikasi terpasang sebelum publish. Agen utama masih perlu mengesahkan package sama, `versionCode` meningkat, dan tingkah laku pemasangan naik taraf. Hanya selepas semua semakan lulus barulah agen utama mempromosikan calon kepada root `NazChat.apk` dan menerbitkan release melalui proses berasingan. Dokumen ini sengaja tidak memberikan arahan publish automatik.

## Build penuh dan signing tempatan melalui `build.sh`

Selepas environment signing di atas disediakan:

```sh
export KEYSTORE_PASSWORD KEY_PASSWORD
UNSIGNED_ONLY=0 sh build.sh
unset KEYSTORE_PASSWORD KEY_PASSWORD
```

Skrip gagal jika key atau kata laluan tiada; ia **tidak menjana key baharu**. Ia memanggil `java -jar apksigner.jar` dengan sumber kata laluan `env:`, mengesahkan calon, kemudian mengesahkan root APK sedia ada dan membandingkan semua certificate SHA-256 digest sebelum menggantikannya secara atomic. Jika verifikasi gagal, sijil berbeza atau format digest tidak dikenali, root APK dikekalkan. Symlink/direktori pada laluan root APK ditolak.

Semakan sijil ini tersedia dalam build signed biasa. Signing artifact menggunakan arahan manual di atas tidak melalui `build.sh`, jadi agen utama wajib melakukan perbandingan sebelum penggantian. Tiada semakan automatik bahawa `versionCode` lebih tinggi daripada release terdahulu; tanggungjawab itu kekal pada pemilik release.

## Rujukan alat

- [Android sdkmanager](https://developer.android.com/tools/sdkmanager)
- [D8](https://developer.android.com/tools/d8)
- [AAPT2](https://developer.android.com/tools/aapt2)
- [zipalign](https://developer.android.com/tools/zipalign)
- [apksigner](https://developer.android.com/tools/apksigner)
- [Ubuntu 24.04 runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
- [checkout v4](https://github.com/actions/checkout/tree/v4), [setup-java v4](https://github.com/actions/setup-java/tree/v4), [upload-artifact v4](https://github.com/actions/upload-artifact/tree/v4)
