from cv_engine import NLSAutomation
import os

def test_engine():
    print("Testing NLSAutomation initialization...")
    try:
        bot = NLSAutomation()
        print("Initialization successful.")
        
        print(f"Loaded calibration: {bot.coords}")
        
        # Verify specific key exists
        if "research_btn" in bot.coords:
            print("Calibration data loaded correctly.")
        else:
            print("Calibration data missing 'research_btn'.")
            
    except Exception as e:
        print(f"Initialization failed: {e}")

if __name__ == "__main__":
    test_engine()
