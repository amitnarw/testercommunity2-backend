import type { Socket } from "socket.io";
import { auth, type SessionWithRole } from "../lib/auth";

export async function websocketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    const cookies = socket.handshake.headers.cookie || "";
    if (!cookies) {
      return next(new Error("Authentication required: no cookies"));
    }

    const headers: Record<string, string> = {
      cookie: cookies,
    };

    const session = (await auth.api.getSession({
      headers,
    })) as SessionWithRole | null;

    if (!session) {
      return next(new Error("Authentication required: invalid session"));
    }

    socket.data.userId = session.user.id;
    socket.data.role = session.role?.name || "user";
    socket.data.isAdmin = session.role?.isAdmin === true;
    socket.data.userName = session.user.name || "Unknown";
    socket.data.userEmail = session.user.email || "";

    next();
  } catch (error) {
    next(new Error("Authentication required"));
  }
}
