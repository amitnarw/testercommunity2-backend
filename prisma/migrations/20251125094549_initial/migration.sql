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
CREATE TYPE "FaqCategory" AS ENUM ('general', 'community', 'professional', 'homepage');

-- CreateEnum
CREATE TYPE "DashboardAndHubStatus" AS ENUM ('IN_REVIEW', 'DRAFT', 'REJECTED', 'IN_TESTING', 'COMPLETED', 'ON_HOLD', 'REQUESTED', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('APP_LOGO', 'SCREENSHOT', 'FEEDBACK_MEDIA', 'FEATURED_IMAGE', 'AUTHOR_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('APP', 'USER');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'SUGGESTION', 'PRAISE', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_TEST', 'FEEDBACK_RECEIVED', 'TEST_COMPLETED', 'BUG_REPORT', 'POINTS_AWARDED', 'OTHER');

-- CreateEnum
CREATE TYPE "UserActionType" AS ENUM ('SUBMIT_APP', 'JOIN_TEST', 'COMPLETE_TEST', 'GIVE_FEEDBACK', 'RATE_APP', 'LOGIN', 'LOGOUT', 'UPDATE_PROFILE', 'REGISTER', 'RENEW_TOKENS', 'OTHER');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('LOGIN', 'REGISTER', 'LOGOUT', 'PASSWORD_RESET', 'RENEW_TOKENS', 'ERROR', 'ADMIN_ACTION', 'SYSTEM_ACTION', 'OTHER');

-- CreateEnum
CREATE TYPE "LogSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FeedbackSuggestionType" AS ENUM ('BUG', 'SUGGESTIONS', 'PRAISE', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REVIEWED', 'IMPLEMENTED', 'REJECTED');

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
CREATE TYPE "EarningAction" AS ENUM ('TESTING', 'FEEDBACK', 'REFERRAL', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "UserTransactionStatus" AS ENUM ('CREDIT', 'DEBIT', 'HOLD');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAIL');

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
    "authType" "UserAuthType" NOT NULL,
    "roleId" INTEGER NOT NULL,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "country" TEXT,
    "profileType" "UserProfileType" NOT NULL,
    "jobRole" "UserJobRole" NOT NULL,
    "company_name" TEXT,
    "company_size" "UserCompanySize",
    "position_in_company" "UserCompanyPosition",
    "company_website" TEXT,
    "experience_level" "UserExperienceLevel",
    "total_published_apps" "UserTotalPublishedApps",
    "platform_development" "UserDevelopmentPlatform",
    "publish_frequency" "UserPublishFrequency",
    "service_usage" "UserTestingServiceReason",
    "communication_methods" "UserCommunicationMethod",
    "notification_preference" "UserNotificationPreference",
    "deviceCompany" TEXT,
    "deviceModel" TEXT,
    "ram" TEXT,
    "os" TEXT,
    "screenResolution" TEXT,
    "language" TEXT,
    "network" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tester_relation" (
    "id" SERIAL NOT NULL,
    "testerId" TEXT NOT NULL,
    "dashboardAndHubId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tester_relation_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "plan" (
    "_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "package" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("_id")
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
    "authorName" TEXT NOT NULL,
    "tags" TEXT[],
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_pkey" PRIMARY KEY ("id")
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
    "currentTester" INTEGER NOT NULL,
    "totalTester" INTEGER NOT NULL,
    "currentDay" INTEGER NOT NULL,
    "totalDay" INTEGER NOT NULL,
    "instructionsForTester" TEXT,
    "points" DOUBLE PRECISION,
    "averageTimeTesting" TEXT,
    "status" "DashboardAndHubStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_and_hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_app" (
    "id" SERIAL NOT NULL,
    "appName" TEXT NOT NULL,
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
CREATE TABLE "support_request" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "supportAgentId" INTEGER,
    "name" TEXT,
    "email" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'PENDING',
    "category" "SupportCategory" NOT NULL DEFAULT 'GENERAL',
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
    "amount" DOUBLE PRECISION DEFAULT 0,
    "transactionType" "UserTransactionType" NOT NULL,
    "status" "UserTransactionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_wallet" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
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
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "app_category_name_key" ON "app_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "support_agent_userId_key" ON "support_agent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_wallet_userId_key" ON "user_wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "module_name_key" ON "module"("name");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_password_reset_token_key" ON "password_reset"("password_reset_token");

-- CreateIndex
CREATE INDEX "_DashboardAndHubTesters_B_index" ON "_DashboardAndHubTesters"("B");

-- CreateIndex
CREATE INDEX "_MediaToWebsiteFeedbackSuggestion_B_index" ON "_MediaToWebsiteFeedbackSuggestion"("B");

-- AddForeignKey
ALTER TABLE "user_detail" ADD CONSTRAINT "user_detail_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_detail" ADD CONSTRAINT "user_detail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_relation" ADD CONSTRAINT "tester_relation_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_relation" ADD CONSTRAINT "tester_relation_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plan" ADD CONSTRAINT "user_plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plan" ADD CONSTRAINT "user_plan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_and_hub" ADD CONSTRAINT "dashboard_and_hub_appId_fkey" FOREIGN KEY ("appId") REFERENCES "android_app"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_and_hub" ADD CONSTRAINT "dashboard_and_hub_appOwnerId_fkey" FOREIGN KEY ("appOwnerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "media" ADD CONSTRAINT "media_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "support_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_supportMessageId_fkey" FOREIGN KEY ("supportMessageId") REFERENCES "support_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating" ADD CONSTRAINT "rating_appId_fkey" FOREIGN KEY ("appId") REFERENCES "android_app"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating" ADD CONSTRAINT "rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_androidAppId_fkey" FOREIGN KEY ("androidAppId") REFERENCES "android_app"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_logs" ADD CONSTRAINT "user_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_feedback_suggestion" ADD CONSTRAINT "website_feedback_suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_supportAgentId_fkey" FOREIGN KEY ("supportAgentId") REFERENCES "support_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "support_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_agent" ADD CONSTRAINT "support_agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request" ADD CONSTRAINT "withdrawal_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transactions" ADD CONSTRAINT "user_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transactions" ADD CONSTRAINT "user_transactions_dashboardAndHubId_fkey" FOREIGN KEY ("dashboardAndHubId") REFERENCES "dashboard_and_hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_transactions" ADD CONSTRAINT "user_transactions_userWalletId_fkey" FOREIGN KEY ("userWalletId") REFERENCES "user_wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wallet" ADD CONSTRAINT "user_wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DashboardAndHubTesters" ADD CONSTRAINT "_DashboardAndHubTesters_A_fkey" FOREIGN KEY ("A") REFERENCES "dashboard_and_hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DashboardAndHubTesters" ADD CONSTRAINT "_DashboardAndHubTesters_B_fkey" FOREIGN KEY ("B") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaToWebsiteFeedbackSuggestion" ADD CONSTRAINT "_MediaToWebsiteFeedbackSuggestion_A_fkey" FOREIGN KEY ("A") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaToWebsiteFeedbackSuggestion" ADD CONSTRAINT "_MediaToWebsiteFeedbackSuggestion_B_fkey" FOREIGN KEY ("B") REFERENCES "website_feedback_suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
