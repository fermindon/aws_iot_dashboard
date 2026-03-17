# Auto-detect correct S3 bucket from CloudFront distribution config
# This prevents hardcoding the wrong bucket

param(
    [string]$DistributionId = "E1HVWARUI8ST5G",
    [switch]$InvalidateCache,
    [switch]$DryRun
)

$SourceDir = "apps\web-agency\website"

if (-not (Test-Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir"
    exit 1
}

Write-Host "Querying CloudFront distribution for correct S3 bucket..." -ForegroundColor Cyan

# Get CloudFront distribution config
$distJson = aws cloudfront get-distribution --id $DistributionId --query 'Distribution.DistributionConfig' --output json
$dist = $distJson | ConvertFrom-Json

# Extract S3 bucket and origin path from first origin
$origin = $dist.Origins.Items[0]
$s3DomainName = $origin.DomainName
$originPath = $origin.OriginPath

# Extract bucket name from domain (format: bucket.s3.region.amazonaws.com)
$bucketName = $s3DomainName.Split('.')[0]

Write-Host "Found CloudFront configuration:" -ForegroundColor Green
Write-Host "  Distribution ID: $DistributionId"
Write-Host "  S3 Bucket: $bucketName"
Write-Host "  Origin Path: $originPath"
Write-Host "  Domain Alias: $($dist.Aliases.Items -join ', ')"
Write-Host ""

$s3Path = "s3://$bucketName$originPath"
Write-Host "Deploying to: $s3Path"
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN - Files that would be synced:" -ForegroundColor Yellow
    aws s3 sync $SourceDir $s3Path --delete --dryrun
    exit 0
}

# Sync to S3
Write-Host "Syncing files to S3..." -ForegroundColor Yellow
aws s3 sync $SourceDir $s3Path --delete

if ($LASTEXITCODE -ne 0) {
    Write-Error "S3 sync failed"
    exit 1
}

Write-Host "Files synced successfully" -ForegroundColor Green

# Invalidate CloudFront cache
if ($InvalidateCache) {
    Write-Host ""
    Write-Host "Invalidating CloudFront cache..." -ForegroundColor Yellow
    $inv = aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" --query 'Invalidation' --output json | ConvertFrom-Json
    Write-Host "Invalidation $($inv.Id) created (Status: $($inv.Status))" -ForegroundColor Green
}

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "Website: https://www.angelorum.tech/"
