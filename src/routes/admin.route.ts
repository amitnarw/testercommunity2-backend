import {
  getControlRoomData,
  getTesterActivity,
  getSubmittedApps,
  acceptApp,
  rejectApp,
  getSubmittedAppsCount,
  updatePaidSubmission,
  deletePaidSubmission,
  // Dashboard
  getDashboardStats,
  // Feedback
  getAllFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  deleteFeedback,
  getFeedbackCounts,
  // Users
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  updateUserProfile,
  updateUserWallet,
  giftPointsAndPackages,
  deleteUser,
  getUserCounts,
  getDiscoverySourceCounts,
  getUserNotificationsById,
  createUser,
  convertUserAuthType,
  // Suggestions
  getAllSuggestions,
  getSuggestionById,
  createSuggestion,
  updateSuggestionStatus,
  deleteSuggestion,
  getSuggestionCounts,
  // Notifications
  getAllNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  broadcastNotification,
  getNotificationCounts,
  getNotificationTypes,
  // Tester Applications
  getTesterApplications,
  getTesterApplicationCounts,
  getTesterApplicationById,
  updateTesterApplicationStatus,
  assignTestersToApp,
  unassignTesterFromApp,
  updateProjectStatus,
  getAllPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  updateDailyVerificationStatus,
  adminCompleteApp,
  getLogs,
  getLogContent,
  deleteLog,
  deleteLogsBatch,
  // Blog
  getAllBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  getPromoCodeApps,
  // Guide
  getAllGuides,
  getGuideById,
  createGuide,
  updateGuide,
  deleteGuide,
  // Guide Categories
  getAllGuideCategories,
  getGuideCategoryById,
  createGuideCategory,
  updateGuideCategory,
  deleteGuideCategory,
  // Testimonials
  getAllTestimonials,
  getTestimonialById,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  // Authors
  getAllAuthors,
  getAuthorById,
  createAuthor,
  updateAuthor,
  deleteAuthor,
  // Act As
  actAsRole,
  // Permissions
  getAllPermissions,
  updatePermission,
  // Roles
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  // IAR
  getUserImmediateAttention,
  createImmediateAttention,
  updateImmediateAttention,
  reorderImmediateAttention,
  deleteImmediateAttention,
  // Self profile
  updateMyProfile,
  // Faq
  getAllFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
} from "@/controllers/admin.controller";
import {
  getAllReviews,
  getReviewById,
  updateReviewStatus,
  deleteReview,
} from "@/controllers/review.controller";
import {
  getAdminDeclaration,
  updateAdminDeclaration,
  publishAdminDeclaration,
} from "@/controllers/declaration.controller";
import {
  getConversations,
  getConversationById,
  assignConversation,
  addConversationMessage,
  closeConversation,
  getAgentStatus,
  setMyStatus,
  getSupportStats,
  updateControlRoom,
} from "@/controllers/adminSupport.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

// Act As (must be before checkAuthorization to allow SUPER_ADMIN to use it)
router.post("/act-as", checkAuthentication, decryptPayload, actAsRole);

// Permission Matrix (super_admin only ,  hardcoded check)
router.get("/permissions", checkAuthentication, getAllPermissions);
router.put("/permissions/:roleId/:moduleId", checkAuthentication, decryptPayload, updatePermission);

// Role CRUD (super_admin only ,  hardcoded check)
router.post("/roles", checkAuthentication, decryptPayload, createRole);
router.put("/roles/:roleId", checkAuthentication, decryptPayload, updateRole);
router.delete("/roles/:roleId", checkAuthentication, deleteRole);

// Authenticate all admin routes below
router.use(checkAuthentication);

// Control Room
router.get("/get-control-room-data", checkAuthorization({ module: "control_room", action: "canReadList" }), getControlRoomData);

// Dashboard Stats
router.get("/get-dashboard-stats", checkAuthorization({ module: "dashboard", action: "canReadList" }), getDashboardStats);

// Submissions
router.get("/get-submitted-apps", checkAuthorization({ module: "submissions", action: "canReadList" }), getSubmittedApps);
router.get("/get-submitted-apps-count", checkAuthorization({ module: "submissions", action: "canReadList" }), getSubmittedAppsCount);
router.post("/accept-app", checkAuthorization({ module: "submissions", action: "canUpdate" }), decryptPayload, acceptApp);
router.post("/reject-app", checkAuthorization({ module: "submissions", action: "canUpdate" }), decryptPayload, rejectApp);
router.post("/update-project-status", checkAuthorization({ module: "submissions", action: "canUpdate" }), decryptPayload, updateProjectStatus);
router.patch("/submission-paid/:id", checkAuthorization({ module: "submissions", action: "canUpdate" }), decryptPayload, updatePaidSubmission);
router.delete("/submission-paid/:id", checkAuthorization({ module: "submissions", action: "canDelete" }), deletePaidSubmission);

