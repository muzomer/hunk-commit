# Discard demo: mark the money fix, press D, and watch it revert in the
# working copy — the opposite of staging, run on the marked hunks.
#
# Run via ./demo/record.sh discard.

Output demo/discard.gif

Set Shell bash
Set FontSize 16
Set Width 880
Set Height 640
Set Padding 10
Set Framerate 12
Set TypingSpeed 30ms

Hide
Type `export PS1="git-demo ~/cart> " XDG_CONFIG_HOME=/tmp/hunk-commit-demo/config HUNK_DISABLE_UPDATE_NOTICE=1` Enter
Type "cd /tmp/hunk-commit-demo/cart && clear" Enter
Show

Sleep 600ms
Type "hunk diff --theme github-dark" Enter

Sleep 2500ms
Hide
Type "?"
Sleep 800ms
Escape
Sleep 600ms
Show

Sleep 600ms
Type "]"
Sleep 700ms
Type "x"
Sleep 1200ms

# D names what is about to be lost, and in git it is not recoverable — the
# confirmation is the whole point of the frame.
Type "D"
Sleep 2500ms
Enter
Sleep 3s
