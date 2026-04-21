import re

def mock_process_matching(specialist_raw, db_name):
    specialist_lower = specialist_raw.lower()
    
    # 1. Extract technical name if parentheses exist (anywhere in string)
    search_term = specialist_lower.strip()
    match = re.search(r"\(([^)]+)\)", specialist_lower)
    if match:
        search_term = match.group(1).strip()
    
    # Cleanup search term
    search_term = search_term.strip(" .")
    
    name = db_name.lower().strip()
    
    match_found = (
        search_term == name 
        or name == search_term
        or search_term in name 
    )
    return match_found, search_term

def test_robustness():
    db_name = "General Medicine"
    test_cases = [
        "Klinik Am (General Medicine)",            # Perfect
        "Klinik Am (General Medicine) ",           # Trailing space
        "Perubatan Am (General Medicine).",        # Trailing dot
        "General Medicine (General Medicine)",     # Redundant
        "Internal Medicine (General Medicine)   ", # Complex
        "(General Medicine)",                      # Minimal
    ]
    
    print(f"Target DB Name: '{db_name}'\n")
    for tc in test_cases:
        matched, extracted = mock_process_matching(tc, db_name)
        status = "PASSED" if matched else "FAILED"
        print(f"Input: '{tc}'")
        print(f"Extracted: '{extracted}' -> {status}\n")

if __name__ == "__main__":
    test_robustness()
