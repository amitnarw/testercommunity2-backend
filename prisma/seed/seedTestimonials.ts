import logger from "../../src/utils/logger";
import { prismaClient } from "../../src/lib/prisma";

const prisma = prismaClient;

const testimonials = [
  {
    name: "Sarah Jennings",
    role: "Lead Developer, TechNova",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "woman portrait",
    comment: "inTesters has revolutionized our QA process. The real-time feedback and detailed reports are game-changers. The platform isn't just functional, it's a joy to use!",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=600&auto=format&fit=crop",
    tags: ["Enterprise", "SaaS", "High Volume"],
    appLink: "https://technova.io",
    rating: 5,
  },
  {
    name: "Mike Valerio",
    role: "Indie Game Developer",
    avatar: "https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "man smiling",
    comment: "Finding the right testers used to be a nightmare. The gamified marketplace made it fun and easy to connect with experienced, reliable people. My app is better for it.",
    tags: ["Indie Game", "Mobile", "Community Love"],
    rating: 5,
  },
  {
    name: "Chen Lin",
    role: "Product Manager, Innovate Inc.",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "person glasses",
    comment: "The dashboards are incredible. Being able to visualize our testing data with such clarity and beauty has helped us identify critical issues faster than ever before.",
    image: "https://images.unsplash.com/photo-1551033406-611cf9a28f67?q=80&w=600&auto=format&fit=crop",
    tags: ["Productivity", "Analytics"],
    appLink: "https://innovate.inc",
    rating: 5,
  },
  {
    name: "David Kim",
    role: "QA Engineer, GameSphere",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "man portrait",
    comment: "As a tester, the gamified reputation system is fantastic. It motivates me to do my best work and get recognized for it. I've gotten more high-quality projects through inTesters than any other platform.",
    tags: ["Top Tester", "Gamer", "Beta Access"],
    rating: 5,
  },
  {
    name: "Maria Garcia",
    role: "Mobile App Developer",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "woman developer",
    comment: "The community aspect is what sets inTesters apart. It's not just a service; it's a network of professionals passionate about quality. The collaboration tools are excellent.",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=600&auto=format&fit=crop",
    tags: ["Networking", "Collaboration"],
    appLink: "https://myapp.com",
    rating: 5,
  },
  {
    name: "James Wilson",
    role: "Solo Entrepreneur",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "man glasses",
    comment: "I launched my first app with confidence thanks to the rigorous testing from this community. The bugs found were obscure but critical!",
    tags: ["Solo Dev", "Bootstrap", "Success"],
    rating: 5,
  },
  {
    name: "Emily Chen",
    role: "UX Researcher",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "woman smiling",
    comment: "The qualitative feedback I received was gold. Testers didn't just find crashes; they pointed out confusing flows I hadn't noticed.",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=600&auto=format&fit=crop",
    tags: ["UX Design", "Feedback"],
    appLink: "https://design.co",
    rating: 5,
  },
  {
    name: "Robert Fox",
    role: "CTO, StartUp X",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400&auto=format&fit=crop",
    dataAiHint: "man suit",
    comment: "We needed 20 testers locally in Brazil for a specific payment feature. inTesters delivered within 24 hours. Exceptionally fast and reliable.",
    tags: [],
    rating: 5,
  },
];

export async function seedTestimonials() {
  logger.info("Seeding testimonials...");

  for (const testimonial of testimonials) {
    const existing = await prisma.testimonial.findFirst({
      where: { name: testimonial.name, comment: testimonial.comment },
    });

    if (!existing) {
      await prisma.testimonial.create({
        data: {
          name: testimonial.name,
          role: testimonial.role,
          avatar: testimonial.avatar,
          dataAiHint: testimonial.dataAiHint || null,
          comment: testimonial.comment,
          image: testimonial.image || null,
          appLink: testimonial.appLink || null,
          tags: testimonial.tags || [],
          rating: testimonial.rating ?? 5,
          isActive: true,
        },
      });
      logger.info(`  Testimonial seeded: ${testimonial.name}`);
    }
  }

  logger.info("All testimonials seeded successfully!");
}
