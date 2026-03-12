// ── S3 deployment + CloudFront invalidation ─────────
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';

const s3 = new S3Client({});
const cf = new CloudFrontClient({});

const GENERATED_BUCKET = process.env.GENERATED_BUCKET || '';
const CDN_DOMAIN = process.env.CDN_DOMAIN || '';
const CDN_DISTRIBUTION_ID = process.env.CDN_DISTRIBUTION_ID || '';

/** Upload the generated HTML to S3 under the customer/website path. */
export async function deployToS3(
  customerId: string,
  websiteId: string,
  html: string,
): Promise<string> {
  const key = `${customerId}/${websiteId}/index.html`;

  await s3.send(
    new PutObjectCommand({
      Bucket: GENERATED_BUCKET,
      Key: key,
      Body: Buffer.from(html, 'utf-8'),
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'public, max-age=3600',
    }),
  );

  console.log(`[deploy] Uploaded to s3://${GENERATED_BUCKET}/${key}`);
  return `https://${CDN_DOMAIN}/${key}`;
}

/** Invalidate CloudFront cache for the deployed website. */
export async function invalidateCdn(
  customerId: string,
  websiteId: string,
): Promise<void> {
  if (!CDN_DISTRIBUTION_ID) return;
  try {
    await cf.send(
      new CreateInvalidationCommand({
        DistributionId: CDN_DISTRIBUTION_ID,
        InvalidationBatch: {
          Paths: {
            Quantity: 1,
            Items: [`/${customerId}/${websiteId}/*`],
          },
          CallerReference: String(Date.now()),
        },
      }),
    );
    console.log('[deploy] CDN invalidation sent');
  } catch (err) {
    console.log(`[deploy] CDN invalidation failed (non-fatal): ${err}`);
  }
}
