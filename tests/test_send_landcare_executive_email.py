import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("send_email", ROOT / "scripts" / "send_landcare_executive_email.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SendExecutiveEmailTests(unittest.TestCase):
    def test_payload_uses_html_and_configured_recipients(self):
        payload = MODULE.build_message("Morning brief", "<strong>hello</strong>", ["ops@example.org", "supervisor@example.org"])
        self.assertEqual(payload["message"]["body"]["contentType"], "HTML")
        self.assertEqual(
            [item["emailAddress"]["address"] for item in payload["message"]["toRecipients"]],
            ["ops@example.org", "supervisor@example.org"],
        )
        self.assertTrue(payload["saveToSentItems"])