// Feedback
router.get("/feedback", checkAuthorization({ module: "feedback", action: "canReadList" }), getAllFeedback);
router.get("/feedback/counts", checkAuthorization({ module: "feedback", action: "canReadList" }), getFeedbackCounts);
router.get("/feedback/:id", checkAuthorization({ module: "feedback", action: "canReadSingle" }), getFeedbackById);
router.post("/feedback/update", checkAuthorization({ module: "feedback", action: "canUpdate" }), decryptPayload, updateFeedbackStatus);
router.delete("/feedback/:id", checkAuthorization({ module: "feedback", action: "canDelete" }), deleteFeedback);

// Users
router.get("/roles", checkAuthorization({ module: "users", action: "canUpdate" }), getAllRoles);
router.get("/users", checkAuthorization({ module: "users", action: "canReadList" }), getAllUsers);
router.get("/users/counts", checkAuthorization({ module: "users", action: "canReadList" }), getUserCounts);
router.get("/users/discovery-source", checkAuthorization({ module: "users", action: "canReadList" }), getDiscoverySourceCounts);
router.get("/users/notifications/:id", checkAuthorization({ module: "users", action: "canReadSingle" }), getUserNotificationsById);
router.get("/users/:id", checkAuthorization({ module: "users", action: "canReadSingle" }), getUserById);
router.post("/users", checkAuthorization({ module: "users", action: "canCreate" }), decryptPayload, createUser);
router.post("/users/update-status", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, updateUserStatus);
router.post("/users/update-role", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, updateUserRole);
router.post("/users/update-profile", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, updateUserProfile);
router.post("/users/convert-auth-type", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, convertUserAuthType);
router.post("/users/update-wallet", checkAuthentication, decryptPayload, updateUserWallet);
router.post("/users/gift-points-packages", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, giftPointsAndPackages);
router.delete("/users/:id", checkAuthorization({ module: "users", action: "canDelete" }), deleteUser);
// Self profile update (no module permission needed ,  any authenticated admin can update their own)
router.post("/update-my-profile", checkAuthentication, decryptPayload, updateMyProfile);

// Immediate Attention Required (IAR)
router.get("/users/:id/immediate-attention", checkAuthorization({ module: "iar", action: "canReadSingle" }), getUserImmediateAttention);
router.post("/users/immediate-attention", checkAuthorization({ module: "iar", action: "canCreate" }), decryptPayload, createImmediateAttention);
router.post("/users/immediate-attention/update", checkAuthorization({ module: "iar", action: "canUpdate" }), decryptPayload, updateImmediateAttention);
router.post("/users/immediate-attention/reorder", checkAuthorization({ module: "iar", action: "canUpdate" }), decryptPayload, reorderImmediateAttention);
router.delete("/users/immediate-attention/:id", checkAuthorization({ module: "iar", action: "canDelete" }), deleteImmediateAttention);

// Suggestions
router.get("/suggestions", checkAuthorization({ module: "suggestions", action: "canReadList" }), getAllSuggestions);
router.get("/suggestions/counts", checkAuthorization({ module: "suggestions", action: "canReadList" }), getSuggestionCounts);
router.get("/suggestions/:id", checkAuthorization({ module: "suggestions", action: "canReadSingle" }), getSuggestionById);
router.post("/suggestions", checkAuthorization({ module: "suggestions", action: "canCreate" }), decryptPayload, createSuggestion);
router.post("/suggestions/update", checkAuthorization({ module: "suggestions", action: "canUpdate" }), decryptPayload, updateSuggestionStatus);
router.delete("/suggestions/:id", checkAuthorization({ module: "suggestions", action: "canDelete" }), deleteSuggestion);

// Notifications
router.get("/notifications", checkAuthorization({ module: "notifications", action: "canReadList" }), getAllNotifications);
router.get("/notifications/counts", checkAuthorization({ module: "notifications", action: "canReadList" }), getNotificationCounts);
router.get("/notification-types", checkAuthorization({ module: "notifications", action: "canReadList" }), getNotificationTypes);
router.post("/notifications", checkAuthorization({ module: "notifications", action: "canCreate" }), decryptPayload, createNotification);
router.post("/notifications/update", checkAuthorization({ module: "notifications", action: "canUpdate" }), decryptPayload, updateNotification);
router.post("/notifications/broadcast", checkAuthorization({ module: "notifications", action: "canCreate" }), decryptPayload, broadcastNotification);
router.delete("/notifications/:id", checkAuthorization({ module: "notifications", action: "canDelete" }), deleteNotification);

