declare module 'better-auth' {
  interface Session {
    role?: {
      name: string;
      permissions: {
        id: number;
        moduleId: number;
        canRead: boolean;
        canUpdate: boolean;
        canDelete: boolean;
      }[];
    };
  }
}