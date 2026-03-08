# Sentinel IoT Dashboard

A professional real-time AWS IoT monitoring dashboard built with TypeScript, featuring device management, sensor data visualization, and Dark/Light mode support.

## Overview

Sentinel provides real-time visualization of IoT sensor data from connected devices. It displays temperature, humidity, and pressure readings with interactive charts, device metadata management, and comprehensive message logging.

## Technology Stack

- **Frontend**: TypeScript 5.3 with esbuild bundling
- **Visualization**: Chart.js 4.4.0 for real-time line charts
- **Styling**: CSS3 with semantic color tokens, Dark/Light mode support
- **Backend**: AWS Lambda, API Gateway (WebSocket + HTTP)
- **Database**: DynamoDB (MessagesTable, DeviceMetadataTable, ConnectionsTable)
- **Hosting**: S3 + CloudFront distribution

## Working with the Dashboard

### Directory Structure

```
website/
├── index.html              # Professional responsive UI
├── style.css               # Semantic styling with theme system
├── config.json             # API endpoint configuration
├── sentinel-logo.svg       # Guardian angel brand logo
├── ts/
│   ├── dashboard.ts        # Main application controller (750+ lines)
│   └── mqtt_relay.ts       # WebSocket connection handler
└── js/
    ├── dashboard.js        # Compiled & minified main app
    └── mqtt_relay.js       # Compiled & minified WebSocket handler
```

### Key Features

- **Device Management**: Select devices from list, view/edit metadata (name, location, sensor type, firmware)
- **Real-time Data**: WebSocket-powered live sensor readings with automatic chart updates
- **Sensor Visualization**: Interactive charts for temperature, humidity, and pressure with gradient fills
- **Device Statistics**: Average temperature calculation and status monitoring
- **Message Logging**: Raw message display with parsed sensor values
- **Theme Toggle**: Dark/Light mode with localStorage persistence
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

### Building

From the root directory:

```bash
npm run build      # Compile TypeScript to JavaScript (minified)
npm run watch      # Watch mode for development
npm run serve      # Start local development server on port 3000
npm run dev        # Run watch + serve concurrently
npm run type-check # TypeScript type checking without emitting
```

### AWS Infrastructure

The dashboard connects to AWS services configured in CloudFormation:

- **WebSocket API**: Real-time bidirectional communication for sensor data streams
- **HTTP API**: Device metadata CRUD operations
- **DynamoDB Tables**:
  - `MessagesTable`: Stores sensor readings with timestamps
  - `DeviceMetadataTable`: Stores device name, location, sensor type, firmware info
  - `ConnectionsTable`: Manages active WebSocket connections

### Configuration

Edit `website/config.json` to set API endpoints:

```json
{
  "websocketUrl": "wss://your-api-id.execute-api.us-east-1.amazonaws.com/prod",
  "queryApiEndpoint": "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod"
}
```

The deployment script (`scripts/deploy.ps1`) automatically updates these values from CloudFormation outputs.

### Development Tips

- **Type Safety**: All TypeScript files use strict type checking (`tsconfig.json`)
- **Console Logging**: Development logging available in `dashboard.ts` and `mqtt_relay.ts`
- **CSS Variables**: Semantic color tokens in `style.css` for easy theme customization
- **Empty State**: Beautiful UI shown when no device is selected, featuring the Sentinel guardian logo

### Deployment

Deploy from the root directory using:

```bash
./scripts/deploy.ps1
```

This script:
1. Deploys/updates CloudFormation stack
2. Builds TypeScript to JavaScript
3. Syncs website files to S3
4. Invalidates CloudFront cache
5. Outputs the live dashboard URL

---

**Brand**: Sentinel - Your connected IoT guardian
**Version**: 1.0.0
