"""
email_send.py — compliant(ish) SMTP sender for small-batch outbound.

Notes:
- Keep volumes low and ramp gradually; respect provider sending limits.
- CAN-SPAM: truthful headers, non-deceptive subject, opt-out, honor within 10 business days. (FTC)
- For EU/UK prospects, ensure GDPR/ePrivacy lawful basis and transparency.

Google Workspace docs list daily sending limits; exceeding can cause suspension or throttling.
"""

import csv
import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from pathlib import Path

LEADS_CSV = Path("assets/data/leads.csv")
UNSUB_CSV = Path("assets/data/unsubscribes.csv")
EMAIL_TEMPLATE = Path("assets/templates/email1.html")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")  # e.g. outreach@asteriacapital.org
SMTP_PASS = os.getenv("SMTP_PASS")  # app password or SMTP password
FROM_NAME = os.getenv("FROM_NAME", "Asteria Capital")
REPLY_TO = os.getenv("REPLY_TO", SMTP_USER or "")

SEND_LIMIT = int(os.getenv("SEND_LIMIT", "30"))   # per run safety limit
SLEEP_SEC = float(os.getenv("SLEEP_SEC", "25"))   # throttle

def load_unsubs() -> set[str]:
  if not UNSUB_CSV.exists():
    return set()
  with UNSUB_CSV.open(newline="", encoding="utf-8") as f:
    return {row["email"].strip().lower() for row in csv.DictReader(f) if row.get("email")}

def load_leads():
  with LEADS_CSV.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
      yield row

def render_html(tpl: str, lead: dict) -> str:
  return (tpl
    .replace("{first}", lead.get("first_name",""))
    .replace("{company}", lead.get("company",""))
    .replace("{role}", lead.get("role",""))
    .replace("{trigger}", lead.get("trigger",""))
    .replace("{segment}", lead.get("segment",""))
    .replace("{pain_area}", lead.get("segment","execution"))
    .replace("{sender_name}", FROM_NAME)
    .replace("{optout_line}", "Reply 'unsubscribe' and I’ll stop."))

def main():
  assert SMTP_USER and SMTP_PASS, "Set SMTP_USER and SMTP_PASS env vars."

  unsubs = load_unsubs()
  html_tpl = EMAIL_TEMPLATE.read_text(encoding="utf-8")

  ctx = ssl.create_default_context()
  sent = 0

  with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
    server.starttls(context=ctx)
    server.login(SMTP_USER, SMTP_PASS)

    for lead in load_leads():
      if sent >= SEND_LIMIT:
        break

      email_addr = (lead.get("email") or "").strip().lower()
      status = (lead.get("status") or "").upper()

      if status != "NEW":
        continue
      if not email_addr or "@" not in email_addr:
        continue
      if email_addr in unsubs:
        continue

      msg = EmailMessage()
      msg["From"] = f"{FROM_NAME} <{SMTP_USER}>"
      msg["To"] = email_addr
      msg["Reply-To"] = REPLY_TO
      msg["Subject"] = f"Quick question about {lead.get('company','')} hiring"
      msg.set_content("This email requires an HTML-capable client.")
      msg.add_alternative(render_html(html_tpl, lead), subtype="html")

      server.send_message(msg)
      sent += 1
      print(f"Sent {sent}: {email_addr} ({lead.get('company','')})")
      time.sleep(SLEEP_SEC)

if __name__ == "__main__":
  main()
