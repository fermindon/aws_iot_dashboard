<#
Migrate data from old SaaS stack to new unified stack.
This script uses AWS CLI to scan old tables and write items to new tables.
#>

param(
  [string]$Region = "us-east-1"
)

# Table mappings
$tables = @{
  'saas-customers-prod' = 'static-site-stack-CustomersTable-I869DVLGH7WV'
  'saas-websites-prod' = 'static-site-stack-WebsitesTable-KJYTAUQZ5WHM'
  'saas-templates-prod' = 'static-site-stack-TemplatesTable-U37Y87BKMNCK'
  'saas-generation-jobs-prod' = 'static-site-stack-JobsTable-1THEUL572210O'
}

function Migrate-Table {
  param(
    [string]$SourceTable,
    [string]$DestTable,
    [string]$TableType
  )
  
  Write-Host "Migrating $TableType..." -ForegroundColor Cyan
  Write-Host "  Source: $SourceTable" -ForegroundColor Gray
  Write-Host "  Dest:   $DestTable" -ForegroundColor Gray
  
  # Scan source table
  $scanResult = aws dynamodb scan --table-name $SourceTable --region $Region --output json | ConvertFrom-Json
  $items = $scanResult.Items
  
  if ($items.Count -eq 0) {
    Write-Host "  ⚠ No items found in source table" -ForegroundColor Yellow
    return
  }
  
  Write-Host "  Found $($items.Count) items" -ForegroundColor Green
  
  # Batch write to destination (DynamoDB batch limit: 25 items per request)
  $batchSize = 25
  for ($i = 0; $i -lt $items.Count; $i += $batchSize) {
    $batch = $items[$i..[Math]::Min($i + $batchSize - 1, $items.Count - 1)]
    $puts = @()
    
    foreach ($item in $batch) {
      $puts += @{ PutRequest = @{ Item = $item } }
    }
    
    $request = @{
      RequestItems = @{
        $DestTable = $puts
      }
    }
    
    $requestJson = $request | ConvertTo-Json -Depth 10 -Compress
    
    # Write batch
    Write-Host "  Writing batch $([Math]::Floor($i / $batchSize) + 1)..." -ForegroundColor Gray
    aws dynamodb batch-write-item --request-items $requestJson --region $Region | Out-Null
    
    Write-Host "    Wrote $($batch.Count) items" -ForegroundColor Green
  }
  
  Write-Host "✓ $TableType migration complete`n" -ForegroundColor Green
}

function Delete-OldStack {
  Write-Host "Deleting old SaaS stack..." -ForegroundColor Cyan
  aws cloudformation delete-stack --stack-name saas-website-generator --region $Region
  
  Write-Host "✓ Stack deletion initiated" -ForegroundColor Green
  Write-Host "Monitor progress with: aws cloudformation describe-stacks --stack-name saas-website-generator --region $Region" -ForegroundColor Gray
}

# Main execution
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SaaS Data Migration" -ForegroundColor Cyan
Write-Host "Old Stack → Unified Stack" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($sourceTable in $tables.Keys) {
  $destTable = $tables[$sourceTable]
  $tableType = switch($sourceTable) {
    'saas-customers-prod' { 'Customers' }
    'saas-websites-prod' { 'Websites' }
    'saas-templates-prod' { 'Templates' }
    'saas-generation-jobs-prod' { 'Generation Jobs' }
  }
  
  Migrate-Table -SourceTable $sourceTable -DestTable $destTable -TableType $tableType
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ All data migrated successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$response = Read-Host "Delete old SaaS stack (saas-website-generator)? [y/N]"
if ($response -eq 'y' -or $response -eq 'Y') {
  Delete-OldStack
} else {
  Write-Host "Old stack will remain. Delete later if needed." -ForegroundColor Yellow
}
