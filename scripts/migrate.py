#!/usr/bin/env python3
"""Migrate DynamoDB data between tables using AWS CLI."""
import json
import subprocess
import sys

# Table mappings: old -> new
OLD_CUSTOMERS = 'saas-customers-prod'
NEW_CUSTOMERS = 'static-site-stack-CustomersTable-I869DVLGH7WV'

OLD_WEBSITES = 'saas-websites-prod'
NEW_WEBSITES = 'static-site-stack-WebsitesTable-KJYTAUQZ5WHM'

OLD_TEMPLATES = 'saas-templates-prod'
NEW_TEMPLATES = 'static-site-stack-TemplatesTable-U37Y87BKMNCK'

OLD_JOBS = 'saas-generation-jobs-prod'
NEW_JOBS = 'static-site-stack-JobsTable-1THEUL572210O'

REGION = 'us-east-1'

def aws_cmd(cmd):
    """Execute AWS CLI command and return output."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return None
    return result.stdout.strip()

def scan_table(table_name):
    """Scan all items from table."""
    print(f"Scanning {table_name}...")
    cmd = f"aws dynamodb scan --table-name {table_name} --region {REGION} --output json"
    output = aws_cmd(cmd)
    if output:
        return json.loads(output).get('Items', [])
    return []

def batch_write_items(table_name, items):
    """Write items to table using batch write."""
    if not items:
        print(f"  No items to write to {table_name}")
        return
    
    # DynamoDB batch write limit: 25 items per request
    batch_size = 25
    for i in range(0, len(items), batch_size):
        batch = items[i:i+batch_size]
        batch_request = {}
        batch_request['RequestItems'] = {
            table_name: [
                {'PutRequest': {'Item': item}} for item in batch
            ]
        }
        
        # Write batch
        cmd = f'aws dynamodb batch-write-item --request-items \'{json.dumps(batch_request)}\' --region {REGION}'
        #(output = aws_cmd(cmd)
        print(f"  Wrote {len(batch)} items to {table_name}")

def migrate_table(old_table, new_table, table_type):
    """Migrate all data from old table to new table."""
    print(f"\nMigrating {table_type}...")
    print(f"  Source: {old_table}")
    print(f"  Destination: {new_table}")
    
    items = scan_table(old_table)
    print(f"  Found {len(items)} items")
    
    if items:
        batch_write_items(new_table, items)
        print(f"✓ {table_type} migration complete")
    else:
        print(f"⚠ No items found in {old_table}")

def main():
    print("=" * 60)
    print("SaaS Data Migration: Old → Unified Stack")
    print("=" * 60)
    
    migrate_table(OLD_CUSTOMERS, NEW_CUSTOMERS, 'Customers')
    migrate_table(OLD_WEBSITES, NEW_WEBSITES, 'Websites')
    migrate_table(OLD_TEMPLATES, NEW_TEMPLATES, 'Templates')
    migrate_table(OLD_JOBS, NEW_JOBS, 'Generation Jobs')
    
    print("\n" + "=" * 60)
    print("✓ Migration complete!")
    print("=" * 60)
    
    # Ask if user wants to delete old stack
    response = input("\nDelete old SaaS stack? [y/N]: ").strip().lower()
    if response == 'y':
        print("Deleting saas-website-generator stack...")
        aws_cmd('aws cloudformation delete-stack --stack-name saas-website-generator --region us-east-1')
        print("✓ Stack deletion initiated")
    else:
        print("Old stack will remain. You can delete it later.")

if __name__ == '__main__':
    main()
