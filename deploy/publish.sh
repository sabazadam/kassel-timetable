#!/bin/sh
# Scrape-and-publish on the mac-mini (scheduled one-shot or manual run): scrape eCampus, then publish the site to Cloudflare.
# The scraper exits non-zero when eCampus returns too little data; nothing is published then.
set -eu
export PATH=/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.."
if [ "${1:-}" != "--no-scrape" ]; then node scraper/scrape.js --fresh; fi
node deploy/build.js
npx wrangler deploy
