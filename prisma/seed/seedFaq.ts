import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

type FaqCategory = "general" | "community" | "professional" | "homepage" | "pricing" | "google_play_guide" | "billing";

interface FaqSeed {
  title: string;
  description: string;
  category: FaqCategory;
  sortOrder: number;
}

const faqs: FaqSeed[] = [
  // ==================== General ====================
  {
    title: "What is inTesters?",
    description: "inTesters is a platform designed to help Android developers meet the Google Play Store's requirement of having their app tested by at least 12 people for 14 days. We offer two paths: Handshake Testing (₹99/month, 1:1 barter) and Pro Testing (managed professional service).",
    category: "general",
    sortOrder: 1,
  },
  {
    title: "Who is inTesters for?",
    description: "inTesters is for any Android developer, from solo indie devs to large companies, who need to fulfill Google's pre-launch testing requirements quickly and efficiently.",
    category: "general",
    sortOrder: 2,
  },
  {
    title: "How do I get started?",
    description: "Sign up and subscribe to Handshake Testing (₹99/month). Publish your app, browse other developers' apps, and send handshake requests. When accepted, you test their app and they test yours ,  a true barter system.",
    category: "general",
    sortOrder: 3,
  },
  // ==================== Community ====================
  {
    title: "How does Handshake Testing work?",
    description: "It's a 1:1 barter system. Subscribe for ₹99/month, publish your apps on the hub, and send testing requests to other developers. When a request is accepted, both sides test each other's app for 14 days. Once both complete, the handshake is done.",
    category: "community",
    sortOrder: 1,
  },
  {
    title: "Do I need a subscription for Handshake Testing?",
    description: "Yes. Handshake Testing is a paid subscription service at ₹99/month. This replaces the old free/points model with a sustainable barter system. You can test as many handshake partners as your level allows within your subscription.",
    category: "community",
    sortOrder: 2,
  },
  {
    title: "What kind of feedback can I expect from handshake testing?",
    description: "You'll receive feedback from a fellow developer who is invested in the testing process. Since you're testing each other's apps, both sides are motivated to provide meaningful, constructive feedback.",
    category: "community",
    sortOrder: 3,
  },
  {
    title: "Should I use Handshake Testing or Pro Testing?",
    description: "Handshake Testing is great if you have time to test other developers' apps and want a reciprocal arrangement. Pro Testing is ideal if you need guaranteed results, vetted testers, detailed bug reports, and a fully managed 14-day cycle with zero effort from you.",
    category: "community",
    sortOrder: 4,
  },
  {
    title: "Why do developers upgrade from Handshake to Pro?",
    description: "The #1 reason is time. Handshake testing requires you to spend 14 days testing your partner's app before your own testing completes. Pro Testing gives you 20+ vetted testers, detailed bug reports, device coverage stats, and Google Play compliance verification -- all managed by our team with zero effort from you.",
    category: "community",
    sortOrder: 5,
  },
  {
    title: "How does the level system work?",
    description: "You start at Level 1 with 12 tester slots per app. Every 2 completed handshakes (where both sides finish 14 days), you gain 1 level and unlock 1 extra slot. Maximum is Level 9 with 20 slots per app.",
    category: "community",
    sortOrder: 6,
  },
  // ==================== Professional ====================
  {
    title: "How does Pro Testing work?",
    description: "It's simple. You submit your app, choose a testing package, and our professional QA team takes over. We assign 20+ vetted testers who test your app across multiple devices and OS versions for 14 days. You receive detailed bug reports, device coverage stats, and analytics -- all managed by our team with zero effort from you.",
    category: "professional",
    sortOrder: 1,
  },
  {
    title: "Is Pro Testing guaranteed to meet Google Play's 12-tester requirement?",
    description: "Yes. Pro Testing is specifically designed to meet and exceed Google Play's 12-tester, 14-day requirement. We guarantee 20+ testers over 14 days, with detailed reports that serve as proof of testing for your Google Play Console listing.",
    category: "professional",
    sortOrder: 2,
  },
  {
    title: "How is Pro Testing different from Handshake Testing?",
    description: "Handshake Testing is a reciprocal barter system where you subscribe (₹99/month) and test another developer's app in exchange for them testing yours. Pro Testing is a paid, fully managed service where you get 20+ vetted professional testers, detailed bug reports, device coverage analytics, and Google Play compliance verification -- all handled by our team with zero effort from you.",
    category: "professional",
    sortOrder: 3,
  },
  {
    title: "What kind of feedback do I get with Pro Testing?",
    description: "You'll receive comprehensive, structured bug reports including: screenshots and screen recordings of issues, device and OS version details, crash logs, step-by-step reproduction steps, usability feedback, and performance metrics. Every test cycle includes a full coverage report showing which devices and OS versions were tested.",
    category: "professional",
    sortOrder: 4,
  },
  {
    title: "How long does a Pro Testing cycle take?",
    description: "The standard Pro Testing cycle is 14 days -- exactly matching Google Play's requirement. We manage the entire process end-to-end. You can track progress in real-time through your dashboard.",
    category: "professional",
    sortOrder: 5,
  },
  {
    title: "What happens if my app doesn't get enough testers?",
    description: "We guarantee 20+ testers for every Pro Testing cycle. If for any reason we fall short, we extend the testing period at no additional cost until the required number of testers is met. This is part of our satisfaction guarantee.",
    category: "professional",
    sortOrder: 6,
  },
  // ==================== Homepage ====================
  {
    title: "What's the difference between Handshake and Professional Paths?",
    description: "The Handshake Path is a subscription-based (₹99/month) 1:1 barter model where you test another developer's app and they test yours. The Professional Path allows you to purchase a testing package to hire our team of vetted, professional testers for a guaranteed, managed testing experience.",
    category: "homepage",
    sortOrder: 1,
  },
  {
    title: "How does the level system work?",
    description: "Your level determines how many testers you can request per app. At Level 1 you get 12 slots. Every 2 completed handshakes raises your level by 1, adding 1 more slot (max Level 9 = 20 slots).",
    category: "homepage",
    sortOrder: 2,
  },
  {
    title: "Do I need a subscription for Handshake Testing?",
    description: "Yes. Handshake Testing costs ₹99/month. This pays for the platform infrastructure and keeps the system fair. You can publish multiple apps and send requests as your level permits.",
    category: "homepage",
    sortOrder: 3,
  },
  {
    title: "Why should I choose the Professional Path?",
    description: "Choose the Professional Path if you're on a tight deadline, need guaranteed high-quality feedback, or simply don't have the time to test other apps. It's the fastest and most hassle-free way to get your app ready for the Play Store.",
    category: "homepage",
    sortOrder: 4,
  },
  // ==================== Pricing ====================
  {
    title: "What is a Professional Testing Package?",
    description: "A package is what you buy to get one app fully tested by our professional, vetted QA team. It covers one complete testing cycle (14 days, 20+ testers) to meet Google's requirements. This is separate from the community points system.",
    category: "pricing",
    sortOrder: 1,
  },
  {
    title: "Do my purchased packages expire?",
    description: "No, your packages never expire. You can use them whenever you're ready to start a new professional testing cycle for an app.",
    category: "pricing",
    sortOrder: 2,
  },
  {
    title: "What is the difference between Handshake subscription and Pro packages?",
    description: "The Handshake subscription (₹99/month) gives you access to the 1:1 barter testing hub. Pro packages are one-time purchases for the Professional Path, where our team manages the entire 14-day testing cycle for you. They are two separate systems.",
    category: "pricing",
    sortOrder: 3,
  },
  {
    title: "Can I get a refund on purchased packages?",
    description: "Unused packages are eligible for a refund within 14 days of purchase. Please contact our support team for assistance.",
    category: "pricing",
    sortOrder: 4,
  },
  // ==================== Google Play Guide ====================
  {
    title: "How many testers do I need for Google Play in 2026?",
    description: "Google Play requires a minimum of 12 opted-in testers for personal developer accounts. Testers must actively use your app on real Android devices for 14 consecutive days before you can apply for production access.",
    category: "google_play_guide",
    sortOrder: 1,
  },
  {
    title: "Can I get 12 testers in 24 hours?",
    description: "Yes. With a dedicated testing platform like inTesters, you can get 12 pre-qualified testers enrolled and active on your app within 24 hours. Our community of real testers is ready to help you meet the requirement quickly.",
    category: "google_play_guide",
    sortOrder: 2,
  },
  {
    title: "Does Google require 12 testers for 14 days?",
    description: "Yes. The requirement is at least 12 opted-in testers actively using your app for 14 consecutive days. If testers drop below 12, the clock resets and you must start over.",
    category: "google_play_guide",
    sortOrder: 3,
  },
  {
    title: "What happens if a tester uninstalls my app during the 14 days?",
    description: "If a tester uninstalls your app and your active tester count drops below 12, Google resets the 14-day clock entirely. This is why it's recommended to recruit 15-20 testers to build in a buffer against dropouts.",
    category: "google_play_guide",
    sortOrder: 4,
  },
  {
    title: "Is the 12-tester requirement mandatory for all developers?",
    description: "It applies to personal Google Play Console accounts created after November 13, 2023. Organization/business accounts are typically exempt from this requirement.",
    category: "google_play_guide",
    sortOrder: 5,
  },
  {
    title: "How long does Google Play closed testing take?",
    description: "The minimum testing period is 14 consecutive days. With inTesters, you can have testers enrolled and active within 24 hours, so the total timeline is approximately 15-16 days from start to production access.",
    category: "google_play_guide",
    sortOrder: 6,
  },
  {
    title: "Can I use the same testers for multiple apps?",
    description: "Yes. The same group of testers can test multiple apps on your developer account. Each app requires its own 14-day testing period, however.",
    category: "google_play_guide",
    sortOrder: 7,
  },
  {
    title: "What is the fastest way to get 12 testers for Google Play?",
    description: "The fastest and most reliable way is to use a professional testing service like inTesters. We connect you with real, active testers who are committed to completing the full 14-day testing period. Testers can be enrolled within 24 hours.",
    category: "google_play_guide",
    sortOrder: 8,
  },
  // ==================== Billing ====================
  {
    title: "How do the credits work?",
    description: "Each credit corresponds to one comprehensive testing cycle for your application. One credit is verified against one specific version of your app.",
    category: "billing",
    sortOrder: 1,
  },
  {
    title: "Can I upgrade later?",
    description: "Absolutely. You can purchase additional packages at any time. Your credits never expire as long as your account is active.",
    category: "billing",
    sortOrder: 2,
  },
  {
    title: "Is there a refund policy?",
    description: "We offer a 100% satisfaction guarantee. If you're not happy with the testing results from your first package, contact our support team within 14 days.",
    category: "billing",
    sortOrder: 3,
  },
  {
    title: "Enterprise agreements?",
    description: "Yes! For high-volume needs, we offer custom enterprise plans with volume discounts and dedicated account management. Contact sales for details.",
    category: "billing",
    sortOrder: 4,
  },
  {
    title: "Payment methods?",
    description: "We accept all major credit cards (Visa, Mastercard, Amex), PayPal, and wire transfers for enterprise invoices.",
    category: "billing",
    sortOrder: 5,
  },
];

export async function seedFaq() {
  logger.info("Seeding FAQs...");

  for (const faq of faqs) {
    const existing = await prisma.faq.findFirst({
      where: { title: faq.title, category: faq.category },
    });

    if (!existing) {
      await prisma.faq.create({
        data: {
          title: faq.title,
          description: faq.description,
          category: faq.category,
          sortOrder: faq.sortOrder,
          isActive: true,
        },
      });
    }
  }

  logger.info(`${faqs.length} FAQs seeded successfully!`);
}
