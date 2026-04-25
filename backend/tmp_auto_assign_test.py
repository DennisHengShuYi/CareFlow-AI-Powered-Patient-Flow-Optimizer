import httpx

url = 'http://127.0.0.1:8002/api/triage/auto_assign/852c3868-8b26-4029-97d6-1f63a681c3c9'
headers = {'Authorization': 'Bearer dev_token_test'}
try:
    r = httpx.post(url, headers=headers, timeout=20.0)
    print('STATUS', r.status_code)
    print('TEXT', r.text)
except Exception as e:
    print('ERR', e)
