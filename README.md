# Minimal AWS-hosted static website

What I added:

- `website/index.html` — minimal landing page
- `website/style.css` — basic styles
- `infra/cloudformation.yml` — creates S3 bucket + CloudFront distribution
- `scripts/deploy.ps1` — Windows PowerShell script to deploy and upload site

Quick start (Windows PowerShell):

1. Ensure the AWS CLI is installed and configured with an IAM user that can create S3, CloudFront, and CloudFormation resources.
2. From the repo root run:

```powershell
.\scripts\deploy.ps1 -StackName my-static-site -Region us-east-1
```

Notes:
- The CloudFormation template creates a private S3 bucket and a CloudFront distribution that serves the content. The bucket is not public — CloudFront accesses it via an Origin Access Identity.
- The stack outputs the `BucketName` and `CloudFrontDomain`. The deploy script reads those outputs and uploads the `website/` folder.
- If you want a custom domain and TLS, I can extend the template to add an ACM certificate and Route53 record (requires a hosted zone).
