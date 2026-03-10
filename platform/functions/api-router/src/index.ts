/// <reference types="node" />
/**
 * SaaS API Router — Main entry point for the AI Website Generator SaaS platform.
 * Routes incoming HTTP API Gateway v2 requests to the appropriate handler.
 *
 * Runtime: Node.js 20.x (bundled with esbuild)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// ── AWS Clients ─────────────────────────────────────
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const sqs = new SQSClient({});
const cf = new CloudFrontClient({});

// ── Environment ─────────────────────────────────────
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE ?? '';
const WEBSITES_TABLE = process.env.WEBSITES_TABLE ?? '';
const TEMPLATES_TABLE = process.env.TEMPLATES_TABLE ?? '';
const JOBS_TABLE = process.env.JOBS_TABLE ?? '';
const GENERATED_BUCKET = process.env.GENERATED_BUCKET ?? '';
const CDN_DOMAIN = process.env.CDN_DOMAIN ?? '';
const CDN_DISTRIBUTION_ID = process.env.CDN_DISTRIBUTION_ID ?? '';
const GENERATION_QUEUE = process.env.GENERATION_QUEUE_URL ?? '';
const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';

// ── Types ───────────────────────────────────────────
interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

interface CustomerItem {
  customerId: string;
  email: string;
  companyName: string;
  subscriptionTier: string;
  websitesCount: number;
  aiGenerationsUsed: number;
  aiGenerationsLimit: number;
  createdAt: number;
  updatedAt: number;
}

interface TeamMember {
  name: string;
  role: string;
  bio: string;
  photoUrl: string;
}

interface ProductItem {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
}

interface TestimonialItem {
  author: string;
  text: string;
  rating: number;
}

interface CaseStudyItem {
  title: string;
  description: string;
  result: string;
}

interface SeoMeta {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogImage: string;
}

interface StylingOptions {
  fontFamily: string;
  borderRadius: string;
  spacing: string;
  animation: string;
}

interface AnalyticsConfig {
  googleAnalyticsId: string;
  facebookPixelId: string;
}

interface WebsiteItem {
  customerId: string;
  websiteId: string;
  businessName: string;
  industry: string;
  templateId: string;
  description: string;
  status: string;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logoText: string;
  };
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  services: string[];
  content: Record<string, unknown>;
  liveUrl: string;
  // ── Extended business data ──
  teamMembers: TeamMember[];
  products: ProductItem[];
  testimonials: TestimonialItem[];
  caseStudies: CaseStudyItem[];
  // ── Content sections ──
  enabledSections: string[];
  // ── Layout ──
  layoutVariation: string;
  // ── Advanced styling ──
  styling: StylingOptions;
  // ── SEO ──
  seo: SeoMeta;
  // ── Analytics ──
  analytics: AnalyticsConfig;
  // ── AI Generation ──
  useAI: boolean;
  aiGeneratedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ── Helpers ─────────────────────────────────────────
function resp(statusCode: number, body: Record<string, unknown>): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

function nowMs(): number {
  return Date.now();
}

function ttlDays(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86400;
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

function tierLimits(tier: string): number {
  const map: Record<string, number> = {
    starter: 50,
    professional: 250,
    enterprise: 99999,
  };
  return map[tier] ?? 50;
}

// ── Customer Handlers ───────────────────────────────
async function createCustomer(body: Record<string, unknown>): Promise<ApiResponse> {
  const customerId = `cust_${shortId()}`;
  const tier = (body.subscriptionTier as string) || 'starter';
  const item: CustomerItem = {
    customerId,
    email: (body.email as string) || '',
    companyName: (body.companyName as string) || '',
    subscriptionTier: tier,
    websitesCount: 0,
    aiGenerationsUsed: 0,
    aiGenerationsLimit: tierLimits(tier),
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  await ddb.send(new PutCommand({ TableName: CUSTOMERS_TABLE, Item: item }));
  return resp(201, item as unknown as Record<string, unknown>);
}

async function getCustomer(customerId: string): Promise<ApiResponse> {
  const result = await ddb.send(
    new GetCommand({ TableName: CUSTOMERS_TABLE, Key: { customerId } })
  );
  if (!result.Item) return resp(404, { error: 'Customer not found' });
  return resp(200, result.Item as Record<string, unknown>);
}

async function updateCustomer(
  customerId: string,
  body: Record<string, unknown>
): Promise<ApiResponse> {
  const allowedKeys = ['email', 'companyName', 'subscriptionTier'];
  const updateParts: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  for (const key of allowedKeys) {
    if (key in body) {
      updateParts.push(`#${key} = :${key}`);
      values[`:${key}`] = body[key];
      names[`#${key}`] = key;
    }
  }

  // If tier changes, update limit too
  if (body.subscriptionTier) {
    updateParts.push('#aiGenerationsLimit = :aiGenerationsLimit');
    values[':aiGenerationsLimit'] = tierLimits(body.subscriptionTier as string);
    names['#aiGenerationsLimit'] = 'aiGenerationsLimit';
  }

  updateParts.push('#updatedAt = :updatedAt');
  values[':updatedAt'] = nowMs();
  names['#updatedAt'] = 'updatedAt';

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: CUSTOMERS_TABLE,
        Key: { customerId },
        UpdateExpression: 'SET ' + updateParts.join(', '),
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: names,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(customerId)',
      })
    );
    return resp(200, result.Attributes as Record<string, unknown>);
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return resp(404, { error: 'Customer not found' });
    }
    throw err;
  }
}

// ── Website Handlers ────────────────────────────────
async function createWebsite(
  customerId: string,
  body: Record<string, unknown>
): Promise<ApiResponse> {
  const websiteId = `web_${shortId()}`;
  const branding = (body.branding as Record<string, string>) || {};
  const contact = (body.contact as Record<string, string>) || {};

  const styling = (body.styling as Record<string, string>) || {};
  const seo = (body.seo as Record<string, unknown>) || {};
  const analytics = (body.analytics as Record<string, string>) || {};

  const defaultSections = ['hero', 'services', 'testimonials', 'contact'];

  const item: WebsiteItem = {
    customerId,
    websiteId,
    businessName: (body.businessName as string) || '',
    industry: (body.industry as string) || '',
    templateId: (body.templateId as string) || '',
    description: (body.description as string) || '',
    status: 'draft',
    branding: {
      primaryColor: branding.primaryColor || '#2563EB',
      secondaryColor: branding.secondaryColor || '#1E40AF',
      logoText: branding.logoText || (body.businessName as string) || '',
    },
    contact: {
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
    },
    services: (body.services as string[]) || [],
    content: {},
    liveUrl: '',
    // Extended business data
    teamMembers: (body.teamMembers as TeamMember[]) || [],
    products: (body.products as ProductItem[]) || [],
    testimonials: (body.testimonials as TestimonialItem[]) || [],
    caseStudies: (body.caseStudies as CaseStudyItem[]) || [],
    // Content sections
    enabledSections: (body.enabledSections as string[]) || defaultSections,
    // Layout
    layoutVariation: (body.layoutVariation as string) || 'modern',
    // Advanced styling
    styling: {
      fontFamily: styling.fontFamily || 'Inter, system-ui, sans-serif',
      borderRadius: styling.borderRadius || 'rounded',
      spacing: styling.spacing || 'comfortable',
      animation: styling.animation || 'subtle',
    },
    // SEO
    seo: {
      metaTitle: (seo.metaTitle as string) || '',
      metaDescription: (seo.metaDescription as string) || '',
      keywords: (seo.keywords as string[]) || [],
      ogImage: (seo.ogImage as string) || '',
    },
    // Analytics
    analytics: {
      googleAnalyticsId: analytics.googleAnalyticsId || '',
      facebookPixelId: analytics.facebookPixelId || '',
    },
    // AI Generation
    useAI: (body.useAI as boolean) || false,
    aiGeneratedAt: 0,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  await ddb.send(new PutCommand({ TableName: WEBSITES_TABLE, Item: item }));

  // Increment customer website count
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: CUSTOMERS_TABLE,
        Key: { customerId },
        UpdateExpression: 'ADD websitesCount :one',
        ExpressionAttributeValues: { ':one': 1 },
      })
    );
  } catch {
    // Non-critical — don't fail the request
  }

  return resp(201, item as unknown as Record<string, unknown>);
}

async function listWebsites(customerId: string): Promise<ApiResponse> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      KeyConditionExpression: 'customerId = :cid',
      ExpressionAttributeValues: { ':cid': customerId },
    })
  );
  const items = result.Items ?? [];
  return resp(200, { customerId, websites: items, count: items.length });
}

async function getWebsite(websiteId: string): Promise<ApiResponse> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      IndexName: 'websiteId-index',
      KeyConditionExpression: 'websiteId = :wid',
      ExpressionAttributeValues: { ':wid': websiteId },
    })
  );
  const items = result.Items ?? [];
  if (items.length === 0) return resp(404, { error: 'Website not found' });
  return resp(200, items[0] as Record<string, unknown>);
}

async function updateWebsite(
  websiteId: string,
  body: Record<string, unknown>
): Promise<ApiResponse> {
  // Look up by GSI to get partition key
  const query = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      IndexName: 'websiteId-index',
      KeyConditionExpression: 'websiteId = :wid',
      ExpressionAttributeValues: { ':wid': websiteId },
    })
  );
  const items = query.Items ?? [];
  if (items.length === 0) return resp(404, { error: 'Website not found' });
  const existing = items[0];

  const allowedKeys = [
    'businessName',
    'industry',
    'templateId',
    'description',
    'status',
    'branding',
    'contact',
    'services',
    'content',
    'teamMembers',
    'products',
    'testimonials',
    'caseStudies',
    'enabledSections',
    'layoutVariation',
    'styling',
    'seo',
    'analytics',
    'useAI',
  ];
  const updateParts: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  for (const key of allowedKeys) {
    if (key in body) {
      updateParts.push(`#${key} = :${key}`);
      values[`:${key}`] = body[key];
      names[`#${key}`] = key;
    }
  }

  updateParts.push('#updatedAt = :updatedAt');
  values[':updatedAt'] = nowMs();
  names['#updatedAt'] = 'updatedAt';

  const result = await ddb.send(
    new UpdateCommand({
      TableName: WEBSITES_TABLE,
      Key: { customerId: existing.customerId as string, websiteId },
      UpdateExpression: 'SET ' + updateParts.join(', '),
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ReturnValues: 'ALL_NEW',
    })
  );
  return resp(200, result.Attributes as Record<string, unknown>);
}

async function deleteWebsite(websiteId: string): Promise<ApiResponse> {
  const query = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      IndexName: 'websiteId-index',
      KeyConditionExpression: 'websiteId = :wid',
      ExpressionAttributeValues: { ':wid': websiteId },
    })
  );
  const items = query.Items ?? [];
  if (items.length === 0) return resp(404, { error: 'Website not found' });
  const existing = items[0];

  await ddb.send(
    new DeleteCommand({
      TableName: WEBSITES_TABLE,
      Key: { customerId: existing.customerId as string, websiteId },
    })
  );
  return resp(200, { deleted: true, websiteId });
}

async function publishWebsite(websiteId: string): Promise<ApiResponse> {
  const query = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      IndexName: 'websiteId-index',
      KeyConditionExpression: 'websiteId = :wid',
      ExpressionAttributeValues: { ':wid': websiteId },
    })
  );
  const items = query.Items ?? [];
  if (items.length === 0) return resp(404, { error: 'Website not found' });
  const website = items[0] as Record<string, unknown>;

  const jobId = `gen_${shortId()}`;

  // Create generation job
  await ddb.send(
    new PutCommand({
      TableName: JOBS_TABLE,
      Item: {
        jobId,
        websiteId,
        customerId: website.customerId,
        status: 'queued',
        createdAt: nowMs(),
        ttl: ttlDays(30),
      },
    })
  );

  // Update website status to generating
  await ddb.send(
    new UpdateCommand({
      TableName: WEBSITES_TABLE,
      Key: { customerId: website.customerId as string, websiteId },
      UpdateExpression: 'SET #s = :s, #u = :u',
      ExpressionAttributeValues: { ':s': 'generating', ':u': nowMs() },
      ExpressionAttributeNames: { '#s': 'status', '#u': 'updatedAt' },
    })
  );

  // Send to SQS for async processing
  if (GENERATION_QUEUE) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: GENERATION_QUEUE,
        MessageBody: JSON.stringify({
          jobId,
          websiteId,
          website,
        }),
      })
    );
  }

  return resp(202, {
    jobId,
    status: 'queued',
    message: 'Website generation queued. Poll GET /ai/jobs/{jobId} for status.',
  });
}

// ── CloudFront Cache Invalidation ────────────────
async function invalidateSiteCache(websiteId: string): Promise<ApiResponse> {
  if (!CDN_DISTRIBUTION_ID) {
    return resp(500, { error: 'CloudFront distribution not configured' });
  }

  const query = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      IndexName: 'websiteId-index',
      KeyConditionExpression: 'websiteId = :wid',
      ExpressionAttributeValues: { ':wid': websiteId },
    })
  );
  const items = query.Items ?? [];
  if (items.length === 0) return resp(404, { error: 'Website not found' });
  const website = items[0] as Record<string, unknown>;
  const customerId = website.customerId as string;

  try {
    await cf.send(
      new CreateInvalidationCommand({
        DistributionId: CDN_DISTRIBUTION_ID,
        InvalidationBatch: {
          Paths: {
            Quantity: 1,
            Items: [`/${customerId}/${websiteId}/*`],
          },
          CallerReference: `inv_${Date.now()}`,
        },
      })
    );
    return resp(202, {
      message: 'CloudFront cache invalidation queued',
      path: `/${customerId}/${websiteId}/*`,
    });
  } catch (err) {
    console.error('[router] CloudFront invalidation failed:', err);
    return resp(500, { error: 'Failed to invalidate cache' });
  }
}

// ── Template Handlers ───────────────────────────────
async function listTemplates(): Promise<ApiResponse> {
  const result = await ddb.send(new ScanCommand({ TableName: TEMPLATES_TABLE }));
  const items = result.Items ?? [];
  return resp(200, { templates: items, count: items.length });
}

async function getTemplate(templateId: string): Promise<ApiResponse> {
  const result = await ddb.send(
    new GetCommand({ TableName: TEMPLATES_TABLE, Key: { templateId } })
  );
  if (!result.Item) return resp(404, { error: 'Template not found' });
  return resp(200, result.Item as Record<string, unknown>);
}

// ── AI Generation Handlers ──────────────────────────
async function triggerGeneration(body: Record<string, unknown>): Promise<ApiResponse> {
  const websiteId = body.websiteId as string;
  const customerId = body.customerId as string;
  if (!websiteId || !customerId) {
    return resp(400, { error: 'websiteId and customerId are required' });
  }

  const jobId = `gen_${shortId()}`;
  const sections = (body.sections as string[]) || [
    'hero',
    'services',
    'testimonials',
    'contact',
  ];

  await ddb.send(
    new PutCommand({
      TableName: JOBS_TABLE,
      Item: {
        jobId,
        websiteId,
        customerId,
        status: 'queued',
        sections,
        createdAt: nowMs(),
        ttl: ttlDays(30),
      },
    })
  );

  if (GENERATION_QUEUE) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: GENERATION_QUEUE,
        MessageBody: JSON.stringify({
          jobId,
          websiteId,
          customerId,
          sections,
        }),
      })
    );
  }

  return resp(202, { jobId, status: 'queued' });
}

async function getGenerationJob(jobId: string): Promise<ApiResponse> {
  const result = await ddb.send(
    new GetCommand({ TableName: JOBS_TABLE, Key: { jobId } })
  );
  if (!result.Item) return resp(404, { error: 'Job not found' });
  return resp(200, result.Item as Record<string, unknown>);
}

// ── Main Router ─────────────────────────────────────
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  let path = event.rawPath || '';
  const method =
    event.requestContext?.http?.method || '';
  const params = event.pathParameters || {};

  // Strip API Gateway stage prefix (e.g. /api/health -> /health)
  const stage = event.requestContext?.stage || '';
  if (stage && path.startsWith(`/${stage}`)) {
    path = path.slice(stage.length + 1);
  }
  if (!path) path = '/';

  let body: Record<string, unknown> = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return resp(400, { error: 'Invalid JSON body' });
    }
  }

  console.log(`[router] ${method} ${path}  params=${JSON.stringify(params)}`);

  try {
    // Health
    if (path === '/health') {
      return resp(200, { status: 'ok', environment: ENVIRONMENT });
    }

    // ── Customers ────────────────────────────
    if (path === '/customers' && method === 'POST') {
      return await createCustomer(body);
    }

    if (path.includes('/customers/') && path.split('/').length === 3) {
      const cid = params.customerId || path.split('/')[2];
      if (method === 'GET') return await getCustomer(cid);
      if (method === 'PUT') return await updateCustomer(cid, body);
    }

    // ── Websites ─────────────────────────────
    if (path.endsWith('/websites') && method === 'POST') {
      const cid = params.customerId || path.split('/')[2];
      return await createWebsite(cid, body);
    }

    if (path.endsWith('/websites') && method === 'GET') {
      const cid = params.customerId || path.split('/')[2];
      return await listWebsites(cid);
    }

    if (path.startsWith('/websites/') && !path.includes('/publish')) {
      const wid = params.websiteId || path.split('/')[2];
      if (method === 'GET') return await getWebsite(wid);
      if (method === 'PUT') return await updateWebsite(wid, body);
      if (method === 'DELETE') return await deleteWebsite(wid);
    }

    if (path.endsWith('/publish') && method === 'POST') {
      const wid = params.websiteId || path.split('/')[2];
      return await publishWebsite(wid);
    }

    if (path.endsWith('/invalidate-cache') && method === 'POST') {
      const wid = params.websiteId || path.split('/')[2];
      return await invalidateSiteCache(wid);
    }

    // ── Templates ────────────────────────────
    if (path === '/templates' && method === 'GET') {
      return await listTemplates();
    }

    if (path.startsWith('/templates/') && method === 'GET') {
      const tid = params.templateId || path.split('/')[2];
      return await getTemplate(tid);
    }

    // ── AI Generation ────────────────────────
    if (path === '/ai/generate' && method === 'POST') {
      return await triggerGeneration(body);
    }

    if (path.startsWith('/ai/jobs/') && method === 'GET') {
      const jid = params.jobId || path.split('/')[3];
      return await getGenerationJob(jid);
    }

    return resp(404, { error: 'Not found', path, method });
  } catch (err: unknown) {
    console.error('[router] ERROR:', err);
    return resp(500, { error: 'Internal server error' });
  }
}
