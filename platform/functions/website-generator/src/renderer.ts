// ── HTML section renderers + full page builder ──────
import { Website, AIContent, ImageMap } from './types';

// ── HTML escaping ────────────────────────────────────
function esc(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Section renderers ────────────────────────────────

function sectionHero(website: Website, c: AIContent, images: ImageMap): string {
  const logo = esc(website.branding?.logoText || website.businessName || 'Site');
  const heroImg = images.hero || '';
  const bgStyle = heroImg
    ? `background-image:linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url(${heroImg});background-size:cover;background-position:center;`
    : '';
  return `
    <section class="hero" style="${bgStyle}">
        <h1>${esc(c.hero_headline || `Welcome to ${logo}`)}</h1>
        <p>${esc(c.hero_subheadline || '')}</p>
        <a href="#contact" class="btn-primary">${esc(c.hero_cta || 'Get Started')}</a>
    </section>`;
}

function sectionAbout(website: Website, c: AIContent, images: ImageMap): string {
  const aboutImg = images.about || '';
  const imgHtml = aboutImg
    ? `<img src="${aboutImg}" alt="About us" class="about-img">`
    : '';
  const wrapperClass = aboutImg ? 'about-with-image' : '';
  return `
    <section id="about" class="${wrapperClass}">
        <div class="about-content">
            <h2 class="section-title">${esc(c.about_title || 'About Us')}</h2>
            <p class="about-text">${esc(c.about_text || '')}</p>
        </div>
        ${imgHtml}
    </section>`;
}

function sectionServices(_website: Website, c: AIContent, images: ImageMap): string {
  let cards = '';
  for (let i = 0; i < (c.services || []).length; i++) {
    const svc = c.services![i];
    const imgUrl = images[`service_${i}`] || '';
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${esc(svc.name)}" class="service-img">`
      : '';
    cards += `
            <div class="service-card">
                ${imgHtml}
                <div class="service-icon">${svc.icon || '✦'}</div>
                <h3>${esc(svc.name)}</h3>
                <p>${esc(svc.description)}</p>
            </div>`;
  }
  return `
    <section id="services">
        <h2 class="section-title">Our Services</h2>
        <div class="grid-3">${cards}
        </div>
    </section>`;
}

function sectionProducts(website: Website, _c: AIContent, images: ImageMap): string {
  const products = website.products || [];
  if (!products.length) return '';
  let cards = '';
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const imgUrl = images[`product_${i}`] || '';
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${esc(p.name)}" class="card-img">`
      : '';
    const priceHtml = p.price
      ? `<span class="price-badge">${esc(p.price)}</span>`
      : '';
    cards += `
            <div class="product-card">
                ${imgHtml}
                <div class="card-body">
                    <h3>${esc(p.name)}</h3>
                    ${priceHtml}
                    <p>${esc(p.description)}</p>
                </div>
            </div>`;
  }
  return `
    <section id="products">
        <h2 class="section-title">Our Products</h2>
        <div class="grid-3">${cards}
        </div>
    </section>`;
}

function sectionPricing(_website: Website, c: AIContent): string {
  const plans = c.pricing_plans || [];
  if (!plans.length) return '';
  let cards = '';
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const featured = i === 1 ? ' featured' : '';
    const featuresHtml = (plan.features || [])
      .map((f) => `<li>✓ ${esc(f)}</li>`)
      .join('');
    cards += `
            <div class="pricing-card${featured}">
                <h3>${esc(plan.name)}</h3>
                <div class="pricing-amount">${esc(plan.price)}</div>
                <ul class="pricing-features">${featuresHtml}</ul>
                <a href="#contact" class="btn-outline">Choose Plan</a>
            </div>`;
  }
  return `
    <section id="pricing">
        <h2 class="section-title">Pricing</h2>
        <div class="grid-3">${cards}
        </div>
    </section>`;
}

