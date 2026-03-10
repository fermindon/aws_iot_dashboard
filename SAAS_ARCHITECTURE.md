# AI Website Generator SaaS - Technical Architecture

## Executive Summary
A multi-tenant SaaS platform that uses AI to generate custom, business-specific websites from a template system. Businesses input their information, select their industry, and the AI generates a fully functional, branded website deployed on AWS.

---

## 1. System Overview

### High-Level Architecture Diagram
```
User Interface Layer (React/Vue)
        ↓
API Gateway + Auth (Cognito)
        ↓
Microservices:
├─ Website Generation Service (Lambda)
├─ AI Service (SageMaker/OpenAI API)
├─ Template Management Service
├─ Customer Management Service
└─ Analytics Service
        ↓
Data Layer:
├─ DynamoDB (website configs, user data)
├─ S3 (templates, generated assets)
└─ RDS Aurora (transactional data)
        ↓
Deployment & Hosting:
├─ CloudFront (CDN)
├─ S3 (static site hosting)
└─ ECS/Lambda (dynamic services)
```

---

## 2. Core Components

### 2.1 Frontend - Admin Dashboard & Website Builder
**Tech Stack:** React/Vue.js + TypeScript + Tailwind CSS

**Features:**
- Business information form (name, industry, description, branding)
- Template selection UI
- Website preview in real-time
- Analytics dashboard
- Website management console

**Hosting:** CloudFront → S3 (SPA)

```typescript
// Example structure
/dashboard
  /pages
    - Onboarding
    - TemplateSelector
    - WebsiteBuilder
    - Analytics
    - Settings
  /services
    - websiteAPI
    - authService
    - analyticsService
```

### 2.2 AI Generation Engine

**Primary Components:**

1. **Prompt Engineering Service**
   - Converts business data → structured prompts
   - Maintains industry-specific templates
   - Handles content generation parameters

2. **AI Provider Integration**
   - **Option A:** OpenAI API (GPT-4) - Fast, flexible
   - **Option B:** AWS Bedrock - Integrated, multi-model
   - **Option C:** Custom fine-tuned model on SageMaker

3. **Content Generation Pipeline**
   ```
   Business Input
      ↓
   Data Validation & Enrichment
      ↓
   AI Prompt Generation
      ↓
   LLM Processing
      ↓
   Response Parsing & Validation
      ↓
   Image Generation (DALL-E / Stable Diffusion)
      ↓
   Content Caching
   ```

### 2.3 Template System

**Architecture:**
```
/templates
  /base                    # Core HTML structure
    - header.html
    - footer.html
    - navigation.html
  /industries
    /fitness-club
      - layout.html
      - default-sections.json
      - config.json
    /web-agency
      - layout.html
      - default-sections.json
      - config.json
    /restaurant
      - layout.html
      - default-sections.json
      - config.json
  /components             # Reusable components
    - hero.html
    - testimonials.html
    - pricing-table.html
    - contact-form.html
    - gallery.html
  /styles
    - base.css
    - tailwind.config.js
```

**Template Metadata (config.json):**
```json
{
  "id": "fitness-club-v1",
  "industry": "fitness",
  "name": "Premium Fitness Club Template",
  "version": "1.0.0",
  "sections": [
    {
      "id": "hero",
      "name": "Hero Section",
      "aiGenerated": true,
      "fields": ["headline", "subheadline", "cta_text", "hero_image"]
    },
    {
      "id": "services",
      "name": "Services Section",
      "aiGenerated": true,
      "fields": ["service_1", "service_2", "service_3"]
    }
  ],
  "colorPalette": "dynamic",
  "responsiveDesign": true
}
```

---

## 3. Database Schema

### 3.1 DynamoDB - NoSQL (Real-time Data)

**Tables:**

