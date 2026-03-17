// ── Types ────────────────────────────────────────────────

export interface Inquiry {
  id: string;
  businessName: string;
  name: string;
  email: string;
  phone?: string;
  details: string;
  createdAt: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
}

export interface Order {
  id: string;
  customerId: string;
  plan: string; // 'hosting', 'professional', 'premium'
  amount: number; // in cents
  currency: string;
  stripePaymentIntentId: string;
  stripeCheckoutSessionId: string;
  status: 'pending' | 'completed' | 'failed';
  email: string;
  businessName: string;
  createdAt: string;
  completedAt?: string;
}

export interface Customer {
  id: string;
  email: string;
  businessName: string;
  phone?: string;
  stripeCustomerId: string;
  createdAt: string;
  orders: Order[];
}

export interface CheckoutSessionRequest {
  plan: string;
  email: string;
  businessName: string;
  successUrl: string;
  cancelUrl: string;
}

export interface WebhookPayload {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
      status: string;
      metadata?: Record<string, string>;
      customer_email?: string;
    };
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
