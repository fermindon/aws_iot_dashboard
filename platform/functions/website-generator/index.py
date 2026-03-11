"""
Website Generator — Processes SQS messages to generate website content via AI,
render HTML from templates, and deploy to S3 + CloudFront.

Supports sections: hero, about, services, products, pricing, team,
                   testimonials, portfolio, faqs, blog, gallery, contact
"""

import base64
import json
import mimetypes
import os
import re
import time
import uuid
import boto3
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


# ── Image helpers ────────────────────────────────────
def _upload_data_url(data_url, customer_id, website_id, prefix, index):
    """Upload a base64 data-URL image to S3 and return the CDN URL."""
    match = re.match(r'data:(image/\w+);base64,(.+)', data_url, re.DOTALL)
    if not match:
        return ''
    mime = match.group(1)
    raw  = base64.b64decode(match.group(2))
    ext  = mimetypes.guess_extension(mime) or '.png'
    key  = f'{customer_id}/{website_id}/img/{prefix}_{index}{ext}'
    s3.put_object(
        Bucket=GENERATED_BUCKET,
        Key=key,
        Body=raw,
        ContentType=mime,
        CacheControl='public, max-age=31536000',
    )
    print(f'[generator] Uploaded image → s3://{GENERATED_BUCKET}/{key}')
    return f'https://{CDN_DOMAIN}/{key}'


def _resolve_image(url, customer_id, website_id, prefix, idx):
    """If `url` is a data-URL, upload to S3; otherwise return as-is."""
    if not url:
        return ''
    if url.startswith('data:'):
        return _upload_data_url(url, customer_id, website_id, prefix, idx)
    return url


# ── OpenAI integration ───────────────────────────────
_openai_key_cache = None

def _get_openai_key():
    global _openai_key_cache
    if _openai_key_cache:
        return _openai_key_cache
    if not OPENAI_SECRET_ARN:
        print('[generator] OPENAI_SECRET_ARN not configured — AI generation disabled')
        return None
    try:
        print(f'[generator] Retrieving OpenAI key from {OPENAI_SECRET_ARN}')
        resp = secrets.get_secret_value(SecretId=OPENAI_SECRET_ARN)
        secret = json.loads(resp['SecretString'])
        _openai_key_cache = secret.get('api_key', secret.get('OPENAI_API_KEY', ''))
        if _openai_key_cache:
            print(f'[generator] OpenAI key retrieved successfully (length: {len(_openai_key_cache)})')
        else:
            print('[generator] OpenAI secret exists but has no api_key field')
        return _openai_key_cache
    except Exception as e:
        print(f'[generator] Failed to get OpenAI key: {type(e).__name__}: {e}')
        return None


