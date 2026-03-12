import requests
import sys

TOKEN = "pit-9abdfe80-8790-48a1-82b4-74c55d52e628"
LOCATION_ID = "GC3Q5eqwDKw2MhZQ0KSj"
TEST_PHONE = "+526391233367"
MSG_TEXT = "Hello Edgar! This is an automated API test from Vibrana AI. We successfully received your private GHL token and injected the WhatsApp message directly into your BlueJax CRM! Phase 15 is 100% complete! 🚀"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Version": "2021-07-28", # standard version for contacts v2
    "Content-Type": "application/json",
    "Accept": "application/json"
}

print("🔍 Searching for contact...")
search_res = requests.get(
    f"https://services.leadconnectorhq.com/contacts/search/duplicate?locationId={LOCATION_ID}&number={TEST_PHONE}",
    headers=headers
)

print(f"Search Response: {search_res.status_code} {search_res.text}")

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
        print("\n🎉 MISSION ACCOMPLISHED! WhatsApp message dispatched.")
        print("API Response:", msg_res.json())
    else:
        print("\n❌ Failed to send WhatsApp message:", msg_res.text)
        print("Status Code:", msg_res.status_code)

else:
    print("Cannot send message without a valid contact. Please ensure the token has 'contacts.readonly' and 'conversations.message.write' scopes, or try creating the contact manually in GHL first.")
