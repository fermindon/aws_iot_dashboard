"""
Website Generator — Processes SQS messages to generate website content via AI,
render HTML from templates, and deploy to S3 + CloudFront.
"""

import json
import os
import time
import uuid
import boto3
from string import Template
from botocore.exceptions import ClientError

# ── AWS clients ──────────────────────────────────────
ddb        = boto3.resource('dynamodb')
s3         = boto3.client('s3')
cf         = boto3.client('cloudfront')
secrets    = boto3.client('secretsmanager')

WEBSITES_TABLE    = os.environ.get('WEBSITES_TABLE', '')
JOBS_TABLE        = os.environ.get('JOBS_TABLE', '')
GENERATED_BUCKET  = os.environ.get('GENERATED_BUCKET', '')
TEMPLATE_BUCKET   = os.environ.get('TEMPLATE_BUCKET', '')
CDN_DOMAIN        = os.environ.get('CDN_DOMAIN', '')
CDN_DISTRIBUTION  = os.environ.get('CDN_DISTRIBUTION_ID', '')
OPENAI_SECRET_ARN = os.environ.get('OPENAI_SECRET_ARN', '')


# ── OpenAI integration ───────────────────────────────
_openai_key_cache = None

def _get_openai_key():
    global _openai_key_cache
    if _openai_key_cache:
        return _openai_key_cache
    if not OPENAI_SECRET_ARN:
        return None
    try:
        resp = secrets.get_secret_value(SecretId=OPENAI_SECRET_ARN)
        secret = json.loads(resp['SecretString'])
        _openai_key_cache = secret.get('api_key', secret.get('OPENAI_API_KEY', ''))
        return _openai_key_cache
    except Exception as e:
        print(f'[generator] Failed to get OpenAI key: {e}')
        return None


def generate_content_with_ai(website):
    """Call OpenAI to generate website copy. Falls back to templates if no key."""
    api_key = _get_openai_key()
    if not api_key:
        print('[generator] No OpenAI key — using template fallback content')
        return _fallback_content(website)

    try:
        import urllib.request

        business_name = website.get('businessName', 'Business')
        industry      = website.get('industry', 'general')
        description   = website.get('description', '')
        services      = website.get('services', [])

        prompt = f"""You are an expert web copywriter. Generate website content for a small business.

Business Name: {business_name}
Industry: {industry}
Description: {description}
Services: {', '.join(services) if services else 'General services'}

Return valid JSON with these keys:
{{
  "hero_headline": "...",
  "hero_subheadline": "...",
  "hero_cta": "...",
  "about_title": "...",
  "about_text": "...",
  "services": [
    {{"name": "...", "description": "...", "icon": "..."}},
    {{"name": "...", "description": "...", "icon": "..."}},
    {{"name": "...", "description": "...", "icon": "..."}}
  ],
  "testimonials": [
    {{"name": "...", "text": "...", "role": "..."}},
    {{"name": "...", "text": "...", "role": "..."}}
  ],
  "cta_title": "...",
  "cta_text": "...",
  "footer_tagline": "..."
}}

Requirements:
- Professional, engaging tone for {industry} industry
- Mobile-friendly lengths (headlines < 80 chars)
- Include industry-specific language
- Make it compelling and conversion-focused
"""

        request_body = json.dumps({
            'model': 'gpt-4o-mini',
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.7,
            'response_format': {'type': 'json_object'},
        }).encode()

        req = urllib.request.Request(
            'https://api.openai.com/v1/chat/completions',
            data=request_body,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
            },
        )

        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())

        content_str = result['choices'][0]['message']['content']
        content = json.loads(content_str)

        tokens_used = result.get('usage', {}).get('total_tokens', 0)
        print(f'[generator] AI generated content — {tokens_used} tokens used')

        return {
            'content': content,
            'tokensUsed': tokens_used,
            'model': 'gpt-4o-mini',
            'aiGenerated': True,
        }

    except Exception as e:
        print(f'[generator] AI generation failed: {e} — using fallback')
        return _fallback_content(website)