1. **websites** (Partition Key: customer_id, Sort Key: website_id)
   ```
   {
     customer_id: "cust_123",
     website_id: "web_456",
     business_name: "Fit Club Pro",
     industry: "fitness",
     template_id: "fitness-club-v1",
     domain: "fitclub.saasdomain.com",
     status: "published|draft|generating",
     ai_generation_params: {...},
     created_at: 1234567890,
     updated_at: 1234567890,
     live_version: 1,
     content: {...},
     branding: {
       primary_color: "#FF6B35",
       secondary_color: "#F7931E"
     }
   }
   ```

2. **website-versions** (Partition Key: website_id, Sort Key: version)
   - Track version history for rollback capability

3. **customers** (Partition Key: customer_id)
   ```
   {
     customer_id: "cust_123",
     email: "owner@business.com",
     company_name: "Fit Club",
     subscription_tier: "starter|professional|enterprise",
     websites_count: 3,
     ai_generations_used: 45,
     ai_generations_limit: 100,
     created_at: 1234567890,
     payment_status: "active"
   }
   ```

4. **generation-jobs** (Partition Key: job_id)
   - Track AI generation requests and status
   - TTL: 30 days

### 3.2 RDS Aurora PostgreSQL - Relational Data

**Tables:**

```sql
-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  company_name VARCHAR(255),
  subscription_tier VARCHAR(50),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Websites
CREATE TABLE websites (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  business_name VARCHAR(255),
  industry VARCHAR(100),
  template_id VARCHAR(100),
  custom_domain VARCHAR(255) UNIQUE,
  status VARCHAR(50),
  published_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Website Content
CREATE TABLE website_content (
  id UUID PRIMARY KEY,
  website_id UUID REFERENCES websites(id),
  section_id VARCHAR(100),
  content_value JSONB,
  ai_generated BOOLEAN,
  generation_model VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Analytics
CREATE TABLE page_analytics (
  id UUID PRIMARY KEY,
  website_id UUID REFERENCES websites(id),
  page_path VARCHAR(255),
  visit_count INTEGER,
  unique_visitors INTEGER,
  bounce_rate FLOAT,
  average_session_duration INTEGER,
  date DATE,
  UNIQUE(website_id, page_path, date)
);

-- Generation Jobs
CREATE TABLE ai_generation_jobs (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  website_id UUID REFERENCES websites(id),
  prompt TEXT,
  model VARCHAR(100),
  status VARCHAR(50),
  result JSONB,
  tokens_used INTEGER,
  cost_usd DECIMAL(10,4),
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### 3.3 S3 Buckets

1. **website-templates** (versioned)
   - Source templates and components
   - Versioning enabled

2. **generated-websites** (per customer)
   - Static HTML/CSS/JS
   - Organization: `s3://generated-websites/{customer_id}/{website_id}/`
   - Website hosting enabled + CloudFront

3. **ai-assets** (cache)
   - Generated images, processing results
   - Lifecycle policies for cost optimization

4. **website-backups**
   - Daily snapshots of configurations
   - 90-day retention

---

## 4. API Architecture

### 4.1 REST API Endpoints (API Gateway + Lambda)

**Base URL:** `https://api.websitegenerator.com/v1`

#### Authentication & Customers
```
POST   /auth/signup                    # Register
POST   /auth/login                     # Sign in
POST   /auth/refresh                   # Refresh token
GET    /customers/{customer_id}        # Get profile
PUT    /customers/{customer_id}        # Update profile
GET    /customers/{customer_id}/usage  # AI usage stats
```

#### Websites
```
POST   /customers/{customer_id}/websites           # Create website
GET    /customers/{customer_id}/websites           # List websites
GET    /websites/{website_id}                      # Get website details
PUT    /websites/{website_id}                      # Update website
DELETE /websites/{website_id}                      # Delete website
POST   /websites/{website_id}/publish              # Publish website
GET    /websites/{website_id}/preview              # Get preview (signed URL)
POST   /websites/{website_id}/regenerate           # Regenerate with AI
```

#### Templates
```
GET    /templates                      # List all templates
GET    /templates/{template_id}        # Get template details
GET    /templates/industry/{industry}  # Filter by industry
GET    /templates/{template_id}/config # Get editable config
```