function sectionTeam(website: Website, _c: AIContent, images: ImageMap): string {
  const members = website.teamMembers || [];
  if (!members.length) return '';
  let cards = '';
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const imgUrl = images[`team_${i}`] || '';
    const avatar = imgUrl
      ? `<img src="${imgUrl}" alt="${esc(m.name)}" class="team-avatar">`
      : `<div class="team-avatar-placeholder">${esc((m.name || '?')[0].toUpperCase())}</div>`;
    cards += `
            <div class="team-card">
                ${avatar}
                <h3>${esc(m.name)}</h3>
                <p class="team-role">${esc(m.role)}</p>
                <p class="team-bio">${esc(m.bio)}</p>
            </div>`;
  }
  return `
    <section id="team">
        <h2 class="section-title">Meet the Team</h2>
        <div class="grid-3">${cards}
        </div>
    </section>`;
}

function sectionTestimonials(website: Website, c: AIContent): string {
  const userTestimonials = website.testimonials || [];
  let cards = '';
  if (userTestimonials.length) {
    for (const t of userTestimonials) {
      const rating = Math.min(parseInt(String(t.rating || 5), 10) || 5, 5);
      const stars = '⭐'.repeat(rating);
      cards += `
            <div class="testimonial-card">
                <div class="testimonial-stars">${stars}</div>
                <p class="testimonial-text">"${esc(t.text)}"</p>
                <p class="testimonial-author">— ${esc(t.author)}</p>
            </div>`;
    }
  } else {
    for (const t of c.testimonials || []) {
      cards += `
            <div class="testimonial-card">
                <p class="testimonial-text">"${esc(t.text)}"</p>
                <p class="testimonial-author">— ${esc(t.name)}, ${esc(t.role)}</p>
            </div>`;
    }
  }
  return `
    <section id="testimonials" class="alt-bg">
        <h2 class="section-title">What Our Clients Say</h2>
        <div class="grid-3">${cards}
        </div>
    </section>`;
}

function sectionPortfolio(website: Website, c: AIContent, images: ImageMap): string {
  const caseStudies = website.caseStudies || [];
  const items = caseStudies.length ? caseStudies : (c.portfolio_items || []);
  if (!items.length) return '';
  let cards = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Record<string, string | undefined>;
    const title = item.title || '';
    const desc = item.description || '';
    const extra = item.result || item.category || '';
    const badge = extra
      ? `<span class="portfolio-badge">${esc(extra)}</span>`
      : '';
    const portImg = images[`portfolio_${i}`] || '';
    const imgHtml = portImg
      ? `<img src="${portImg}" alt="${esc(title)}" class="portfolio-img">`
      : '';
    cards += `
            <div class="portfolio-card">
                ${imgHtml}
                <h3>${esc(title)}</h3>
                <p>${esc(desc)}</p>
                ${badge}
            </div>`;
  }
  return `
    <section id="portfolio">
        <h2 class="section-title">Our Work</h2>
        <div class="grid-3">${cards}
        </div>
    </section>`;
}

function sectionFaqs(_website: Website, c: AIContent): string {
  const faqs = c.faqs || [];
  if (!faqs.length) return '';
  let items = '';
  for (const faq of faqs) {
    items += `
            <details class="faq-item">
                <summary>${esc(faq.question)}</summary>
                <p>${esc(faq.answer)}</p>
            </details>`;
  }
  return `
    <section id="faqs">
        <h2 class="section-title">Frequently Asked Questions</h2>
        <div class="faq-list">${items}
        </div>
    </section>`;
}

function sectionBlog(_website: Website, c: AIContent, images: ImageMap): string {
  const posts = c.blog_posts || [];
  if (!posts.length) return '';
  let cards = '';
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const blogImg = images[`blog_${i}`] || '';
    const imgHtml = blogImg
      ? `<img src="${blogImg}" alt="${esc(post.title)}" class="blog-img">`
      : '';
    cards += `
            <div class="blog-card">
                ${imgHtml}
                <span class="blog-date">${esc(post.date)}</span>
                <h3>${esc(post.title)}</h3>
                <p>${esc(post.excerpt)}</p>
            </div>`;
  }
  return `
    <section id="blog">
        <h2 class="section-title">Latest News</h2>
        <div class="grid-2">${cards}
        </div>
    </section>`;
}

function sectionGallery(_website: Website, _c: AIContent, images: ImageMap): string {
  const urls = Object.entries(images)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .filter(Boolean);
  if (!urls.length) return '';
  const items = urls
    .map((url) => `\n            <div class="gallery-item"><img src="${url}" alt="" loading="lazy"></div>`)
    .join('');
  return `
    <section id="gallery" class="alt-bg">
        <h2 class="section-title">Gallery</h2>
        <div class="gallery-grid">${items}
        </div>
    </section>`;
}

