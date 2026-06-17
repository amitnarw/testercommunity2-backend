-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BlogCategory" AS ENUM ('AUTOMATION', 'UI_UX', 'SECURITY', 'AI', 'MOBILE', 'DEVOPS', 'GENERAL');

-- CreateEnum
CREATE TYPE "UserAuthType" AS ENUM ('EMAIL_PASSWORD', 'GOOGLE');

-- CreateEnum
CREATE TYPE "UserProfileType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'AGENCY', 'CLIENT_MANAGER');

-- CreateEnum
CREATE TYPE "UserJobRole" AS ENUM ('DEVELOPER', 'QA_TESTER', 'PRODUCT_MANAGER', 'DESIGNER', 'BUSINESS_OWNER', 'MARKETING', 'SALES', 'PROJECT_MANAGER', 'STUDENT', 'HOBBYIST', 'AGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "UserCompanySize" AS ENUM ('SIZE_1', 'SIZE_2_10', 'SIZE_11_50', 'SIZE_51_200', 'SIZE_201_500', 'SIZE_501_1000', 'SIZE_1001_5000', 'SIZE_5001_10000', 'SIZE_10000_PLUS');

-- CreateEnum
CREATE TYPE "UserCompanyPosition" AS ENUM ('FOUNDER_CEO', 'CTO_TECH_LEAD', 'PRODUCT_MANAGER', 'PROJECT_MANAGER', 'SOFTWARE_ENGINEER', 'QA_TESTER', 'DESIGNER', 'MARKETING', 'SALES_BUSINESS_DEV', 'OPERATIONS_ADMIN', 'CUSTOMER_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "UserExperienceLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'DIRECTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "UserTotalPublishedApps" AS ENUM ('PUB_0', 'PUB_1_5', 'PUB_6_10', 'PUB_11_20', 'PUB_21_50', 'PUB_51_PLUS');

-- CreateEnum
CREATE TYPE "UserDevelopmentPlatform" AS ENUM ('NATIVE_IOS', 'NATIVE_ANDROID', 'FLUTTER', 'REACT_NATIVE', 'UNITY', 'DRAG_AND_DROP', 'OTHER');

-- CreateEnum
CREATE TYPE "UserPublishFrequency" AS ENUM ('FIRST_APP', 'OCCASIONAL', 'REGULAR', 'FREQUENT', 'OTHER');

-- CreateEnum
CREATE TYPE "UserTestingServiceReason" AS ENUM ('VERIFY_FUNCTIONALITY', 'USER_FEEDBACK', 'COMPLIANCE_GOOGLE_PLAY', 'SAVE_TIME', 'OTHER');

-- CreateEnum
CREATE TYPE "UserCommunicationMethod" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'TELEGRAM', 'SLACK', 'OTHER');

-- CreateEnum
CREATE TYPE "UserNotificationPreference" AS ENUM ('APP_SUBMITTED', 'TEST_COMPLETED', 'TEST_ASSIGNED', 'COMMENT_ADDED', 'PROMOTIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "TesterAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'DO_NOT_DISTURB');

-- CreateEnum
CREATE TYPE "TesterStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'REMOVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TesterAssignmentSource" AS ENUM ('SELF_JOIN', 'ADMIN_ASSIGNED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FaqCategory" AS ENUM ('general', 'community', 'professional', 'homepage');

-- CreateEnum
CREATE TYPE "DashboardAndHubAppType" AS ENUM ('PAID', 'FREE');

-- CreateEnum
CREATE TYPE "DashboardAndHubStatus" AS ENUM ('IN_REVIEW', 'DRAFT', 'REJECTED', 'IN_TESTING', 'COMPLETED', 'ON_HOLD', 'REQUESTED', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('APP_LOGO', 'SCREENSHOT', 'FEATURED_VIDEO', 'FEATURED_IMAGE', 'AUTHOR_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('APP', 'USER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'SUGGESTION', 'PRAISE', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_TEST', 'FEEDBACK_RECEIVED', 'TEST_COMPLETED', 'BUG_REPORT', 'POINTS_AWARDED', 'POINTS_DEDUCTED', 'NEW_JOIN_REQUEST', 'NEW_JOIN_ACCEPT', 'REJECTED', 'APP_APPROVED', 'APP_REJECTED', 'TEST_INVITATION', 'GENERAL_MESSAGE', 'REMINDER', 'ANNOUNCEMENT', 'ACCOUNT_UPDATE', 'INSUFFICIENT_BALANCE', 'OTHER', 'SPECIAL_OFFERS');

-- CreateEnum
CREATE TYPE "UserActionType" AS ENUM ('SUBMIT_APP', 'JOIN_TEST_REQUEST', 'JOIN_TEST_ACCEPT', 'JOIN_TEST_REJECTED', 'COMPLETE_TEST', 'GIVE_FEEDBACK', 'RATE_APP', 'LOGIN', 'LOGOUT', 'UPDATE_PROFILE', 'REGISTER', 'RENEW_TOKENS', 'OTHER', 'DRAFT');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('LOGIN', 'REGISTER', 'LOGOUT', 'PASSWORD_RESET', 'RENEW_TOKENS', 'ERROR', 'ADMIN_ACTION', 'SYSTEM_ACTION', 'OTHER');

-- CreateEnum
CREATE TYPE "LogSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FeedbackSuggestionType" AS ENUM ('BUG', 'SUGGESTIONS', 'PRAISE', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REVIEWED', 'IMPLEMENTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('AI_CHAT', 'LIVE_CHAT', 'TICKET');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_AGENT', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ConversationCategory" AS ENUM ('GENERAL', 'TECHNICAL', 'BILLING', 'ACCOUNT', 'BUG_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('USER', 'AGENT', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'SYSTEM', 'TRANSFER_NOTICE', 'TICKET_CREATED');

-- CreateEnum
CREATE TYPE "AgentOnlineStatus" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "SupportRequestType" AS ENUM ('TICKET', 'AI_CHAT', 'HUMAN_CHAT');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('GENERAL', 'TECHNICAL', 'BILLING', 'ACCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('USER', 'AGENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "UserTransactionType" AS ENUM ('EARNING', 'WITHDRAWAL', 'PURCHASE', 'REFUND', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "EarningAction" AS ENUM ('TESTING', 'FEEDBACK', 'REFERRAL', 'BONUS', 'APP_SUBMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "UserTransactionStatus" AS ENUM ('CREDIT', 'DEBIT', 'HOLD');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAIL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'ATTEMPTED', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "RefundModelStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('POINTS', 'PACKAGE', 'PROMO_FREE');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_detail" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "auth_type" "UserAuthType" NOT NULL,
    "roleId" INTEGER NOT NULL,
    "banned" BOOLEAN DEFAULT false,
    "ban_reason" TEXT,
    "country" TEXT,
    "profile_type" "UserProfileType",
    "job_role" "UserJobRole",
    "company_name" TEXT,
    "company_size" "UserCompanySize",
    "position_in_company" "UserCompanyPosition",
    "company_website" TEXT,
    "experience_level" "UserExperienceLevel",
    "total_published_apps" "UserTotalPublishedApps",
    "platform_development" "UserDevelopmentPlatform",
    "publish_frequency" "UserPublishFrequency",
    "service_usage" "UserTestingServiceReason",
    "communication_methods" "UserCommunicationMethod"[] DEFAULT ARRAY[]::"UserCommunicationMethod"[],
    "notification_preference" "UserNotificationPreference"[] DEFAULT ARRAY[]::"UserNotificationPreference"[],
    "device_company" TEXT,
    "device_model" TEXT,
    "ram" TEXT,
    "os" TEXT,
    "screen_resolution" TEXT,
    "language" TEXT,
    "network" TEXT,
    "bio" TEXT,
    "years_of_experience" TEXT,
    "testing_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tester_devices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tester_os_versions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "areas_of_expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "initial" BOOLEAN NOT NULL DEFAULT true,
    "application_status" TEXT,
    "discovery_source" TEXT,
    "discovery_source_answered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "availability" "TesterAvailability" DEFAULT 'AVAILABLE',

    CONSTRAINT "user_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tester_relation" (
    "id" SERIAL NOT NULL,
    "testerId" TEXT NOT NULL,
    "dashboardAndHubId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "TesterStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "daysCompleted" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "statusDetails" JSONB,
    "assignmentSource" "TesterAssignmentSource" NOT NULL DEFAULT 'SELF_JOIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tester_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_tester_verification" (
    "id" SERIAL NOT NULL,
    "testerRelationId" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "proofImageUrl" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metaData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_tester_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "package" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "user_plan" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "authorDataAiHint" TEXT,
    "imageUrl" TEXT NOT NULL,
    "dataAiHint" TEXT,
    "tags" TEXT[],
    "category" "BlogCategory" NOT NULL DEFAULT 'GENERAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "dataAiHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "FaqCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_and_hub" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER NOT NULL,
    "appOwnerId" TEXT NOT NULL,
    "appType" "DashboardAndHubAppType" NOT NULL,
    "currentTester" INTEGER NOT NULL,
    "totalTester" INTEGER NOT NULL,
    "currentDay" INTEGER NOT NULL,
    "totalDay" INTEGER NOT NULL,
    "instructionsForTester" TEXT,
    "rewardPoints" DOUBLE PRECISION,
    "costPoints" DOUBLE PRECISION,
    "rewardMoney" DOUBLE PRECISION,
    "costMoney" DOUBLE PRECISION,
    "averageTimeTesting" TEXT,
    "minimumAndroidVersion" DOUBLE PRECISION NOT NULL,
    "status" "DashboardAndHubStatus" NOT NULL,
    "statusDetails" JSONB,
    "promoCodeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "testingEndDate" TIMESTAMP(3),
    "testingStartDate" TIMESTAMP(3),
    "activeTestersOverride" INTEGER,
    "bugCountOverride" INTEGER,
    "completedTestersOverride" INTEGER,
    "pendingTestersOverride" INTEGER,
    "praiseCountOverride" INTEGER,
    "suggestionCountOverride" INTEGER,

    CONSTRAINT "dashboard_and_hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_app" (
    "id" SERIAL NOT NULL,
    "appName" TEXT NOT NULL,
    "appLogoUrl" TEXT NOT NULL,
    "appScreenshotUrl1" TEXT NOT NULL,
    "appScreenshotUrl2" TEXT NOT NULL,
    "appCategoryId" INTEGER NOT NULL,
    "packageName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "android_app_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" SERIAL NOT NULL,
    "type" "MediaType" NOT NULL,
    "mime" TEXT,
    "category" "MediaCategory" NOT NULL,
    "src" TEXT NOT NULL,
    "appId" INTEGER,
    "blogId" INTEGER,
    "feedbackId" INTEGER,
    "notificationId" INTEGER,
    "conversationId" INTEGER,
    "messageId" INTEGER,
    "supportRequestId" INTEGER,
    "supportMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating" (
    "id" SERIAL NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "ratingType" "RatingType" NOT NULL,
    "appId" INTEGER,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "priority" "FeedbackPriority",
    "testerId" TEXT NOT NULL,
    "dashboardAndHubId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'OTHER',
    "url" TEXT,
    "userId" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "dashboardAndHubId" INTEGER,
    "androidAppId" INTEGER,
    "actionType" "UserActionType" NOT NULL,
    "description" TEXT,
    "context" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" "AuditResult" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feedbackId" INTEGER,

    CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_logs" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "logType" "LogType" NOT NULL,
    "severity" "LogSeverity",
    "description" TEXT NOT NULL,
    "context" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_feedback_suggestion" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FeedbackSuggestionType" NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "priority" "FeedbackPriority",
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_feedback_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" SERIAL NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'AI_CHAT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ConversationPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "ConversationCategory" NOT NULL DEFAULT 'GENERAL',
    "subject" TEXT,
    "description" TEXT,
    "userId" TEXT,
    "assignedTo" TEXT,
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "senderId" TEXT,
    "senderType" "MessageSenderType" NOT NULL,
    "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_status" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentOnlineStatus" NOT NULL DEFAULT 'OFFLINE',
    "currentChats" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_room" (
    "id" SERIAL NOT NULL,
    "profileSurveyPoints" INTEGER,
    "pointsWithdrawalLimit" INTEGER,
    "pointsWithdrawalThreshold" INTEGER,
    "humanChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "communitySize" INTEGER,
    "bugsFound" INTEGER,
    "proAppsTested" INTEGER,
    "communityApps" INTEGER,
    "uniqueDevices" INTEGER,
    "communityPoints" INTEGER,
    "alexSystemPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_request" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "supportAgentId" INTEGER,
    "assignedTo" TEXT,
    "name" TEXT,
    "email" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'PENDING',
    "category" "SupportCategory" NOT NULL DEFAULT 'GENERAL',
    "type" "SupportRequestType" NOT NULL DEFAULT 'TICKET',
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_message" (
    "id" SERIAL NOT NULL,
    "supportRequestId" INTEGER NOT NULL,
    "senderId" TEXT,
    "senderType" "SenderType" NOT NULL,
    "message" TEXT NOT NULL,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_agent" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "support_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_request" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_transactions" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userWalletId" INTEGER,
    "dashboardAndHubId" INTEGER,
    "action" "EarningAction",
    "points" DOUBLE PRECISION DEFAULT 0,
    "package" DOUBLE PRECISION DEFAULT 0,
    "transactionType" "UserTransactionType" NOT NULL,
    "status" "UserTransactionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethod",

    CONSTRAINT "user_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_wallet" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPackages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceMoney" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "canReadList" BOOLEAN NOT NULL DEFAULT false,
    "canReadSingle" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL,
    "reason" TEXT,
    "ip" TEXT NOT NULL,
    "ua" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset" (
    "id" SERIAL NOT NULL,
    "password_reset_token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "packageCount" INTEGER DEFAULT 1,
    "razorpayOrderId" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "invoiceId" TEXT,
    "notes" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpaySignature" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "bank" TEXT,
    "wallet" TEXT,
    "vpa" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "fee" INTEGER DEFAULT 0,
    "tax" INTEGER DEFAULT 0,
    "errorCode" TEXT,
    "errorDescription" TEXT,
    "errorReason" TEXT,
    "amountRefunded" INTEGER NOT NULL DEFAULT 0,
    "refundStatus" "RefundStatus",
    "notes" JSONB,
    "captured" BOOLEAN NOT NULL DEFAULT false,
    "international" BOOLEAN NOT NULL DEFAULT false,
    "webhookVerified" BOOLEAN NOT NULL DEFAULT false,
    "webhookPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "amount_inr" INTEGER,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing" (
    "id" SERIAL NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "currency_symbol" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_type" TEXT NOT NULL DEFAULT 'IND',
    "service_name" TEXT NOT NULL,
    "sac_code" TEXT NOT NULL DEFAULT '998313',
    "period" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" INTEGER,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgst_amount" INTEGER NOT NULL DEFAULT 0,
    "sgst_amount" INTEGER NOT NULL DEFAULT 0,
    "igst_amount" INTEGER NOT NULL DEFAULT 0,
    "state_code" TEXT,
    "due_date" TIMESTAMP(3),
    "place_of_supply" TEXT,
    "supply_type" TEXT,
    "amount_in_words" TEXT,
    "lut_number" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "razorpayRefundId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "RefundModelStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "notes" JSONB,
    "speed" TEXT DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event_log" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_store_declaration" (
    "id" SERIAL NOT NULL,
    "dashboardAndHubId" INTEGER NOT NULL,
    "appOwnerId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "autoGeneratedData" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "adminAnswers" JSONB,
    "adminDeclarationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "play_store_declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "maxPerUser" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonial" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT,
    "avatar" TEXT NOT NULL,
    "dataAiHint" TEXT,
    "comment" TEXT NOT NULL,
    "image" TEXT,
    "appLink" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_promo_usage" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "promoCodeId" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_promo_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_info" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "zipCode" TEXT,
    "country" TEXT NOT NULL,
    "gstin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DashboardAndHubTesters" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DashboardAndHubTesters_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MediaToWebsiteFeedbackSuggestion" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_MediaToWebsiteFeedbackSuggestion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_detail_userId_key" ON "user_detail"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_detail_phone_key" ON "user_detail"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "tester_relation_testerId_dashboardAndHubId_key" ON "tester_relation"("testerId", "dashboardAndHubId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_tester_verification_testerRelationId_dayNumber_key" ON "daily_tester_verification"("testerRelationId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "blog_slug_key" ON "blog"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "author_name_key" ON "author"("name");

-- CreateIndex
CREATE UNIQUE INDEX "app_category_name_key" ON "app_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_and_hub_appId_key" ON "dashboard_and_hub"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "android_app_appName_key" ON "android_app"("appName");

-- CreateIndex
CREATE UNIQUE INDEX "android_app_appLogoUrl_key" ON "android_app"("appLogoUrl");

-- CreateIndex
CREATE UNIQUE INDEX "android_app_packageName_key" ON "android_app"("packageName");

-- CreateIndex
CREATE UNIQUE INDEX "media_feedbackId_key" ON "media"("feedbackId");

-- CreateIndex
CREATE INDEX "conversation_userId_idx" ON "conversation"("userId");

-- CreateIndex
CREATE INDEX "conversation_assignedTo_idx" ON "conversation"("assignedTo");

-- CreateIndex
CREATE INDEX "conversation_status_idx" ON "conversation"("status");

-- CreateIndex
CREATE INDEX "conversation_type_idx" ON "conversation"("type");

-- CreateIndex
CREATE INDEX "conversation_createdAt_idx" ON "conversation"("createdAt");

-- CreateIndex
CREATE INDEX "message_conversationId_idx" ON "message"("conversationId");

-- CreateIndex
CREATE INDEX "message_createdAt_idx" ON "message"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_status_userId_key" ON "agent_status"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "support_agent_userId_key" ON "support_agent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_wallet_userId_key" ON "user_wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "module_name_key" ON "module"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_roleId_moduleId_key" ON "permission"("roleId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "account_userId_providerId_key" ON "account"("userId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_password_reset_token_key" ON "password_reset"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "order_razorpayOrderId_key" ON "order"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_receipt_key" ON "order"("receipt");

-- CreateIndex
CREATE UNIQUE INDEX "order_invoiceId_key" ON "order"("invoiceId");

-- CreateIndex
CREATE INDEX "order_userId_idx" ON "order"("userId");

-- CreateIndex
CREATE INDEX "order_razorpayOrderId_idx" ON "order"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "order_status_idx" ON "order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_razorpayPaymentId_key" ON "payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "payment_orderId_idx" ON "payment"("orderId");

-- CreateIndex
CREATE INDEX "payment_razorpayPaymentId_idx" ON "payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "payment_razorpayOrderId_idx" ON "payment"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE INDEX "payment_userId_idx" ON "payment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_country_code_key" ON "pricing"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_paymentId_key" ON "invoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_invoice_number_key" ON "invoice"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "refund_razorpayRefundId_key" ON "refund"("razorpayRefundId");

-- CreateIndex
CREATE INDEX "refund_paymentId_idx" ON "refund"("paymentId");

-- CreateIndex
CREATE INDEX "refund_razorpayRefundId_idx" ON "refund"("razorpayRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_log_eventId_key" ON "webhook_event_log"("eventId");

-- CreateIndex
CREATE INDEX "webhook_event_log_eventId_idx" ON "webhook_event_log"("eventId");

-- CreateIndex
CREATE INDEX "webhook_event_log_eventType_idx" ON "webhook_event_log"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "play_store_declaration_dashboardAndHubId_key" ON "play_store_declaration"("dashboardAndHubId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_code_key" ON "promo_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_promo_usage_userId_promoCodeId_key" ON "user_promo_usage"("userId", "promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_info_userId_key" ON "billing_info"("userId");

-- CreateIndex
CREATE INDEX "_DashboardAndHubTesters_B_index" ON "_DashboardAndHubTesters"("B");

-- CreateIndex
CREATE INDEX "_MediaToWebsiteFeedbackSuggestion_B_index" ON "_MediaToWebsiteFeedbackSuggestion"("B");

-- AddForeignKey
ALTER TABLE "user_detail" ADD CONSTRAINT "user_detail_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_detail" ADD CONSTRAINT "user_detail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_relation" ADD CONSTRAINT "tester_relation_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_relation" ADD CONSTRAINT "tester_relation_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_tester_verification" ADD CONSTRAINT "daily_tester_verification_testerRelationId_fkey" FOREIGN KEY ("testerRelationId") REFERENCES "tester_relation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plan" ADD CONSTRAINT "user_plan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plan" ADD CONSTRAINT "user_plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_and_hub" ADD CONSTRAINT "dashboard_and_hub_appId_fkey" FOREIGN KEY ("appId") REFERENCES "android_app"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_and_hub" ADD CONSTRAINT "dashboard_and_hub_appOwnerId_fkey" FOREIGN KEY ("appOwnerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_and_hub" ADD CONSTRAINT "dashboard_and_hub_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_app" ADD CONSTRAINT "android_app_appCategoryId_fkey" FOREIGN KEY ("appCategoryId") REFERENCES "app_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_appId_fkey" FOREIGN KEY ("appId") REFERENCES "android_app"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_supportMessageId_fkey" FOREIGN KEY ("supportMessageId") REFERENCES "support_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "support_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating" ADD CONSTRAINT "rating_appId_fkey" FOREIGN KEY ("appId") REFERENCES "android_app"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating" ADD CONSTRAINT "rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_androidAppId_fkey" FOREIGN KEY ("androidAppId") REFERENCES "android_app"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_logs" ADD CONSTRAINT "user_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_feedback_suggestion" ADD CONSTRAINT "website_feedback_suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_supportAgentId_fkey" FOREIGN KEY ("supportAgentId") REFERENCES "support_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "support_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_agent" ADD CONSTRAINT "support_agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request" ADD CONSTRAINT "withdrawal_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transactions" ADD CONSTRAINT "user_transactions_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transactions" ADD CONSTRAINT "user_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transactions" ADD CONSTRAINT "user_transactions_userWalletId_fkey" FOREIGN KEY ("userWalletId") REFERENCES "user_wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wallet" ADD CONSTRAINT "user_wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_store_declaration" ADD CONSTRAINT "play_store_declaration_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_store_declaration" ADD CONSTRAINT "play_store_declaration_appOwnerId_fkey" FOREIGN KEY ("appOwnerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_appId_fkey" FOREIGN KEY ("appId") REFERENCES "android_app"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_promo_usage" ADD CONSTRAINT "user_promo_usage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_code"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_promo_usage" ADD CONSTRAINT "user_promo_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_info" ADD CONSTRAINT "billing_info_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DashboardAndHubTesters" ADD CONSTRAINT "_DashboardAndHubTesters_A_fkey" FOREIGN KEY ("A") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DashboardAndHubTesters" ADD CONSTRAINT "_DashboardAndHubTesters_B_fkey" FOREIGN KEY ("B") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaToWebsiteFeedbackSuggestion" ADD CONSTRAINT "_MediaToWebsiteFeedbackSuggestion_A_fkey" FOREIGN KEY ("A") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaToWebsiteFeedbackSuggestion" ADD CONSTRAINT "_MediaToWebsiteFeedbackSuggestion_B_fkey" FOREIGN KEY ("B") REFERENCES "website_feedback_suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
