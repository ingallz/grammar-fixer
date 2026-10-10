#!/bin/bash
# One-time setup: registers the native messaging host with Google Chrome (macOS).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.ingall.grammar_fixer"
EXT_ID="hiegmknmmhnjccehbfffanaaaiclleol"   # fixed by "key" in extension/manifest.json
NODE_BIN="$(command -v node)"
AGY_BIN="$(command -v agy || echo "$HOME/.local/bin/agy")"
[ -x "$NODE_BIN" ] || { echo "node not found"; exit 1; }
[ -x "$AGY_BIN" ] || { echo "agy not found"; exit 1; }

# Chrome starts hosts with a minimal PATH, so the wrapper pins absolute paths.
cat > "$DIR/host/run-host.sh" <<WRAP
#!/bin/bash
export HOME="$HOME"
export AGY_BIN="$AGY_BIN"
export PATH="$(dirname "$AGY_BIN"):$(dirname "$NODE_BIN"):/usr/bin:/bin"
exec "$NODE_BIN" "$DIR/host/grammar-host.js"
WRAP
chmod +x "$DIR/host/run-host.sh" "$DIR/host/grammar-host.js"

TARGET="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$TARGET"
cat > "$TARGET/$HOST_NAME.json" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Grammar Fixer host (agy -p)",
  "path": "$DIR/host/run-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON
echo "Installed host -> $TARGET/$HOST_NAME.json"
echo "Now load '$DIR/extension' in chrome://extensions (Developer mode > Load unpacked)."
