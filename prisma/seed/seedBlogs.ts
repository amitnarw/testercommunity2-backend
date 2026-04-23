import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  authorName: string;
  authorAvatarUrl: string;
  authorDataAiHint?: string;
  imageUrl: string;
  dataAiHint?: string;
  tags: string[];
  date: string;
}

const blogPosts: BlogPost[] = [
  {
    slug: "mastering-automated-testing",
    title: "Mastering Automated Testing: A Beginner's Guide",
    excerpt: "Learn the fundamentals of automated testing and how it can save you time and improve your product quality.",
    content: `<p>Automated testing is a cornerstone of modern software development. By letting scripts and tools do the repetitive work, you can focus on what truly matters: building great features. This guide will walk you through the basics.</p><p>We'll cover topics like:</p><ul><li>Choosing the right automation framework</li><li>Writing your first test script</li><li>Integrating tests into your CI/CD pipeline</li><li>Analyzing test results</li></ul>`,
    authorName: "Alice Johnson",
    authorAvatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "woman developer",
    imageUrl: "https://images.unsplash.com/photo-1516116216624-53e697320f64?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "code testing",
    tags: ["Automation", "Beginner", "CI/CD"],
    date: "2024-05-15",
  },
  {
    slug: "the-art-of-ux-testing",
    title: "The Art of UX Testing: More Than Just Finding Bugs",
    excerpt: "Discover how user experience (UX) testing can transform your app from functional to delightful.",
    content: `<p>UX testing goes beyond identifying functional bugs. It's about understanding how users feel when they interact with your product. A seamless UX can be the difference between a good app and a great one.</p><p>In this article, we explore:</p><ul><li>Heuristic evaluation</li><li>Usability testing methods</li><li>Gathering and interpreting user feedback</li><li>The connection between UX and business success</li></ul>`,
    authorName: "Hannah Wright",
    authorAvatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "woman tech",
    imageUrl: "https://images.unsplash.com/photo-1587440871875-191322ee64b0?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "ux design",
    tags: ["UI/UX", "Design", "User Research"],
    date: "2024-05-20",
  },
  {
    slug: "securing-your-mobile-app",
    title: "Securing Your Mobile App: A Tester's Checklist",
    excerpt: "A comprehensive checklist for mobile app security testing to protect your users and your reputation.",
    content: `<p>Mobile security is not a feature; it's a necessity. With increasing threats, robust security testing is crucial. This checklist provides a starting point for testers to ensure an app is secure.</p><p>Key areas covered:</p><ul><li>Data storage and encryption</li><li>Network communication vulnerabilities</li><li>Authentication and authorization</li><li>Code obfuscation and anti-tampering</li></ul>`,
    authorName: "George Hill",
    authorAvatarUrl: "https://images.unsplash.com/photo-1527982987257-d3abc440f2ba?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "man portrait",
    imageUrl: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "cyber security",
    tags: ["Security", "Mobile", "Checklist"],
    date: "2024-05-25",
  },
  {
    slug: "future-of-ai-testing",
    title: "The Future involves AI: How Machine Learning is Changing QA",
    excerpt: "Explore the revolutionary impact of AI on software testing, from predictive analysis to automated test generation.",
    content: `<p>Artificial Intelligence is no longer just a buzzword—it's actively reshaping how we approach Quality Assurance. In this deep dive, we look at tools and methodologies that are leveraging ML algorithms.</p><p>Topics:</p><ul><li>Self-healing test scripts</li><li>Visual regression testing with AI</li><li>Predictive bug analysis</li><li>The role of the human tester in an AI world</li></ul>`,
    authorName: "Sarah Connor",
    authorAvatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "woman professional",
    imageUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "ai brain network",
    tags: ["AI", "Future Tech", "Automation"],
    date: "2024-06-01",
  },
  {
    slug: "accessibility-testing-guide",
    title: "Testing for All: A Practical Guide to Accessibility (a11y)",
    excerpt: "Ensure your application is usable by everyone. A guide to WCAG standards and practical accessibility testing tips.",
    content: `<p>Accessibility adds a dimension of quality that ensures your software can be used by people with varying abilities. It's not just about compliance; it's about empathy and market reach.</p><p>We will cover:</p><ul><li>Understanding WCAG 2.1 principles</li><li>Screen reader testing (VoiceOver, NVDA)</li><li>Color contrast and text resizing</li><li>Automated vs. Manual a11y testing</li></ul>`,
    authorName: "Marcus Chen",
    authorAvatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "man smiling",
    imageUrl: "https://images.unsplash.com/photo-1573164713988-8665fc963095?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "accessible technology",
    tags: ["Accessibility", "Guide", "Inclusive Design"],
    date: "2024-06-10",
  },
  {
    slug: "performance-testing-101",
    title: "Need for Speed: Performance Testing Fundamentals",
    excerpt: "A slow app is a failed app. Learn how to load test your application and identify bottlenecks before your users do.",
    content: `<p>Performance testing is the art of determining how a system performs in terms of responsiveness and stability under a particular workload.</p><p>Key concepts:</p><ul><li>Load vs. Stress vs. Endurance testing</li><li>Interpreting latency and throughput</li><li>Tools of the trade: JMeter, k6, Gatling</li><li>Common performance bottlenecks</li></ul>`,
    authorName: "Elena Rodriguez",
    authorAvatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "woman developer glasses",
    imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "speedometer dashboard",
    tags: ["Performance", "Backend", "DevOps"],
    date: "2024-06-18",
  },
  {
    slug: "google-play-12-testers-14-days-requirement-2024",
    title: "The 2024 Update: Navigating Google Play's 12 Testers for 14 Days Requirement",
    excerpt: "Google has quietly updated their testing requirements for new individual developers. Here is everything you need to know about testing with 12 testers instead of 20.",
    content: `<p>If you are an independent app developer preparing to launch on the Google Play Store, you are likely aware of the stringent testing requirements introduced for personal developer accounts after November 2023. Initially, this policy mandated exactly 20 testers opting into a closed test for 14 continuous days.</p><p>However, in late 2024, developer forums and Google's official documentation reflected a significant, much-welcomed update: <strong>The requirement has been reduced from 20 testers to 12 testers.</strong></p><h3>What Exactly Has Changed?</h3><p>Google's primary goal—improving the overall quality of apps on the Play Store—remains unchanged. The adjustment to 12 testers acknowledges that gathering a dedicated cohort of 20 people was often an insurmountable hurdle for solo developers without a massive social network.</p>`,
    authorName: "Alex Narwal",
    authorAvatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "man professional",
    imageUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "money graph success",
    tags: ["Google Play", "Testing", "Requirements"],
    date: "2024-11-20",
  },
  {
    slug: "advanced-app-marketing-aso-strategies-2024",
    title: "Advanced App Marketing & ASO Strategies for Google Play in 2024",
    excerpt: "App Store Optimization (ASO) is constantly evolving. Learn the most effective strategies for ranking your app higher in Google Play search results.",
    content: `<p>Launching your app on the Google Play Store is just the beginning. With millions of apps vying for attention, organic discovery is rare to happen by accident. You need a dedicated App Store Optimization (ASO) and marketing strategy.</p><p>In 2024, Google's algorithms have become significantly smarter, relying heavily on user behavior, retention rates, and semantic keyword understanding rather than just keyword stuffing.</p><h3>1. Mastering Application Metadata</h3><p>Google's crawler indexes almost all text in your Play Store listing. How you structure this is critical to your app marketing efforts.</p>`,
    authorName: "Sarah Chen",
    authorAvatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "woman professional",
    imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "seo metrics website",
    tags: ["App Marketing", "ASO", "SEO"],
    date: "2024-11-25",
  },
  {
    slug: "seo-backlink-building-internal-linking-app-developers",
    title: "SEO Backlink Building and Internal Linking for App Developers",
    excerpt: "Learn why off-page SEO and backlink building are essential for driving high-converting web traffic to your Google Play Store app landing pages.",
    content: `<p>A common mistake indie developers make is relying solely on the Google Play Store for discovery. If your entire marketing strategy exists within the Play Console, you are missing out on millions of potential users searching for solutions on traditional web browsers.</p><p>To capture this audience, every successful app needs a corresponding website or landing page. And that website needs an SEO strategy. In 2024, the foundation of web SEO remains <strong>high-quality backlinks</strong> and <strong>strategic internal linking</strong>.</p>`,
    authorName: "Jordan Smith",
    authorAvatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop",
    authorDataAiHint: "person glasses",
    imageUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=600&auto=format&fit=crop",
    dataAiHint: "network connections",
    tags: ["SEO", "Backlinks", "Marketing"],
    date: "2024-11-28",
  },
];

export async function seedBlogs() {
  logger.info("🌱 Seeding blogs...");

  for (const blog of blogPosts) {
    await prisma.blog.upsert({
      where: { slug: blog.slug },
      update: {
        title: blog.title,
        excerpt: blog.excerpt,
        content: blog.content,
        authorName: blog.authorName,
        authorAvatarUrl: blog.authorAvatarUrl,
        authorDataAiHint: blog.authorDataAiHint || null,
        imageUrl: blog.imageUrl,
        dataAiHint: blog.dataAiHint || null,
        tags: blog.tags,
        isActive: true,
        date: new Date(blog.date),
      },
      create: {
        title: blog.title,
        slug: blog.slug,
        excerpt: blog.excerpt,
        content: blog.content,
        authorName: blog.authorName,
        authorAvatarUrl: blog.authorAvatarUrl,
        authorDataAiHint: blog.authorDataAiHint || null,
        imageUrl: blog.imageUrl,
        dataAiHint: blog.dataAiHint || null,
        tags: blog.tags,
        isActive: true,
        date: new Date(blog.date),
      },
    });
    logger.info(`  ✅ Blog seeded: ${blog.title}`);
  }

  logger.info("✅ All blogs seeded successfully!");
}