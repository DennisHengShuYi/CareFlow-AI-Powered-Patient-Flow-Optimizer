import pdfplumber
import sys

# Force UTF-8 for terminal printing
sys.stdout.reconfigure(encoding='utf-8')

def verify_deep_extraction():
    pdf_path = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
    try:
        with pdfplumber.open(pdf_path) as pdf:
            # Check Page 1500 to show deep extraction works
            page_num = 1500
            page = pdf.pages[page_num - 1]
            text = page.extract_text()
            
            print(f"--- Verification: Page {page_num} Text Extraction ---")
            if text:
                # Print sample but safely handle characters
                print(text[:1000])
            else:
                print("No text found on this page.")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_deep_extraction()
