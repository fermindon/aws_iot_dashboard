#!/usr/bin/env python3
"""
Migrate data from old SaaS stack tables to new unified stack tables.
"""
import boto3
import json
from datetime import datetime

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

# Old SaaS stack table names
OLD_CUSTOMERS_TABLE = 'saas-customers-prod'
OLD_WEBSITES_TABLE = 'saas-websites-prod'
OLD_TEMPLATES_TABLE = 'saas-templates-prod'
OLD_JOBS_TABLE = 'saas-generation-jobs-prod'

# New unified stack table names (from CloudFormation)
NEW_CUSTOMERS_TABLE = 'static-site-stack-CustomersTable-I869DVLGH7WV'
NEW_WEBSITES_TABLE = 'static-site-stack-WebsitesTable-1NKSDLKJSDKL'  # Will be determined
NEW_TEMPLATES_TABLE = 'static-site-stack-TemplatesTable-U37Y87BKMNCK'
NEW_JOBS_TABLE = 'static-site-stack-JobsTable-1NKSDLKJSDKL'  # Will be determined

def get_table_name(stack_name, output_key, region='us-east-1'):
    """Get table name from CloudFormation stack output."""
    cf = boto3.client('cloudformation', region_name=region)
    response = cf.describe_stacks(StackName=stack_name)
    for output in response['Stacks'][0]['Outputs']:
        if output['OutputKey'] == output_key:
            return output['OutputValue']
    raise Exception(f"Output {output_key} not found in stack {stack_name}")

def scan_table_items(table_name):
    """Scan all items from a DynamoDB table."""
    table = dynamodb.Table(table_name)
    items = []
    response = table.scan()
    items.extend(response['Items'])
    
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response['Items'])
    
    return items

def migrate_customers():
    """Migrate customer data."""
    print("Migrating customers...")
    old_items = scan_table_items(OLD_CUSTOMERS_TABLE)
    print(f"  Found {len(old_items)} customers in old table")
    
    new_table = dynamodb.Table(NEW_CUSTOMERS_TABLE)
    for item in old_items:
        new_table.put_item(Item=item)
        print(f"    Migrated customer: {item.get('customerId', 'unknown')}")
    
    print(f"✓ Customers migration complete")

def migrate_websites():
    """Migrate website data."""
    print("Migrating websites...")
    old_items = scan_table_items(OLD_WEBSITES_TABLE)
    print(f"  Found {len(old_items)} websites in old table")
    
    new_table = dynamodb.Table(NEW_WEBSITES_TABLE)
    for item in old_items:
        new_table.put_item(Item=item)
        print(f"    Migrated website: {item.get('websiteId', 'unknown')}")
    
    print(f"✓ Websites migration complete")

def migrate_templates():
    """Migrate template data."""
    print("Migrating templates...")
    old_items = scan_table_items(OLD_TEMPLATES_TABLE)
    print(f"  Found {len(old_items)} templates in old table")
    
    new_table = dynamodb.Table(NEW_TEMPLATES_TABLE)
    for item in old_items:
        # Skip if already exists (we seeded 4 default templates)
        try:
            new_table.put_item(Item=item, ConditionExpression='attribute_not_exists(templateId)')
            print(f"    Migrated template: {item.get('templateId', 'unknown')}")
        except Exception as e:
            if 'ConditionalCheckFailedException' in str(e):
                print(f"    Skipped template (already exists): {item.get('templateId', 'unknown')}")
            else:
                raise
    
    print(f"✓ Templates migration complete")

def migrate_jobs():
    """Migrate job data."""
    print("Migrating generation jobs...")
    old_items = scan_table_items(OLD_JOBS_TABLE)
    print(f"  Found {len(old_items)} jobs in old table")
    
    new_table = dynamodb.Table(NEW_JOBS_TABLE)
    for item in old_items:
        new_table.put_item(Item=item)
        print(f"    Migrated job: {item.get('jobId', 'unknown')}")
    
    print(f"✓ Jobs migration complete")

def delete_old_stack():
    """Delete the old SaaS stack."""
    print("\nDeleting old SaaS stack...")
    cf = boto3.client('cloudformation', region_name='us-east-1')
    try:
        cf.delete_stack(StackName='saas-website-generator')
        print("✓ Stack deletion initiated")
        print("  Monitor progress: aws cloudformation describe-stacks --stack-name saas-website-generator --region us-east-1")
    except Exception as e:
        print(f"✗ Error deleting stack: {e}")

if __name__ == '__main__':
    print("=" * 60)
    print("SaaS Data Migration: Old Stack → Unified Stack")
    print("=" * 60)
    
    # Get new table names from CloudFormation
    try:
        NEW_WEBSITES_TABLE = get_table_name('static-site-stack', 'WebsitesTableName')
        NEW_JOBS_TABLE = get_table_name('static-site-stack', 'JobsTableName')
        print(f"New tables identified:\n  Websites: {NEW_WEBSITES_TABLE}\n  Jobs: {NEW_JOBS_TABLE}\n")
    except Exception as e:
        print(f"Error getting new table names: {e}")
        exit(1)
    
    # Perform migration
    try:
        migrate_customers()
        migrate_websites()
        migrate_templates()
        migrate_jobs()
        
        print("\n" + "=" * 60)
        print("Migration complete! Data moved to unified stack.")
        print("=" * 60)
        
        # Offer to delete old stack
        response = input("\nDelete old SaaS stack (saas-website-generator)? [y/N]: ").lower()
        if response == 'y':
            delete_old_stack()
        else:
            print("Old stack will remain. You can delete it later if needed.")
    
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        exit(1)