def _fallback_content(website):
    """Generate reasonable default content from templates when AI is unavailable."""
    name     = website.get('businessName', 'Our Business')
    industry = website.get('industry', 'general')
    services = website.get('services', ['Service 1', 'Service 2', 'Service 3'])

    return {
        'content': {
            'hero_headline': f'Welcome to {name}',
            'hero_subheadline': f'Your trusted partner in {industry} excellence.',
            'hero_cta': 'Get Started Today',
            'about_title': f'About {name}',
            'about_text': f'{name} is dedicated to providing exceptional {industry} services. '
                          f'With years of experience and a passion for quality, we deliver results '
                          f'that exceed expectations.',
            'services': [
                {'name': s, 'description': f'Professional {s.lower()} tailored to your needs.', 'icon': '✦'}
                for s in (services[:3] if services else ['Consulting', 'Support', 'Solutions'])
            ],
            'testimonials': [
                {'name': 'Sarah M.', 'text': f'Outstanding {industry} service. Highly recommended!', 'role': 'Customer'},
                {'name': 'James K.', 'text': f'{name} exceeded all expectations. Truly professional.', 'role': 'Client'},
            ],
            'cta_title': 'Ready to Get Started?',
            'cta_text': f'Contact {name} today and let us help you achieve your goals.',
            'footer_tagline': f'© {name}. All rights reserved.',
        },
        'tokensUsed': 0,
        'model': 'fallback-template',
        'aiGenerated': False,
    }


