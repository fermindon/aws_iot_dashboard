param([string]$Region = "us-east-1")

Write-Host "Exporting data from old SaaS stack tables..."

# Export each table to JSON files
$tables = @{
  'saas-customers-prod' = 'old-customers'
  'saas-websites-prod' = 'old-websites'
  'saas-templates-prod' = 'old-templates'
  'saas-generation-jobs-prod' = 'old-jobs'
}

foreach ($table in $tables.Keys) {
  $filename = "scripts/$($tables[$table]).json"
  Write-Host "  Exporting $table..."
  aws dynamodb scan --table-name $table --region $Region > $filename
}

Write-Host ""
Write-Host "Now run the Python migration script:"
Write-Host "  python -m pip install boto3"
Write-Host "  python scripts/migrate-saas-data.py"
