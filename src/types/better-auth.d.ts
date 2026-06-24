import "better-auth";

declare module "better-auth" {
  interface Session {
    role?: {
      name: string;
      isAdmin?: boolean;
      permissions: {
        moduleId: number;
        canReadList: boolean;
        canReadSingle: boolean;
        canCreate: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        module: { name: string };
      }[];
    };
    actingAsRole?: string | null;
  }
}