# ── HTML Rendering ───────────────────────────────────
def render_website_html(website, content):
    """Render a complete HTML website from the template + AI content."""
    branding = website.get('branding', {})
    primary   = branding.get('primaryColor', '#2563EB')
    secondary = branding.get('secondaryColor', '#1E40AF')
    logo_text = branding.get('logoText', website.get('businessName', 'Site'))
    contact   = website.get('contact', {})
    c = content.get('content', {})

    services_html = ''
    for svc in c.get('services', []):
        services_html += f"""
        <div class="service-card">
            <div class="service-icon">{svc.get('icon', '✦')}</div>
            <h3>{svc.get('name', '')}</h3>
            <p>{svc.get('description', '')}</p>
        </div>"""

    testimonials_html = ''
    for t in c.get('testimonials', []):
        testimonials_html += f"""
        <div class="testimonial-card">
            <p class="testimonial-text">"{t.get('text', '')}"</p>
            <p class="testimonial-author">— {t.get('name', '')}, {t.get('role', '')}</p>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{logo_text}</title>
    <style>
        :root {{
            --primary: {primary};
            --secondary: {secondary};
            --bg: #ffffff;
            --text: #1a1a2e;
            --text-light: #555;
            --radius: 12px;
        }}

        * {{ margin: 0; padding: 0; box-sizing: border-box; }}

        body {{
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            color: var(--text);
            line-height: 1.6;
        }}

        /* ── Navigation ── */
        nav {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 5%;
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            position: fixed;
            width: 100%;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }}
        .logo {{
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--primary);
            text-decoration: none;
        }}
        .nav-links {{ display: flex; gap: 2rem; list-style: none; }}
        .nav-links a {{
            text-decoration: none;
            color: var(--text);
            font-weight: 500;
            transition: color 0.2s;
        }}
        .nav-links a:hover {{ color: var(--primary); }}

        /* ── Hero ── */
        .hero {{
            padding: 10rem 5% 6rem;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            text-align: center;
        }}
        .hero h1 {{
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 800;
            margin-bottom: 1rem;
        }}
        .hero p {{
            font-size: 1.25rem;
            opacity: 0.9;
            max-width: 600px;
            margin: 0 auto 2rem;
        }}
        .btn-primary {{
            display: inline-block;
            padding: 0.9rem 2.5rem;
            background: white;
            color: var(--primary);
            font-weight: 700;
            border-radius: var(--radius);
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .btn-primary:hover {{
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }}

        /* ── Sections ── */
        section {{
            padding: 5rem 5%;
        }}
        .section-title {{
            font-size: 2rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 3rem;
        }}

        /* ── About ── */
        .about-text {{
            max-width: 700px;
            margin: 0 auto;
            text-align: center;
            color: var(--text-light);
            font-size: 1.1rem;
        }}

        /* ── Services ── */
        .services-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            max-width: 1100px;
            margin: 0 auto;
        }}
        .service-card {{
            background: #f8f9fa;
            border-radius: var(--radius);
            padding: 2rem;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .service-card:hover {{
            transform: translateY(-4px);
            box-shadow: 0 12px 30px rgba(0,0,0,0.08);
        }}
        .service-icon {{
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }}
        .service-card h3 {{
            margin-bottom: 0.5rem;
            color: var(--primary);
        }}
        .service-card p {{
            color: var(--text-light);
        }}

        /* ── Testimonials ── */
        .testimonials {{ background: #f8f9fa; }}
        .testimonials-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            max-width: 900px;
            margin: 0 auto;
        }}
        .testimonial-card {{
            background: white;
            border-radius: var(--radius);
            padding: 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }}
        .testimonial-text {{
            font-style: italic;
            color: var(--text-light);
            margin-bottom: 1rem;
        }}
        .testimonial-author {{
            font-weight: 600;
            color: var(--primary);
        }}

        /* ── CTA ── */
        .cta {{
            text-align: center;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
        }}
        .cta .section-title {{ color: white; }}
        .cta p {{
            max-width: 500px;
            margin: 0 auto 2rem;
            opacity: 0.9;
        }}

        /* ── Contact ── */
        .contact-info {{
            text-align: center;
            color: var(--text-light);
        }}
        .contact-info a {{
            color: var(--primary);
            text-decoration: none;
        }}

        /* ── Footer ── */
        footer {{
            text-align: center;
            padding: 2rem 5%;
            background: var(--text);
            color: rgba(255,255,255,0.7);
            font-size: 0.9rem;
        }}

        /* ── Responsive ── */
        @media (max-width: 768px) {{
            .nav-links {{ display: none; }}
            .hero {{ padding: 8rem 5% 4rem; }}
        }}
    </style>
</head>
<body>
    <nav>
        <a href="#" class="logo">{logo_text}</a>
        <ul class="nav-links">
            <li><a href="#about">About</a></li>
            <li><a href="#services">Services</a></li>
            <li><a href="#testimonials">Reviews</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>

    <section class="hero">
        <h1>{c.get('hero_headline', f'Welcome to {logo_text}')}</h1>
        <p>{c.get('hero_subheadline', '')}</p>
        <a href="#contact" class="btn-primary">{c.get('hero_cta', 'Get Started')}</a>
    </section>

    <section id="about">
        <h2 class="section-title">{c.get('about_title', 'About Us')}</h2>
        <p class="about-text">{c.get('about_text', '')}</p>
    </section>

    <section id="services">
        <h2 class="section-title">Our Services</h2>
        <div class="services-grid">
            {services_html}
        </div>
    </section>

    <section id="testimonials" class="testimonials">
        <h2 class="section-title">What Our Clients Say</h2>
        <div class="testimonials-grid">
            {testimonials_html}
        </div>
    </section>

    <section class="cta">
        <h2 class="section-title">{c.get('cta_title', 'Get Started Today')}</h2>
        <p>{c.get('cta_text', '')}</p>
        <a href="#contact" class="btn-primary">{c.get('hero_cta', 'Contact Us')}</a>
    </section>

    <section id="contact">
        <h2 class="section-title">Contact Us</h2>
        <div class="contact-info">
            {'<p>Email: <a href="mailto:' + contact.get('email', '') + '">' + contact.get('email', '') + '</a></p>' if contact.get('email') else ''}
            {'<p>Phone: ' + contact.get('phone', '') + '</p>' if contact.get('phone') else ''}
            {'<p>Address: ' + contact.get('address', '') + '</p>' if contact.get('address') else ''}
        </div>
    </section>

    <footer>
        <p>{c.get('footer_tagline', f'&copy; {logo_text}. All rights reserved.')}</p>
    </footer>
</body>
</html>"""

    return html


# ── S3 Deployment ────────────────────────────────────
def deploy_to_s3(customer_id, website_id, html):
    """Upload the generated HTML to S3 under the customer/website path."""
    key = f'{customer_id}/{website_id}/index.html'
    s3.put_object(
        Bucket=GENERATED_BUCKET,
        Key=key,
        Body=html.encode('utf-8'),
        ContentType='text/html; charset=utf-8',
        CacheControl='public, max-age=3600',
    )
    print(f'[generator] Uploaded to s3://{GENERATED_BUCKET}/{key}')
    return f'https://{CDN_DOMAIN}/{key}'