#### AI Generation
```
POST   /ai/generate-content            # Generate section content
POST   /ai/generate-hero               # Generate hero section
POST   /ai/generate-images             # Generate hero/banner images
GET    /ai/generation-jobs/{job_id}    # Check generation status
POST   /ai/batch-generate              # Batch content generation
```

#### Analytics
```
GET    /websites/{website_id}/analytics         # Get analytics
GET    /websites/{website_id}/analytics/overview
GET    /websites/{website_id}/analytics/pages   # Per-page stats
GET    /websites/{website_id}/analytics/visitors
```

#### Custom Domains
```
POST   /websites/{website_id}/custom-domain  # Add custom domain
GET    /websites/{website_id}/dns-config     # Get DNS setup info
POST   /websites/{website_id}/verify-domain  # Verify ownership
DELETE /websites/{website_id}/custom-domain  # Remove custom domain
```

### 4.2 Request/Response Examples

**Create Website Request:**
```json
POST /customers/cust_123/websites

{
  "business_name": "FitFlow Fitness",
  "industry": "fitness",
  "template_id": "fitness-club-v1",
  "business_description": "Premium fitness center with yoga classes",
  "owner_contact": "owner@fitflow.com",
  "phone": "+1-555-0123",
  "address": "123 Wellness St, NYC",
  "services": ["Personal Training", "Group Classes", "Yoga"],
  "branding": {
    "primary_color": "#FF6B35",
    "secondary_color": "#F7931E",
    "logo_text": "FitFlow"
  }
}
```

**Generate Content Response:**
```json
{
  "job_id": "gen_xyz789",
  "status": "queued",
  "estimated_completion_seconds": 45,
  "content_sections": [
    {
      "section_id": "hero",
      "status": "in-progress"
    },
    {
      "section_id": "services",
      "status": "pending"
    }
  ]
}
```

**Polling for Generation Status:**
```json
GET /ai/generation-jobs/gen_xyz789

{
  "job_id": "gen_xyz789",
  "status": "completed",
  "results": {
    "hero": {
      "headline": "Transform Your Fitness Journey at FitFlow",
      "subheadline": "Expert trainers. Proven results. Your success story starts here.",
      "cta_text": "Start Your Free Trial Today"
    },
    "services": [
      {
        "title": "Personal Training",
        "description": "One-on-one sessions tailored..."
      }
    ]
  },
  "tokens_used": 2847,
  "cost_usd": 0.08,
  "completed_at": "2026-03-09T14:32:45Z"
}
```

---

## 5. Deployment & Hosting Architecture

### 5.1 Multi-Tenant Website Hosting Strategy

**Option A: Single S3 + CloudFront (Recommended for starting)**
- All generated websites in single S3 bucket: `generated-websites/{customer_id}/{website_id}/`
- Single CloudFront distribution with custom domain routing
- Pros: Simple, cost-effective
- Cons: Single point of failure, harder to scale per-tenant

**Option B: Per-Tenant S3 + CloudFront Distribution**
- Separate S3 bucket and CloudFront per customer/website
- Full isolation and independent scaling
- Pros: Better isolation, dedicated resources
- Cons: Higher complexity, higher costs

**Option C: Hybrid - Tiered by Subscription**
- Starter: Shared S3/CloudFront (fitclub.saasdomain.com)
- Professional: Shared with dedicated CloudFront path
- Enterprise: Dedicated S3 + CloudFront distribution

### 5.2 Website Generation & Deployment Pipeline

```
User Input
    ↓
Validation Service (Lambda)
    ↓
AI Generation Service (Lambda + OpenAI/Bedrock)
    ↓
Template Rendering (Lambda)
    - Inject AI content into templates
    - Apply branding (colors, fonts, logo)
    - Generate static HTML/CSS
    ↓
Asset Optimization (Lambda)
    - Minify CSS/JS
    - Optimize images
    - Generate responsive variants
    ↓
S3 Upload
    - Store at: s3://generated-websites/{customer_id}/{website_id}/
    - Enable public read-only access
    ↓
CloudFront Invalidation
    - Create invalidation for CDN refresh
    ↓
Database Update
    - Mark website as "published"
    - Log deployment timestamp
    ↓
DNS Configuration (if custom domain)
    - Update Route53 CNAME records
    ↓
Live Website Available
```

