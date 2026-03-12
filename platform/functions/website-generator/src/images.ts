// ── Image generation & upload helpers ────────────────
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Website, ImageMap } from './types';

const s3 = new S3Client({});

const GENERATED_BUCKET = process.env.GENERATED_BUCKET || '';
const CDN_DOMAIN = process.env.CDN_DOMAIN || '';
const IMAGE_MODE = process.env.IMAGE_MODE || 'stock';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const OPENAI_SECRET_ARN = process.env.OPENAI_SECRET_ARN || '';

// Import getOpenAIKey lazily to avoid circular deps
let _getOpenAIKeyFn: (() => Promise<string>) | null = null;
export function setOpenAIKeyProvider(fn: () => Promise<string>) {
  _getOpenAIKeyFn = fn;
}

// ── Upload a data-URL (base64) to S3 → CDN URL ──────
export async function uploadDataUrl(
  dataUrl: string,
  customerId: string,
  websiteId: string,
  category: string,
  index: number,
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return '';

  const contentType = match[1];
  const body = Buffer.from(match[2], 'base64');
  const ext = contentType.split('/')[1] || 'png';
  const key = `${customerId}/${websiteId}/images/${category}_${index}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: GENERATED_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    }),
  );
  return `https://${CDN_DOMAIN}/${key}`;
}

// ── Resolve user-provided image (data URL → CDN, http → pass-through) ──
export async function resolveImage(
  url: string,
  customerId: string,
  websiteId: string,
  category: string,
  index: number,
): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) {
    return uploadDataUrl(url, customerId, websiteId, category, index);
  }
  if (url.startsWith('http')) {
    return uploadUrlToS3(url, customerId, websiteId, category, index);
  }
  return '';
}

// ── Download an external URL and upload to S3 ────────
export async function uploadUrlToS3(
  url: string,
  customerId: string,
  websiteId: string,
  category: string,
  index: number,
): Promise<string> {
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) return '';

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const body = Buffer.from(await resp.arrayBuffer());
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const key = `${customerId}/${websiteId}/images/${category}_${index}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: GENERATED_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      }),
    );
    return `https://${CDN_DOMAIN}/${key}`;
  } catch (err) {
    console.log(`[images] Failed to upload ${url}: ${err}`);
    return '';
  }
}

// ── DALL-E image generation ──────────────────────────
async function generateDalleImage(
  prompt: string,
  size: string = '1792x1024',
): Promise<string> {
  if (!_getOpenAIKeyFn) return '';
  const apiKey = await _getOpenAIKeyFn();
  if (!apiKey) return '';

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality: 'standard',
    }),
  });

  if (!resp.ok) {
    console.log(`[images] DALL-E error ${resp.status}: ${await resp.text()}`);
    return '';
  }

  const data = (await resp.json()) as { data?: { url?: string }[] };
  return data.data?.[0]?.url || '';
}

// ── Stock photo search (Unsplash API → Picsum fallback) ──
async function searchUnsplash(query: string, count: number = 1): Promise<string[]> {
  if (UNSPLASH_ACCESS_KEY) {
    try {
      const params = new URLSearchParams({
        query,
        per_page: String(count),
        orientation: 'landscape',
      });
      const resp = await fetch(
        `https://api.unsplash.com/search/photos?${params}`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } },
      );
      if (resp.ok) {
        const data = (await resp.json()) as { results?: { urls?: { regular?: string } }[] };
        const urls = (data.results || []).map((r) => r.urls?.regular || '').filter(Boolean);
        if (urls.length > 0) return urls;
      }
    } catch {
      // fall through to Picsum
    }
  }

  // Deterministic Picsum fallback
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const seed = simpleHash(`${query}_${i}`);
    urls.push(`https://picsum.photos/seed/${seed}/800/500`);
  }
  return urls;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

async function searchStockPhoto(query: string): Promise<string> {
  const results = await searchUnsplash(query, 1);
  return results[0] || '';
}