function sectionContact(website: Website, _c: AIContent): string {
  const contact = website.contact || {};
  let rows = '';
  if (contact.email) {
    rows += `<p>✉ Email: <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></p>`;
  }
  if (contact.phone) {
    rows += `<p>📞 Phone: ${esc(contact.phone)}</p>`;
  }
  if (contact.address) {
    rows += `<p>📍 Address: ${esc(contact.address)}</p>`;
  }
  return `
    <section id="contact">
        <h2 class="section-title">Contact Us</h2>
        <div class="contact-info">${rows}
        </div>
    </section>`;
}

// ── Navbar builder ───────────────────────────────────
const NAV_LABELS: Record<string, string> = {
  about: 'About',
  services: 'Services',
  products: 'Products',
  pricing: 'Pricing',
  team: 'Team',
  testimonials: 'Reviews',
  portfolio: 'Portfolio',
  faqs: 'FAQs',
  blog: 'Blog',
  gallery: 'Gallery',
  contact: 'Contact',
};

function buildNav(sections: string[]): string {
  return sections
    .map((sec) => {
      const label = NAV_LABELS[sec];
      return label ? `\n            <li><a href="#${sec}">${label}</a></li>` : '';
    })
    .join('');
}

// ── Full CSS ─────────────────────────────────────────
function buildCss(primary: string, secondary: string): string {
  return `
        :root {
            --primary: ${primary};
            --secondary: ${secondary};
            --bg: #ffffff;
            --text: #1a1a2e;
            --text-light: #555;
            --radius: 12px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: var(--text); line-height: 1.6; }

        /* Nav */
        nav { display:flex; justify-content:space-between; align-items:center; padding:1rem 5%; background:rgba(255,255,255,0.95); backdrop-filter:blur(10px); position:fixed; width:100%; top:0; z-index:100; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
        .logo { font-size:1.5rem; font-weight:800; color:var(--primary); text-decoration:none; }
        .nav-links { display:flex; gap:2rem; list-style:none; }
        .nav-links a { text-decoration:none; color:var(--text); font-weight:500; transition:color .2s; }
        .nav-links a:hover { color:var(--primary); }

        /* Hero */
        .hero { padding:10rem 5% 6rem; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:white; text-align:center; }
        .hero h1 { font-size:clamp(2rem,5vw,3.5rem); font-weight:800; margin-bottom:1rem; }
        .hero p { font-size:1.25rem; opacity:.9; max-width:600px; margin:0 auto 2rem; }

        /* Buttons */
        .btn-primary { display:inline-block; padding:.9rem 2.5rem; background:white; color:var(--primary); font-weight:700; border-radius:var(--radius); text-decoration:none; transition:transform .2s, box-shadow .2s; }
        .btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 25px rgba(0,0,0,.15); }
        .btn-outline { display:inline-block; padding:.7rem 2rem; border:2px solid var(--primary); color:var(--primary); font-weight:600; border-radius:var(--radius); text-decoration:none; transition:all .2s; }
        .btn-outline:hover { background:var(--primary); color:white; }

        /* Sections */
        section { padding:5rem 5%; }
        .alt-bg { background:#f8f9fa; }
        .section-title { font-size:2rem; font-weight:700; text-align:center; margin-bottom:3rem; }

        /* About */
        .about-text { max-width:700px; margin:0 auto; text-align:center; color:var(--text-light); font-size:1.1rem; }
        .about-with-image { display:flex; align-items:center; gap:3rem; max-width:1100px; margin:0 auto; }
        .about-with-image .about-content { flex:1; }
        .about-with-image .about-content .section-title { text-align:left; }
        .about-with-image .about-text { text-align:left; margin:0; }
        .about-img { width:400px; height:300px; object-fit:cover; border-radius:var(--radius); flex-shrink:0; }
        @media (max-width:768px) { .about-with-image { flex-direction:column; } .about-img { width:100%; height:auto; } }

        /* Grids */
        .grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:2rem; max-width:1100px; margin:0 auto; }
        .grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:2rem; max-width:1100px; margin:0 auto; }

        /* Service cards */
        .service-card { background:#f8f9fa; border-radius:var(--radius); padding:0; text-align:center; transition:transform .2s, box-shadow .2s; overflow:hidden; }
        .service-card:hover { transform:translateY(-4px); box-shadow:0 12px 30px rgba(0,0,0,.08); }
        .service-icon { font-size:2.5rem; margin-bottom:1rem; padding-top:2rem; }
        .service-img { width:100%; height:180px; object-fit:cover; }
        .service-card h3 { margin-bottom:.5rem; color:var(--primary); padding:0 1.5rem; }
        .service-card h3:first-of-type { padding-top:1.5rem; }
        .service-card p { color:var(--text-light); padding:0 1.5rem 1.5rem; }

        /* Portfolio cards */
        .portfolio-img { width:100%; height:200px; object-fit:cover; border-radius:var(--radius) var(--radius) 0 0; margin-bottom:1rem; }

        /* Blog images */
        .blog-img { width:100%; height:180px; object-fit:cover; border-radius:var(--radius) var(--radius) 0 0; margin-bottom:1rem; }

        /* Product cards */
        .product-card { background:white; border-radius:var(--radius); overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.06); transition:transform .2s; }
        .product-card:hover { transform:translateY(-4px); }
        .card-img { width:100%; height:200px; object-fit:cover; }
        .card-body { padding:1.5rem; }
        .card-body h3 { margin-bottom:.5rem; color:var(--primary); }
        .card-body p { color:var(--text-light); font-size:.95rem; }
        .price-badge { display:inline-block; background:var(--primary); color:white; padding:.25rem .75rem; border-radius:20px; font-weight:700; font-size:.85rem; margin-bottom:.5rem; }

        /* Pricing cards */
        .pricing-card { background:white; border-radius:var(--radius); padding:2.5rem 2rem; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,.06); transition:transform .2s; }
        .pricing-card.featured { border:2px solid var(--primary); transform:scale(1.05); }
        .pricing-card:hover { transform:translateY(-4px); }
        .pricing-amount { font-size:2rem; font-weight:800; color:var(--primary); margin:1rem 0; }
        .pricing-features { list-style:none; text-align:left; margin:1.5rem 0; }
        .pricing-features li { padding:.4rem 0; color:var(--text-light); border-bottom:1px solid #f0f0f0; }

        /* Team cards */
        .team-card { background:white; border-radius:var(--radius); padding:2rem; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,.06); }
        .team-avatar { width:100px; height:100px; border-radius:50%; object-fit:cover; margin:0 auto 1rem; display:block; }
        .team-avatar-placeholder { width:100px; height:100px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:700; margin:0 auto 1rem; }
        .team-role { color:var(--primary); font-weight:600; margin-bottom:.5rem; }
        .team-bio { color:var(--text-light); font-size:.9rem; }

        /* Testimonials */
        .testimonial-card { background:white; border-radius:var(--radius); padding:2rem; box-shadow:0 2px 8px rgba(0,0,0,.05); }
        .testimonial-stars { margin-bottom:.5rem; }
        .testimonial-text { font-style:italic; color:var(--text-light); margin-bottom:1rem; }
        .testimonial-author { font-weight:600; color:var(--primary); }

        /* Portfolio */
        .portfolio-card { background:white; border-radius:var(--radius); padding:2rem; box-shadow:0 2px 12px rgba(0,0,0,.06); }
        .portfolio-card h3 { color:var(--primary); margin-bottom:.5rem; }
        .portfolio-card p { color:var(--text-light); }
        .portfolio-badge { display:inline-block; margin-top:.75rem; background:#e0e7ff; color:var(--primary); padding:.2rem .7rem; border-radius:20px; font-size:.8rem; font-weight:600; }

        /* FAQs */
        .faq-list { max-width:800px; margin:0 auto; }
        .faq-item { border-bottom:1px solid #e5e7eb; }
        .faq-item summary { padding:1.2rem 0; font-weight:600; cursor:pointer; font-size:1.05rem; }
        .faq-item summary:hover { color:var(--primary); }
        .faq-item p { padding:0 0 1.2rem; color:var(--text-light); }

        /* Blog */
        .blog-card { background:white; border-radius:var(--radius); padding:2rem; box-shadow:0 2px 12px rgba(0,0,0,.06); }
        .blog-date { color:var(--primary); font-size:.85rem; font-weight:600; }
        .blog-card h3 { margin:.5rem 0; }
        .blog-card p { color:var(--text-light); }

        /* Gallery */
        .gallery-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:1rem; max-width:1100px; margin:0 auto; }
        .gallery-item img { width:100%; height:200px; object-fit:cover; border-radius:var(--radius); transition:transform .3s; }
        .gallery-item img:hover { transform:scale(1.05); }

        /* CTA */
        .cta { text-align:center; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:white; }
        .cta .section-title { color:white; }
        .cta p { max-width:500px; margin:0 auto 2rem; opacity:.9; }

        /* Contact */
        .contact-info { text-align:center; color:var(--text-light); }
        .contact-info a { color:var(--primary); text-decoration:none; }
        .contact-info p { margin:.5rem 0; }

        /* Footer */
        footer { text-align:center; padding:2rem 5%; background:var(--text); color:rgba(255,255,255,.7); font-size:.9rem; }

        /* Mobile */
        @media (max-width: 768px) {
            .nav-links { display:none; }
            .hero { padding:8rem 5% 4rem; }
            .pricing-card.featured { transform:scale(1); }
        }
    `;
}

