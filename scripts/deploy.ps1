<#
  Deploys the CloudFormation stack and uploads website files to the created S3 bucket.
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
Write-Host "Fetching WebSocket and Query API endpoints, writing website/config.json"
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
  $cfg | ConvertTo-Json | Set-Content -Path website\config.json -Encoding UTF8
}

aws s3 sync website/ "s3://$bucket" --region $Region --delete
if ($LASTEXITCODE -ne 0) { throw "s3 sync failed" }

Write-Host "Fetching CloudFront domain..."
$cf = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomain'].OutputValue" --output text
Write-Host "Deployment complete. Website available at: https://$cf"
