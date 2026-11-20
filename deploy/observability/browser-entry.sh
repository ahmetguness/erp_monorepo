#!/bin/sh
set -eu
# A real window manager makes minimize/visibility lifecycle observable in Xvfb.
openbox --sm-disable > /tmp/quality-window-manager.log 2>&1 &
quality_wm_pid=$!
trap 'kill "$quality_wm_pid" 2>/dev/null || true' EXIT
quality_attempt=0
until xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id'; do
    quality_attempt=$((quality_attempt + 1))
    if [ "$quality_attempt" -ge 30 ]; then
        printf '%s\n' 'Virtual display window manager did not become ready' >&2
        exit 1
    fi
    sleep 0.1
done
"$@"
