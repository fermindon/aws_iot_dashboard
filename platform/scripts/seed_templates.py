"""
Template Seed Script — Populates the DynamoDB TemplatesTable with industry templates.
Run this once after the SaaS CloudFormation stack deploys.

Usage:
  python platform/scripts/seed_templates.py --table saas-templates-prod --region us-east-1
"""

import argparse
import json
import os
import boto3

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'templates', 'industries')


def load_templates():
    templates = []
    for industry in os.listdir(TEMPLATE_DIR):
        config_path = os.path.join(TEMPLATE_DIR, industry, 'config.json')
        if os.path.isfile(config_path):
            with open(config_path, 'r') as f:
                templates.append(json.load(f))
    return templates


def seed(table_name, region):
    ddb = boto3.resource('dynamodb', region_name=region)
    table = ddb.Table(table_name)

    templates = load_templates()
    for tpl in templates:
        print(f'  Seeding template: {tpl["templateId"]} ({tpl["name"]})')
        table.put_item(Item=tpl)

    print(f'\nDone — {len(templates)} templates seeded into {table_name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Seed SaaS templates into DynamoDB')
    parser.add_argument('--table', required=True, help='DynamoDB table name')
    parser.add_argument('--region', default='us-east-1', help='AWS region')
    args = parser.parse_args()
    seed(args.table, args.region)
