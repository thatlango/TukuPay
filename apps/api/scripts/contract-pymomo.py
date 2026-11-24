"""Run native TukuPay adapters against a loopback-only PyMoMo test gateway."""
import os
from pathlib import Path
import subprocess

from py_momo_sdk import __version__, start_mock_server_thread

if __version__ != "1.3.0":
    raise SystemExit("Install pinned py-momo-sdk==1.3.0")

root = Path(__file__).resolve().parents[3]
server, state, thread = start_mock_server_thread(host="127.0.0.1", port=0, default_status="SUCCESSFUL")
try:
    base = f"http://127.0.0.1:{server.server_address[1]}"
    # No inherited operator credentials are passed to the child.
    env = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "HOME") if key in os.environ}
    env.update({
        "TUKUPAY_FINANCIAL_ENVIRONMENT": "sandbox",
        "TUKUPAY_SIMULATOR_ENABLED": "false",
        "MTN_UG_BASE_URL": base,
        "MTN_UG_MODE": "sandbox",
        "MTN_UG_TARGET_ENVIRONMENT": "sandbox",
        "MTN_UG_API_USER": "mock-user",
        "MTN_UG_API_KEY": "mock-key",
        "MTN_UG_COLLECTION_SUBSCRIPTION_KEY": "mock-collection",
        "MTN_UG_DISBURSEMENT_SUBSCRIPTION_KEY": "mock-disbursement",
        "MTN_UG_CALLBACK_URL": "https://example.invalid/webhooks/mtn/UG",
        "AIRTEL_UG_BASE_URL": base,
        "AIRTEL_UG_MODE": "sandbox",
        "AIRTEL_UG_API_VERSION": "1",
        "AIRTEL_UG_CLIENT_ID": "mock-client",
        "AIRTEL_UG_CLIENT_SECRET": "mock-secret",
        "AIRTEL_UG_CALLBACK_URL": "https://example.invalid/webhooks/airtel/UG",
        "AIRTEL_UG_BALANCE_PATH": "/standard/v1/users/balance",
    })
    subprocess.run(["node", "apps/api/scripts/contract-pymomo.mjs"], cwd=root, env=env, check=True, timeout=120)
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
