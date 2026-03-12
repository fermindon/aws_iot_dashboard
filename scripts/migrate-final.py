#!/usr/bin/env python3
"""
Migrate DynamoDB data using file-based input to avoid shell escaping issues.
"""
import subprocess
import json
import os
import tempfile

MIGRATIONS = {
    'saas-customers-prod': 'static-site-stack-CustomersTable-I869DVLGH7WV',
    'saas-websites-prod': 'static-site-stack-WebsitesTable-KJYTAUQZ5WHM',
    'saas-templates-prod': 'static-site-stack-TemplatesTable-U37Y87BKMNCK',
    'saas-generation-jobs-prod': 'static-site-stack-JobsTable-1THEUL572210O'
}

TABLE_LABELS = {
    'saas-customers-prod': 'Customers',
    'saas-websites-prod': 'Websites',
    'saas-templates-prod': 'Templates',
    'saas-generation-jobs-prod': 'Jobs'
}

REGION = 'us-east-1'

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode == 0, result.stdout, result.stderr

def scan_table(table_name):
    cmd = f'aws dynamodb scan --table-name {table_name} --region {REGION} --output json'
    success, stdout, stderr = run_cmd(cmd)
    if not success:
        return []
    try:
        return json.loads(stdout).get('Items', [])
    except:
        return []

def put_item_from_file(table_name, json_file):
    cmd = f'aws dynamodb put-item --table-name {table_name} --cli-input-json file://{json_file} --region {REGION}'
    return run_cmd(cmd)[0]

def migrate_table(old_table, new_table):
    label = TABLE_LABELS[old_table]
    print(f"\nMigrating {label}...")
    
    items = scan_table(old_table)
    if not items:
        print("  No items to migrate")
        return
    
    print(f"  Found {len(items)} items")
    
    success_count = 0
    for i, item in enumerate(items):
        # Write item to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump({
                'TableName': new_table,
                'Item': item
            }, f)
            temp_file = f.name
        
        try:
            if put_item_from_file(new_table, temp_file):
                success_count += 1
        finally:
            os.unlink(temp_file)
        
        if (i + 1) % 5 == 0:
            print(f"    {i + 1}/{len(items)}")
    
    print(f"  ✓ Migrated {success_count}/{len(items)}")

def delete_stack():
    cmd = f'aws cloudformation delete-stack --stack-name saas-website-generator --region {REGION}'
    success, _, _ = run_cmd(cmd)
    if success:
        print("✓ Stack deletion initiated")
    else:
        print("✗ Stack deletion failed")

# Main
print("\n" + "=" * 50)
print("Migrating to Unified Stack")
print("=" * 50)

for old_table, new_table in MIGRATIONS.items():
    migrate_table(old_table, new_table)

print("\n" + "=" * 50)
print("Migration complete!")
print("=" * 50)

response = input("\nDelete old SaaS stack? [y/N]: ").strip().lower()
if response == 'y':
    delete_stack()
