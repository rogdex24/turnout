#!/bin/sh
# Rebuilds src/web/fonts/inter-rupee.woff2: Inter Variable (OFL) reduced to the rupee sign U+20B9,
# keeping the weight axis. Inter's latin file has no U+20B9; the package's latin-ext file has it but
# weighs 85 KB, so we ship this 1.2 KB subset behind a unicode-range instead. Needs fonttools and brotli:
#   python3 -m venv /tmp/ftv && /tmp/ftv/bin/pip install fonttools brotli
set -e
cd "$(dirname "$0")/.."
${PYFTSUBSET:-/tmp/ftv/bin/pyftsubset} node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2 \
  --unicodes=U+20B9 --flavor=woff2 --layout-features='*' --output-file=src/web/fonts/inter-rupee.woff2
