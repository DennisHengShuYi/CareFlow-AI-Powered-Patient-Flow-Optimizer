"""
Test script to debug patient registration issues.
"""
import asyncio
import sys
import os
import uuid
sys.path.insert(0, os.path.dirname(__file__))

from app.models.db import AsyncSessionLocal, Patient, Session as TriageSession, Hospital
from app.services.careflow_service import CareFlowService
from sqlalchemy import select as sa_select


async def test_register_patient():
    """Test patient registration step by step."""
    print("\n=== Testing Patient Registration ===\n")
    
    async with AsyncSessionLocal() as db:
        try:
            # Step 1: Check if hospitals exist
            print("Step 1: Checking for hospitals...")
            result = await db.execute(sa_select(Hospital).limit(5))
            hospitals = result.scalars().all()
            
            if not hospitals:
                print("  ❌ ERROR: No hospitals found in database!")
                print("  Please create a hospital first using the admin interface.")
                return False
            
            print(f"  ✓ Found {len(hospitals)} hospital(s)")
            hospital_id = hospitals[0].id
            print(f"  Using hospital: {hospital_id}")
            
            # Step 2: Try to create a patient with unique IC number
            print("\nStep 2: Creating patient...")
            ic_number = f"TEST-{uuid.uuid4().hex[:6].upper()}"
            
            patient_data = {
                "full_name": "Test Patient",
                "ic_number": ic_number,
                "phone": "555-1234",
                "email": "test@example.com"
            }
            
            print(f"  Patient data: {patient_data}")
            
            try:
                sess = await CareFlowService.register_patient(
                    db,
                    hospital_id,
                    patient_data["full_name"],
                    patient_data["ic_number"],
                    patient_data["phone"],
                    patient_data["email"],
                    "Test complaint",
                    2  # level P2
                )
                print(f"  ✓ Patient registered successfully!")
                print(f"  Session ID: {sess.id}")
                print(f"  Patient ID: {sess.patient_id}")
                return True
                
            except Exception as e:
                print(f"  ❌ ERROR during registration: {type(e).__name__}")
                print(f"  Message: {str(e)}")
                import traceback
                traceback.print_exc()
                return False
                
        except Exception as e:
            print(f"❌ Unexpected error: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = asyncio.run(test_register_patient())
    sys.exit(0 if success else 1)
