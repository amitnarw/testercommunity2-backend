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
  // Tester Applications
  getTesterApplications,
  getTesterApplicationCounts,
  getTesterApplicationById,
  updateTesterApplicationStatus,
  assignTestersToApp,
  unassignTesterFromApp,
  updateProjectStatus,
} from "@/controllers/admin.controller";
import { decryptPayload } from "@/middlewares/decyptPayload";
import Router from "express";

const router = Router();

// Control Room
router.get("/get-control-room-data", getControlRoomData);

// Dashboard Stats
router.get("/get-dashboard-stats", getDashboardStats);

// Submissions
router.get("/get-submitted-apps", getSubmittedApps);
router.get("/get-submitted-apps-count", getSubmittedAppsCount);
router.post("/accept-app", decryptPayload, acceptApp);
router.post("/reject-app", decryptPayload, rejectApp);
router.post("/update-project-status", decryptPayload, updateProjectStatus);

// Feedback
router.get("/feedback", getAllFeedback);
router.get("/feedback/counts", getFeedbackCounts);
router.get("/feedback/:id", getFeedbackById);
router.post("/feedback/update", decryptPayload, updateFeedbackStatus);
router.delete("/feedback/:id", deleteFeedback);

// Users
router.get("/users", getAllUsers);
router.get("/users/counts", getUserCounts);
router.get("/users/:id", getUserById);
router.post("/users/update-status", decryptPayload, updateUserStatus);
router.post("/users/update-role", decryptPayload, updateUserRole);

// Suggestions
router.get("/suggestions", getAllSuggestions);
router.get("/suggestions/counts", getSuggestionCounts);
router.get("/suggestions/:id", getSuggestionById);
router.post("/suggestions", decryptPayload, createSuggestion);
router.post("/suggestions/update", decryptPayload, updateSuggestionStatus);
router.delete("/suggestions/:id", deleteSuggestion);

// Notifications
router.get("/notifications", getAllNotifications);
router.get("/notifications/counts", getNotificationCounts);
router.post("/notifications", decryptPayload, createNotification);
router.post("/notifications/update", decryptPayload, updateNotification);
router.post("/notifications/broadcast", decryptPayload, broadcastNotification);
router.delete("/notifications/:id", deleteNotification);

// Tester Applications
router.get("/tester-applications", getTesterApplications);
router.get("/tester-applications/counts", getTesterApplicationCounts);
router.get("/tester-applications/:id", getTesterApplicationById);
router.post(
  "/tester-applications/update-status",
  decryptPayload,
  updateTesterApplicationStatus,
);
router.post("/tester-applications/assign", decryptPayload, assignTestersToApp);
router.post(
  "/tester-applications/unassign",
  decryptPayload,
  unassignTesterFromApp,
);

export default router;