// ── Main HTML renderer ───────────────────────────────
export function renderWebsiteHtml(
  website: Website,
  content: { content: AIContent },
  images: ImageMap = {},
): string {
  const branding = website.branding || {};
  const primary = branding.primaryColor || '#2563EB';
  const secondary = branding.secondaryColor || '#1E40AF';
  const logoText = esc(branding.logoText || website.businessName || 'Site');
  const c = content.content || ({} as AIContent);

  // SEO
  const seo = website.seo || {};
  const metaTitle = esc(seo.metaTitle) || logoText;
  const metaDesc = esc(seo.metaDescription) || '';
  const ogImage = seo.ogImage || '';

  // Analytics
  const analytics = website.analytics || {};
  const gaId = analytics.googleAnalyticsId || '';
  const fbPixel = analytics.facebookPixelId || '';
  let analyticsHtml = '';
  if (gaId) {
    analyticsHtml += `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${esc(gaId)}"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(gaId)}');</script>`;
  }
  if (fbPixel) {
    analyticsHtml += `
    <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(fbPixel)}');fbq('track','PageView');</script>`;
  }

  // Determine which sections to render
  const enabled = website.enabledSections?.length
    ? website.enabledSections
    : ['hero', 'services', 'testimonials', 'contact'];

  const navLinks = buildNav(enabled);

  // Map section names → renderers
  const sectionMap: Record<string, () => string> = {
    hero: () => sectionHero(website, c, images),
    about: () => sectionAbout(website, c, images),
    services: () => sectionServices(website, c, images),
    products: () => sectionProducts(website, c, images),
    pricing: () => sectionPricing(website, c),
    team: () => sectionTeam(website, c, images),
    testimonials: () => sectionTestimonials(website, c),
    portfolio: () => sectionPortfolio(website, c, images),
    faqs: () => sectionFaqs(website, c),
    blog: () => sectionBlog(website, c, images),
    gallery: () => sectionGallery(website, c, images),
    contact: () => sectionContact(website, c),
  };

  let bodySections = '';
  for (const secName of enabled) {
    const renderer = sectionMap[secName];
    if (renderer) bodySections += renderer();
  }

  // CTA + footer
  const ctaHtml = `
    <section class="cta">
        <h2 class="section-title">${esc(c.cta_title || 'Get Started Today')}</h2>
        <p>${esc(c.cta_text || '')}</p>
        <a href="#contact" class="btn-primary">${esc(c.hero_cta || 'Contact Us')}</a>
    </section>`;

  const css = buildCss(primary, secondary);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metaTitle}</title>
    ${metaDesc ? `<meta name="description" content="${metaDesc}">` : ''}
    ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
    ${analyticsHtml}
    <style>${css}
    </style>
</head>
<body>
    <nav>
        <a href="#" class="logo">${logoText}</a>
        <ul class="nav-links">${navLinks}
        </ul>
    </nav>
${bodySections}
${ctaHtml}

    <footer>
        <p>${esc(c.footer_tagline || `© ${logoText}. All rights reserved.`)}</p>
    </footer>
</body>
</html>`;
}