### 5.3 Lambda Functions Architecture

```
saas-website-generator/
├── functions/
│   ├── api-handler/                    # Main API Gateway handler
│   │   ├── auth.ts
│   │   ├── websites.ts
│   │   ├── templates.ts
│   │   └── index.ts
│   ├── ai-generation/
│   │   ├── prompt-builder.ts
│   │   ├── content-generator.ts
│   │   ├── image-generator.ts
│   │   └── index.ts
│   ├── website-renderer/
│   │   ├── template-engine.ts
│   │   ├── branding-applier.ts
│   │   ├── asset-optimizer.ts
│   │   └── s3-uploader.ts
│   ├── analytics-processor/
│   │   ├── cloudwatch-aggregator.ts
│   │   ├── ddb-writer.ts
│   │   └── index.ts
│   └── scheduled-tasks/
│       ├── cleanup-old-jobs.ts
│       ├── backup-configs.ts
│       └── billing-aggregator.ts
```

### 5.4 Infrastructure as Code (CloudFormation)

```yaml
# Key AWS Resources

Resources:
  # API Gateway
  WebsiteGeneratorAPI:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: website-generator-api
      ProtocolType: HTTP
      CorsPolicy:
        AllowOrigins:
          - https://app.websitegenerator.com
        AllowMethods:
          - GET
          - POST
          - PUT
          - DELETE

  # Lambda Functions
  ApiHandlerFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs18.x
      MemorySize: 256
      Timeout: 30
      Environment:
        Variables:
          OPENAI_API_KEY: !Sub '{{resolve:secretsmanager:openai-key:SecretString:api_key}}'
          DYNAMODB_TABLE: !Ref WebsitesTable
          S3_BUCKET: !Ref GeneratedWebsitesBucket

  AIGenerationFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: python3.11
      MemorySize: 512
      Timeout: 900
      EphemeralStorage:
        Size: 1024
      ReservedConcurrentExecutions: 10

  # DynamoDB
  WebsitesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: websites
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: customer_id
          AttributeType: S
        - AttributeName: website_id
          AttributeType: S
      KeySchema:
        - AttributeName: customer_id
          KeyType: HASH
        - AttributeName: website_id
          KeyType: RANGE
      TTL:
        AttributeName: expires_at
        Enabled: true

  # S3 Buckets
  GeneratedWebsitesBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'generated-websites-${AWS::AccountId}'
      VersioningConfiguration:
        Status: Enabled
      WebsiteConfiguration:
        IndexDocument: index.html
        ErrorDocument: 404.html
      PublicAccessBlockConfiguration:
        BlockPublicAcls: false
        BlockPublicPolicy: false
        IgnorePublicAcls: false
        RestrictPublicBuckets: false

  GeneratedWebsitesBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref GeneratedWebsitesBucket
      PolicyText:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal: '*'
            Action:
              - s3:GetObject
            Resource: !Sub '${GeneratedWebsitesBucket.Arn}/*'

  # CloudFront Distribution
  WebsiteCDN:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https
          CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6
          OriginRequestPolicyId: 216adef5-5c7f-47e4-b989-5492eafa07d3
        Origins:
          - Id: S3Origin
            DomainName: !GetAtt GeneratedWebsitesBucket.RegionalDomainName
            S3OriginConfig: {}
        Enabled: true
        HttpVersion: http2and3

  # RDS Aurora
  DBCluster:
    Type: AWS::RDS::DBCluster
    Properties:
      Engine: aurora-postgresql
      EngineVersion: '15.2'
      DatabaseName: saas_db
      MasterUsername: !Sub '{{resolve:secretsmanager:db-credentials:SecretString:username}}'
      MasterUserPassword: !Sub '{{resolve:secretsmanager:db-credentials:SecretString:password}}'

  # Cognito
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: website-generator-users
      Policies:
        PasswordPolicy:
          MinimumLength: 12
          RequireUppercase: true
          RequireLowercase: true
          RequireNumbers: true
          RequireSymbols: true
```

