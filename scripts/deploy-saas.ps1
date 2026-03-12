<#
  Deploys the SaaS Website Generator platform.
  Creates/updates the CloudFormation stack, uploads Lambda code,
  seeds templates, deploys the admin dashboard, and outputs endpoints.

  Usage:
    .\scripts\deploy-saas.ps1
    .\scripts\deploy-saas.ps1 -StackName my-saas-stack -Region us-west-2
    .\scripts\deploy-saas.ps1 -OpenAISecretArn arn:aws:secretsmanager:us-east-1:123456:secret:openai-key
#>

param(
  [string]$StackName     = "saas-website-generator",
  [string]$Region        = "us-east-1",
  [string]$Environment   = "prod",
  [string]$OpenAISecretArn = ""
)

$ErrorActionPreference = "Stop"

# ── 1. Deploy CloudFormation stack ────────────────────
Write-Host "`n=== SaaS Platform Deploy ===" -ForegroundColor Cyan
Write-Host "Stack:       $StackName"
Write-Host "Region:      $Region"
Write-Host "Environment: $Environment"
Write-Host ""

$cfParams = @("EnvironmentName=$Environment")
if ($OpenAISecretArn) {
  $cfParams += "OpenAISecretArn=$OpenAISecretArn"
}

Write-Host "[1/7] Deploying CloudFormation stack..." -ForegroundColor Yellow
aws cloudformation deploy `
  --template-file infra/saas-platform.yml `
  --stack-name $StackName `
  --region $Region `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides @cfParams `
  --no-fail-on-empty-changeset

if ($LASTEXITCODE -ne 0) { throw "CloudFormation deploy failed" }
Write-Host "  Stack deployed." -ForegroundColor Green

# ── 2. Retrieve stack outputs ────────────────────────
Write-Host "[2/7] Reading stack outputs..." -ForegroundColor Yellow

function Get-StackOutput($key) {
  $val = aws cloudformation describe-stacks `
    --stack-name $StackName --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
  return $val
}

$apiEndpoint      = Get-StackOutput "SaaSApiEndpoint"
$generatedBucket  = Get-StackOutput "GeneratedSitesBucketName"
$templateBucket   = Get-StackOutput "TemplateBucketName"
$cdnDomain        = Get-StackOutput "GeneratedSitesCDNDomain"
$cdnId            = Get-StackOutput "GeneratedSitesCDNId"
$templatesTable   = Get-StackOutput "TemplatesTableName"
$apiRouterName    = "saas-api-router-$Environment"
$generatorName    = "saas-website-generator-$Environment"
$generationQueue  = Get-StackOutput "GenerationQueueUrl"

Write-Host "  API:             $apiEndpoint"
Write-Host "  CDN:             https://$cdnDomain"
Write-Host "  Generated Sites: $generatedBucket"
Write-Host "  Templates:       $templateBucket"

# ── 3. Build & deploy API Router Lambda (TypeScript) ──
Write-Host "[3/7] Building & deploying API Router Lambda..." -ForegroundColor Yellow

$apiRouterSrc = "platform/functions/api-router/src/index.ts"
$apiRouterOut = "dist/api-router"
$apiRouterZip = "$env:TEMP\saas-api-router.zip"

