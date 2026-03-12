<#
  Deploys the CloudFormation stack and uploads all application files to the created S3 bucket.
  Deploys Sentinel IoT Dashboard (root), Fitness Club (/fitness-club), and Web Agency (/web-agency)
  to a single S3 bucket.
  Requirements: AWS CLI v2 configured with permissions to create S3, CloudFront, and CloudFormation stacks.
#>

param(
  [string]$StackName = "static-site-stack",
  [string]$Region = "us-east-1"
)

Write-Host "Deploying CloudFormation stack: $StackName in $Region"

# ── Build & upload API Router Lambda code ──────────
Write-Host "Building API Router Lambda..."
npm run build:api-router
if ($LASTEXITCODE -ne 0) { throw "API Router build failed" }

Write-Host "Packaging API Router Lambda zip..."
$lambdaZipDir = "dist/api-router"
$lambdaZip = "dist/api-router.zip"
if (Test-Path $lambdaZip) { Remove-Item $lambdaZip -Force }
Compress-Archive -Path "$lambdaZipDir/index.js" -DestinationPath $lambdaZip

$artifactBucket = "esp1-static-site-websitebucket-vdg6opbm6kz2"
Write-Host "Uploading API Router zip to s3://$artifactBucket/lambda/api-router.zip ..."
aws s3 cp $lambdaZip "s3://$artifactBucket/lambda/api-router.zip" --region $Region
if ($LASTEXITCODE -ne 0) { throw "Lambda zip upload failed" }

# Template is large (>51KB), must use S3 for deployment
aws cloudformation deploy --template-file infra/cloudformation.yml --stack-name $StackName --region $Region --capabilities CAPABILITY_NAMED_IAM --s3-bucket $artifactBucket

if ($LASTEXITCODE -ne 0) { throw "CloudFormation deploy failed" }

# ── Update API Router Lambda code (ensure latest) ──
Write-Host "Updating SaaS API Router Lambda code..."
$saasLambdaName = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='SaasApiRouterFunctionName'].OutputValue" --output text
if ($saasLambdaName -and $saasLambdaName -ne "None") {
  aws lambda update-function-code --function-name $saasLambdaName --s3-bucket $artifactBucket --s3-key lambda/api-router.zip --region $Region | Out-Null
  Write-Host "API Router Lambda code updated: $saasLambdaName"
}

Write-Host "Retrieving bucket name..."
$bucket = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text
if (-not $bucket) { throw "Could not read BucketName from stack outputs" }

Write-Host "Uploading website files to s3://$bucket ..."
Write-Host "Fetching WebSocket and Query API endpoints, writing apps/iot-dashboard/website/config.json"
$ws = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='WebSocketEndpoint'].OutputValue" --output text
$queryApi = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='QueryApiEndpoint'].OutputValue" --output text

$cfg = @{}
if ($ws -and $ws -ne "None") {
  $cfg.websocketUrl = $ws
}
if ($queryApi -and $queryApi -ne "None") {
  $cfg.queryApiEndpoint = $queryApi
}

if ($cfg.Count -gt 0) {
  $cfg | ConvertTo-Json | Set-Content -Path apps\iot-dashboard\website\config.json -Encoding UTF8
}

Write-Host "Creating config for Web Agency with API endpoint..."
$agencyConfig = @{}
if ($queryApi -and $queryApi -ne "None") {
  $agencyConfig.apiEndpoint = $queryApi + "/inquiries"
  $agencyConfig.paymentApiEndpoint = $queryApi
}

if ($agencyConfig.Count -gt 0) {
  $agencyConfig | ConvertTo-Json | Set-Content -Path apps\web-agency\website\config.json -Encoding UTF8
}

Write-Host "Creating config for Dashboard with API endpoint..."
$dashboardConfig = @{}
if ($queryApi -and $queryApi -ne "None") {
  $dashboardConfig.apiEndpoint = $queryApi
  $dashboardConfig.customerId = "demo-customer-001"
}

if ($dashboardConfig.Count -gt 0) {
  $dashboardConfig | ConvertTo-Json | Set-Content -Path apps\dashboard\website\config.json -Encoding UTF8
}

Write-Host "Building TypeScript..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed" }

Write-Host "Syncing IoT Dashboard (Sentinel) to S3..."
aws s3 sync apps/iot-dashboard/website/ "s3://$bucket" --region $Region --delete --exclude "fitness-club/*" --exclude "web-agency/*"
if ($LASTEXITCODE -ne 0) { throw "s3 sync (iot-dashboard) failed" }

Write-Host "Syncing Fitness Club to S3..."
aws s3 sync apps/fitness-club/website/ "s3://$bucket/fitness-club/" --region $Region --delete
if ($LASTEXITCODE -ne 0) { throw "s3 sync (fitness-club) failed" }

Write-Host "Syncing Web Agency to S3..."
aws s3 sync apps/web-agency/website/ "s3://$bucket/web-agency/" --region $Region --delete
if ($LASTEXITCODE -ne 0) { throw "s3 sync (web-agency) failed" }

Write-Host "Syncing Dashboard to S3..."
aws s3 sync apps/dashboard/website/ "s3://$bucket/dashboard/" --region $Region --delete
if ($LASTEXITCODE -ne 0) { throw "s3 sync (dashboard) failed" }

Write-Host "Invalidating Main CloudFront cache..."
$mainDistribution = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='MainCloudFrontDistributionId'].OutputValue" --output text
if ($mainDistribution -and $mainDistribution -ne "None") {
  aws cloudfront create-invalidation --distribution-id $mainDistribution --paths "/*" --region $Region
}

Write-Host "Invalidating Agency CloudFront cache..."
$agencyDistribution = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='AgencyCloudFrontDistributionId'].OutputValue" --output text
if ($agencyDistribution -and $agencyDistribution -ne "None") {
  aws cloudfront create-invalidation --distribution-id $agencyDistribution --paths "/*" --region $Region
}

Write-Host "Fetching CloudFront domains..."
$mainCf = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='MainCloudFrontDomain'].OutputValue" --output text
$agencyCf = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='AgencyCloudFrontDomain'].OutputValue" --output text
Write-Host "Deployment complete."
Write-Host "Sentinel URL: https://$mainCf"
Write-Host "Web Agency URL: https://$agencyCf"