---

## 6. AI Integration Details

### 6.1 Prompt Engineering Strategy

```typescript
// Prompt builder pseudocode
class PromptBuilder {
  buildHeroSection(business: BusinessInfo): string {
    return `
You are an expert web copywriter. Generate a compelling hero section for a website.

Business Details:
- Name: ${business.name}
- Industry: ${business.industry}
- Description: ${business.description}
- Target Audience: ${business.targetAudience}

Generate JSON with:
{
  "headline": "...",           // Max 100 chars, action-oriented
  "subheadline": "...",        // Max 150 chars, benefit-focused
  "cta_text": "...",          // 2-4 words
  "cta_description": "..."     // Supporting text
}

Requirements:
- Tone: ${business.tone || 'professional'}
- Include industry-specific keywords
- Mobile-friendly length
- Emotionally resonant
    `;
  }

  buildServicesSection(business: BusinessInfo): string {
    // Similar approach for services
  }
}
```

### 6.2 Image Generation Integration

```typescript
interface ImageRequest {
  sectionType: 'hero' | 'service' | 'testimonial';
  businessContext: {
    industry: string;
    name: string;
    description: string;
    branding: BrandingInfo;
  };
  style: 'professional' | 'creative' | 'minimalist';
}

async function generateImage(request: ImageRequest): Promise<string> {
  const prompt = buildImagePrompt(request);
  
  // Option A: DALL-E 3
  const response = await openai.images.generate({
    prompt,
    model: 'dall-e-3',
    size: '1792x1024',
    quality: 'hd',
    n: 1
  });
  
  // Or Option B: Stable Diffusion via SageMaker
  const sageMakerResponse = await sagemaker.invoke({
    endpointName: 'stable-diffusion-endpoint',
    contentType: 'application/json',
    body: JSON.stringify({ prompt, steps: 50 })
  });
  
  return response.data[0].url;
}
```

### 6.3 Cost Optimization

**Caching Strategy:**
```typescript
// Cache AI-generated content to reduce API calls
class GenerationCache {
  async getOrGenerate(
    businessContext: BusinessInfo,
    sectionType: string
  ): Promise<string> {
    const cacheKey = hashBusinessContext(businessContext) + sectionType;
    
    // Try cache first (DynamoDB)
    const cached = await dynamodb.get({ Key: { id: cacheKey } });
    if (cached && !isExpired(cached)) {
      return cached.content;
    }
    
    // Generate if not cached
    const generated = await generateContent(businessContext, sectionType);
    
    // Cache with 30-day TTL
    await dynamodb.put({
      id: cacheKey,
      content: generated,
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
    });
    
    return generated;
  }
}
```

**Token/Cost Tracking:**
```typescript
async function trackAIUsage(
  customerId: string,
  tokens: number,
  costUsd: number
): Promise<void> {
  // Increment usage counter
  await dynamodb.update({
    Key: { customer_id: customerId },
    UpdateExpression: 'ADD tokens_used :t, cost_incurred :c',
    ExpressionAttributeValues: {
      ':t': tokens,
      ':c': costUsd
    }
  });
  
  // Check if over limit
  const customer = await getCustomer(customerId);
  if (tokens > customer.token_limit) {
    await notifyCustomer(customerId, 'Token limit approaching');
  }
}
```

---

## 7. Security Architecture

### 7.1 Authentication & Authorization

```
User Login
    ↓
Cognito: Email/Password MFA
    ↓
JWT Token Issued
    ↓
API Gateway: Authorizer validates JWT
    ↓
Lambda: Verify customer_id in token matches request
    ↓
DynamoDB: Row-level security via partition key
```

