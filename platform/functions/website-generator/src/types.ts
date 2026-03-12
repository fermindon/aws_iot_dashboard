// ── Shared types for the Website Generator ──────────

export interface Website {
  customerId: string;
  websiteId: string;
  businessName?: string;
  industry?: string;
  description?: string;
  templateId?: string;
  style?: string;
  enabledSections?: string[];
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logoText?: string;
  };
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
  };
  analytics?: {
    googleAnalyticsId?: string;
    facebookPixelId?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  products?: Product[];
  teamMembers?: TeamMember[];
  testimonials?: Testimonial[];
  caseStudies?: CaseStudy[];
  services?: Service[];
  content?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Product {
  name?: string;
  description?: string;
  price?: string;
  imageUrl?: string;
}

export interface TeamMember {
  name?: string;
  role?: string;
  bio?: string;
  photoUrl?: string;
}

export interface Testimonial {
  text?: string;
  author?: string;
  rating?: number | string;
  name?: string;
  role?: string;
}

export interface CaseStudy {
  title?: string;
  description?: string;
  result?: string;
  category?: string;
}

export interface Service {
  name?: string;
  description?: string;
  icon?: string;
}

export interface AIContent {
  hero_headline?: string;
  hero_subheadline?: string;
  hero_cta?: string;
  about_title?: string;
  about_text?: string;
  services?: Service[];
  pricing_plans?: PricingPlan[];
  testimonials?: { text?: string; name?: string; role?: string }[];
  portfolio_items?: { title?: string; description?: string; category?: string }[];
  faqs?: { question?: string; answer?: string }[];
  blog_posts?: { title?: string; excerpt?: string; date?: string }[];
  cta_title?: string;
  cta_text?: string;
  footer_tagline?: string;
  [key: string]: unknown;
}

export interface PricingPlan {
  name?: string;
  price?: string;
  features?: string[];
}

export interface GenerationResult {
  content: AIContent;
  aiGenerated: boolean;
  tokensUsed: number;
  model: string;
}

export interface ImageMap {
  [key: string]: string;
}

export interface SQSMessageBody {
  jobId: string;
  websiteId: string;
  website?: Website;
  customerId?: string;
  imageMode?: string;
}
