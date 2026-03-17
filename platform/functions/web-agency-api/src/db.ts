// ── Database Operations (DynamoDB) ──────────────────────
import { DynamoDB } from 'aws-sdk';
import { randomUUID } from 'crypto';
import { Order, Inquiry, Customer } from './types';

const dynamodb = new DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ORDERS_TABLE = process.env.ORDERS_TABLE || 'web-agency-orders';
const INQUIRIES_TABLE = process.env.INQUIRIES_TABLE || 'web-agency-inquiries';
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE || 'web-agency-customers';

// ── Orders ────────────────────────────────────────────────

export async function createOrder(order: Omit<Order, 'id'>): Promise<Order> {
  const id = randomUUID();
  const newOrder: Order = { ...order, id };
  
  await dynamodb
    .put({
      TableName: ORDERS_TABLE,
      Item: newOrder,
    })
    .promise();
  
  return newOrder;
}

export async function updateOrderStatus(
  orderId: string,
  status: Order['status'],
  completedAt?: string,
): Promise<void> {
  const params: any = {
    TableName: ORDERS_TABLE,
    Key: { id: orderId },
    UpdateExpression: 'SET #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status },
  };

  if (completedAt) {
    params.UpdateExpression += ', completedAt = :completedAt';
    params.ExpressionAttributeValues[':completedAt'] = completedAt;
  }

  await dynamodb.update(params).promise();
}

export async function getOrderByStripeSessionId(sessionId: string): Promise<Order | null> {
  const result = await dynamodb
    .query({
      TableName: ORDERS_TABLE,
      IndexName: 'stripeCheckoutSessionIdIndex',
      KeyConditionExpression: 'stripeCheckoutSessionId = :sessionId',
      ExpressionAttributeValues: { ':sessionId': sessionId },
    })
    .promise();

  return (result.Items?.[0] as Order) || null;
}

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const result = await dynamodb
    .query({
      TableName: ORDERS_TABLE,
      IndexName: 'emailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
    .promise();

  return (result.Items as Order[]) || [];
}

// ── Inquiries ─────────────────────────────────────────────

export async function createInquiry(inquiry: Omit<Inquiry, 'id'>): Promise<Inquiry> {
  const id = randomUUID();
  const newInquiry: Inquiry = { ...inquiry, id, status: 'new' };

  await dynamodb
    .put({
      TableName: INQUIRIES_TABLE,
      Item: newInquiry,
    })
    .promise();

  return newInquiry;
}

export async function getInquiriesByEmail(email: string): Promise<Inquiry[]> {
  const result = await dynamodb
    .query({
      TableName: INQUIRIES_TABLE,
      IndexName: 'emailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
    .promise();

  return (result.Items as Inquiry[]) || [];
}

export async function updateInquiryStatus(inquiryId: string, status: Inquiry['status']): Promise<void> {
  await dynamodb
    .update({
      TableName: INQUIRIES_TABLE,
      Key: { id: inquiryId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    })
    .promise();
}

export async function getAllInquiries(): Promise<Inquiry[]> {
  const result = await dynamodb
    .scan({
      TableName: INQUIRIES_TABLE,
    })
    .promise();

  return (result.Items as Inquiry[]) || [];
}

export async function deleteInquiry(inquiryId: string): Promise<void> {
  await dynamodb
    .delete({
      TableName: INQUIRIES_TABLE,
      Key: { id: inquiryId },
    })
    .promise();
}

// ── Customers ─────────────────────────────────────────────

export async function createCustomer(customer: Omit<Customer, 'id' | 'orders'>): Promise<Customer> {
  const id = randomUUID();
  const newCustomer: Customer = { ...customer, id, orders: [] };

  await dynamodb
    .put({
      TableName: CUSTOMERS_TABLE,
      Item: newCustomer,
    })
    .promise();

  return newCustomer;
}

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  const result = await dynamodb
    .query({
      TableName: CUSTOMERS_TABLE,
      IndexName: 'emailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
    .promise();

  return (result.Items?.[0] as Customer) || null;
}

export async function updateCustomerStripeId(customerId: string, stripeCustomerId: string): Promise<void> {
  await dynamodb
    .update({
      TableName: CUSTOMERS_TABLE,
      Key: { id: customerId },
      UpdateExpression: 'SET stripeCustomerId = :stripeId',
      ExpressionAttributeValues: { ':stripeId': stripeCustomerId },
    })
    .promise();
}