def invalidate_cdn(customer_id, website_id):
    """Invalidate CloudFront cache for the deployed website."""
    if not CDN_DISTRIBUTION:
        return
    try:
        cf.create_invalidation(
            DistributionId=CDN_DISTRIBUTION,
            InvalidationBatch={
                'Paths': {
                    'Quantity': 1,
                    'Items': [f'/{customer_id}/{website_id}/*'],
                },
                'CallerReference': str(int(time.time())),
            },
        )
        print(f'[generator] CDN invalidation sent')
    except Exception as e:
        print(f'[generator] CDN invalidation failed (non-fatal): {e}')


# ── Job status helpers ───────────────────────────────
def _update_job(job_id, status, extra=None):
    table = ddb.Table(JOBS_TABLE)
    update = 'SET #s = :s, #u = :u'
    values = {':s': status, ':u': int(time.time() * 1000)}
    names  = {'#s': 'status', '#u': 'updatedAt'}
    if extra:
        for k, v in extra.items():
            update += f', #{k} = :{k}'
            values[f':{k}'] = v
            names[f'#{k}'] = k
    table.update_item(
        Key={'jobId': job_id},
        UpdateExpression=update,
        ExpressionAttributeValues=values,
        ExpressionAttributeNames=names,
    )


def _update_website_status(customer_id, website_id, status, live_url=''):
    table = ddb.Table(WEBSITES_TABLE)
    update = 'SET #s = :s, #u = :u'
    values = {':s': status, ':u': int(time.time() * 1000)}
    names  = {'#s': 'status', '#u': 'updatedAt'}
    if live_url:
        update += ', #lu = :lu'
        values[':lu'] = live_url
        names['#lu'] = 'liveUrl'
    table.update_item(
        Key={'customerId': customer_id, 'websiteId': website_id},
        UpdateExpression=update,
        ExpressionAttributeValues=values,
        ExpressionAttributeNames=names,
    )


# ── SQS handler ─────────────────────────────────────
def handler(event, context):
    """Process SQS messages — each message is a website generation job."""
    for record in event.get('Records', []):
        body = json.loads(record['body'])
        job_id     = body.get('jobId', 'unknown')
        website_id = body.get('websiteId', '')
        website    = body.get('website', {})
        customer_id = website.get('customerId', body.get('customerId', ''))

        print(f'[generator] Processing job={job_id}  website={website_id}')

        # If we only have an ID, fetch the full website record
        if not website.get('businessName') and website_id:
            ws_table = ddb.Table(WEBSITES_TABLE)
            resp = ws_table.query(
                IndexName='websiteId-index',
                KeyConditionExpression='websiteId = :wid',
                ExpressionAttributeValues={':wid': website_id},
            )
            items = resp.get('Items', [])
            if items:
                website = items[0]
                customer_id = website.get('customerId', customer_id)

        try:
            _update_job(job_id, 'in-progress')

            # 1. Generate content via AI (or fallback)
            result = generate_content_with_ai(website)
            content = result['content'] if isinstance(result.get('content'), dict) else result

            _update_job(job_id, 'rendering', {
                'tokensUsed': result.get('tokensUsed', 0),
                'model': result.get('model', 'unknown'),
            })

            # 2. Render HTML
            html = render_website_html(website, {'content': content})

            # 3. Deploy to S3
            live_url = deploy_to_s3(customer_id, website_id, html)

            # 4. Invalidate CDN
            invalidate_cdn(customer_id, website_id)

            # 5. Store generated content back on the website record
            _update_website_status(customer_id, website_id, 'published', live_url)

            # Also save the content on the website record
            ws_table = ddb.Table(WEBSITES_TABLE)
            ws_table.update_item(
                Key={'customerId': customer_id, 'websiteId': website_id},
                UpdateExpression='SET content = :c',
                ExpressionAttributeValues={':c': content},
            )

            _update_job(job_id, 'completed', {
                'liveUrl': live_url,
                'aiGenerated': result.get('aiGenerated', False),
            })

            print(f'[generator] Job {job_id} completed — {live_url}')

        except Exception as e:
            print(f'[generator] Job {job_id} FAILED: {e}')
            _update_job(job_id, 'failed', {'error': str(e)})
            _update_website_status(customer_id, website_id, 'failed')
            raise  # Re-raise so SQS retries / sends to DLQ
