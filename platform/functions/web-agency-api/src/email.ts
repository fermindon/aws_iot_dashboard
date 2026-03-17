// ── Email Service (SES) ──────────────────────────────────
import { SES } from 'aws-sdk';

const ses = new SES({ region: process.env.AWS_REGION || 'us-east-1' });

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@angelorum.tech';

// HTML-escape user-supplied strings to prevent injection
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Email Templates ──────────────────────────────────────

function inquiryConfirmationEmail(name: string, businessName: string): { subject: string; html: string } {
  return {
    subject: 'We received your inquiry — Angelorum Solutions',
    html: `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <h2>Thank you for reaching out, ${esc(name)}!</h2>
          <p>We've received your inquiry for <strong>${esc(businessName)}</strong> and will get back to you within 1 business day.</p>
          <p>In the meantime, feel free to explore our <a href="https://www.angelorum.tech">website</a> to learn more about our managed infrastructure services.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 2rem 0;">
          <p style="font-size: 12px; color: #777;">
            <strong>Angelorum Solutions</strong><br>
            Managed Website Infrastructure for Small Businesses<br>
            <a href="mailto:inquiry@angelorum.tech">inquiry@angelorum.tech</a>
          </p>
        </body>
      </html>
    `,
  };
}

function paymentConfirmationEmail(businessName: string, plan: string, amount: number): { subject: string; html: string } {
  const planNames: Record<string, string> = {
    hosting: 'Managed Hosting',
    professional: 'Professional Website',
    premium: 'Premium Website',
    integration: 'Platform Integration',
  };

  return {
    subject: `Payment confirmed — ${planNames[plan] || 'Your Order'} | Angelorum Solutions`,
    html: `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <h2>Payment Received! ✓</h2>
          <p>Thank you for your purchase, <strong>${esc(businessName)}</strong>.</p>
          <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0;">
            <p><strong>Plan:</strong> ${planNames[plan] || plan}</p>
            <p><strong>Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          </div>
          <p>Our team will reach out within 1 business day to discuss next steps and get your project underway.</p>
          <p>Questions? Contact us anytime at <strong>inquiry@angelorum.tech</strong></p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 2rem 0;">
          <p style="font-size: 12px; color: #777;">
            <strong>Angelorum Solutions</strong><br>
            Managed Website Infrastructure for Small Businesses
          </p>
        </body>
      </html>
    `,
  };
}

// ── Send Functions ───────────────────────────────────────

export async function sendInquiryConfirmation(email: string, name: string, businessName: string): Promise<void> {
  const { subject, html } = inquiryConfirmationEmail(name, businessName);

  const params: SES.SendEmailRequest = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } },
    },
  };

  try {
    await ses.sendEmail(params).promise();
    console.log('Inquiry confirmation sent');
  } catch (error) {
    console.error('Failed to send inquiry confirmation:', error);
    throw error;
  }
}

export async function sendPaymentConfirmation(
  email: string,
  businessName: string,
  plan: string,
  amount: number,
): Promise<void> {
  const { subject, html } = paymentConfirmationEmail(businessName, plan, amount);

  const params: SES.SendEmailRequest = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } },
    },
  };

  try {
    await ses.sendEmail(params).promise();
    console.log('Payment confirmation sent');
  } catch (error) {
    console.error('Failed to send payment confirmation:', error);
    throw error;
  }
}

export async function sendInternalNotification(inquiryData: Record<string, string>): Promise<void> {
  const subject = `New Inquiry: ${inquiryData.businessName}`;
  const html = `
    <html>
      <body style="font-family: monospace; color: #333; background: #f8f9fa; padding: 1rem;">
        <h3>New Web Agency Inquiry</h3>
        <p><strong>Business:</strong> ${esc(inquiryData.businessName || '')}</p>
        <p><strong>Name:</strong> ${esc(inquiryData.name || '')}</p>
        <p><strong>Email:</strong> ${esc(inquiryData.email || '')}</p>
        <p><strong>Phone:</strong> ${esc(inquiryData.phone || 'N/A')}</p>
        <p><strong>Details:</strong> ${esc(inquiryData.details || '')}</p>
        <p><strong>Inquiry ID:</strong> ${esc(inquiryData.inquiryId || '')}</p>
      </body>
    </html>
  `;

  const params: SES.SendEmailRequest = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [process.env.INTERNAL_EMAIL || 'inquiry@angelorum.tech'] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } },
    },
  };

  try {
    await ses.sendEmail(params).promise();
    console.log('Internal notification sent for new inquiry');
  } catch (error) {
    console.error('Failed to send internal notification:', error);
  }
}