def generate_content_with_ai(website):
    """Call OpenAI to generate website copy. Falls back to templates if no key."""
    website_id = website.get('websiteId', 'unknown')
    print(f'[generator] Processing website {website_id}')
    api_key = _get_openai_key()
    if not api_key:
        print('[generator] No OpenAI key — using template fallback content')
        return _fallback_content(website)

    try:
        import urllib.request
        print('[generator] Attempting to generate content with OpenAI...')

        business_name = website.get('businessName', 'Business')
        industry      = website.get('industry', 'general')
        description   = website.get('description', '')
        services      = website.get('services', [])
        enabled       = website.get('enabledSections', [])

        prompt = f"""You are an expert web copywriter. Generate website content for a small business.

Business Name: {business_name}
Industry: {industry}
Description: {description}
Services: {', '.join(services) if services else 'General services'}
Enabled sections: {', '.join(enabled) if enabled else 'hero, about, services, testimonials, contact'}

Return valid JSON with ALL of these keys (fill every key even if the section is not enabled):
{{
  "hero_headline": "...",
  "hero_subheadline": "...",
  "hero_cta": "...",
  "about_title": "About [Business]",
  "about_text": "2-3 sentences about the business...",
  "services": [
    {{"name": "...", "description": "...", "icon": "emoji"}},
    {{"name": "...", "description": "...", "icon": "emoji"}},
    {{"name": "...", "description": "...", "icon": "emoji"}}
  ],
  "testimonials": [
    {{"name": "...", "text": "...", "role": "..."}},
    {{"name": "...", "text": "...", "role": "..."}}
  ],
  "faqs": [
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}}
  ],
  "blog_posts": [
    {{"title": "...", "excerpt": "...", "date": "2026-01-15"}},
    {{"title": "...", "excerpt": "...", "date": "2026-02-10"}}
  ],
  "pricing_plans": [
    {{"name": "Basic", "price": "$29/mo", "features": ["Feature 1","Feature 2","Feature 3"]}},
    {{"name": "Pro", "price": "$59/mo", "features": ["Everything in Basic","Feature 4","Feature 5"]}},
    {{"name": "Enterprise", "price": "Contact us", "features": ["Everything in Pro","Custom solutions","Priority support"]}}
  ],
  "portfolio_items": [
    {{"title": "...", "description": "...", "category": "..."}},
    {{"title": "...", "description": "...", "category": "..."}}
  ],
  "cta_title": "...",
  "cta_text": "...",
  "footer_tagline": "© [Business]. All rights reserved."
}}

Requirements:
- Professional, engaging tone for {industry} industry
- Mobile-friendly lengths (headlines < 80 chars)
- Include industry-specific language
- Make it compelling and conversion-focused
- Use appropriate emoji icons for services
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
        print('[generator] Sending request to OpenAI API...')

        with urllib.request.urlopen(req, timeout=120) as resp:
            response_text = resp.read().decode()
            print(f'[generator] OpenAI response received: {len(response_text)} bytes')
            result = json.loads(response_text)
            print('[generator] Response parsed successfully')

        content_str = result['choices'][0]['message']['content']
        print(f'[generator] Extracted content string from response')
        content = json.loads(content_str)
        print('[generator] Content JSON parsed successfully')

        tokens_used = result.get('usage', {}).get('total_tokens', 0)
        print(f'[generator] AI generated content — {tokens_used} tokens used')

        return {
            'content': content,
            'tokensUsed': tokens_used,
            'model': 'gpt-4o-mini',
            'aiGenerated': True,
        }

    except Exception as e:
        import traceback
        print(f'[generator] AI generation failed: {type(e).__name__}: {e}')
        print(f'[generator] Traceback: {traceback.format_exc()}')
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
            'faqs': [
                {'question': f'What services does {name} offer?',
                 'answer': f'We offer a range of professional {industry} services including {", ".join(services[:3])}.'},
                {'question': 'How can I get started?',
                 'answer': f'Simply reach out through our contact form or give us a call. We\'ll schedule a free consultation.'},
                {'question': 'What makes you different?',
                 'answer': f'{name} combines industry expertise with personalized attention to deliver exceptional results.'},
            ],
            'blog_posts': [
                {'title': f'Top {industry.title()} Trends for 2026', 'excerpt': f'Discover the latest developments shaping the {industry} landscape this year.', 'date': '2026-02-15'},
                {'title': f'Why Choose Professional {industry.title()} Services', 'excerpt': f'Learn how expert {industry} services can transform your business outcomes.', 'date': '2026-01-20'},
            ],
            'pricing_plans': [
                {'name': 'Starter', 'price': '$29/mo', 'features': ['Core features', 'Email support', 'Monthly reports']},
                {'name': 'Professional', 'price': '$59/mo', 'features': ['Everything in Starter', 'Priority support', 'Weekly reports', 'Custom integrations']},
                {'name': 'Enterprise', 'price': 'Contact us', 'features': ['Everything in Professional', 'Dedicated manager', 'Custom solutions', 'SLA guarantee']},
            ],
            'portfolio_items': [
                {'title': 'Project Alpha', 'description': f'A successful {industry} transformation project.', 'category': industry.title()},
                {'title': 'Project Beta', 'description': f'Delivering excellence in {industry} innovation.', 'category': 'Innovation'},
            ],
            'cta_title': 'Ready to Get Started?',
            'cta_text': f'Contact {name} today and let us help you achieve your goals.',
            'footer_tagline': f'© {name}. All rights reserved.',
        },
        'tokensUsed': 0,
        'model': 'fallback-template',
        'aiGenerated': False,
    }


# ── Section renderers (each returns an HTML string) ──
def _html_esc(text):
    """Basic HTML escaping."""
    return (str(text)
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;'))


def _section_hero(website, c):
    logo = _html_esc(website.get('branding', {}).get('logoText', website.get('businessName', 'Site')))
    return f"""
    <section class="hero">
        <h1>{_html_esc(c.get('hero_headline', f'Welcome to {logo}'))}</h1>
        <p>{_html_esc(c.get('hero_subheadline', ''))}</p>
        <a href="#contact" class="btn-primary">{_html_esc(c.get('hero_cta', 'Get Started'))}</a>
    </section>"""


def _section_about(website, c):
    return f"""
    <section id="about">
        <h2 class="section-title">{_html_esc(c.get('about_title', 'About Us'))}</h2>
        <p class="about-text">{_html_esc(c.get('about_text', ''))}</p>
    </section>"""


def _section_services(website, c):
    cards = ''
    for svc in c.get('services', []):
        cards += f"""
            <div class="service-card">
                <div class="service-icon">{svc.get('icon', '✦')}</div>
                <h3>{_html_esc(svc.get('name', ''))}</h3>
                <p>{_html_esc(svc.get('description', ''))}</p>
            </div>"""
    return f"""
    <section id="services">
        <h2 class="section-title">Our Services</h2>
        <div class="grid-3">{cards}
        </div>
    </section>"""


def _section_products(website, c, images):
    """Render products from the website record (user-entered data)."""
    products = website.get('products', [])
    if not products:
        return ''
    cards = ''
    for i, p in enumerate(products):
        img_url = images.get(f'product_{i}', '')
        img_html = f'<img src="{img_url}" alt="{_html_esc(p.get("name", ""))}" class="card-img">' if img_url else ''
        price_html = f'<span class="price-badge">{_html_esc(p.get("price", ""))}</span>' if p.get('price') else ''
        cards += f"""
            <div class="product-card">
                {img_html}
                <div class="card-body">
                    <h3>{_html_esc(p.get('name', ''))}</h3>
                    {price_html}
                    <p>{_html_esc(p.get('description', ''))}</p>
                </div>
            </div>"""
    return f"""
    <section id="products">
        <h2 class="section-title">Our Products</h2>
        <div class="grid-3">{cards}
        </div>
    </section>"""


def _section_pricing(website, c):
    plans = c.get('pricing_plans', [])
    if not plans:
        return ''
    cards = ''
    for i, plan in enumerate(plans):
        featured = ' featured' if i == 1 else ''
        features_html = ''.join(
            f'<li>✓ {_html_esc(f)}</li>' for f in plan.get('features', [])
        )
        cards += f"""
            <div class="pricing-card{featured}">
                <h3>{_html_esc(plan.get('name', ''))}</h3>
                <div class="pricing-amount">{_html_esc(plan.get('price', ''))}</div>
                <ul class="pricing-features">{features_html}</ul>
                <a href="#contact" class="btn-outline">Choose Plan</a>
            </div>"""
    return f"""
    <section id="pricing">
        <h2 class="section-title">Pricing</h2>
        <div class="grid-3">{cards}
        </div>
    </section>"""


def _section_team(website, c, images):
    """Render team members from the website record (user-entered data)."""
    members = website.get('teamMembers', [])
    if not members:
        return ''
    cards = ''
    for i, m in enumerate(members):
        img_url = images.get(f'team_{i}', '')
        avatar = f'<img src="{img_url}" alt="{_html_esc(m.get("name",""))}" class="team-avatar">' if img_url else f'<div class="team-avatar-placeholder">{_html_esc(m.get("name","?")[0].upper())}</div>'
        cards += f"""
            <div class="team-card">
                {avatar}
                <h3>{_html_esc(m.get('name', ''))}</h3>
                <p class="team-role">{_html_esc(m.get('role', ''))}</p>
                <p class="team-bio">{_html_esc(m.get('bio', ''))}</p>
            </div>"""
    return f"""
    <section id="team">
        <h2 class="section-title">Meet the Team</h2>
        <div class="grid-3">{cards}
        </div>
    </section>"""


def _section_testimonials(website, c):
    # Prefer user-entered testimonials, fall back to AI content
    user_testimonials = website.get('testimonials', [])
    cards = ''
    if user_testimonials:
        for t in user_testimonials:
            stars = '⭐' * min(int(t.get('rating', 5) or 5), 5)
            cards += f"""
            <div class="testimonial-card">
                <div class="testimonial-stars">{stars}</div>
                <p class="testimonial-text">"{_html_esc(t.get('text', ''))}"</p>
                <p class="testimonial-author">— {_html_esc(t.get('author', ''))}</p>
            </div>"""
    else:
        for t in c.get('testimonials', []):
            cards += f"""
            <div class="testimonial-card">
                <p class="testimonial-text">"{_html_esc(t.get('text', ''))}"</p>
                <p class="testimonial-author">— {_html_esc(t.get('name', ''))}, {_html_esc(t.get('role', ''))}</p>
            </div>"""
    return f"""
    <section id="testimonials" class="alt-bg">
        <h2 class="section-title">What Our Clients Say</h2>
        <div class="grid-3">{cards}
        </div>
    </section>"""


def _section_portfolio(website, c):
    # Prefer case studies from user, fall back to AI portfolio items
    case_studies = website.get('caseStudies', [])
    items = case_studies if case_studies else c.get('portfolio_items', [])
    if not items:
        return ''
    cards = ''
    for item in items:
        title = item.get('title', '')
        desc  = item.get('description', '')
        extra = item.get('result') or item.get('category', '')
        badge = f'<span class="portfolio-badge">{_html_esc(extra)}</span>' if extra else ''
        cards += f"""
            <div class="portfolio-card">
                <h3>{_html_esc(title)}</h3>
                <p>{_html_esc(desc)}</p>
                {badge}
            </div>"""
    return f"""
    <section id="portfolio">
        <h2 class="section-title">Our Work</h2>
        <div class="grid-3">{cards}
        </div>
    </section>"""


def _section_faqs(website, c):
    faqs = c.get('faqs', [])
    if not faqs:
        return ''
    items = ''
    for faq in faqs:
        items += f"""
            <details class="faq-item">
                <summary>{_html_esc(faq.get('question', ''))}</summary>
                <p>{_html_esc(faq.get('answer', ''))}</p>
            </details>"""
    return f"""
    <section id="faqs">
        <h2 class="section-title">Frequently Asked Questions</h2>
        <div class="faq-list">{items}
        </div>
    </section>"""


def _section_blog(website, c):
    posts = c.get('blog_posts', [])
    if not posts:
        return ''
    cards = ''
    for post in posts:
        cards += f"""
            <div class="blog-card">
                <span class="blog-date">{_html_esc(post.get('date', ''))}</span>
                <h3>{_html_esc(post.get('title', ''))}</h3>
                <p>{_html_esc(post.get('excerpt', ''))}</p>
            </div>"""
    return f"""
    <section id="blog">
        <h2 class="section-title">Latest News</h2>
        <div class="grid-2">{cards}
        </div>
    </section>"""


def _section_gallery(website, c, images):
    """Render gallery from product & team images as a visual grid."""
    urls = [v for k, v in sorted(images.items()) if v]
    if not urls:
        return ''
    items = ''
    for url in urls:
        items += f'\n            <div class="gallery-item"><img src="{url}" alt="" loading="lazy"></div>'
    return f"""
    <section id="gallery" class="alt-bg">
        <h2 class="section-title">Gallery</h2>
        <div class="gallery-grid">{items}
        </div>
    </section>"""


def _section_contact(website, c):
    contact = website.get('contact', {})
    rows = ''
    if contact.get('email'):
        rows += f'<p>✉ Email: <a href="mailto:{_html_esc(contact["email"])}">{_html_esc(contact["email"])}</a></p>'
    if contact.get('phone'):
        rows += f'<p>📞 Phone: {_html_esc(contact["phone"])}</p>'
    if contact.get('address'):
        rows += f'<p>📍 Address: {_html_esc(contact["address"])}</p>'
    return f"""
    <section id="contact">
        <h2 class="section-title">Contact Us</h2>
        <div class="contact-info">{rows}
        </div>
    </section>"""


# ── Navbar builder ───────────────────────────────────
_NAV_LABELS = {
    'about': 'About',
    'services': 'Services',
    'products': 'Products',
    'pricing': 'Pricing',
    'team': 'Team',
    'testimonials': 'Reviews',
    'portfolio': 'Portfolio',
    'faqs': 'FAQs',
    'blog': 'Blog',
    'gallery': 'Gallery',
    'contact': 'Contact',
}

def _build_nav(sections):
    """Build nav <li> items only for enabled sections (skip hero)."""
    links = ''
    for sec in sections:
        label = _NAV_LABELS.get(sec)
        if label:
            links += f'\n            <li><a href="#{sec}">{label}</a></li>'
    return links


# ── Main HTML renderer ───────────────────────────────
def render_website_html(website, content, images=None):
    """Render a full HTML page honouring enabledSections and real data."""
    images = images or {}
    branding  = website.get('branding', {})
    primary   = branding.get('primaryColor', '#2563EB')
    secondary = branding.get('secondaryColor', '#1E40AF')
    logo_text = _html_esc(branding.get('logoText', website.get('businessName', 'Site')))
    c         = content.get('content', {})

    # SEO
    seo = website.get('seo', {})
    meta_title = _html_esc(seo.get('metaTitle', '')) or logo_text
    meta_desc  = _html_esc(seo.get('metaDescription', ''))
    og_image   = seo.get('ogImage', '')

    # Analytics
    analytics = website.get('analytics', {})
    ga_id = analytics.get('googleAnalyticsId', '')
    fb_pixel = analytics.get('facebookPixelId', '')
    analytics_html = ''
    if ga_id:
        analytics_html += f"""
    <script async src="https://www.googletagmanager.com/gtag/js?id={_html_esc(ga_id)}"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','{_html_esc(ga_id)}');</script>"""
    if fb_pixel:
        analytics_html += f"""
    <script>!function(f,b,e,v,n,t,s){{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','{_html_esc(fb_pixel)}');fbq('track','PageView');</script>"""

    # Determine which sections to render
    enabled = website.get('enabledSections', [])
    if not enabled:
        enabled = ['hero', 'services', 'testimonials', 'contact']

    nav_links = _build_nav(enabled)

    # Map section names → renderer callables
    section_map = {
        'hero':         lambda: _section_hero(website, c),
        'about':        lambda: _section_about(website, c),
        'services':     lambda: _section_services(website, c),
        'products':     lambda: _section_products(website, c, images),
        'pricing':      lambda: _section_pricing(website, c),
        'team':         lambda: _section_team(website, c, images),
        'testimonials': lambda: _section_testimonials(website, c),
        'portfolio':    lambda: _section_portfolio(website, c),
        'faqs':         lambda: _section_faqs(website, c),
        'blog':         lambda: _section_blog(website, c),
        'gallery':      lambda: _section_gallery(website, c, images),
        'contact':      lambda: _section_contact(website, c),
    }

    body_sections = ''
    for sec_name in enabled:
        renderer = section_map.get(sec_name)
        if renderer:
            body_sections += renderer()

    # Always add CTA + footer
    cta_html = f"""
    <section class="cta">
        <h2 class="section-title">{_html_esc(c.get('cta_title', 'Get Started Today'))}</h2>
        <p>{_html_esc(c.get('cta_text', ''))}</p>
        <a href="#contact" class="btn-primary">{_html_esc(c.get('hero_cta', 'Contact Us'))}</a>
    </section>"""

    # ── Full CSS ──────────────────────────────
    css = f"""
        :root {{
            --primary: {primary};
            --secondary: {secondary};
            --bg: #ffffff;
            --text: #1a1a2e;
            --text-light: #555;
            --radius: 12px;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: var(--text); line-height: 1.6; }}

        /* Nav */
        nav {{ display:flex; justify-content:space-between; align-items:center; padding:1rem 5%; background:rgba(255,255,255,0.95); backdrop-filter:blur(10px); position:fixed; width:100%; top:0; z-index:100; box-shadow:0 1px 3px rgba(0,0,0,0.08); }}
        .logo {{ font-size:1.5rem; font-weight:800; color:var(--primary); text-decoration:none; }}
        .nav-links {{ display:flex; gap:2rem; list-style:none; }}
        .nav-links a {{ text-decoration:none; color:var(--text); font-weight:500; transition:color .2s; }}
        .nav-links a:hover {{ color:var(--primary); }}

        /* Hero */
        .hero {{ padding:10rem 5% 6rem; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:white; text-align:center; }}
        .hero h1 {{ font-size:clamp(2rem,5vw,3.5rem); font-weight:800; margin-bottom:1rem; }}
        .hero p {{ font-size:1.25rem; opacity:.9; max-width:600px; margin:0 auto 2rem; }}

        /* Buttons */
        .btn-primary {{ display:inline-block; padding:.9rem 2.5rem; background:white; color:var(--primary); font-weight:700; border-radius:var(--radius); text-decoration:none; transition:transform .2s, box-shadow .2s; }}
        .btn-primary:hover {{ transform:translateY(-2px); box-shadow:0 8px 25px rgba(0,0,0,.15); }}
        .btn-outline {{ display:inline-block; padding:.7rem 2rem; border:2px solid var(--primary); color:var(--primary); font-weight:600; border-radius:var(--radius); text-decoration:none; transition:all .2s; }}
        .btn-outline:hover {{ background:var(--primary); color:white; }}

        /* Sections */
        section {{ padding:5rem 5%; }}
        .alt-bg {{ background:#f8f9fa; }}
        .section-title {{ font-size:2rem; font-weight:700; text-align:center; margin-bottom:3rem; }}

        /* About */
        .about-text {{ max-width:700px; margin:0 auto; text-align:center; color:var(--text-light); font-size:1.1rem; }}

        /* Grids */
        .grid-2 {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:2rem; max-width:1100px; margin:0 auto; }}
        .grid-3 {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:2rem; max-width:1100px; margin:0 auto; }}

        /* Service cards */
        .service-card {{ background:#f8f9fa; border-radius:var(--radius); padding:2rem; text-align:center; transition:transform .2s, box-shadow .2s; }}
        .service-card:hover {{ transform:translateY(-4px); box-shadow:0 12px 30px rgba(0,0,0,.08); }}
        .service-icon {{ font-size:2.5rem; margin-bottom:1rem; }}
        .service-card h3 {{ margin-bottom:.5rem; color:var(--primary); }}
        .service-card p {{ color:var(--text-light); }}

        /* Product cards */
        .product-card {{ background:white; border-radius:var(--radius); overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.06); transition:transform .2s; }}
        .product-card:hover {{ transform:translateY(-4px); }}
        .card-img {{ width:100%; height:200px; object-fit:cover; }}
        .card-body {{ padding:1.5rem; }}
        .card-body h3 {{ margin-bottom:.5rem; color:var(--primary); }}
        .card-body p {{ color:var(--text-light); font-size:.95rem; }}
        .price-badge {{ display:inline-block; background:var(--primary); color:white; padding:.25rem .75rem; border-radius:20px; font-weight:700; font-size:.85rem; margin-bottom:.5rem; }}

        /* Pricing cards */
        .pricing-card {{ background:white; border-radius:var(--radius); padding:2.5rem 2rem; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,.06); transition:transform .2s; }}
        .pricing-card.featured {{ border:2px solid var(--primary); transform:scale(1.05); }}
        .pricing-card:hover {{ transform:translateY(-4px); }}
        .pricing-amount {{ font-size:2rem; font-weight:800; color:var(--primary); margin:1rem 0; }}
        .pricing-features {{ list-style:none; text-align:left; margin:1.5rem 0; }}
        .pricing-features li {{ padding:.4rem 0; color:var(--text-light); border-bottom:1px solid #f0f0f0; }}

        /* Team cards */
        .team-card {{ background:white; border-radius:var(--radius); padding:2rem; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,.06); }}
        .team-avatar {{ width:100px; height:100px; border-radius:50%; object-fit:cover; margin:0 auto 1rem; display:block; }}
        .team-avatar-placeholder {{ width:100px; height:100px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:700; margin:0 auto 1rem; }}
        .team-role {{ color:var(--primary); font-weight:600; margin-bottom:.5rem; }}
        .team-bio {{ color:var(--text-light); font-size:.9rem; }}

        /* Testimonials */
        .testimonial-card {{ background:white; border-radius:var(--radius); padding:2rem; box-shadow:0 2px 8px rgba(0,0,0,.05); }}
        .testimonial-stars {{ margin-bottom:.5rem; }}
        .testimonial-text {{ font-style:italic; color:var(--text-light); margin-bottom:1rem; }}
        .testimonial-author {{ font-weight:600; color:var(--primary); }}

        /* Portfolio */
        .portfolio-card {{ background:white; border-radius:var(--radius); padding:2rem; box-shadow:0 2px 12px rgba(0,0,0,.06); }}
        .portfolio-card h3 {{ color:var(--primary); margin-bottom:.5rem; }}
        .portfolio-card p {{ color:var(--text-light); }}
        .portfolio-badge {{ display:inline-block; margin-top:.75rem; background:#e0e7ff; color:var(--primary); padding:.2rem .7rem; border-radius:20px; font-size:.8rem; font-weight:600; }}

        /* FAQs */
        .faq-list {{ max-width:800px; margin:0 auto; }}
        .faq-item {{ border-bottom:1px solid #e5e7eb; }}
        .faq-item summary {{ padding:1.2rem 0; font-weight:600; cursor:pointer; font-size:1.05rem; }}
        .faq-item summary:hover {{ color:var(--primary); }}
        .faq-item p {{ padding:0 0 1.2rem; color:var(--text-light); }}

        /* Blog */
        .blog-card {{ background:white; border-radius:var(--radius); padding:2rem; box-shadow:0 2px 12px rgba(0,0,0,.06); }}
        .blog-date {{ color:var(--primary); font-size:.85rem; font-weight:600; }}
        .blog-card h3 {{ margin:.5rem 0; }}
        .blog-card p {{ color:var(--text-light); }}

        /* Gallery */
        .gallery-grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:1rem; max-width:1100px; margin:0 auto; }}
        .gallery-item img {{ width:100%; height:200px; object-fit:cover; border-radius:var(--radius); transition:transform .3s; }}
        .gallery-item img:hover {{ transform:scale(1.05); }}

        /* CTA */
        .cta {{ text-align:center; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:white; }}
        .cta .section-title {{ color:white; }}
        .cta p {{ max-width:500px; margin:0 auto 2rem; opacity:.9; }}

        /* Contact */
        .contact-info {{ text-align:center; color:var(--text-light); }}
        .contact-info a {{ color:var(--primary); text-decoration:none; }}
        .contact-info p {{ margin:.5rem 0; }}

        /* Footer */
        footer {{ text-align:center; padding:2rem 5%; background:var(--text); color:rgba(255,255,255,.7); font-size:.9rem; }}

        /* Mobile */
        @media (max-width: 768px) {{
            .nav-links {{ display:none; }}
            .hero {{ padding:8rem 5% 4rem; }}
            .pricing-card.featured {{ transform:scale(1); }}
        }}
    """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{meta_title}</title>
    {'<meta name="description" content="' + meta_desc + '">' if meta_desc else ''}
    {'<meta property="og:image" content="' + _html_esc(og_image) + '">' if og_image else ''}
    {analytics_html}
    <style>{css}
    </style>
