import pdfplumber

def check_pdf():
    pdf_path = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
    try:
        with pdfplumber.open(pdf_path) as pdf:
            print(f"Total pages: {len(pdf.pages)}")
            if len(pdf.pages) > 0:
                print("--- First 500 characters of Page 1 ---")
                text = pdf.pages[0].extract_text()
                if text:
                    print(text[:500])
                else:
                    print("No text found on Page 1 (could be an image).")
    except Exception as e:
        print(f"Error reading PDF: {e}")

if __name__ == "__main__":
    check_pdf()
