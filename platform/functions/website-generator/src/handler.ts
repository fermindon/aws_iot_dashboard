// ── SQS handler — entry point for the generator Lambda ──
import type { SQSEvent } from 'aws-lambda';
import { SQSMessageBody, Website, ImageMap } from './types';
import { resolveImage, generateImagesForWebsite, setOpenAIKeyProvider } from './images';
import { generateContentWithAI, getOpenAIKey } from './ai';
import { renderWebsiteHtml } from './renderer';
import { deployToS3, invalidateCdn } from './deploy';
import {
  updateJob,
  updateWebsiteStatus,
  fetchWebsite,
  saveGeneratedContent,
} from './db';

const IMAGE_MODE = process.env.IMAGE_MODE || 'stock';

// Wire up the OpenAI key provider so images.ts can use it for DALL-E
setOpenAIKeyProvider(getOpenAIKey);

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const body: SQSMessageBody = JSON.parse(record.body);
    const jobId = body.jobId || 'unknown';
    const websiteId = body.websiteId || '';
    let website: Website = (body.website || {}) as Website;
    let customerId = website.customerId || body.customerId || '';
    const reqImageMode = body.imageMode;

    console.log(`[generator] Processing job=${jobId}  website=${websiteId}`);

    // Always fetch the LATEST website record from DynamoDB
    if (websiteId) {
      const latest = await fetchWebsite(websiteId);
      if (latest) {
        website = latest;
        customerId = website.customerId || customerId;
      }
    }

    try {
      await updateJob(jobId, 'in-progress');

      // 0. Upload any base64 / external images to S3 and get CDN URLs
      const images: ImageMap = {};

      const teamMembers = website.teamMembers || [];
      for (let i = 0; i < teamMembers.length; i++) {
        const url = teamMembers[i].photoUrl || '';
        const cdnUrl = await resolveImage(url, customerId, websiteId, 'team', i);
        if (cdnUrl) images[`team_${i}`] = cdnUrl;
      }

      const products = website.products || [];
      for (let i = 0; i < products.length; i++) {
        const url = products[i].imageUrl || '';
        const cdnUrl = await resolveImage(url, customerId, websiteId, 'product', i);
        if (cdnUrl) images[`product_${i}`] = cdnUrl;
      }

      // 1. Generate content via AI (or fallback)
      const result = await generateContentWithAI(website);
      const content = result.content;

      await updateJob(jobId, 'rendering', {
        tokensUsed: result.tokensUsed,
        model: result.model,
      });

      // 1b. Generate images (DALL-E or stock photos) for sections
      const effectiveMode = (reqImageMode || IMAGE_MODE).toLowerCase();
      if (effectiveMode !== 'none') {
        await updateJob(jobId, 'generating-images');
        const aiImages = await generateImagesForWebsite(
          website,
          content as unknown as Record<string, unknown>,
          customerId,
          websiteId,
          effectiveMode,
        );
        // Merge: user-provided images take priority over AI/stock
        for (const [k, v] of Object.entries(aiImages)) {
          if (!(k in images)) images[k] = v;
        }
      }

      // 2. Render HTML with ALL sections + images
      const html = renderWebsiteHtml(website, { content }, images);

      // 3. Deploy to S3
      const liveUrl = await deployToS3(customerId, websiteId, html);

      // 4. Invalidate CDN
      await invalidateCdn(customerId, websiteId);

      // 5. Store generated content back on the website record
      await updateWebsiteStatus(customerId, websiteId, 'published', liveUrl);
      await saveGeneratedContent(
        customerId,
        websiteId,
        content as unknown as Record<string, unknown>,
      );

      await updateJob(jobId, 'completed', {
        liveUrl,
        aiGenerated: result.aiGenerated,
      });

      console.log(`[generator] Job ${jobId} completed — ${liveUrl}`);
    } catch (err) {
      console.log(`[generator] Job ${jobId} FAILED: ${err}`);
      await updateJob(jobId, 'failed', { error: String(err) });
      await updateWebsiteStatus(customerId, websiteId, 'failed');
      throw err; // Re-raise so SQS retries / sends to DLQ
    }
  }
}
