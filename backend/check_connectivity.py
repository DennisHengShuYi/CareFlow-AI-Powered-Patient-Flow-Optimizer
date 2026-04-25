"""
Diagnostic script to check Supabase connectivity.
"""
import socket
import httpx
import asyncio

async def check_connectivity():
    """Check if Supabase is reachable."""
    
    print("\n=== SUPABASE CONNECTIVITY DIAGNOSTIC ===\n")
    
    # 1. Check DNS resolution
    print("1. Checking DNS resolution...")
    try:
        ip = socket.gethostbyname("db.guiimyubbbrnzmzncetx.supabase.co")
        print(f"   ✓ DNS resolved to: {ip}")
    except socket.gaierror as e:
        print(f"   ❌ DNS resolution failed: {e}")
        print("   - Check your internet connection")
        print("   - Check if firewall is blocking DNS")
        return False
    
    # 2. Check TCP connection to database port
    print("\n2. Checking TCP connection to database...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        result = sock.connect_ex(("db.guiimyubbbrnzmzncetx.supabase.co", 5432))
        if result == 0:
            print("   ✓ TCP connection successful on port 5432")
        else:
            print(f"   ⚠ TCP connection failed (error code: {result})")
            print("   - Network connectivity may be limited")
            print("   - Firewall may be blocking port 5432")
    finally:
        sock.close()
    
    # 3. Check HTTPS connectivity to Supabase API
    print("\n3. Checking HTTPS connectivity...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("https://guiimyubbbrnzmzncetx.supabase.co/auth/v1/health")
            if response.status_code == 200:
                print(f"   ✓ HTTPS connection successful (status: {response.status_code})")
            else:
                print(f"   ⚠ Unexpected status code: {response.status_code}")
    except httpx.ConnectError as e:
        print(f"   ❌ HTTPS connection failed: {e}")
        print("   - Check your internet connection")
    except Exception as e:
        print(f"   ⚠ Connection check error: {type(e).__name__}: {e}")
    
    print("\n=== DIAGNOSTIC COMPLETE ===\n")

if __name__ == "__main__":
    asyncio.run(check_connectivity())
