// ── Stripe Integration ───────────────────────────────────
import Stripe from 'stripe';
import { SecretsManager } from 'aws-sdk';
import { CheckoutSessionRequest } from './types';

const secretsManager = new SecretsManager({ region: process.env.AWS_REGION || 'us-east-1' });

let stripeInstance: Stripe | null = null;

async function getStripe(): Promise<Stripe> {
  if (stripeInstance) return stripeInstance;
  
  const secretId = process.env.STRIPE_SECRET_ARN || 'stripe-keys';
  const result = await secretsManager.getSecretValue({ SecretId: secretId }).promise();
  const keys = JSON.parse(result.SecretString || '{}');
  
  stripeInstance = new Stripe(keys.secret_key, {
    apiVersion: '2023-10-16',
  });
  return stripeInstance;
}

const PLAN_PRICES: Record<string, { name: string; amount: number; interval: string; additionalItems?: { name: string; amount: number; interval: string }[] }> = {
  hosting: { name: 'Managed Hosting', amount: 6000, interval: 'month' }, // $60/month
  premium: {
    name: 'Premium Website', amount: 240000, interval: 'once', // $2,400 one-time
    additionalItems: [
      { name: 'Premium Hosting', amount: 4000, interval: 'month' }, // $40/month hosting
    ],
  },
};

export async function createCheckoutSession(req: CheckoutSessionRequest): Promise<string> {
  const plan = PLAN_PRICES[req.plan];
  if (!plan) throw new Error(`Invalid plan: ${req.plan}`);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let mode: Stripe.Checkout.SessionCreateParams.Mode;

  if (plan.additionalItems && plan.additionalItems.length > 0) {
    // Plan with one-time build + monthly hosting (e.g., Premium Website)
    // Use subscription mode: one-time cost added to first invoice, recurring charged monthly
    mode = 'subscription';
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: plan.name,
          description: `Web Agency - ${plan.name} (one-time build)`,
        },
        unit_amount: plan.amount,
      },
      quantity: 1,
    });
    for (const item of plan.additionalItems) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: `Web Agency - ${item.name}`,
          },
          unit_amount: item.amount,
          recurring: { interval: item.interval as any },
        },
        quantity: 1,
      });
    }
  } else if (plan.interval === 'month') {
    // Pure subscription plan (e.g., Managed Hosting)
    mode = 'subscription';
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: plan.name,
          description: `Web Agency - ${plan.name}`,
        },
        unit_amount: plan.amount,
        recurring: { interval: plan.interval as any },
      },
      quantity: 1,
    });
  } else {
    // One-time payment
    mode = 'payment';
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: plan.name,
          description: `Web Agency - ${plan.name}`,
        },
        unit_amount: plan.amount,
      },
      quantity: 1,
    });
  }

  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode,
    customer_email: req.email,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    metadata: {
      plan: req.plan,
      businessName: req.businessName,
      email: req.email,
    },
  });

  if (!session.id) throw new Error('Failed to create checkout session');
  return session.id;
}

export async function verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
  try {
    const stripe = await getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return true;
  } catch (error) {
    console.error('Webhook verification failed:', error);
    return false;
  }
}

export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = await getStripe();
  return stripe.checkout.sessions.retrieve(sessionId);
}

export async function getPaymentIntent(intentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = await getStripe();
  return stripe.paymentIntents.retrieve(intentId);
}

export async function constructEvent(body: string, signature: string) {
  const stripe = await getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}
