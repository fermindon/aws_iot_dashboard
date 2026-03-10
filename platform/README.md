# AI Website Generator SaaS — Platform

This directory contains the backend services for the AI Website Generator SaaS platform.

## Structure

```
platform/
├── functions/
│   ├── api-router/           # API Gateway handler — routes all HTTP requests
│   │   └── index.py
│   └── website-generator/    # SQS worker — AI content generation + HTML rendering + S3 deploy
│       └── index.py
├── templates/
│   └── industries/
│       ├── fitness-club/     # Fitness gym/studio template
│       ├── web-agency/       # Digital agency template
│       ├── restaurant/       # Restaurant/café template
│       └── general/          # General-purpose template
└── scripts/
    └── seed_templates.py     # Seeds DynamoDB with template metadata
```

## Deploy

```powershell
# Full deploy (CloudFormation + Lambda code + templates + dashboard)
.\scripts\deploy-saas.ps1

# With OpenAI integration
.\scripts\deploy-saas.ps1 -OpenAISecretArn "arn:aws:secretsmanager:us-east-1:123456:secret:openai-key"

# Different environment
.\scripts\deploy-saas.ps1 -Environment dev -StackName saas-dev
```

## API Endpoints

After deployment, the API is available at the `SaaSApiEndpoint` stack output.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/customers` | Create a customer |
| GET | `/customers/{id}` | Get customer details |
| PUT | `/customers/{id}` | Update customer |
| POST | `/customers/{id}/websites` | Create a website |
| GET | `/customers/{id}/websites` | List customer's websites |
| GET | `/websites/{id}` | Get website details |
| PUT | `/websites/{id}` | Update website |
| DELETE | `/websites/{id}` | Delete website |
| POST | `/websites/{id}/publish` | Generate & deploy website |
| GET | `/templates` | List available templates |
| GET | `/templates/{id}` | Get template details |
| POST | `/ai/generate` | Queue AI content generation |
| GET | `/ai/jobs/{id}` | Check generation job status |

## Quick Test

```powershell
$api = "https://xxxxxxxx.execute-api.us-east-1.amazonaws.com/api"

# Health check
Invoke-RestMethod "$api/health"

# Create a customer
$customer = Invoke-RestMethod "$api/customers" -Method POST -ContentType "application/json" -Body (@{
    email = "test@example.com"
    companyName = "My Test Business"
    subscriptionTier = "starter"
} | ConvertTo-Json)

# Create a website
$website = Invoke-RestMethod "$api/customers/$($customer.customerId)/websites" -Method POST -ContentType "application/json" -Body (@{
    businessName = "FitFlow Fitness"
    industry = "fitness"
    templateId = "fitness-club-v1"
    description = "Premium fitness center"
    services = @("Personal Training", "Group Classes", "Yoga")
    branding = @{ primaryColor = "#FF6B35"; logoText = "FitFlow" }
    contact = @{ email = "hi@fitflow.com"; phone = "555-0123" }
} | ConvertTo-Json)

# Publish (triggers AI generation + deployment)
Invoke-RestMethod "$api/websites/$($website.websiteId)/publish" -Method POST

# Check generation status
Invoke-RestMethod "$api/ai/jobs/{jobId}"
```

## AWS Resources Created

- **Cognito** — User pool + client for auth
- **DynamoDB** — 4 tables (customers, websites, templates, generation-jobs)
- **S3** — 2 buckets (generated websites, template source files)
- **CloudFront** — CDN distribution for generated websites
- **Lambda** — 2 functions (API router, website generator worker)
- **SQS** — Generation queue + dead-letter queue
- **API Gateway** — HTTP API with 14 routes
- **IAM** — Lambda execution role with least-privilege policies
