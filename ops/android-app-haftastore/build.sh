#!/bin/bash
# Builds the Trbhh Android app (TWA, package app.haftastore.com) with Bubblewrap, on the server.
# The upload key and its password stay in /root/trbhh-android/keys.
set -euo pipefail
WORK=/root/trbhh-android
mkdir -p "$WORK/project" "$WORK/icons"
cp "$WORK/src/twa-manifest.json" "$WORK/project/twa-manifest.json"
cp "$WORK/src/icon-512.png" "$WORK/src/maskable-512.png" "$WORK/icons/"
PASS="$(cat "$WORK/keys/password")"

cat > "$WORK/inner.sh" <<'INNER'
set -euo pipefail
(cd /icons && python3 -m http.server 8099 >/dev/null 2>&1 &)
sleep 1
npm i -g @bubblewrap/cli >/dev/null 2>&1
echo "bubblewrap $(npm ls -g @bubblewrap/cli --depth=0 2>/dev/null | grep -o 'cli@[0-9.]*')"
mkdir -p /root/.bubblewrap
printf '{"jdkPath":"%s","androidSdkPath":"%s"}' "$JAVA_HOME" "$ANDROID_HOME" > /root/.bubblewrap/config.json
cd /work
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "build-tools;34.0.0" "platforms;android-34" >/dev/null 2>&1 || true
set +o pipefail
yes | bubblewrap update --skipVersionUpgrade --manifest=./twa-manifest.json
set -o pipefail
./gradlew --no-daemon -q bundleRelease assembleRelease
BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
cp app/build/outputs/bundle/release/app-release.aab /work/trbhh.aab
jarsigner -keystore /keys/upload.jks -storepass "$KS_PASS" -keypass "$KS_PASS" /work/trbhh.aab trbhh-upload >/dev/null
"$BT/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk /work/trbhh-aligned.apk
"$BT/apksigner" sign --ks /keys/upload.jks --ks-key-alias trbhh-upload \
  --ks-pass env:KS_PASS --key-pass env:KS_PASS --out /work/trbhh.apk /work/trbhh-aligned.apk
rm -f /work/trbhh-aligned.apk /work/trbhh.apk.idsig
"$BT/apksigner" verify /work/trbhh.apk && echo "APK signature OK"
jarsigner -verify /work/trbhh.aab >/dev/null && echo "AAB signature OK"
grep -o 'targetSdkVersion [0-9]*\|targetSdk[ =]*[0-9]*' app/build.gradle | head -2
ls -la /work/trbhh.aab /work/trbhh.apk
INNER

docker run --rm -u root -e KS_PASS="$PASS" \
  -v "$WORK/project":/work -v "$WORK/keys":/keys -v "$WORK/icons":/icons -v "$WORK/inner.sh":/inner.sh:ro \
  cimg/android:2024.10.1-node bash /inner.sh
echo DONE
