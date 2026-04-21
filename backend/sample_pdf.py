import pdfplumber
import json

def sample_pdf_content():
    pdf_path = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
    samples = {}
    
    # We will check a few specific pages to see the content structure
    pages_to_check = [1, 10, 50, 100, 500] 
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            print(f"DEBUG: Total pages: {total_pages}")
            
            for p_num in pages_to_check:
                if p_num > total_pages:
                    continue
                
                # Pages are 0-indexed in pdfplumber
                page = pdf.pages[p_num - 1]
                text = page.extract_text()
                
                if text:
                    samples[f"Page {p_num}"] = text[:1000] # Get a good chunk
                else:
                    samples[f"Page {p_num}"] = "[No text found / Image only]"
                    
        print(json.dumps(samples, indent=2))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    sample_pdf_content()
