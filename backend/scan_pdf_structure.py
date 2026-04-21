import pdfplumber

def scan_toc():
    pdf_path = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
    try:
        with pdfplumber.open(pdf_path) as pdf:
            print(f"Total pages: {len(pdf.pages)}")
            # Scan first 50 pages for anything that looks like a TOC or a chapter start
            for i in range(1, 51):
                text = pdf.pages[i].extract_text()
                if text:
                    # Check if the page is likely a TOC or a new chapter
                    if "CONTENTS" in text.upper() or "TABLE OF CONTENTS" in text.upper() or "MANAGEMENT OF" in text.upper():
                        print(f"--- Page {i+1} ---")
                        print(text[:500]) # Show first 500 chars
                        print("-" * 20)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    scan_toc()
