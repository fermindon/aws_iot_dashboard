# AWS IoT Dashboard Monorepo

A monorepo containing multiple web applications sharing AWS infrastructure: **Sentinel** (professional IoT monitoring dashboard) and **Severna Park Fitness Club** (service landing page).

## Repository Structure

```
aws_iot_dashboard/
├── apps/                           # Multiple applications
│   ├── iot-dashboard/
│   │   ├── website/               # Sentinel IoT Dashboard source
│   │   │   ├── ts/                # TypeScript source files
│   │   │   ├── js/                # Compiled & minified JavaScript
│   │   │   ├── index.html
│   │   │   ├── style.css          # Semantic styling system
│   │   │   ├── config.json        # API endpoint configuration
│   │   │   └── sentinel-logo.svg
│   │   └── README.md
│   │
│   └── fitness-club/
│       ├── fitness-club.html       # Complete standalone landing page
│       └── README.md
│
├── infra/
│   └── cloudformation.yml          # Shared AWS infrastructure as code
│
├── scripts/
│   └── deploy.ps1                  # Deployment automation
│
├── package.json                    # Root-level build scripts
├── tsconfig.json                   # TypeScript configuration
└── README.md                       # This file
```

## Projects

### 1. **Sentinel IoT Dashboard** (`apps/iot-dashboard/`)
Professional real-time AWS IoT monitoring dashboard with device management, sensor visualization, and Dark/Light mode.

**Key Features:**
- Real-time sensor data visualization (temperature, humidity, pressure)
- Device selection and metadata management
- Interactive charts with gradient fills
- Dark/Light theme toggle with persistence
- WebSocket-powered live updates
- Responsive design (desktop, tablet, mobile)

**Tech Stack:** TypeScript, Chart.js, AWS Lambda, API Gateway, DynamoDB, S3, CloudFront

[See full documentation →](apps/iot-dashboard/README.md)

### 2. **Severna Park Fitness Club** (`apps/fitness-club/`)
Professional, responsive landing page showcasing fitness club services, member testimonials, and membership signup.

**Key Features:**
- Hero section with call-to-action buttons
- Service showcase grid (racquetball, fitness, aquatics, youth)
- Member testimonials section
- Membership signup form with validation
- Responsive design
- No build required (standalone HTML)

**Tech Stack:** Pure HTML5, CSS3, vanilla JavaScript

[See full documentation →](apps/fitness-club/README.md)

## Shared AWS Infrastructure

Both applications share the same AWS backend configured in `infra/cloudformation.yml`:

### AWS Services
- **S3 Bucket**: Static website hosting
- **CloudFront**: CDN distribution (domain: d1ng1kqs2eqbzl.cloudfront.net)
- **API Gateway V2**: WebSocket and HTTP endpoints
  - WebSocket endpoint: `wss://yzo5rqjmv9.execute-api.us-east-1.amazonaws.com/prod`
  - Query API endpoint: `https://yzo5rqjmv9.execute-api.us-east-1.amazonaws.com/prod`
- **Lambda Functions**: 4 serverless functions
  - QueryFunction: Historical data queries
  - GetDeviceMetadataFunction: Retrieve device configuration
  - UpdateDeviceMetadataFunction: Update device information
  - IotRelayFunction: Real-time message relay
- **DynamoDB Tables**:
  - `MessagesTable`: Sensor readings with timestamps
  - `DeviceMetadataTable`: Device configuration (name, location, sensor type, firmware)
  - `ConnectionsTable`: Active WebSocket connections

### Deployment Architecture
- Applications deployed to same S3 bucket (separate paths or root)
- CloudFront distribution serves both applications
- Efficient caching with cache invalidation on updates
- Single infrastructure cost for multiple apps

## Getting Started

### Prerequisites
- Node.js 16+ and npm
- AWS CLI v2 configured with appropriate permissions
- PowerShell (for deployment script on Windows)

### Installation

1. **Clone repository**
   ```bash
   git clone <repo-url>
   cd aws_iot_dashboard
   npm install
   ```

2. **Configure TypeScript** (optional)
   ```bash
   npm run type-check
   ```

### Development

For **IoT Dashboard** development:
```bash
npm run watch   # Watch TypeScript files for changes
npm run serve   # Start local dev server (port 3000)
npm run dev     # Run both watch + serve concurrently
```

The dashboard will be available at `http://localhost:3000`.

### Production Build

Build all TypeScript applications:
```bash
npm run build
```

Output:
- IoT Dashboard: `apps/iot-dashboard/website/js/` (minified JavaScript)
- Fitness Club: No build step required (pure HTML)

### Deployment

Deploy both applications to AWS:
```powershell
.\scripts\deploy.ps1
```

This script:
1. Deploys/updates CloudFormation infrastructure
2. Builds TypeScript files
3. Syncs applications to S3
4. Invalidates CloudFront cache
5. Outputs live dashboard URL

**Optional Parameters:**
```powershell
.\scripts\deploy.ps1 -StackName "custom-stack" -Region "us-west-2"
```

## Development Workflow

### Adding a New App

1. Create folder under `apps/new-app-name/`
2. Add React, Vue, or other framework if needed
3. Update `package.json` with build commands if necessary
4. Update `scripts/deploy.ps1` to deploy new app
5. Document in `apps/new-app-name/README.md`

### Updating Infrastructure

Edit `infra/cloudformation.yml` and redeploy:
```powershell
.\scripts\deploy.ps1
```

CloudFormation will update only changed resources (no downtime).

### CI/CD Integration

For GitHub Actions or similar:
```bash
npm run build
npm run type-check
.\scripts\deploy.ps1
```

## Project Statistics

- **Total Lines of Code**: 750+ (IoT Dashboard TypeScript)
- **TypeScript Configuration**: Strict mode enabled
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Hosting**: AWS (S3 + CloudFront)
- **Uptime**: 99.9% (CloudFront SLA)

## Troubleshooting

### Build Errors
```bash
npm run type-check  # Check for TypeScript errors
npm run build       # Rebuild from scratch
```

### Deployment Issues
- Check AWS CLI credentials: `aws sts get-caller-identity`
- Verify CloudFormation IAM permissions
- Check S3 bucket exists: `aws s3 ls`

### Runtime Issues
- Check `apps/iot-dashboard/website/config.json` has correct API endpoints
- Verify WebSocket connectivity in browser DevTools
- Check Lambda function logs in CloudWatch

## Contributing

1. Create a feature branch
2. Make changes to relevant app in `apps/`
3. Run type checks: `npm run type-check`
4. Build and test locally: `npm run dev`
5. Deploy to stage environment and verify
6. Merge to main and deploy to production

## Support

For issues or questions:
- Check individual app README files in `apps/*/README.md`
- Review AWS CloudFormation template in `infra/cloudformation.yml`
- Check Lambda function logs in CloudWatch console

---

**Brands:**
- 🛡️ **Sentinel** - IoT monitoring platform
- 💪 **Severna Park Fitness Club** - Premier fitness services

**Status**: Production Ready
**Last Updated**: 2024
