"""
Vibrana GHL Token Test Script
Uses environment variables for token security.
"""
import os
import requests

TOKEN = os.environ.get('GHL_API_TOKEN', '')
LOCATION_ID = os.environ.get('GHL_LOCATION_ID', 'GC3Q5eqwDKw2MhZQ0KSj')
TEST_PHONE = os.environ.get('GHL_TEST_PHONE', '+526391233367')

if not TOKEN:
    print("❌ GHL_API_TOKEN environment variable not set.")
    print("   Set it: $env:GHL_API_TOKEN='pit-xxxx-xxxx...'")
    exit(1)

MSG_TEXT = "Hello! Vibrana AI WhatsApp API test — token authentication verified. 🚀"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Version": "2021-07-28",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

print("🔍 Searching for contact...")
search_res = requests.get(
    f"https://services.leadconnectorhq.com/contacts/search/duplicate?locationId={LOCATION_ID}&number={TEST_PHONE}",
    headers=headers
)

print(f"Search Response: {search_res.status_code}")

contact_id = None
if search_res.ok and search_res.json().get('contact'):
    contact_id = search_res.json()['contact']['id']
    print(f"✅ Found existing contact: {contact_id}")

    print("\n🚀 Sending direct WhatsApp message via API...")
    msg_payload = {
        "type": "WhatsApp",
        "contactId": contact_id,
        "message": MSG_TEXT
    }

    msg_headers = dict(headers)
    msg_headers["Version"] = "2021-04-15"

    msg_res = requests.post(
        "https://services.leadconnectorhq.com/conversations/messages",
        headers=msg_headers,
        json=msg_payload
    )

    if msg_res.ok:
        print("\n🎉 WhatsApp message dispatched successfully!")
        print("API Response:", msg_res.json())
    else:
        print("\n❌ Failed to send WhatsApp message:", msg_res.text)
        print("Status Code:", msg_res.status_code)
else:
    print("Cannot send message without a valid contact.")
    print("Ensure GHL_API_TOKEN has 'contacts.readonly' and 'conversations.message.write' scopes.")
