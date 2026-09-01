# Into demo (jj): mark the money fix, press F, pick the commit it belongs to,
# and watch `jj squash` land it immediately.
#
# jj rather than git because jj's squash completes on screen; git's path ends
# on "now go run this rebase command", which is a dead final frame.
#
# Run via ./demo/record.sh into.

Output demo/into.gif

Set Shell bash
Set FontSize 16
Set Width 880
Set Height 640
Set Padding 10
Set Framerate 12
Set TypingSpeed 30ms

Hide
Type `export PS1="jj-demo ~/cart> " XDG_CONFIG_HOME=/tmp/hunk-commit-demo/config HUNK_DISABLE_UPDATE_NOTICE=1` Enter
Type `export JJ_CONFIG=/tmp/hunk-commit-demo/jjconfig.toml` Enter
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

# F offers only the commits that can still be changed.
Type "F"
Sleep 2200ms
Enter

# Then it confirms, naming the revision and the `jj undo` that reverses it.
Sleep 2500ms
Enter

# In jj the squash happens now: the hunk is gone from the working copy.
Sleep 3s
