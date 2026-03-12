#!/usr/bin/env python3
"""
Migrate DynamoDB data from old SaaS stack to new unified stack.
Uses AWS CLI subprocess calls to avoid JSON parsing issues.
"""
import subprocess
import json
import sys

OLD_CUSTOMERS = 'saas-customers-prod'
NEW_CUSTOMERS = 'static-site-stack-CustomersTable-I869DVLGH7WV'

OLD_WEBSITES = 'saas-websites-prod'
NEW_WEBSITES = 'static-site-stack-WebsitesTable-KJYTAUQZ5WHM'

OLD_TEMPLATES = 'saas-templates-prod'
NEW_TEMPLATES = 'static-site-stack-TemplatesTable-U37Y87BKMNCK'

OLD_JOBS = 'saas-generation-jobs-prod'
NEW_JOBS = 'static-site-stack-JobsTable-1THEUL572210O'

REGION = 'us-east-1'

def run_aws_cmd(cmd):
    """Run AWS CLI command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            print(f"  Error: {result.stderr[:200]}")
            return None
        return result.stdout
    except Exception as e:
        print(f"  Error running command: {e}")
        return None

def scan_table(table_name):
    """Scan table and return ItemNo."""
    cmd = f'aws dynamodb scan --table-name {table_name} --region {REGION} --output json'
    output = run_aws_cmd(cmd)
    if not output:
        return []
    try:
        data = json.loads(output)
        return data.get('Items', [])
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}")
        return []

def put_item(table_name, item):
    """Write a single item to DynamoDB table."""
    # Convert item dict to JSON string and escape it
    item_json = json.dumps(item).replace('"', '\\"')
    cmd = f'aws dynamodb put-item --table-name {table_name} --item {item_json} --region {REGION}'
    return run_aws_cmd(cmd) is not None

def migrate_table(old_table, new_table, table_type):
    """Migrate all items from old table to new table."""
    print(f"\nMigrating {table_type}...")
    print(f"  Source: {old_table}")
    print(f"  Dest: {new_table}")
    
    items = scan_table(old_table)
    if not items:
        print("  No items found or scan failed")
        return
    
    print(f"  Found {len(items)} items")
    
    # Write each item
    success_count = 0
    for i, item in enumerate(items):
        if put_item(new_table, item):
            success_count += 1
        if (i + 1) % 5 == 0:
            print(f"    Progress: {i + 1}/{len(items)}")
    
    print(f"  ✓ Migrated {success_count}/{len(items)} items")

def delete_old_stack():
    """Delete the old SaaS CloudFormation stack."""
    print("\nDeleting old SaaS stack...")
    cmd = f'aws cloudformation delete-stack --stack-name saas-website-generator --region {REGION}'
    if run_aws_cmd(cmd):
        print("✓ Stack deletion initiated")
        print("  Monitor: aws cloudformation describe-stacks --stack-name saas-website-generator --region {REGION}")
    else:
        print("  Error deleting stack")

def main():
    print("\n" + "=" * 50)
    print("SaaS Data Migration")
    print("Old Stack → Unified Stack")
    print("=" * 50)
    
    migrate_table(OLD_CUSTOMERS, NEW_CUSTOMERS, 'Customers')
    migrate_table(OLD_WEBSITES, NEW_WEBSITES, 'Websites')
    migrate_table(OLD_TEMPLATES, NEW_TEMPLATES, 'Templates')
    migrate_table(OLD_JOBS, NEW_JOBS, 'Jobs')
    
    print("\n" + "=" * 50)
    print("Migration complete!")
    print("=" * 50)
    
    response = input("\nDelete old SaaS stack? [y/N]: ").strip().lower()
    if response == 'y':
        delete_old_stack()
    else:
        print("Old stack remains. Delete later if needed.")

if __name__ == '__main__':
    main()
