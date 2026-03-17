# Angelorum Solutions — Deployment Reference

## Website Hosting

### S3 Buckets
- **Web Agency Website** (CORRECT BUCKET): `static-site-stack-websitebucket-aulk8ueyrez7`
  - Origin path: `/web-agency`
  - Source directory: `apps/web-agency/website/`
  
- ~~saas-generated-sites-398069592855-prod~~ ❌ (DO NOT USE for website files)
  - (This bucket is for Lambda function packages and template files)

### CloudFront Distribution
- **Distribution ID**: `E1HVWARUI8ST5G`
- **Domain**: `d5wngejoc0j6p.cloudfront.net`
- **Alias**: `angelorum.tech`, `www.angelorum.tech`
- **Default Root**: `index.html`

### API Gateway
- **Endpoint**: `https://9yvmc32yo3.execute-api.us-east-1.amazonaws.com/api/agency`
- **Function**: `web-agency-api-prod`
- **Runtime**: Node.js 20.x
- **Code Location**: `platform/functions/web-agency-api/`

## Deployment Commands

### Deploy website with cache invalidation (RECOMMENDED):
```powershell
.\scripts\deploy-web-agency.ps1 -InvalidateCache
```

### Deploy website without cache invalidation:
```powershell
.\scripts\deploy-web-agency.ps1
```

### Manual S3 sync to correct bucket:
```powershell
aws s3 sync apps/web-agency/website/ s3://static-site-stack-websitebucket-aulk8ueyrez7/web-agency/ --delete
```

### Clear CloudFront cache after manual sync:
```powershell
aws cloudfront create-invalidation --distribution-id E1HVWARUI8ST5G --paths "/*"
```

## Lambda Deployment

### Build backend API:
```powershell
cd platform/functions/web-agency-api
npm run build
```

### Package and deploy:
```powershell
Compress-Archive -Path dist\*, node_modules\*, package.json -DestinationPath lambda.zip -Force
aws s3 cp lambda.zip s3://saas-generated-sites-398069592855-prod/lambda/web-agency-api.zip
aws lambda update-function-code --function-name web-agency-api-prod --s3-bucket saas-generated-sites-398069592855-prod --s3-key lambda/web-agency-api.zip
```

## Environment Variables (Lambda)

| Variable | Value | Purpose |
|----------|-------|---------|
| `ORDERS_TABLE` | `web-agency-orders` | DynamoDB |
| `INQUIRIES_TABLE` | `web-agency-inquiries` | DynamoDB |
| `CUSTOMERS_TABLE` | `web-agency-customers` | DynamoDB |
| `STRIPE_SECRET_ARN` | `stripe-keys` | Secrets Manager |
| `FROM_EMAIL` | `noreply@angelorum.tech` | SES sender |
| `INTERNAL_EMAIL` | `inquiry@angelorum.tech` | Internal notifications |
| `DOMAIN` | `https://www.angelorum.tech` | Site domain |
| `CORS_ORIGIN` | `https://www.angelorum.tech` | CORS access |
| `STRIPE_WEBHOOK_SECRET` | (empty) | Stripe webhook verification |

## Key Files

- Website: `apps/web-agency/website/` 
- Backend API: `platform/functions/web-agency-api/src/handler.ts`
- Infrastructure: `infra/saas-platform.yml`
- Config: `apps/web-agency/website/config.json`

## Common Issues

### Changes not visible on website
- ✓ Verify files were synced to correct bucket: `static-site-stack-websitebucket-aulk8ueyrez7`
- ✓ Wait for CloudFront invalidation to complete (~1-2 min)
- ✓ Hard-refresh browser: `Ctrl+Shift+R` (Chrome/Firefox) or `Cmd+Shift+R` (Mac)

### API endpoint not working
- ✓ Verify Lambda was built: `npm run build`
- ✓ Check Lambda logs: `aws logs tail /aws/lambda/web-agency-api-prod --follow`
- ✓ Verify Stripe keys in Secrets Manager: `aws secretsmanager get-secret-value --secret-id stripe-keys`

### Email not sending (SES sandbox)
- ✓ Verify domain verified: `aws ses verify-domain-identity --domain angelorum.tech`
- ✓ Request production access at AWS SES console
- ✓ Check emails are being sent to verified addresses only (in sandbox mode)