**Cognito Setup:**
```yaml
- MFA: Required for admin accounts
- Password Policy: 12+ chars, symbols, numbers
- Session: 12-hour default, 30-day refresh token
- Social Login: Optional (Google, GitHub)
```

### 7.2 Data Protection

- **Encryption at Rest:** S3 SSE-KMS, RDS encryption, DynamoDB encryption
- **Encryption in Transit:** TLS 1.3 for all connections
- **Secrets Management:** AWS Secrets Manager for API keys, DB credentials

```typescript
// Example: Secure API key retrieval
const secretsManager = new AWS.SecretsManager();

async function getOpenAIKey(): Promise<string> {
  const secret = await secretsManager.getSecretValue({
    SecretId: 'openai-api-key'
  }).promise();
  
  return JSON.parse(secret.SecretString).api_key;
}
```

### 7.3 API Security

- **Rate Limiting:** 100 requests/minute per customer (CloudWatch quotas)
- **Input Validation:** Sanitize all inputs, validate file uploads
- **CORS:** Whitelist specific origins
- **CSRF Protection:** SameSite cookies, CSRF tokens for state-changing operations

```typescript
// Rate limiting with Lambda
const rateLimit = new RateLimiter({
  points: 100,           // 100 requests
  duration: 60,          // per 60 seconds
  blockDuration: 300,    // block for 5 minutes if exceeded
  keyPrefix: 'customer'
});

async function apiHandler(event: APIGatewayEvent): Promise<any> {
  const customerId = getCustomerId(event);
  
  try {
    await rateLimit.consume(customerId);
  } catch (error) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Rate limit exceeded' })
    };
  }
  
  // Continue with request processing
}
```

---

## 8. Monitoring & Observability

### 8.1 CloudWatch Dashboards

```typescript
// Key metrics to monitor
const metrics = {
  // Application
  'api_latency_p95': 'ms',
  'ai_generation_success_rate': '%',
  'website_deployment_success_rate': '%',
  
  // Infrastructure
  'lambda_duration': 'ms',
  'dynamodb_consumed_capacity': 'units',
  's3_request_count': 'count',
  
  // AI/LLM
  'openai_api_calls': 'count',
  'openai_tokens_used': 'tokens',
  'openai_cost_usd': '$',
  'image_generation_queue_depth': 'jobs',
  
  // Business
  'websites_created': 'count',
  'ai_generations_per_customer': 'count',
  'active_subscriptions': 'count',
  'monthly_churn_rate': '%'
};
```

### 8.2 Logging Strategy

```typescript
// Structured logging
import winston from 'winston';

const logger = winston.createLogger({
  defaultMeta: {
    service: 'website-generator',
    environment: process.env.ENVIRONMENT
  },
  format: winston.format.json(),
  transports: [
    new winston.transports.CloudWatch({
      logGroupName: '/aws/lambda/website-generator',
      logStreamName: `${Date.now()}`
    })
  ]
});

// Log with context
logger.info('Website generated successfully', {
  website_id: 'web_123',
  customer_id: 'cust_456',
  ai_tokens_used: 2847,
  duration_seconds: 45
});

logger.error('AI generation failed', {
  website_id: 'web_123',
  error: error.message,
  retry_count: 3
});
```

### 8.3 Alerting

```yaml
Alerts:
  - API latency > 2 seconds (p95)
  - AI generation failure rate > 5%
  - DynamoDB throttling
  - S3 upload failures
  - CloudFront cache miss rate > 30%
  - RDS CPU > 80%
  - Lambda errors > 1%
  - OpenAI API errors
  - Daily costs exceed threshold
```

---

## 9. Scaling Strategy

### 9.1 Horizontal Scaling

**API Tier:**
- Lambda: Auto-scales (concurrent executions: 1000+)
- API Gateway: Managed, handles millions of requests
- Load balanced by AWS automatically

**AI Generation:**
- Lambda concurrency limit: 10 (configurable)
- Queue processing: SQS for large batches
- Async job processing with polling

