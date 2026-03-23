"""
Vibrana GHL Direct API — Token Interception via Browser Session
Securely retrieves a GHL bearer token by intercepting authenticated network requests.
"""
import sys
import time
import json
import os
import requests

LOCATION_ID = os.environ.get('GHL_LOCATION_ID', 'GC3Q5eqwDKw2MhZQ0KSj')
SESSION_FILE = os.environ.get('GHL_SESSION_FILE', os.path.join(os.path.expanduser('~'), 'session.json'))


def dispatch_whatsapp_message(phone, msg_text):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"status": "error", "message": "Playwright not installed. Run: pip install playwright && playwright install chromium"}

    print(f"🚀 Launching BlueJax Network Interceptor for {phone}...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()

        if os.path.exists(SESSION_FILE):
            try:
                with open(SESSION_FILE, 'r') as f:
                    session_data = json.load(f)
                    if 'cookies' in session_data:
                        context.add_cookies(session_data['cookies'])
            except Exception:
                pass

        page = context.new_page()
        token = {"value": None}

        def handle_request(route, request):
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer ") and not token["value"]:
                token["value"] = auth_header.split(" ")[1]
            route.continue_()

        page.route("**/*", handle_request)
        page.goto(f"https://admin.bluejax.ai/v2/location/{LOCATION_ID}/")

        attempts = 0
        while not token["value"] and attempts < 60:
            time.sleep(1)
            attempts += 1

        if not token["value"]:
            browser.close()
            return {"status": "error", "message": "Failed to intercept GHL token."}

        headers = {
            "Authorization": f"Bearer {token['value']}",
            "Version": "2021-04-15",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        # Search Contact
        contact_id = None
        search_res = requests.get(
            f"https://services.leadconnectorhq.com/contacts/search/?query={phone}&locationId={LOCATION_ID}",
            headers=headers
        )

        if search_res.ok and search_res.json().get('contacts'):
            contact_id = search_res.json()['contacts'][0]['id']
        else:
            # Create Contact
            create_payload = {
                "name": "Vibrana Patient",
                "phone": phone,
                "locationId": LOCATION_ID
            }
            create_res = requests.post(
                "https://services.leadconnectorhq.com/contacts/",
                headers=headers,
                json=create_payload
            )
            if create_res.ok:
                contact_id = create_res.json()['contact']['id']
            else:
                browser.close()
                return {"status": "error", "message": "Failed to create contact."}

        # Send Message
        msg_payload = {
            "type": "WhatsApp",
            "contactId": contact_id,
            "message": msg_text
        }

        msg_res = requests.post(
            "https://services.leadconnectorhq.com/conversations/messages",
            headers=headers,
            json=msg_payload
        )

        browser.close()

        if msg_res.ok:
            return {"status": "success", "response": msg_res.json()}
        else:
            return {"status": "error", "message": msg_res.text}


if __name__ == "__main__":
    if len(sys.argv) > 2:
        # python ghl_direct_api.py "+52..." "Diagnostic Summary..."
        phone = sys.argv[1]
        msg = sys.argv[2]
        res = dispatch_whatsapp_message(phone, msg)
        print(json.dumps(res))
    else:
        print(json.dumps({"status": "error", "message": "Usage: python ghl_direct_api.py <phone> <message>"}))