// ── Generate a single section image (DALL-E → stock fallback) ──
async function generateSectionImage(
  dallePrompt: string,
  stockQuery: string,
  customerId: string,
  websiteId: string,
  category: string,
  index: number,
  imageMode: string,
): Promise<string> {
  let url = '';

  if (imageMode === 'dalle') {
    url = await generateDalleImage(dallePrompt);
    if (url) {
      const cdnUrl = await uploadUrlToS3(url, customerId, websiteId, category, index);
      if (cdnUrl) return cdnUrl;
    }
    // fallback to stock
  }

  // Stock photo path
  url = await searchStockPhoto(stockQuery);
  if (url) {
    const cdnUrl = await uploadUrlToS3(url, customerId, websiteId, category, index);
    if (cdnUrl) return cdnUrl;
  }
  return url; // raw URL as last resort
}

// ── Orchestrator: generate all images for a website ──
export async function generateImagesForWebsite(
  website: Website,
  content: Record<string, unknown>,
  customerId: string,
  websiteId: string,
  imageMode: string = IMAGE_MODE,
): Promise<ImageMap> {
  const images: ImageMap = {};
  const businessName = website.businessName || 'business';
  const industry = website.industry || 'business';
  const enabled = website.enabledSections || [];

  console.log(`[images] Generating images for ${websiteId} (mode=${imageMode})`);

  // Hero image
  if (enabled.includes('hero')) {
    const dallePrompt = `Professional hero banner for a ${industry} business called "${businessName}". Modern, clean, high-quality commercial photography style.`;
    const stockQuery = `${industry} business professional`;
    const url = await generateSectionImage(
      dallePrompt, stockQuery, customerId, websiteId, 'hero', 0, imageMode,
    );
    if (url) images.hero = url;
  }

  // About image
  if (enabled.includes('about')) {
    const dallePrompt = `Professional team photo for a ${industry} company called "${businessName}". Warm, inviting atmosphere.`;
    const stockQuery = `${industry} team office`;
    const url = await generateSectionImage(
      dallePrompt, stockQuery, customerId, websiteId, 'about', 0, imageMode,
    );
    if (url) images.about = url;
  }

  // Service images
  if (enabled.includes('services')) {
    const services = (content.services as { name?: string }[]) || [];
    for (let i = 0; i < Math.min(services.length, 6); i++) {
      const svcName = services[i]?.name || `service ${i + 1}`;
      const dallePrompt = `Professional photo representing "${svcName}" service for a ${industry} business. Clean, modern style.`;
      const stockQuery = `${industry} ${svcName}`;
      const url = await generateSectionImage(
        dallePrompt, stockQuery, customerId, websiteId, 'service', i, imageMode,
      );
      if (url) images[`service_${i}`] = url;
    }
  }

  // Portfolio / case study images
  if (enabled.includes('portfolio')) {
    const items = (content.portfolio_items as { title?: string }[]) ||
                  (website.caseStudies || []);
    for (let i = 0; i < Math.min(items.length, 6); i++) {
      const title = items[i]?.title || `project ${i + 1}`;
      const dallePrompt = `Professional showcase image for a ${industry} project: "${title}".`;
      const stockQuery = `${industry} ${title} project`;
      const url = await generateSectionImage(
        dallePrompt, stockQuery, customerId, websiteId, 'portfolio', i, imageMode,
      );
      if (url) images[`portfolio_${i}`] = url;
    }
  }

  // Blog images
  if (enabled.includes('blog')) {
    const posts = (content.blog_posts as { title?: string }[]) || [];
    for (let i = 0; i < Math.min(posts.length, 4); i++) {
      const postTitle = posts[i]?.title || `article ${i + 1}`;
      const dallePrompt = `Blog header image about "${postTitle}" for a ${industry} business.`;
      const stockQuery = `${industry} ${postTitle}`;
      const url = await generateSectionImage(
        dallePrompt, stockQuery, customerId, websiteId, 'blog', i, imageMode,
      );
      if (url) images[`blog_${i}`] = url;
    }
  }

  console.log(`[images] Generated ${Object.keys(images).length} images`);
  return images;
}