```typescript
// Async generation with SQS
async function queueWebsiteGeneration(
  website_id: string,
  business_info: BusinessInfo
): Promise<string> {
  const jobId = generateJobId();
  
  // Queue for processing
  await sqs.sendMessage({
    QueueUrl: process.env.GENERATION_QUEUE_URL,
    MessageBody: JSON.stringify({
      job_id: jobId,
      website_id,
      business_info
    })
  });
  
  // Return job ID immediately
  return jobId;
}

// Worker Lambda processes queue
async function generationWorker(
  event: SQSEvent
): Promise<void> {
  for (const message of event.Records) {
    const { job_id, website_id, business_info } = 
        JSON.parse(message.body);
    
    try {
      const content = await generateWebsiteContent(business_info);
      await updateJobStatus(job_id, 'completed', content);
    } catch (error) {
      await updateJobStatus(job_id, 'failed', error.message);
    }
  }
}
```

**Database Scaling:**
- DynamoDB: On-demand billing for variable workloads
- Aurora: Auto-scaling read replicas
- Connection pooling for Lambda-to-RDS

### 9.2 Vertical Scaling

**Lambda Memory/CPU Tuning:**
```
Configuration | Memory | vCPU | Network | Cost/100ms
Small (256MB) | 256    | 0.2  | Low     | $0.0000000533
Medium (512MB)| 512    | 0.5  | Medium  | $0.0000001067
Large (1GB)   | 1024   | 1    | High    | $0.0000002133
```

### 9.3 Cost Optimization

1. **Reserved Capacity:**
   - Reserve Lambda concurrency for baseline
   - RDS Reserved Instances (1-year commitment)
   - CloudFront data transfer discounts

2. **Auto-Scaling Policies:**
   ```yaml
   DynamoDB:
     WriteCapacity: 100-1000 (auto-scale)
     ReadCapacity: 50-500 (auto-scale)
     Target utilization: 70%
   ```

3. **Caching Strategy:**
   - CloudFront: Default 24-hour TTL
   - API responses: Cache on client-side
   - AI generation results: 30-day cache

---

## 10. Deployment & DevOps

### 10.1 CI/CD Pipeline (GitHub Actions + AWS)

```yaml
name: Deploy Website Generator

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test
      - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run build
      - run: npm run package-lambda
      - uses: actions/upload-artifact@v3
        with:
          name: lambda-builds
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: lambda-builds
      - uses: aws-actions/cloudformation-stack-set-action@v1
        with:
          template: infra/cloudformation.yml
          aws-region: us-east-1
          parameter-overrides: |
            EnvironmentName=production
            LambdaCodeHash=${{ github.sha }}
```

### 10.2 Environment Configuration

```
Production:
  - Region: us-east-1, us-west-2 (multi-region)
  - Backup: Enabled, daily snapshots
  - Monitoring: Full CloudWatch dashboards
  - AI Model: GPT-4 (premium for better quality)
  - Cost Focus: Balanced

Staging:
  - Region: us-east-1
  - Backup: Weekly
  - Monitoring: Essential metrics only
  - AI Model: GPT-3.5-turbo (cost-effective)
  - Cost Focus: Minimal

Development:
  - Region: us-east-1
  - Backup: Manual
  - Monitoring: CloudWatch Logs only
  - AI Model: Local testing (mock)
  - Cost Focus: Minimal
```

---

## 11. Revenue Model & Billing

### 11.1 Subscription Tiers

```
Starter ($29/month)
├─ 1 website
├─ 50 AI generations/month
├─ Basic templates (5)
├─ Shared domain
└─ 1 GB storage

Professional ($99/month)
├─ 5 websites
├─ 250 AI generations/month
├─ All templates
├─ Custom domain (1)
├─ 10 GB storage
└─ Analytics

Enterprise (Custom pricing)
├─ Unlimited websites
├─ Unlimited AI generations
├─ White-label option
├─ Unlimited custom domains
├─ Dedicated support
└─ Advanced analytics & API access
```

### 11.2 Cost Model (per AI generation)