# Build TypeScript with esbuild
if (Test-Path $apiRouterOut) { Remove-Item $apiRouterOut -Recurse -Force }
npx esbuild $apiRouterSrc --bundle --platform=node --target=node20 --outfile="$apiRouterOut/index.js" --external:@aws-sdk/*
if ($LASTEXITCODE -ne 0) { throw "esbuild failed for API Router" }

if (Test-Path $apiRouterZip) { Remove-Item $apiRouterZip }
Compress-Archive -Path "$apiRouterOut\index.js" -DestinationPath $apiRouterZip -Force

aws lambda update-function-code `
  --function-name $apiRouterName `
  --zip-file "fileb://$apiRouterZip" `
  --region $Region | Out-Null

# Update environment variables to include queue URL
aws lambda update-function-configuration `
  --function-name $apiRouterName `
  --region $Region `
  --environment "Variables={CUSTOMERS_TABLE=$(Get-StackOutput 'CustomersTableName'),WEBSITES_TABLE=$(Get-StackOutput 'WebsitesTableName'),TEMPLATES_TABLE=$templatesTable,JOBS_TABLE=$(Get-StackOutput 'GenerationJobsTableName'),GENERATED_BUCKET=$generatedBucket,TEMPLATE_BUCKET=$templateBucket,CDN_DOMAIN=$cdnDomain,CDN_DISTRIBUTION_ID=$cdnId,GENERATION_QUEUE_URL=$generationQueue,ENVIRONMENT=$Environment}" | Out-Null

Write-Host "  API Router deployed." -ForegroundColor Green

# ── 4. Build & deploy Website Generator Lambda (TypeScript) ──
Write-Host "[4/7] Building & deploying Website Generator Lambda..." -ForegroundColor Yellow

$generatorSrc = "platform/functions/website-generator/src/handler.ts"
$generatorOut = "dist/website-generator"
$generatorZip = "$env:TEMP\saas-website-generator.zip"

# Build TypeScript with esbuild
if (Test-Path $generatorOut) { Remove-Item $generatorOut -Recurse -Force }
npx esbuild $generatorSrc --bundle --platform=node --target=node20 --outfile="$generatorOut/index.js" --external:@aws-sdk/*
if ($LASTEXITCODE -ne 0) { throw "esbuild failed for Website Generator" }

if (Test-Path $generatorZip) { Remove-Item $generatorZip }
Compress-Archive -Path "$generatorOut\index.js" -DestinationPath $generatorZip -Force

aws lambda update-function-code `
  --function-name $generatorName `
  --zip-file "fileb://$generatorZip" `
  --region $Region | Out-Null

Write-Host "  Website Generator deployed." -ForegroundColor Green

# ── 5. Upload templates to S3 ────────────────────────
Write-Host "[5/7] Uploading templates to S3..." -ForegroundColor Yellow

aws s3 sync platform/templates/ "s3://$templateBucket/templates/" --region $Region --delete
if ($LASTEXITCODE -ne 0) { throw "Template S3 sync failed" }
Write-Host "  Templates uploaded." -ForegroundColor Green

# ── 6. Seed template metadata into DynamoDB ──────────
Write-Host "[6/7] Seeding template metadata..." -ForegroundColor Yellow

python platform/scripts/seed_templates.py --table $templatesTable --region $Region
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Warning: Template seed failed (Python/boto3 may not be available). You can run it manually later." -ForegroundColor DarkYellow
}

# ── 7. Deploy Admin Dashboard ────────────────────────
Write-Host "[7/7] Deploying Admin Dashboard..." -ForegroundColor Yellow

# Write dashboard config with live API endpoint
$dashConfig = @{
  apiEndpoint = $apiEndpoint
  customerId  = "cust_fa3abe75bb63"
  cdnDomain   = $cdnDomain
} | ConvertTo-Json
$dashConfig | Set-Content -Path apps\dashboard\website\config.json -Encoding UTF8

# Get the main S3 bucket from the original stack (shared hosting)
$mainBucket = aws cloudformation describe-stacks `
  --stack-name "static-site-stack" --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text 2>$null

if ($mainBucket) {
  aws s3 sync apps/dashboard/website/ "s3://$mainBucket/dashboard/" --region $Region --delete
  Write-Host "  Dashboard deployed to /dashboard/ on main bucket." -ForegroundColor Green
  
  # Invalidate CloudFront cache for the dashboard distribution
  $dashboardCdnId = "E3J054RNYC35HW"
  aws cloudfront create-invalidation --distribution-id $dashboardCdnId --paths "/dashboard/*" --region $Region | Out-Null
  Write-Host "  Dashboard CloudFront cache invalidated." -ForegroundColor Green
} else {
  Write-Host "  Main hosting stack not found - dashboard files ready in apps/dashboard/website/" -ForegroundColor DarkYellow
}

# ── Summary ──────────────────────────────────────────
Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "SaaS API:           $apiEndpoint" -ForegroundColor White
Write-Host "Generated Sites CDN: https://$cdnDomain" -ForegroundColor White
Write-Host "Health Check:       $apiEndpoint/health" -ForegroundColor White
Write-Host "Templates:          $apiEndpoint/templates" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test the API:     Invoke-RestMethod ${apiEndpoint}/health"
Write-Host "  2. List templates:   Invoke-RestMethod ${apiEndpoint}/templates"
Write-Host "  3. Create a site:    POST ${apiEndpoint}/customers"
Write-Host '  4. (Optional) Store your OpenAI API key in Secrets Manager and redeploy with -OpenAISecretArn'
Write-Host ""
