#!/bin/sh
# Copies the project to the deploy machine and publishes the
# site to Cloudflare (Workers static assets, see wrangler.jsonc). The mac-mini holds the Cloudflare
# login (wrangler OAuth token), so every publish runs there. Nothing on the mac-mini listens for
# incoming connections.
set -eu
HOST=${HOST:?set HOST to the ssh host of the deploy machine, e.g. HOST=my-server ./deploy/deploy.sh}
DEST=ders-programi
cd "$(dirname "$0")/.."
ssh "$HOST" "mkdir -p $DEST/deploy $DEST/scraper ~/Library/Logs/spacedevelopers"
# -u: a scrape run there may have written newer data on the mac-mini; keep it instead of an older local copy.
rsync -a -u --delete site/ "$HOST:$DEST/site/"
rsync -a --delete --exclude .cache scraper/ "$HOST:$DEST/scraper/"
rsync -a --delete worker/ "$HOST:$DEST/worker/"
rsync -a package.json package-lock.json wrangler.jsonc "$HOST:$DEST/"
rsync -a deploy/build.js deploy/publish.sh "$HOST:$DEST/deploy/"
ssh "$HOST" "export PATH=/opt/homebrew/bin:\$PATH
  cd $DEST && npm ci --silent
  sh deploy/publish.sh --no-scrape"