```
OpenAI GPT-4:
- Input: $0.03 / 1K tokens
- Output: $0.06 / 1K tokens
- Avg generation: 2,000 tokens → ~$0.08

DALL-E 3 Image:
- Standard quality: $0.04 per image
- HD quality: $0.08 per image

Total per website generation: ~$0.50-$2.00
(dependent on AI depth and number of images)
```

### 11.3 Billing Implementation

```typescript
// Track usage and charge periodically
interface UsageRecord {
  customer_id: string;
  website_id: string;
  ai_tokens: number;
  images_generated: number;
  cost_usd: number;
  timestamp: Date;
}

async function billCustomer(customerId: string): Promise<void> {
  // Get monthly usage
  const usage = await getDailyUsageStats(
    customerId,
    firstDayOfMonth,
    lastDayOfMonth
  );
  
  // Get subscription tier
  const customer = await getCustomer(customerId);
  
  // Calculate charges
  const baseCharge = getSubscriptionPrice(customer.tier);
  const overageCharge = calculateOverageCharges(
    usage,
    customer.tier
  );
  
  const totalCharge = baseCharge + overageCharge;
  
  // Charge via Stripe
  await stripe.invoices.create({
    customer: customer.stripe_id,
    auto_advance: true,
    collection_method: 'charge_automatically',
    custom_fields: [{
      name: 'Usage Summary',
      value: `${usage.total_generations} generations, ${usage.images_generated} images`
    }],
    lines: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Subscription' },
          unit_amount: Math.round(baseCharge * 100)
        },
        quantity: 1
      },
      ...(overageCharge > 0 ? [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Overage Charges' },
          unit_amount: Math.round(overageCharge * 100)
        },
        quantity: 1
      }] : [])
    ]
  });
}
```

---

## 12. Implementation Roadmap

### Phase 1: MVP (Weeks 1-8)
- [ ] Frontend: Business info form + template selector
- [ ] Backend: Customer management + authentication
- [ ] AI: GPT-3.5 integration for content generation
- [ ] Deployment: Single template to S3 + CloudFront
- [ ] Launch: Fitness club template only

### Phase 2: Feature Expansion (Weeks 9-16)
- [ ] Add 3 more industry templates
- [ ] Image generation (DALL-E)
- [ ] Custom domain support
- [ ] Analytics dashboard
- [ ] Subscription billing

### Phase 3: Enterprise Features (Weeks 17-24)
- [ ] White-label option
- [ ] Advanced API access
- [ ] A/B testing framework
- [ ] SEO optimization tools
- [ ] Multi-region deployment

### Phase 4: Scale & Optimize (Weeks 25+)
- [ ] Performance optimization
- [ ] Cost reduction initiatives
- [ ] ML-based personalization
- [ ] Mobile app (native iOS/Android)

---

## 13. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AI generation quality varies | High | Fine-tune prompts, implement QA review queue |
| High LLM API costs | High | Implement caching, rate limiting per tier, batch processing |
| Multi-tenant data isolation breach | Critical | Row-level security, encryption, regular audit |
| Deployment failures | High | Automated rollback, blue-green deployments, staging env |
| DDoS attacks on hosted websites | Medium | CloudFront DDoS protection, WAF rules |
| Customer domain hijacking | Medium | DNSSEC, domain verification requirements |
| Regional outage | High | Multi-region failover, database replication |

---

## 14. Success Metrics

**Technical KPIs:**
- API latency p95: < 1 second
- AI generation success rate: > 98%
- Website deployment time: < 2 minutes
- System uptime: > 99.9%

**Business KPIs:**
- Customer acquisition cost: < $50
- Monthly churn rate: < 5%
- Customer lifetime value: > $2,000
- Net revenue retention: > 110%

---

## Conclusion

This architecture provides a scalable, cost-effective SaaS platform for AI-powered website generation. It leverages AWS managed services to minimize operational overhead while maintaining security and performance at scale. The modular design allows for incremental feature development and easy customization per industry vertical.
