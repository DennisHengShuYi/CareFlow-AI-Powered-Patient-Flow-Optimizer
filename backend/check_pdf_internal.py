import pdfplumber

def check_pdf():
    pdf_path = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
    try:
        with pdfplumber.open(pdf_path) as pdf:
            print(f"Total pages: {len(pdf.pages)}")
            for i in range(1, 10):
                text = pdf.pages[i].extract_text()
                if text:
                    print(f"--- Page {i+1} first 200 chars ---")
                    print(text[:200])
                    break
    except Exception as e:
        print(f"Error reading PDF: {e}")

if __name__ == "__main__":
    check_pdf()
