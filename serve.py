# -*- coding: utf-8 -*-
import os
import socket
import sys

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT_DIR)

from waitress import serve


def _to_int(name, default):
    raw = os.getenv(name, str(default)).strip()
    try:
        return int(raw)
    except ValueError:
        return default


def collect_ipv4_addresses():
    addresses = {"127.0.0.1", "localhost"}
    try:
        host_name = socket.gethostname()
        for item in socket.getaddrinfo(host_name, None, socket.AF_INET, socket.SOCK_STREAM):
            ip = item[4][0]
            if ip:
                addresses.add(ip)
    except OSError:
        pass
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        addresses.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    ordered = []
    for ip in sorted(addresses):
        if ip not in ordered:
            ordered.append(ip)
    return ordered


def print_banner(host, port, threads):
    print("=" * 80)
    print("BOM - new_backend")
    print("=" * 80)
    for ip in collect_ipv4_addresses():
        base = f"http://{ip}:{port}"
        print(f"  URL: {base}")
        print(f"  Login: {base}/frontend/login.html")
    print(f"  Port: {port}  Threads: {threads}")
    print("=" * 80)


def run_server():
    host = os.getenv("KS_SERVER_HOST", "0.0.0.0").strip() or "0.0.0.0"
    port = _to_int("KS_SERVER_PORT", 5000)
    threads = _to_int("KS_WAITRESS_THREADS", 8)
    connection_limit = _to_int("KS_WAITRESS_CONNECTION_LIMIT", 200)

    from new_backend.app import create_app
    app = create_app()

    print_banner(host, port, threads)
    serve(app, host=host, port=port, threads=threads, connection_limit=connection_limit)


if __name__ == "__main__":
    run_server()
