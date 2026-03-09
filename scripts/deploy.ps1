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

aws cloudformation deploy --template-file infra/cloudformation.yml --stack-name $StackName --region $Region --capabilities CAPABILITY_NAMED_IAM

if ($LASTEXITCODE -ne 0) { throw "CloudFormation deploy failed" }

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
