"""Manual desktop smoke-test endpoint. Binds loopback only; never validates real credentials.

Run: python3 tests/fixtures/local_s3_server.py --directory /tmp/gopic-local-upload
Use any test key and a path-style S3 endpoint http://127.0.0.1:17642.
This fixture tests desktop transport/cache wiring, not cloud authentication.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=17642)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
args.directory.mkdir(parents=True, exist_ok=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not print Authorization headers, keys, or signed URLs.

    def do_PUT(self):
        relative = Path(unquote(urlsplit(self.path).path).lstrip('/'))
        if relative.is_absolute() or '..' in relative.parts:
            self.send_error(400)
            return
        target = args.directory / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        remaining = int(self.headers.get('Content-Length', '0'))
        digest = hashlib.md5()
        with target.open('wb') as output:
            while remaining:
                block = self.rfile.read(min(65536, remaining))
                if not block:
                    self.send_error(400)
                    return
                output.write(block)
                digest.update(block)
                remaining -= len(block)
        self.send_response(200)
        self.send_header('ETag', '"' + digest.hexdigest() + '"')
        self.send_header('Content-Length', '0')
        self.end_headers()
        print('Stored one test object', flush=True)

print(f'Local test endpoint ready on 127.0.0.1:{args.port}', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
