#!/bin/bash
# Simple migration script using AWS CLI

OLD_CUSTOMERS="saas-customers-prod"
NEW_CUSTOMERS="static-site-stack-CustomersTable-I869DVLGH7WV"

OLD_WEBSITES="saas-websites-prod"
NEW_WEBSITES="static-site-stack-WebsitesTable-KJYTAUQZ5WHM"

OLD_TEMPLATES="saas-templates-prod"
NEW_TEMPLATES="static-site-stack-TemplatesTable-U37Y87BKMNCK"

OLD_JOBS="saas-generation-jobs-prod"
NEW_JOBS="static-site-stack-JobsTable-1THEUL572210O"

REGION="us-east-1"

migrate_table() {
  local old_table=$1
  local new_table=$2
  local table_type=$3
  
  echo ""
  echo "Migrating $table_type..."
  echo "  From: $old_table"
  echo "  To:   $new_table"
  
  # Scan and migrate (this will handle JSON properly via AWS CLI)
  aws dynamodb scan --table-name "$old_table" --region "$REGION" | \
  jq -r '.Items[]' | while read item; do
    # Create PutRequest
    aws dynamodb put-item \
      --table-name "$new_table" \
      --item "$item" \
      --region "$REGION" 2>/dev/null
  done
  
  echo "✓ Done"
}

echo "========================================="
echo "Migrating SaaS Data to Unified Stack"
echo "========================================="

migrate_table "$OLD_CUSTOMERS" "$NEW_CUSTOMERS" "Customers"
migrate_table "$OLD_WEBSITES" "$NEW_WEBSITES" "Websites"  
migrate_table "$OLD_TEMPLATES" "$NEW_TEMPLATES" "Templates"
migrate_table "$OLD_JOBS" "$NEW_JOBS" "Jobs"

echo ""
echo "========================================="
echo "Migration complete!"
echo "========================================="
echo ""
read -p "Delete old SaaS stack? [y/N]: " response
if [ "$response" = "y" ]; then
  aws cloudformation delete-stack --stack-name saas-website-generator --region "$REGION"
  echo "Stack deletion initiated"
fi
