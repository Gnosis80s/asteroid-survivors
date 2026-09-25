#!/usr/bin/env python3
# Dev server. python3 -m http.server sends no cache-control, so Chromium
# heuristically caches ES modules and can serve a stale config.js next to a
# fresh state.js (mixed module cache -> TypeError at startRun). Serve with
# no-store so reloads always get the current files.
import functools
import http.server
import socketserver

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

with socketserver.ThreadingTCPServer(("", PORT), functools.partial(Handler)) as httpd:
    print(f"Serving http://localhost:{PORT}  (no-cache)")
    httpd.serve_forever()