#!/usr/bin/env bash
# Records the README demo GIFs from the real Hunk TUI. No agent required.
#
#   ./demo/record.sh hero
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="${DEMO_WORK:-/tmp/hunk-commit-demo}"

# bun installs outside the default PATH of a non-login shell, and VHS spawns
# one; add its usual home so the preflight below reflects the machine, not the
# shell it happened to start in.
[ -d "$HOME/.bun/bin" ] && PATH="$HOME/.bun/bin:$PATH"
export PATH

for binary in vhs ttyd ffmpeg git jj hunk bun; do
  command -v "$binary" >/dev/null 2>&1 || {
    echo "missing: $binary" >&2
    exit 1
  }
done

tape="${1:-hero}"
backend=git
[ "$tape" = "into" ] && backend=jj

bun "$repo/demo/fixture.ts" --backend "$backend" --out "$work/cart" >/dev/null

# An isolated config is what keeps takes identical: no other extension of the
# recording machine's is loaded (one of them collides with `X`), no update
# notice dates the frame, and the theme is the one the tape pins. The tape
# exports the same path, so what it records is what is set up here.
export XDG_CONFIG_HOME="$work/config"
rm -rf "$XDG_CONFIG_HOME"
mkdir -p "$XDG_CONFIG_HOME/hunk"

# Installed rather than passed with --extension, because the command ids come
# from the folder name — an install is what users have, so it is what the
# demo should show.
hunk extension install "$repo" --yes >/dev/null
echo "fixture: $work/cart ($backend), extension installed into $XDG_CONFIG_HOME"

vhs "$repo/demo/$tape.tape"

gif="$repo/demo/$tape.gif"
[ -f "$gif" ] || { echo "no gif produced" >&2; exit 1; }

frames=$(ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames -of csv=p=0 "$gif")
seconds=$((frames / 12))

# The last frame must differ from the first: the failure this catches is a
# recording of a TUI that never painted or never took a keystroke, which is
# otherwise indistinguishable from a successful run.
shots="$work/verify"
rm -rf "$shots"
mkdir -p "$shots"
ffmpeg -loglevel error -i "$gif" -vf "select=eq(n\,0)" -vsync 0 "$shots/first.png"
ffmpeg -loglevel error -sseof -1 -i "$gif" -update 1 "$shots/last.png"
cmp -s "$shots/first.png" "$shots/last.png" &&
  { echo "nothing happened on screen: first and last frame are identical" >&2; exit 1; }

bytes=$(wc -c <"$gif")
echo "$tape.gif: $((bytes / 1024)) KiB, ${seconds}s, $frames frames"

# Over budget: fewer frames or a shorter take, never more columns — the GIF
# has to stay readable in GitHub's ~900px column.
[ "$bytes" -le 1572864 ] || { echo "over the 1.5 MB size budget" >&2; exit 1; }
[ "$seconds" -le 25 ] || { echo "longer than 25s: nobody watches to the end" >&2; exit 1; }
