"""
SaaS API Router — Main entry point for the AI Website Generator SaaS platform.
Routes incoming HTTP API Gateway requests to the appropriate handler.
"""

import json
import os
import uuid
import time
import boto3
from botocore.exceptions import ClientError

# ── AWS clients ──────────────────────────────────────
ddb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

CUSTOMERS_TABLE   = os.environ.get('CUSTOMERS_TABLE', '')
WEBSITES_TABLE    = os.environ.get('WEBSITES_TABLE', '')
TEMPLATES_TABLE   = os.environ.get('TEMPLATES_TABLE', '')
JOBS_TABLE        = os.environ.get('JOBS_TABLE', '')
GENERATED_BUCKET  = os.environ.get('GENERATED_BUCKET', '')
CDN_DOMAIN        = os.environ.get('CDN_DOMAIN', '')
GENERATION_QUEUE  = os.environ.get('GENERATION_QUEUE_URL', '')
ENVIRONMENT       = os.environ.get('ENVIRONMENT', 'dev')


# ── Helpers ──────────────────────────────────────────
def _resp(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body),
    }


def _now_ms():
    return int(time.time() * 1000)


def _ttl_days(days):
    return int(time.time()) + days * 86400


# ── Customer handlers ────────────────────────────────
def create_customer(body):
    table = ddb.Table(CUSTOMERS_TABLE)
    customer_id = f'cust_{uuid.uuid4().hex[:12]}'
    item = {
        'customerId':       customer_id,
        'email':            body.get('email', ''),
        'companyName':      body.get('companyName', ''),
        'subscriptionTier': body.get('subscriptionTier', 'starter'),
        'websitesCount':    0,
        'aiGenerationsUsed': 0,
        'aiGenerationsLimit': _tier_limits(body.get('subscriptionTier', 'starter')),
        'createdAt':        _now_ms(),
        'updatedAt':        _now_ms(),
    }
    table.put_item(Item=item)
    return _resp(201, item)


def get_customer(customer_id):
    table = ddb.Table(CUSTOMERS_TABLE)
    resp = table.get_item(Key={'customerId': customer_id})
    item = resp.get('Item')
    if not item:
        return _resp(404, {'error': 'Customer not found'})
    return _resp(200, _decimal_safe(item))


