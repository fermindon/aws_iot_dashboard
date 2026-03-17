# Deploy Angelorum Solutions website to correct S3 bucket
# This script ensures deployment to the correct CloudFront-serving bucket

param(
    [string]$BucketName = "static-site-stack-websitebucket-aulk8ueyrez7",
    [string]$OriginPath = "/web-agency",
    [string]$DistributionId = "E1HVWARUI8ST5G",
    [switch]$InvalidateCache
)

$SourceDir = "apps\web-agency\website"

if (-not (Test-Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir"
    exit 1
}

Write-Host "Deploying Angelorum Solutions website..." -ForegroundColor Cyan
Write-Host "Source: $SourceDir"
Write-Host "Destination: s3://$BucketName$OriginPath"
Write-Host ""

# Sync to S3
Write-Host "Syncing files to S3..." -ForegroundColor Yellow
aws s3 sync $SourceDir "s3://$BucketName$OriginPath" --delete

if ($LASTEXITCODE -ne 0) {
    Write-Error "S3 sync failed"
    exit 1
}

Write-Host "✓ Files synced successfully" -ForegroundColor Green

# Invalidate CloudFront cache
if ($InvalidateCache) {
    Write-Host ""
    Write-Host "Invalidating CloudFront cache (Distribution: $DistributionId)..." -ForegroundColor Yellow
    aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" --query 'Invalidation.{Id:Id,Status:Status}' --output json
    Write-Host "✓ Invalidation created" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Tip: Run with -InvalidateCache flag to clear CloudFront cache" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "Website: https://www.angelorum.tech/"
