"""
Production startup entrypoint for intranet usage.
Runs the Flask app behind waitress.
"""
from __future__ import annotations

import os
import socket
import threading
import time
from typing import List

from waitress import serve

from backend.app import create_app
from backend.config.settings import IMAGE_PATH, OUTPUT_FOLDER, UPLOAD_FOLDER


def _to_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        return int(raw)
    except ValueError:
        return default


def collect_ipv4_addresses() -> List[str]:
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


def print_banner(host: str, port: int, threads: int) -> None:
    print("=" * 80)
    print("BOM quotation system - intranet production server")
    print("=" * 80)
    print(f"Upload dir: {os.path.abspath(str(UPLOAD_FOLDER))}")
    print(f"Output dir: {os.path.abspath(str(OUTPUT_FOLDER))}")
    print(f"Logo path: {os.path.abspath(str(IMAGE_PATH))}")
    print(f"Listen on: {host}:{port}")
    print(f"Threads: {threads}")
    print("-" * 80)

    for ip in collect_ipv4_addresses():
        base = f"http://{ip}:{port}"
        print(f"Access URL: {base}")
        print(f"Login URL : {base}/frontend/login.html")

    print("-" * 80)
    print("Note: allow Windows Firewall TCP 5000 before sharing to intranet users.")
    print("=" * 80)


def _background_inquiry_cleanup():
    from backend.repositories.inquiry_repository import cleanup_expired_records
    while True:
        try:
            time.sleep(3600)
            cleanup_expired_records()
        except Exception as exc:
            print(f'[INQUIRY-CLEANUP] Background cleanup error: {exc}')


def run_server() -> None:
    host = os.getenv("KS_SERVER_HOST", "0.0.0.0").strip() or "0.0.0.0"
    port = _to_int("KS_SERVER_PORT", 5000)
    threads = _to_int("KS_WAITRESS_THREADS", 8)
    connection_limit = _to_int("KS_WAITRESS_CONNECTION_LIMIT", 200)

    app = create_app()
    cleanup_thread = threading.Thread(target=_background_inquiry_cleanup, daemon=True)
    cleanup_thread.start()
    print_banner(host, port, threads)
    serve(
        app,
        host=host,
        port=port,
        threads=threads,
        connection_limit=connection_limit,
    )


if __name__ == "__main__":
    run_server()
