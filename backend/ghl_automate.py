import sys
import time
import json
import sqlite3
import os
from playwright.sync_api import sync_playwright

def main():
    print("🚀 Launching BlueJax Automation...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        
        # Load session if it exists to try and bypass login
        session_file = r"C:\Users\edgar\OneDrive\Desktop\BlueJax\session.json"
        if os.path.exists(session_file):
            try:
                with open(session_file, 'r') as f:
                    session_data = json.load(f)
                    if 'cookies' in session_data:
                        context.add_cookies(session_data['cookies'])
                        print("✅ Injected saved session cookies.")
            except Exception as e:
                print(f"⚠️ Could not load session from {session_file}: {e}")

        page = context.new_page()
        print("🌍 Navigating to GoHighLevel (BlueJax) Dashboard...")
        page.goto("https://admin.bluejax.ai/v2/location/GC3Q5eqwDKw2MhZQ0KSj/")
        
        print("\n⏳ IMPORTANT: Please look at the opened browser.")
        print("If it asks for a login or 2FA, please complete it manually NOW.")
        print("I am waiting for the dashboard to fully load...\n")
        
        # Wait up to 3 minutes for user to log in and reach the location dashboard
        try:
            page.wait_for_url("**/v2/location/GC3Q5eqwDKw2MhZQ0KSj/**", timeout=180000)
            print("✅ Successfully verified dashboard access!")
        except Exception as e:
            print("❌ Timed out waiting for login. Exiting.")
            browser.close()
            sys.exit(1)

        print("🤖 Automating workflow creation... Please DO NOT touch the mouse!")
        
        # Navigate to Automations
        try:
            page.get_by_role("link", name="Automations").click(timeout=10000)
        except:
            page.goto("https://admin.bluejax.ai/v2/location/GC3Q5eqwDKw2MhZQ0KSj/automations/workflows")
        
        time.sleep(3)
        print("➡️ Clicking 'Create workflow'")
        page.locator("text=Create workflow").last.click()
        
        print("➡️ Selecting 'Start from scratch'")
        page.locator("text=Start from scratch").first.click()
        time.sleep(3) # Wait for builder to load
        
        print("➡️ Clicking 'Add New Trigger'")
        page.locator("text=Add New Trigger").first.click()
        time.sleep(1)
        
        print("➡️ Choosing 'Inbound Webhook'")
        # Type into the search box to filter triggers
        search_input = page.locator("input[placeholder='Search triggers']").first
        if search_input.is_visible():
            search_input.fill("Inbound Webhook")
        page.locator("text=Inbound Webhook").first.click()
        
        time.sleep(2)
        print("➡️ Extracting Webhook URL...")
        # The webhook URL is usually in a readonly input or inside a copy-to-clipboard button
        webhook_url = ""
        inputs = page.locator("input[readonly]").all()
        for inp in inputs:
            val = inp.input_value()
            if "hooks" in val or "services.leadconnectorhq" in val:
                webhook_url = val
                break
        
        if not webhook_url:
            print("⚠️ Could not automatically find the webhook URL. Please copy it manually and update the Vibrana Settings tab.")
            print("I will pause the browser so you can do it.")
            page.pause()
        else:
            print(f"🎯 FOUND WEBHOOK: {webhook_url}")
            print("➡️ Saving Trigger...")
            page.locator("text=Save Trigger").first.click()
            time.sleep(1)
            
            print("💾 Saving Workflow...")
            page.locator("button:has-text('Save')").first.click()
            
            print("\n✅ Webhook generated! Updating Vibrana database...")
            
            # Update database
            db_path = r"C:\Users\edgar\OneDrive\Desktop\Vibrana\backend\vibrana.db"
            conn = sqlite3.connect(db_path)
            conn.execute("INSERT INTO system_config (key, value) VALUES ('ghl_whatsapp_webhook', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (webhook_url,))
            conn.commit()
            conn.close()
            
            print("✅ Database updated.")
            print("🎉 Done! I am leaving the browser open so you can manually add the 'Send WhatsApp' action below the trigger!")
            print("You must map the {{contact.phone}} and {{contact.message}} variables from your trigger.")
            page.pause() # Keeps browser open for user to add WhatsApp action

if __name__ == "__main__":
    main()
