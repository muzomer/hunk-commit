# Hero demo: mark the two hunks of the money fix, commit just those, and watch
# the review reload with only the unrelated README typo left behind.
#
# Run via ./demo/record.sh hero — it builds the fixture, installs the
# extension into an isolated config, and verifies the result.

Output demo/hero.gif

Set Shell bash
Set FontSize 16
Set Width 880
Set Height 640
Set Padding 10
Set Framerate 12
Set TypingSpeed 30ms

# The prompt names the backend because a full-screen TUI hides everything else
# about where it is running, and `F` behaves differently in git and jj.
# XDG_CONFIG_HOME must match the one record.sh installed the extension into.
Hide
Type `export PS1="git-demo ~/cart> " XDG_CONFIG_HOME=/tmp/hunk-commit-demo/config HUNK_DISABLE_UPDATE_NOTICE=1` Enter
Type "cd /tmp/hunk-commit-demo/cart && clear" Enter
Show

Sleep 600ms
# Pinned theme: without it Hunk's background detection races the recording and
# takes come out light or dark at random.
Type "hunk diff --theme github-dark" Enter

# Hunk's own video pipeline documents that the first keypress after startup can
# be dropped. Absorb that race off-camera rather than losing a real key.
Sleep 2500ms
Hide
Type "?"
Sleep 800ms
Escape
Sleep 600ms
Show

# Walk to the two cart.ts hunks. The README typo is hunk 1 and is deliberately
# left unmarked — it is what proves the commit took only what was marked.
Sleep 600ms
Type "]"
Sleep 700ms
Type "x"
Sleep 900ms
Type "]"
Sleep 700ms
Type "x"
Sleep 1500ms

# Commit only what is marked. One question: the summary.
Type "C"
Sleep 1200ms
Type "fix: round the taxed total"
Sleep 600ms
Enter

# The reload is the point: the money fix is gone, the typo remains.
Sleep 3s
