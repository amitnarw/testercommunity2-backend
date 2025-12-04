import "better-auth";

declare module "better-auth" {
  interface BetterAuthContext {
    state: Record<string, any>;
  }
}