// Tester Applications
router.get("/tester-applications", checkAuthorization({ module: "tester_applications", action: "canReadList" }), getTesterApplications);
router.get("/tester-applications/counts", checkAuthorization({ module: "tester_applications", action: "canReadList" }), getTesterApplicationCounts);
router.get("/tester-applications/:id", checkAuthorization({ module: "tester_applications", action: "canReadSingle" }), getTesterApplicationById);
router.post(
  "/tester-applications/update-status",
  checkAuthorization({ module: "tester_applications", action: "canUpdate" }),
  decryptPayload,
  updateTesterApplicationStatus,
);
router.post("/tester-applications/assign", checkAuthorization({ module: "tester_applications", action: "canUpdate" }), decryptPayload, assignTestersToApp);
router.post(
  "/tester-applications/unassign",
  checkAuthorization({ module: "tester_applications", action: "canUpdate" }),
  decryptPayload,
  unassignTesterFromApp,
);

// Promo Codes
router.get("/promo-codes", checkAuthorization({ module: "promo_codes", action: "canReadList" }), getAllPromoCodes);
router.post("/promo-codes", checkAuthorization({ module: "promo_codes", action: "canCreate" }), decryptPayload, createPromoCode);
router.post("/promo-codes/update", checkAuthorization({ module: "promo_codes", action: "canUpdate" }), decryptPayload, updatePromoCode);
router.delete("/promo-codes/:id", checkAuthorization({ module: "promo_codes", action: "canDelete" }), deletePromoCode);
router.get("/promo-codes/:id/apps", checkAuthorization({ module: "promo_codes", action: "canReadList" }), getPromoCodeApps);

// Blog
router.get("/blogs", checkAuthorization({ module: "blogs", action: "canReadList" }), getAllBlogs);
router.get("/blogs/:id", checkAuthorization({ module: "blogs", action: "canReadSingle" }), getBlogById);
router.post("/blogs", checkAuthorization({ module: "blogs", action: "canCreate" }), decryptPayload, createBlog);
router.post("/blogs/update", checkAuthorization({ module: "blogs", action: "canUpdate" }), decryptPayload, updateBlog);
router.delete("/blogs/:id", checkAuthorization({ module: "blogs", action: "canDelete" }), deleteBlog);

// Guides
router.get("/guides", checkAuthorization({ module: "guides", action: "canReadList" }), getAllGuides);
router.get("/guides/:id", checkAuthorization({ module: "guides", action: "canReadSingle" }), getGuideById);
router.post("/guides", checkAuthorization({ module: "guides", action: "canCreate" }), decryptPayload, createGuide);
router.post("/guides/update", checkAuthorization({ module: "guides", action: "canUpdate" }), decryptPayload, updateGuide);
router.delete("/guides/:id", checkAuthorization({ module: "guides", action: "canDelete" }), deleteGuide);

// Guide Categories
router.get("/guide-categories", checkAuthorization({ module: "guide_categories", action: "canReadList" }), getAllGuideCategories);
router.get("/guide-categories/:id", checkAuthorization({ module: "guide_categories", action: "canReadSingle" }), getGuideCategoryById);
router.post("/guide-categories", checkAuthorization({ module: "guide_categories", action: "canCreate" }), decryptPayload, createGuideCategory);
router.post("/guide-categories/update", checkAuthorization({ module: "guide_categories", action: "canUpdate" }), decryptPayload, updateGuideCategory);
router.delete("/guide-categories/:id", checkAuthorization({ module: "guide_categories", action: "canDelete" }), deleteGuideCategory);

// Testimonials
router.get("/testimonials", checkAuthorization({ module: "testimonial", action: "canReadList" }), getAllTestimonials);
router.get("/testimonials/:id", checkAuthorization({ module: "testimonial", action: "canReadSingle" }), getTestimonialById);
router.post("/testimonials", checkAuthorization({ module: "testimonial", action: "canCreate" }), decryptPayload, createTestimonial);
router.post("/testimonials/update", checkAuthorization({ module: "testimonial", action: "canUpdate" }), decryptPayload, updateTestimonial);
router.delete("/testimonials/:id", checkAuthorization({ module: "testimonial", action: "canDelete" }), deleteTestimonial);

