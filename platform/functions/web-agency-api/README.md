# Web Agency API

Lambda function for handling Angelorum Solutions web agency payments, inquiries, and customer management.

## Setup

### Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_...         # From Stripe dashboard
STRIPE_WEBHOOK_SECRET=whsec_...       # From Stripe webhook settings
ORDERS_TABLE=web-agency-orders        # DynamoDB table for orders
INQUIRIES_TABLE=web-agency-inquiries  # DynamoDB table for inquiries
CUSTOMERS_TABLE=web-agency-customers  # DynamoDB table for customers
FROM_EMAIL=inquiry@angelorumsolutions.com  # SES verified email
INTERNAL_EMAIL=team@angelorumsolutions.com # Where to send internal notifications
DOMAIN=https://www.angelorumsolutions.com  # Your domain for redirects
AWS_REGION=us-east-1
```

### Build & Deploy

```bash
npm install
npm run build
# Deploy the dist/ folder to Lambda
```

## API Endpoints

### POST `/api/inquiries`

Submit a contact form inquiry.

**Request:**
```json
{
  "businessName": "Acme Corp",
  "name": "John Doe",
  "email": "john@acme.com",
  "phone": "555-1234",
  "details": "We need a new website..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "inquiryId": "uuid",
    "message": "Inquiry received..."
  }
}
```

### POST `/api/checkout/session`

Create a Stripe checkout session.

**Request:**
```json
{
  "plan": "professional",
  "email": "john@acme.com",
  "businessName": "Acme Corp"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "cs_live_..."
  }
}
```

**Plans:**
- `hosting` — $75/month managed hosting
- `professional` — $1,900 one-time professional website
- `premium` — $3,200 one-time premium website

### POST `/api/webhook/stripe`

Stripe webhook handler (auto-called by Stripe).

Configure in Stripe dashboard:
- Endpoint: `https://your-api-gateway-url/webhook/stripe`
- Events: `checkout.session.completed`

### GET `/api/orders?email=john@acme.com`

Retrieve customer orders.

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "plan": "professional",
        "amount": 190000,
        "status": "completed",
        "createdAt": "2026-03-13T..."
      }
    ]
  }
}
```

## Database Schema (DynamoDB)

### web-agency-orders

```
id (PK)
customerId
plan
amount (cents)
currency
stripePaymentIntentId
stripeCheckoutSessionId (GSI: stripeCheckoutSessionIdIndex)
status: 'pending' | 'completed' | 'failed'
email (GSI: emailIndex)
businessName
createdAt
completedAt (optional)
```

### web-agency-inquiries

```
id (PK)
businessName
name
email (GSI: emailIndex)
phone (optional)
details
status: 'new' | 'contacted' | 'qualified' | 'closed'
createdAt
```

### web-agency-customers

```
id (PK)
email (GSI: emailIndex)
businessName
phone (optional)
stripeCustomerId
createdAt
orders (array of order IDs)
```

## Frontend Integration

### 1. Inquiry Form (index.html)

```javascript
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const res = await fetch('/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await res.json();
  if (result.success) {
    alert('Thank you! We\'ll be in touch soon.');
    e.target.reset();
  }
});
```

### 2. Payment Form (payment.html)

```html
<script src="https://js.stripe.com/v3/"></script>
<script>
  const stripe = Stripe('pk_live_...');

  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const plan = new URLSearchParams(location.search).get('plan');
    const email = document.getElementById('email').value;
    const businessName = document.getElementById('business-name').value;

    const res = await fetch('/api/checkout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, email, businessName })
    });

    const { data } = await res.json();
    stripe.redirectToCheckout({ sessionId: data.sessionId });
  });
</script>
```

## Stripe Setup Checklist

- [ ] Create Stripe account (https://stripe.com)
- [ ] Get Live API keys
- [ ] Add webhook endpoint in Stripe dashboard
- [ ] Store keys in AWS Secrets Manager
- [ ] Set webhook events: `checkout.session.completed`
- [ ] Test with Stripe test cards in development

## Testing

### Local Testing

```bash
npm run build
sam local start-api
curl -X POST http://localhost:3000/inquiries \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test","name":"John","email":"john@test.com","details":"test"}'
```

### Stripe Webhook Testing

```bash
stripe listen --forward-to localhost:3000/webhook/stripe
stripe trigger checkout.session.completed
```

## Monitoring

- CloudWatch Logs for Lambda errors
- Stripe dashboard for payment failures
- SES bounce/complaint rates
- DynamoDB throttle alarms

## Next Steps

1. Create DynamoDB tables with GSIs
2. Add Stripe API keys to Secrets Manager
3. Verify SES sender email
4. Deploy Lambda & API Gateway
5. Test end-to-end flow
6. Wire up payment.html to use new API
