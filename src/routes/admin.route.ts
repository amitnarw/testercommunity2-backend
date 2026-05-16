import {
  getControlRoomData,
  getSubmittedApps,
  acceptApp,
  rejectApp,
  getSubmittedAppsCount,
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
  deleteUser,
  getUserCounts,
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
  // Testimonials
  getAllTestimonials,
  getTestimonialById,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  // Act As
  actAsRole,
} from "@/controllers/admin.controller";
import {
  getAllReviews,
  getReviewById,
  updateReviewStatus,
  deleteReview,
} from "@/controllers/review.controller";
import {
  getConversations,
  getConversationById,
  assignConversation,
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
router.post("/act-as", decryptPayload, actAsRole);

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

// Feedback
router.get("/feedback", checkAuthorization({ module: "feedback", action: "canReadList" }), getAllFeedback);
router.get("/feedback/counts", checkAuthorization({ module: "feedback", action: "canReadList" }), getFeedbackCounts);
router.get("/feedback/:id", checkAuthorization({ module: "feedback", action: "canReadSingle" }), getFeedbackById);
router.post("/feedback/update", checkAuthorization({ module: "feedback", action: "canUpdate" }), decryptPayload, updateFeedbackStatus);
router.delete("/feedback/:id", checkAuthorization({ module: "feedback", action: "canDelete" }), deleteFeedback);

// Users
router.get("/users", checkAuthorization({ module: "users", action: "canReadList" }), getAllUsers);
router.get("/users/counts", checkAuthorization({ module: "users", action: "canReadList" }), getUserCounts);
router.get("/users/:id", checkAuthorization({ module: "users", action: "canReadSingle" }), getUserById);
router.post("/users/update-status", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, updateUserStatus);
router.post("/users/update-role", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, updateUserRole);
router.post("/users/update-profile", checkAuthorization({ module: "users", action: "canUpdate" }), decryptPayload, updateUserProfile);
router.delete("/users/:id", checkAuthorization({ module: "users", action: "canDelete" }), deleteUser);

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

// Testimonials
router.get("/testimonials", checkAuthorization({ module: "testimonial", action: "canReadList" }), getAllTestimonials);
router.get("/testimonials/:id", checkAuthorization({ module: "testimonial", action: "canReadSingle" }), getTestimonialById);
router.post("/testimonials", checkAuthorization({ module: "testimonial", action: "canCreate" }), decryptPayload, createTestimonial);
router.post("/testimonials/update", checkAuthorization({ module: "testimonial", action: "canUpdate" }), decryptPayload, updateTestimonial);
router.delete("/testimonials/:id", checkAuthorization({ module: "testimonial", action: "canDelete" }), deleteTestimonial);

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

// System Logs
router.get("/logs", checkAuthorization({ module: "logs", action: "canReadList" }), getLogs);
router.get("/logs/:filename", checkAuthorization({ module: "logs", action: "canReadSingle" }), getLogContent);
router.delete("/logs/:filename", checkAuthorization({ module: "logs", action: "canDelete" }), deleteLog);
router.post("/logs/batch-delete", checkAuthorization({ module: "logs", action: "canDelete" }), decryptPayload, deleteLogsBatch);

// Support Operations
router.post("/control-room", checkAuthentication, decryptPayload, updateControlRoom);
router.get("/support/conversations", checkAuthentication, getConversations);
router.get("/support/conversations/:id", checkAuthentication, getConversationById);
router.post("/support/conversations/:id/assign", checkAuthentication, decryptPayload, assignConversation);
router.post("/support/conversations/:id/close", checkAuthentication, decryptPayload, closeConversation);
router.get("/support/agent-statuses", checkAuthentication, getAgentStatus);
router.post("/support/agents/status", checkAuthentication, decryptPayload, setMyStatus);
router.get("/support/stats", checkAuthentication, getSupportStats);

export default router;
