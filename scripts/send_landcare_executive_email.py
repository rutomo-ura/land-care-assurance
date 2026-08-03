"""Deliver the generated LandCare HTML morning brief through Microsoft 365 Graph."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_RECIPIENTS = ""


def post_json(url: str, payload: dict, headers: dict[str, str]) -> dict:
    request = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urlopen(request, timeout=30) as response:  # nosec B310 - endpoints are fixed Microsoft HTTPS hosts
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}


def get_access_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    request = Request(
        f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
        data=urlencode(
            {"client_id": client_id, "client_secret": client_secret, "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"}
        ).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:  # nosec B310 - fixed Microsoft HTTPS endpoint
        token_payload = json.loads(response.read().decode("utf-8"))
    return token_payload["access_token"]


def build_message(subject: str, html: str, recipients: list[str]) -> dict:
    return {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html},
            "toRecipients": [{"emailAddress": {"address": address}} for address in recipients],
        },
        "saveToSentItems": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Send the LandCare executive HTML email through Microsoft 365 Graph.")
    parser.add_argument("--html", type=Path, required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--recipients", default=os.environ.get("LANDCARE_EMAIL_RECIPIENTS", DEFAULT_RECIPIENTS))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    recipients = [address.strip() for address in args.recipients.split(",") if address.strip()]
    if not recipients:
        raise SystemExit("At least one recipient is required.")
    html = args.html.read_text(encoding="utf-8")
    if args.dry_run:
        print(json.dumps(build_message(args.subject, html, recipients), indent=2))
        return

    required = {name: os.environ.get(name, "") for name in ("M365_TENANT_ID", "M365_CLIENT_ID", "M365_CLIENT_SECRET", "M365_SENDER_UPN")}
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise SystemExit(f"Missing Microsoft 365 Graph configuration: {', '.join(missing)}")
    token = get_access_token(required["M365_TENANT_ID"], required["M365_CLIENT_ID"], required["M365_CLIENT_SECRET"])
    post_json(
        f"https://graph.microsoft.com/v1.0/users/{required['M365_SENDER_UPN']}/sendMail",
        build_message(args.subject, html, recipients),
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    print(f"Sent LandCare executive email to {', '.join(recipients)}")


if __name__ == "__main__":
    main()
