#!/bin/sh
# Rebuilds js/app.bundle.js after you change any other js file. Needs Node.js.
npx --yes esbuild js/app.js --bundle --format=iife --minify --outfile=js/app.bundle.js
