"""
Smoke test for the SaaS API — validates endpoints return expected responses.
Run against a deployed stack:

  python platform/tests/test_api.py --api https://xxx.execute-api.us-east-1.amazonaws.com/api
"""

import argparse
import json
import sys
import urllib.request

PASS = 0
FAIL = 0


def test(name, method, url, body=None, expect_status=200):
    global PASS, FAIL
    try:
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, method=method,
                                      headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        status = e.code
        result = json.loads(e.read().decode()) if e.fp else {}
    except Exception as e:
        status = 0
        result = {'error': str(e)}

    ok = status == expect_status
    icon = '✓' if ok else '✗'
    if ok:
        PASS += 1
    else:
        FAIL += 1
    print(f'  {icon} [{status}] {name}')
    if not ok:
        print(f'       Expected {expect_status}, got {status}: {json.dumps(result)[:200]}')
    return result


def main(api):
    print(f'\nTesting API: {api}\n')

    # Health
    test('GET /health', 'GET', f'{api}/health')

    # Templates
    test('GET /templates', 'GET', f'{api}/templates')

    # Create customer
    cust = test('POST /customers', 'POST', f'{api}/customers', {
        'email': 'smoke-test@example.com',
        'companyName': 'Smoke Test Co',
        'subscriptionTier': 'starter',
    }, 201)
    cust_id = cust.get('customerId', 'unknown')

    # Get customer
    test('GET /customers/{id}', 'GET', f'{api}/customers/{cust_id}')

    # Create website
    site = test('POST /customers/{id}/websites', 'POST', f'{api}/customers/{cust_id}/websites', {
        'businessName': 'Test Fitness',
        'industry': 'fitness',
        'templateId': 'fitness-club-v1',
        'description': 'A test gym',
        'services': ['Training', 'Classes'],
    }, 201)
    web_id = site.get('websiteId', 'unknown')

    # List websites
    test('GET /customers/{id}/websites', 'GET', f'{api}/customers/{cust_id}/websites')

    # Get website
    test('GET /websites/{id}', 'GET', f'{api}/websites/{web_id}')

    # Publish website
    pub = test('POST /websites/{id}/publish', 'POST', f'{api}/websites/{web_id}/publish', {}, 202)
    job_id = pub.get('jobId', 'unknown')

    # Check job status
    test('GET /ai/jobs/{id}', 'GET', f'{api}/ai/jobs/{job_id}')

    # Delete website
    test('DELETE /websites/{id}', 'DELETE', f'{api}/websites/{web_id}')

    # 404
    test('GET /nonexistent (expect 404)', 'GET', f'{api}/this-does-not-exist', expect_status=404)

    # Summary
    total = PASS + FAIL
    print(f'\n  Results: {PASS}/{total} passed', end='')
    if FAIL:
        print(f'  ({FAIL} failed)', end='')
    print('\n')
    sys.exit(1 if FAIL else 0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--api', required=True, help='SaaS API base URL')
    args = parser.parse_args()
    main(args.api.rstrip('/'))