</head>
<body>
    <nav>
        <a href="#" class="logo">{logo_text}</a>
        <ul class="nav-links">{nav_links}
        </ul>
    </nav>
{body_sections}
{cta_html}

    <footer>
        <p>{_html_esc(c.get('footer_tagline', f'&copy; {logo_text}. All rights reserved.'))}</p>
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

        # Always fetch the LATEST website record from DynamoDB
        ws_table = ddb.Table(WEBSITES_TABLE)
        if website_id:
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

            # 0. Upload any base64 images to S3 and get CDN URLs
            images = {}
            for i, member in enumerate(website.get('teamMembers', [])):
                url = member.get('photoUrl', '')
                cdn_url = _resolve_image(url, customer_id, website_id, 'team', i)
                if cdn_url:
                    images[f'team_{i}'] = cdn_url
            for i, product in enumerate(website.get('products', [])):
                url = product.get('imageUrl', '')
                cdn_url = _resolve_image(url, customer_id, website_id, 'product', i)
                if cdn_url:
                    images[f'product_{i}'] = cdn_url

            # 1. Generate content via AI (or fallback)
            result = generate_content_with_ai(website)
            content = result['content'] if isinstance(result.get('content'), dict) else result

            _update_job(job_id, 'rendering', {
                'tokensUsed': result.get('tokensUsed', 0),
                'model': result.get('model', 'unknown'),
            })

            # 2. Render HTML with ALL sections + images
            html = render_website_html(website, {'content': content}, images)

            # 3. Deploy to S3
            live_url = deploy_to_s3(customer_id, website_id, html)

            # 4. Invalidate CDN
            invalidate_cdn(customer_id, website_id)

            # 5. Store generated content back on the website record
            _update_website_status(customer_id, website_id, 'published', live_url)

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
