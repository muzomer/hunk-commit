# Committing demo: B commits the marked hunks with a description as well as a
# summary. Hunk's input dialog holds one line, so a body costs a second
# question — and only the key that promises one asks it.
#
# Run via ./demo/record.sh commit.

Output demo/commit.gif

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

Sleep 2200ms
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

# First question: the summary.
Type "B"
Sleep 1800ms
Type "fix: round the taxed total"
Sleep 600ms
Enter

# Second question, which only B asks: the description.
Sleep 1800ms
Type "Totals were carrying full float precision."
Sleep 600ms
Enter

Sleep 3s
