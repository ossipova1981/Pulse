#!/bin/bash
cd "$(dirname "$0")"
if [ -x ./node_modules/.bin/electron ]; then
  env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron .
else
  open index.html
fi
