#!/bin/sh
# Quick standalone check of the pure planning engine (no node_modules needed)
tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2020 --module commonjs src/lib/scheduling.ts src/lib/dates.ts src/lib/types.ts && echo "engine OK"
