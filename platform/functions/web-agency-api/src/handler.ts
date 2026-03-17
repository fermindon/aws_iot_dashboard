// ── API Gateway Handler ──────────────────────────────────
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as stripe from './stripe';
import * as db from './db';
import * as email from './email';

const DOMAIN = process.env.DOMAIN || 'https://www.angelorum.tech';

// ── Helper: CORS headers ──────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'https://www.angelorum.tech',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

// ── Helper: Response formatter ────────────────────────────
function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

// ── POST /inquiries ──────────────────────────────────────
async function handleInquiry(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { businessName, name, email: userEmail, phone, details } = body;

    if (!businessName || !name || !userEmail || !details) {
      return response(400, {
        success: false,
        error: 'Missing required fields: businessName, name, email, details',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return response(400, {
        success: false,
        error: 'Invalid email address format',
      });
    }

    // 1. Create inquiry in DB (critical — fail if this fails)
    const inquiry = await db.createInquiry({
      businessName,
      name,
      email: userEmail,
      phone: phone || undefined,
      details,
      createdAt: new Date().toISOString(),
      status: 'new',
    });

    // 2. Send emails (non-critical — log failures but don't fail the request)
    //    SES sandbox mode restricts recipients to verified addresses only.
    const emailErrors: string[] = [];
    try {
      await email.sendInquiryConfirmation(userEmail, name, businessName);
    } catch (err: any) {
      console.warn('Non-critical: failed to send inquiry confirmation email:', err.message);
      emailErrors.push('confirmation');
    }

    try {
      await email.sendInternalNotification({
        inquiryId: inquiry.id,
        businessName,
        name,
        email: userEmail,
        phone: phone || 'N/A',
        details,
      });
    } catch (err: any) {
      console.warn('Non-critical: failed to send internal notification:', err.message);
      emailErrors.push('internal');
    }

    const message = emailErrors.length > 0
      ? 'Inquiry received. Email notifications may be delayed.'
      : 'Inquiry received. Check your email for confirmation.';

    return response(201, {
      success: true,
      data: { inquiryId: inquiry.id, message },
    });
  } catch (error) {
    console.error('Error handling inquiry:', error);
    return response(500, { success: false, error: 'Failed to process inquiry' });
  }
}

// ── POST /checkout/session ───────────────────────────────
async function handleCheckoutSession(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { plan, email: userEmail, businessName } = body;

    if (!plan || !userEmail || !businessName) {
      return response(400, {
        success: false,
        error: 'Missing required fields: plan, email, businessName',
      });
    }

    // Create checkout session
    const sessionId = await stripe.createCheckoutSession({
      plan,
      email: userEmail,
      businessName,
      successUrl: `${DOMAIN}/confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${DOMAIN}/payment.html`,
    });

    // Create order record
    const planPrices: Record<string, { amount: number; name: string }> = {
      hosting: { amount: 6000, name: 'Managed Hosting' },
      premium: { amount: 240000, name: 'Premium Website' },
    };

    const priceInfo = planPrices[plan];
    if (priceInfo) {
      await db.createOrder({
        customerId: '', // Will be updated upon payment success
        plan,
        amount: priceInfo.amount,
        currency: 'usd',
        stripePaymentIntentId: '', // Will be filled from webhook
        stripeCheckoutSessionId: sessionId,
        status: 'pending',
        email: userEmail,
        businessName,
        createdAt: new Date().toISOString(),
      });
    }

    return response(200, {
      success: true,
      data: { sessionId },
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return response(500, { success: false, error: 'Failed to create checkout session' });
  }
}

// ── POST /webhook/stripe ─────────────────────────────────
async function handleStripeWebhook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const signature = event.headers['stripe-signature'] || '';
    const body = event.body || '';

    // Verify webhook signature
    const webhookEvent = await stripe.constructEvent(body, signature);

    if (webhookEvent.type === 'checkout.session.completed') {
      const session = webhookEvent.data.object as any;
      const { customer_email, metadata, payment_intent } = session;

      if (!customer_email || !metadata?.businessName) {
        console.warn('Missing customer data in webhook');
        return response(200, { success: true });
      }

      // Find and update order
      const order = await db.getOrderByStripeSessionId(session.id);
      if (order) {
        await db.updateOrderStatus(order.id, 'completed', new Date().toISOString());

        // Send payment confirmation email (non-critical)
        try {
          await email.sendPaymentConfirmation(customer_email, metadata.businessName, metadata.plan, order.amount);
        } catch (emailErr: any) {
          console.warn('Non-critical: failed to send payment confirmation email:', emailErr.message);
        }

        console.log(`Order ${order.id} completed`);
      }
    }

    return response(200, { success: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return response(400, { success: false, error: 'Webhook processing failed' });
  }
}

// ── GET /orders?email=... ────────────────────────────────
async function handleGetOrders(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const email = event.queryStringParameters?.email;

    if (!email) {
      return response(400, { success: false, error: 'Missing email query parameter' });
    }

    const orders = await db.getOrdersByEmail(email);

    return response(200, {
      success: true,
      data: { orders },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return response(500, { success: false, error: 'Failed to fetch orders' });
  }
}

// ── GET /checkout/session?session_id=... ─────────────────
async function handleGetCheckoutSession(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = event.queryStringParameters?.session_id;

    if (!sessionId) {
      return response(400, { success: false, error: 'Missing session_id query parameter' });
    }

    // Retrieve the Stripe session
    const session = await stripe.getCheckoutSession(sessionId);

    // Look up our order record
    const order = await db.getOrderByStripeSessionId(sessionId);

    const planNames: Record<string, string> = {
      hosting: 'Managed Hosting',
      professional: 'Professional Website',
      premium: 'Premium Website',
      integration: 'Platform Integration',
    };

    return response(200, {
      success: true,
      data: {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email || session.customer_details?.email || '',
        plan: session.metadata?.plan || order?.plan || '',
        planName: planNames[session.metadata?.plan || order?.plan || ''] || 'Website Package',
        businessName: session.metadata?.businessName || order?.businessName || '',
        amountTotal: session.amount_total, // in cents
        currency: session.currency || 'usd',
        orderId: order?.id || '',
        status: order?.status || session.payment_status,
        createdAt: order?.createdAt || new Date((session.created || 0) * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching checkout session:', error);
    return response(500, { success: false, error: 'Failed to retrieve session' });
  }
}

// ── GET /inquiries/all ──────────────────────────────────
async function handleGetAllInquiries(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const inquiries = await db.getAllInquiries();

    return response(200, {
      success: true,
      data: inquiries,
    });
  } catch (error) {
    console.error('Error fetching all inquiries:', error);
    return response(500, { success: false, error: 'Failed to fetch inquiries' });
  }
}

// ── PUT /inquiries/{id} ─────────────────────────────────
async function handleUpdateInquiry(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = (event as any).rawPath || (event as any).path || '';
    const id = path.split('/').pop();
    
    if (!id) {
      return response(400, { success: false, error: 'Missing inquiry ID' });
    }

    const body = JSON.parse(event.body || '{}');
    const { status } = body;

    if (!status) {
      return response(400, { success: false, error: 'Missing status field' });
    }

    await db.updateInquiryStatus(id, status);

    return response(200, {
      success: true,
      data: { id, status },
    });
  } catch (error) {
    console.error('Error updating inquiry:', error);
    return response(500, { success: false, error: 'Failed to update inquiry' });
  }
}

// ── DELETE /inquiries/{id} ──────────────────────────────
async function handleDeleteInquiry(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = (event as any).rawPath || (event as any).path || '';
    const id = path.split('/').pop();

    if (!id) {
      return response(400, { success: false, error: 'Missing inquiry ID' });
    }

    await db.deleteInquiry(id);

    return response(200, {
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting inquiry:', error);
    return response(500, { success: false, error: 'Failed to delete inquiry' });
  }
}

// ── Main Lambda handler ──────────────────────────────────
export async function handler(event: any): Promise<APIGatewayProxyResult> {
  // Support both API Gateway v1 and v2 formats
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || event.resource || event.path || '';

  // CORS preflight
  if (method === 'OPTIONS') {
    return response(200, {});
  }

  console.log(`${method} ${path}`);

  try {
    // Route based on method + exact path suffix
    const route = `${method} ${path.replace(/^\/api\/agency/, '')}`;

    // POST /inquiries
    if (route === 'POST /inquiries') {
      return await handleInquiry(event);
    }

    // POST /checkout/session
    if (route === 'POST /checkout/session') {
      return await handleCheckoutSession(event);
    }

    // POST /webhook/stripe
    if (route === 'POST /webhook/stripe') {
      return await handleStripeWebhook(event);
    }

    // GET /orders
    if (route.startsWith('GET /orders')) {
      return await handleGetOrders(event);
    }

    // GET /checkout/session?session_id=...
    if (route.startsWith('GET /checkout/session')) {
      return await handleGetCheckoutSession(event);
    }

    // GET /inquiries/all
    if (route === 'GET /inquiries/all') {
      return await handleGetAllInquiries(event);
    }

    // PUT /inquiries/{id}
    if (route.startsWith('PUT /inquiries/')) {
      return await handleUpdateInquiry(event);
    }

    // DELETE /inquiries/{id}
    if (route.startsWith('DELETE /inquiries/')) {
      return await handleDeleteInquiry(event);
    }

    return response(404, { success: false, error: 'Route not found' });
  } catch (error) {
    console.error('Unhandled error:', error);
    return response(500, { success: false, error: 'Internal server error' });
  }
}
