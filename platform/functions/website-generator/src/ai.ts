// ── AI content generation (OpenAI) + fallback ───────
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { Website, AIContent, GenerationResult } from './types';

const sm = new SecretsManagerClient({});
const OPENAI_SECRET_ARN = process.env.OPENAI_SECRET_ARN || '';

// Cache the key for the lifetime of the Lambda container
let _cachedKey: string | null = null;

export async function getOpenAIKey(): Promise<string> {
  if (_cachedKey) return _cachedKey;
  if (!OPENAI_SECRET_ARN) return '';

  try {
    const res = await sm.send(
      new GetSecretValueCommand({ SecretId: OPENAI_SECRET_ARN }),
    );
    const raw = res.SecretString || '';
    try {
      const parsed = JSON.parse(raw);
      _cachedKey = parsed.apiKey || parsed.api_key || parsed.OPENAI_API_KEY || raw;
    } catch {
      _cachedKey = raw;
    }
    return _cachedKey!;
  } catch (err) {
    console.log(`[ai] Failed to fetch OpenAI key: ${err}`);
    return '';
  }
}

// ── AI content generation via OpenAI ─────────────────
export async function generateContentWithAI(
  website: Website,
): Promise<GenerationResult> {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    console.log('[ai] No OpenAI key — using fallback content');
    return {
      content: fallbackContent(website),
      aiGenerated: false,
      tokensUsed: 0,
      model: 'fallback',
    };
  }

  const businessName = website.businessName || 'Our Business';
  const industry = website.industry || 'general';
  const description = website.description || '';
  const style = website.style || 'professional';
  const enabled = website.enabledSections || [
    'hero',
    'services',
    'testimonials',
    'contact',
  ];

  const prompt = `Generate website content for a ${industry} business called "${businessName}".
Description: ${description}
Style: ${style}
Enabled sections: ${enabled.join(', ')}

Return a JSON object with these fields (include only those relevant to the enabled sections):
{
  "hero_headline": "compelling headline",
  "hero_subheadline": "supporting text",
  "hero_cta": "call to action button text",
  "about_title": "About section title",
  "about_text": "2-3 sentences about the business",
  "services": [{"name": "service name", "description": "short description", "icon": "single emoji"}],
  "pricing_plans": [{"name": "plan name", "price": "$XX/mo", "features": ["feature1", "feature2"]}],
  "testimonials": [{"text": "testimonial quote", "name": "person name", "role": "their role"}],
  "portfolio_items": [{"title": "project title", "description": "short description", "category": "category"}],
  "faqs": [{"question": "FAQ question?", "answer": "Concise answer"}],
  "blog_posts": [{"title": "article title", "excerpt": "short excerpt", "date": "Month YYYY"}],
  "cta_title": "call to action section title",
  "cta_text": "compelling CTA description",
  "footer_tagline": "short footer text"
}

Generate 3-6 items for list fields. Be specific to the ${industry} industry.
Return ONLY valid JSON, no markdown fences.`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional website content writer. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!resp.ok) {
      console.log(`[ai] OpenAI error ${resp.status}: ${await resp.text()}`);
      return {
        content: fallbackContent(website),
        aiGenerated: false,
        tokensUsed: 0,
        model: 'fallback',
      };
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
      model?: string;
    };

    const raw = data.choices?.[0]?.message?.content || '{}';
    // Strip potential markdown fences
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const content: AIContent = JSON.parse(cleaned);

    return {
      content,
      aiGenerated: true,
      tokensUsed: data.usage?.total_tokens || 0,
      model: data.model || 'gpt-4o-mini',
    };
  } catch (err) {
    console.log(`[ai] Content generation failed: ${err}`);
    return {
      content: fallbackContent(website),
      aiGenerated: false,
      tokensUsed: 0,
      model: 'fallback',
    };
  }
}

// ── Fallback content when AI is unavailable ──────────
function fallbackContent(website: Website): AIContent {
  const name = website.businessName || 'Our Business';
  const industry = website.industry || 'business';

  return {
    hero_headline: `Welcome to ${name}`,
    hero_subheadline: `Your trusted ${industry} partner`,
    hero_cta: 'Get Started',
    about_title: 'About Us',
    about_text: `${name} is a leading ${industry} company dedicated to providing exceptional services. We combine industry expertise with innovative solutions to deliver outstanding results for our clients.`,
    services: [
      {
        name: 'Consultation',
        description: `Expert ${industry} consultation tailored to your needs.`,
        icon: '💡',
      },
      {
        name: 'Implementation',
        description: 'Professional implementation and project management.',
        icon: '⚡',
      },
      {
        name: 'Support',
        description: 'Ongoing support and maintenance for your peace of mind.',
        icon: '🛡️',
      },
    ],
    testimonials: [
      {
        text: `${name} exceeded our expectations. Highly recommended!`,
        name: 'Sarah Johnson',
        role: 'CEO, TechCorp',
      },
      {
        text: 'Professional service from start to finish.',
        name: 'Michael Chen',
        role: 'Director, InnovateCo',
      },
      {
        text: 'The best in the industry. We will definitely work with them again.',
        name: 'Emily Davis',
        role: 'Manager, GlobalFirm',
      },
    ],
    cta_title: 'Ready to Get Started?',
    cta_text: 'Contact us today to learn how we can help your business grow.',
    footer_tagline: `© ${name}. All rights reserved.`,
  };
}
