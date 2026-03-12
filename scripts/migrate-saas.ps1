param([string]$Region = "us-east-1")

$tables = @{
  'saas-customers-prod' = 'static-site-stack-CustomersTable-I869DVLGH7WV'
  'saas-websites-prod' = 'static-site-stack-WebsitesTable-KJYTAUQZ5WHM'
  'saas-templates-prod' = 'static-site-stack-TemplatesTable-U37Y87BKMNCK'
  'saas-generation-jobs-prod' = 'static-site-stack-JobsTable-1THEUL572210O'
}

function Migrate-Table {
  param([string]$SourceTable, [string]$DestTable, [string]$TableType)
  
  Write-Host "Migrating $TableType..." -ForegroundColor Cyan
  Write-Host "  Source: $SourceTable" -ForegroundColor Gray
  Write-Host "  Dest: $DestTable" -ForegroundColor Gray
  
  $scanResult = aws dynamodb scan --table-name $SourceTable --region $Region --output json | ConvertFrom-Json
  $items = $scanResult.Items
  
  if ($items.Count -eq 0) {
    Write-Host "  No items found" -ForegroundColor Yellow
    return
  }
  
  Write-Host "  Found $($items.Count) items" -ForegroundColor Green
  
  $batchSize = 25
  for ($i = 0; $i -lt $items.Count; $i += $batchSize) {
    $batch = $items[$i..[Math]::Min($i + $batchSize - 1, $items.Count - 1)]
    $puts = @()
    
    foreach ($item in $batch) {
      $puts += @{ PutRequest = @{ Item = $item } }
    }
    
    $request = @{ RequestItems = @{ $DestTable = $puts } }
    $requestJson = $request | ConvertTo-Json -Depth 10 -Compress
    
    Write-Host "  Writing batch..." -ForegroundColor Gray
    aws dynamodb batch-write-item --request-items $requestJson --region $Region | Out-Null
    Write-Host "    +$($batch.Count) items" -ForegroundColor Green
  }
  
  Write-Host "Done with $TableType" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================"
Write-Host "SaaS Data Migration"
Write-Host "Old Stack > Unified Stack"
Write-Host "========================================"
Write-Host ""

foreach ($sourceTable in $tables.Keys) {
  $destTable = $tables[$sourceTable]
  $tableType = switch($sourceTable) {
    'saas-customers-prod' { 'Customers' }
    'saas-websites-prod' { 'Websites' }
    'saas-templates-prod' { 'Templates' }
    'saas-generation-jobs-prod' { 'Jobs' }
  }
  Migrate-Table -SourceTable $sourceTable -DestTable $destTable -TableType $tableType
}

Write-Host ""
Write-Host "========================================"
Write-Host "Migration complete!"
Write-Host "========================================"
Write-Host ""

$response = Read-Host "Delete old SaaS stack? [y/N]"
if ($response -eq 'y') {
  Write-Host "Deleting saas-website-generator..."
  aws cloudformation delete-stack --stack-name saas-website-generator --region $Region
  Write-Host "Deletion initiated"
} else {
  Write-Host "Old stack remains"
}
