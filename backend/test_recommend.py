import asyncio
import json
from app.api.endpoints import recommend_hospitals
from pydantic import BaseModel

# Mock Body
class MockBody:
    def __init__(self, specialist, location):
        self.specialist = specialist
        self.location = location
        self.chief_complaint = "testing"

# Mock User Depends
# Since verify_clerk_token returns a dict with 'sub', we mock it
MOCK_USER = {"sub": "user_2eSOWRRExZEnj7oX9oT2w7W6v0M"} # A valid ID from profile tests

async def test_recommendations():
    print("--- Scenario 1: Pediatrics in Miri ---")
    body = MockBody("Pediatrics", "Miri, Sarawak")
    res = await recommend_hospitals(body, MOCK_USER)
    for r in res["recommendations"]:
        print(f"Hosp: {r['name']} | Dist: {r['distance_note']} | Match: {r['specialty_match']}")

    print("\n--- Scenario 2: Cardiology in KL ---")
    body = MockBody("Cardiology", "Kuala Lumpur")
    res = await recommend_hospitals(body, MOCK_USER)
    for r in res["recommendations"]:
        print(f"Hosp: {r['name']} | Dist: {r['distance_note']} | Match: {r['specialty_match']}")

    print("\n--- Scenario 3: Orthopaedics in PJ ---")
    body = MockBody("Orthopaedics", "Petaling Jaya")
    res = await recommend_hospitals(body, MOCK_USER)
    for r in res["recommendations"]:
        print(f"Hosp: {r['name']} | Dist: {r['distance_note']} | Match: {r['specialty_match']}")

if __name__ == "__main__":
    asyncio.run(test_recommendations())