def update_customer(customer_id, body):
    table = ddb.Table(CUSTOMERS_TABLE)
    update_parts = []
    values = {}
    names = {}
    for key in ['email', 'companyName', 'subscriptionTier']:
        if key in body:
            safe = f'#{key}'
            update_parts.append(f'{safe} = :{key}')
            values[f':{key}'] = body[key]
            names[safe] = key
    update_parts.append('#updatedAt = :updatedAt')
    values[':updatedAt'] = _now_ms()
    names['#updatedAt'] = 'updatedAt'

    try:
        resp = table.update_item(
            Key={'customerId': customer_id},
            UpdateExpression='SET ' + ', '.join(update_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names,
            ReturnValues='ALL_NEW',
            ConditionExpression='attribute_exists(customerId)',
        )
        return _resp(200, _decimal_safe(resp['Attributes']))
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return _resp(404, {'error': 'Customer not found'})
        raise


# ── Website handlers ─────────────────────────────────
def create_website(customer_id, body):
    table = ddb.Table(WEBSITES_TABLE)
    website_id = f'web_{uuid.uuid4().hex[:12]}'
    item = {
        'customerId':    customer_id,
        'websiteId':     website_id,
        'businessName':  body.get('businessName', ''),
        'industry':      body.get('industry', ''),
        'templateId':    body.get('templateId', ''),
        'description':   body.get('description', ''),
        'status':        'draft',
        'branding': {
            'primaryColor':   body.get('branding', {}).get('primaryColor', '#2563EB'),
            'secondaryColor': body.get('branding', {}).get('secondaryColor', '#1E40AF'),
            'logoText':       body.get('branding', {}).get('logoText', body.get('businessName', '')),
        },
        'contact': {
            'email':   body.get('contact', {}).get('email', ''),
            'phone':   body.get('contact', {}).get('phone', ''),
            'address': body.get('contact', {}).get('address', ''),
        },
        'services':   body.get('services', []),
        'content':    {},
        'liveUrl':    '',
        'createdAt':  _now_ms(),
        'updatedAt':  _now_ms(),
    }
    table.put_item(Item=item)

    # Increment customer website count
    cust_table = ddb.Table(CUSTOMERS_TABLE)
    try:
        cust_table.update_item(
            Key={'customerId': customer_id},
            UpdateExpression='ADD websitesCount :one',
            ExpressionAttributeValues={':one': 1},
        )
    except Exception:
        pass

    return _resp(201, item)


def list_websites(customer_id):
    table = ddb.Table(WEBSITES_TABLE)
    resp = table.query(
        KeyConditionExpression='customerId = :cid',
        ExpressionAttributeValues={':cid': customer_id},
    )
    items = [_decimal_safe(i) for i in resp.get('Items', [])]
    return _resp(200, {'customerId': customer_id, 'websites': items, 'count': len(items)})


def get_website(website_id):
    table = ddb.Table(WEBSITES_TABLE)
    resp = table.query(
        IndexName='websiteId-index',
        KeyConditionExpression='websiteId = :wid',
        ExpressionAttributeValues={':wid': website_id},
    )
    items = resp.get('Items', [])
    if not items:
        return _resp(404, {'error': 'Website not found'})
    return _resp(200, _decimal_safe(items[0]))


def update_website(website_id, body):
    # Fetch website first to get customerId (partition key)
    table = ddb.Table(WEBSITES_TABLE)
    query_resp = table.query(
        IndexName='websiteId-index',
        KeyConditionExpression='websiteId = :wid',
        ExpressionAttributeValues={':wid': website_id},
    )
    items = query_resp.get('Items', [])
    if not items:
        return _resp(404, {'error': 'Website not found'})
    existing = items[0]

    update_parts = []
    values = {}
    names = {}
    for key in ['businessName', 'industry', 'templateId', 'description', 'status',
                'branding', 'contact', 'services', 'content']:
        if key in body:
            safe = f'#{key}'
            update_parts.append(f'{safe} = :{key}')
            values[f':{key}'] = body[key]
            names[safe] = key
    update_parts.append('#updatedAt = :updatedAt')
    values[':updatedAt'] = _now_ms()
    names['#updatedAt'] = 'updatedAt'

    resp = table.update_item(
        Key={'customerId': existing['customerId'], 'websiteId': website_id},
        UpdateExpression='SET ' + ', '.join(update_parts),
        ExpressionAttributeValues=values,
        ExpressionAttributeNames=names,
        ReturnValues='ALL_NEW',
    )
    return _resp(200, _decimal_safe(resp['Attributes']))


def delete_website(website_id):
    table = ddb.Table(WEBSITES_TABLE)
    query_resp = table.query(
        IndexName='websiteId-index',
        KeyConditionExpression='websiteId = :wid',
        ExpressionAttributeValues={':wid': website_id},
    )
    items = query_resp.get('Items', [])
    if not items:
        return _resp(404, {'error': 'Website not found'})
    existing = items[0]
    table.delete_item(Key={'customerId': existing['customerId'], 'websiteId': website_id})
    return _resp(200, {'deleted': True, 'websiteId': website_id})


def publish_website(website_id):
    """Queue the website for generation and deployment."""
    table = ddb.Table(WEBSITES_TABLE)
    query_resp = table.query(
        IndexName='websiteId-index',
        KeyConditionExpression='websiteId = :wid',
        ExpressionAttributeValues={':wid': website_id},
    )
    items = query_resp.get('Items', [])
    if not items:
        return _resp(404, {'error': 'Website not found'})
    website = items[0]

    job_id = f'gen_{uuid.uuid4().hex[:12]}'
    jobs_table = ddb.Table(JOBS_TABLE)
    jobs_table.put_item(Item={
        'jobId':      job_id,
        'websiteId':  website_id,
        'customerId': website['customerId'],
        'status':     'queued',
        'createdAt':  _now_ms(),
        'ttl':        _ttl_days(30),
    })

    # Update website status
    table.update_item(
        Key={'customerId': website['customerId'], 'websiteId': website_id},
        UpdateExpression='SET #s = :s, #u = :u',
        ExpressionAttributeValues={':s': 'generating', ':u': _now_ms()},
        ExpressionAttributeNames={'#s': 'status', '#u': 'updatedAt'},
    )

    # Send to SQS for async processing
    if GENERATION_QUEUE:
        sqs.send_message(
            QueueUrl=GENERATION_QUEUE,
            MessageBody=json.dumps({
                'jobId':     job_id,
                'websiteId': website_id,
                'website':   _decimal_safe(website),
            }),
        )

    return _resp(202, {
        'jobId':   job_id,
        'status':  'queued',
        'message': 'Website generation queued. Poll GET /ai/jobs/{jobId} for status.',
    })


# ── Template handlers ────────────────────────────────
def list_templates():
    table = ddb.Table(TEMPLATES_TABLE)
    resp = table.scan()
    items = [_decimal_safe(i) for i in resp.get('Items', [])]
    return _resp(200, {'templates': items, 'count': len(items)})


def get_template(template_id):
    table = ddb.Table(TEMPLATES_TABLE)
    resp = table.get_item(Key={'templateId': template_id})
    item = resp.get('Item')
    if not item:
        return _resp(404, {'error': 'Template not found'})
    return _resp(200, _decimal_safe(item))


# ── AI Generation handlers ──────────────────────────
def trigger_generation(body):
    """Queue a manual content generation job."""
    website_id = body.get('websiteId')
    customer_id = body.get('customerId')
    if not website_id or not customer_id:
        return _resp(400, {'error': 'websiteId and customerId are required'})

    job_id = f'gen_{uuid.uuid4().hex[:12]}'
    jobs_table = ddb.Table(JOBS_TABLE)
    jobs_table.put_item(Item={
        'jobId':      job_id,
        'websiteId':  website_id,
        'customerId': customer_id,
        'status':     'queued',
        'sections':   body.get('sections', ['hero', 'services', 'testimonials', 'contact']),
        'createdAt':  _now_ms(),
        'ttl':        _ttl_days(30),
    })

    if GENERATION_QUEUE:
        sqs.send_message(
            QueueUrl=GENERATION_QUEUE,
            MessageBody=json.dumps({
                'jobId':     job_id,
                'websiteId': website_id,
                'customerId': customer_id,
                'sections':   body.get('sections', []),
            }),
        )

    return _resp(202, {'jobId': job_id, 'status': 'queued'})


def get_generation_job(job_id):
    table = ddb.Table(JOBS_TABLE)
    resp = table.get_item(Key={'jobId': job_id})
    item = resp.get('Item')
    if not item:
        return _resp(404, {'error': 'Job not found'})
    return _resp(200, _decimal_safe(item))


# ── Utilities ────────────────────────────────────────
def _tier_limits(tier):
    return {'starter': 50, 'professional': 250, 'enterprise': 99999}.get(tier, 50)


def _decimal_safe(obj):
    """Convert Decimal types from DynamoDB to int/float for JSON serialisation."""
    from decimal import Decimal
    if isinstance(obj, list):
        return [_decimal_safe(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _decimal_safe(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    return obj


# ── Main router ──────────────────────────────────────
def handler(event, context):
    path   = event.get('rawPath', '')
    method = event.get('requestContext', {}).get('http', {}).get('method', '')
    params = event.get('pathParameters') or {}
    body   = {}

    # Strip API Gateway stage prefix (e.g. /api/health -> /health)
    stage = event.get('requestContext', {}).get('stage', '')
    if stage and path.startswith(f'/{stage}'):
        path = path[len(f'/{stage}'):]
    if not path:
        path = '/'

    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except (json.JSONDecodeError, TypeError):
            return _resp(400, {'error': 'Invalid JSON body'})

    print(f'[router] {method} {path}  params={params}')

    try:
        # Health
        if path == '/health':
            return _resp(200, {'status': 'ok', 'environment': ENVIRONMENT})

        # ── Customers ────────────────────────────
        if path == '/customers' and method == 'POST':
            return create_customer(body)

        if '/customers/' in path and path.count('/') == 2:
            cid = params.get('customerId', path.split('/')[2])
            if method == 'GET':
                return get_customer(cid)
            if method == 'PUT':
                return update_customer(cid, body)

        # ── Websites ─────────────────────────────
        if path.endswith('/websites') and method == 'POST':
            cid = params.get('customerId', path.split('/')[2])
            return create_website(cid, body)

        if path.endswith('/websites') and method == 'GET':
            cid = params.get('customerId', path.split('/')[2])
            return list_websites(cid)

        if path.startswith('/websites/') and '/publish' not in path:
            wid = params.get('websiteId', path.split('/')[2])
            if method == 'GET':
                return get_website(wid)
            if method == 'PUT':
                return update_website(wid, body)
            if method == 'DELETE':
                return delete_website(wid)

        if path.endswith('/publish') and method == 'POST':
            wid = params.get('websiteId', path.split('/')[2])
            return publish_website(wid)

        # ── Templates ────────────────────────────
        if path == '/templates' and method == 'GET':
            return list_templates()

        if path.startswith('/templates/') and method == 'GET':
            tid = params.get('templateId', path.split('/')[2])
            return get_template(tid)

        # ── AI Generation ────────────────────────
        if path == '/ai/generate' and method == 'POST':
            return trigger_generation(body)

        if path.startswith('/ai/jobs/') and method == 'GET':
            jid = params.get('jobId', path.split('/')[3])
            return get_generation_job(jid)

        return _resp(404, {'error': 'Not found', 'path': path, 'method': method})

    except Exception as e:
        print(f'[router] ERROR: {e}')
        return _resp(500, {'error': 'Internal server error'})
