import os, json, requests

ZAPIER_HOOK = os.getenv("ZAPIER_HOOK")  # paste Catch Hook URL
def post_event(payload: dict):
  r = requests.post(ZAPIER_HOOK, json=payload, timeout=10)
  r.raise_for_status()
  return r.text

if __name__ == "__main__":
  print(post_event({"event":"email_sent","company":"ExampleCloud","email":"ana@example.com"}))
