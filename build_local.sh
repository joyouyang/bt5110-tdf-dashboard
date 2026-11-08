#!/bin/sh
# Wraps page.html into the index.html served locally.
cd "$(dirname "$0")"
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>\n'; cat page.html; printf '\n</body></html>\n'; } > index.html