// Authors
router.get("/authors", checkAuthorization({ module: "authors", action: "canReadList" }), getAllAuthors);
router.get("/authors/:id", checkAuthorization({ module: "authors", action: "canReadSingle" }), getAuthorById);
router.post("/authors", checkAuthorization({ module: "authors", action: "canCreate" }), decryptPayload, createAuthor);
router.post("/authors/update", checkAuthorization({ module: "authors", action: "canUpdate" }), decryptPayload, updateAuthor);
router.delete("/authors/:id", checkAuthorization({ module: "authors", action: "canDelete" }), deleteAuthor);

// FAQs
router.get("/faqs", checkAuthorization({ module: "faqs", action: "canReadList" }), getAllFaqs);
router.get("/faqs/:id", checkAuthorization({ module: "faqs", action: "canReadSingle" }), getFaqById);
router.post("/faqs", checkAuthorization({ module: "faqs", action: "canCreate" }), decryptPayload, createFaq);
router.post("/faqs/update", checkAuthorization({ module: "faqs", action: "canUpdate" }), decryptPayload, updateFaq);
router.delete("/faqs/:id", checkAuthorization({ module: "faqs", action: "canDelete" }), deleteFaq);

// User Reviews (admin management)
router.get("/user-reviews", checkAuthorization({ module: "review", action: "canReadList" }), getAllReviews);
router.get("/user-reviews/:id", checkAuthorization({ module: "review", action: "canReadSingle" }), getReviewById);
router.post("/user-reviews/update-status", checkAuthorization({ module: "review", action: "canUpdate" }), decryptPayload, updateReviewStatus);
router.delete("/user-reviews/:id", checkAuthorization({ module: "review", action: "canDelete" }), deleteReview);

// Verification and Completion
router.post(
  "/update-verification-status",
  checkAuthorization({ module: "verification", action: "canUpdate" }),
  decryptPayload,
  updateDailyVerificationStatus,
);
router.post("/admin-complete-app", checkAuthorization({ module: "submissions", action: "canUpdate" }), decryptPayload, adminCompleteApp);

// Admin Declaration (PAID apps)
router.get("/declarations/:appId", checkAuthorization({ module: "submissions", action: "canReadSingle" }), getAdminDeclaration);
router.put("/declarations/:appId", checkAuthorization({ module: "submissions", action: "canUpdate" }), decryptPayload, updateAdminDeclaration);
router.post("/declarations/:appId/publish", checkAuthorization({ module: "submissions", action: "canUpdate" }), publishAdminDeclaration);

// System Logs
router.get("/logs", checkAuthorization({ module: "logs", action: "canReadList" }), getLogs);
router.get("/logs/:filename", checkAuthorization({ module: "logs", action: "canReadSingle" }), getLogContent);
router.delete("/logs/:filename", checkAuthorization({ module: "logs", action: "canDelete" }), deleteLog);
router.post("/logs/batch-delete", checkAuthorization({ module: "logs", action: "canDelete" }), decryptPayload, deleteLogsBatch);

// Tester Activity
router.get("/tester-activity", checkAuthorization({ module: "tester_activity", action: "canReadList" }), getTesterActivity);

// Support Operations
router.post("/control-room", checkAuthentication, checkAuthorization({ module: "control_room", action: "canUpdate" }), decryptPayload, updateControlRoom);
router.get("/support/conversations", checkAuthorization({ module: "support", action: "canReadList" }), getConversations);
router.get("/support/conversations/:id", checkAuthorization({ module: "support", action: "canReadSingle" }), getConversationById);
router.post("/support/conversations/:id/assign", checkAuthorization({ module: "support", action: "canUpdate" }), decryptPayload, assignConversation);
router.post("/support/conversations/:id/messages", checkAuthorization({ module: "support", action: "canUpdate" }), decryptPayload, addConversationMessage);
router.post("/support/conversations/:id/close", checkAuthorization({ module: "support", action: "canUpdate" }), decryptPayload, closeConversation);
router.get("/support/agent-statuses", checkAuthorization({ module: "support", action: "canReadList" }), getAgentStatus);
router.post("/support/agents/status", checkAuthorization({ module: "support", action: "canUpdate" }), decryptPayload, setMyStatus);
router.get("/support/stats", checkAuthorization({ module: "support", action: "canReadList" }), getSupportStats);

export default router;
