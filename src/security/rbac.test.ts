import { describe, expect, it } from "vitest";
import {
  resolveRbacConfig,
  resolveRole,
  hasPermission,
  checkPermission,
  checkPermissions,
  checkAnyPermission,
  getRolePermissions,
  getAvailableRoles,
  getPredefinedRoles,
  getAllPermissions,
  createContextFromAuth,
  type IdentityContext,
  type Permission,
} from "./rbac.js";

describe("resolveRbacConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = resolveRbacConfig();
    expect(config.enabled).toBe(true);
    expect(config.defaultRole).toBe("viewer");
    expect(config.denyByDefault).toBe(true);
    expect(config.roles.has("admin")).toBe(true);
    expect(config.roles.has("operator")).toBe(true);
    expect(config.roles.has("viewer")).toBe(true);
  });

  it("merges custom roles with predefined roles", () => {
    const config = resolveRbacConfig({
      roles: {
        developer: {
          permissions: ["exec.run", "agents.execute"],
          description: "Developer access",
        },
      },
    });
    expect(config.roles.has("developer")).toBe(true);
    expect(config.roles.has("admin")).toBe(true);
    const dev = config.roles.get("developer");
    expect(dev?.permissions).toContain("exec.run");
    expect(dev?.permissions).toContain("agents.execute");
  });

  it("supports role inheritance", () => {
    const config = resolveRbacConfig({
      roles: {
        "super-viewer": {
          inherits: "viewer",
          permissions: ["sessions.export"],
        },
      },
    });
    const superViewer = config.roles.get("super-viewer");
    expect(superViewer?.permissions).toContain("sessions.export");
    // Should also have inherited viewer permissions
    expect(superViewer?.permissions).toContain("config.read");
    expect(superViewer?.permissions).toContain("sessions.list");
  });

  it("handles missing parent role gracefully", () => {
    const config = resolveRbacConfig({
      roles: {
        orphan: {
          inherits: "nonexistent",
          permissions: ["config.read"],
        },
      },
    });
    const orphan = config.roles.get("orphan");
    expect(orphan?.permissions).toEqual(["config.read"]);
  });
});

describe("resolveRole", () => {
  it("returns role from exact binding match", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "alice@example.com", role: "admin" }],
    });
    const context: IdentityContext = { identity: "alice@example.com" };
    const role = resolveRole(context, config);
    expect(role?.name).toBe("admin");
  });

  it("returns role from wildcard binding", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "*@admin.com", role: "admin" }],
    });
    const context: IdentityContext = { identity: "bob@admin.com" };
    const role = resolveRole(context, config);
    expect(role?.name).toBe("admin");
  });

  it("returns role from glob pattern", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "service-*", role: "operator" }],
    });
    const context: IdentityContext = { identity: "service-worker-1" };
    const role = resolveRole(context, config);
    expect(role?.name).toBe("operator");
  });

  it("returns default role when no binding matches", () => {
    const config = resolveRbacConfig({
      defaultRole: "viewer",
      bindings: [{ identity: "admin@example.com", role: "admin" }],
    });
    const context: IdentityContext = { identity: "user@example.com" };
    const role = resolveRole(context, config);
    expect(role?.name).toBe("viewer");
  });

  it("returns null when no role found and no default", () => {
    const config = resolveRbacConfig({
      defaultRole: undefined,
      bindings: [],
    });
    // Override defaultRole to undefined
    const resolved = { ...config, defaultRole: "" };
    const context: IdentityContext = { identity: "unknown" };
    const role = resolveRole(context, resolved);
    expect(role).toBeNull();
  });

  it("respects binding expiration", () => {
    const pastTime = Date.now() - 60000; // 1 minute ago
    const config = resolveRbacConfig({
      defaultRole: "viewer",
      bindings: [{ identity: "expired@example.com", role: "admin", expiresAt: pastTime }],
    });
    const context: IdentityContext = { identity: "expired@example.com" };
    const role = resolveRole(context, config);
    // Should fall back to default since binding expired
    expect(role?.name).toBe("viewer");
  });

  it("respects IP range conditions", () => {
    const config = resolveRbacConfig({
      defaultRole: "viewer",
      bindings: [
        {
          identity: "internal@example.com",
          role: "admin",
          conditions: { ipRange: ["192.168.*", "10.*"] },
        },
      ],
    });

    // Matching IP
    const internalContext: IdentityContext = {
      identity: "internal@example.com",
      clientIp: "192.168.1.100",
    };
    expect(resolveRole(internalContext, config)?.name).toBe("admin");

    // Non-matching IP
    const externalContext: IdentityContext = {
      identity: "internal@example.com",
      clientIp: "8.8.8.8",
    };
    expect(resolveRole(externalContext, config)?.name).toBe("viewer");
  });

  it("grants admin when RBAC is disabled", () => {
    const config = resolveRbacConfig({ enabled: false });
    const context: IdentityContext = { identity: "anyone" };
    const role = resolveRole(context, config);
    expect(role?.name).toBe("admin");
  });
});

describe("hasPermission", () => {
  it("returns true for granted permission", () => {
    const config = resolveRbacConfig();
    const admin = config.roles.get("admin")!;
    expect(hasPermission(admin, "config.write")).toBe(true);
  });

  it("returns false for denied permission", () => {
    const config = resolveRbacConfig();
    const viewer = config.roles.get("viewer")!;
    expect(hasPermission(viewer, "config.write")).toBe(false);
  });

  it("returns false for null role", () => {
    expect(hasPermission(null, "config.read")).toBe(false);
  });
});

describe("checkPermission", () => {
  it("allows permission for matching role", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "admin@test.com", role: "admin" }],
    });
    const context: IdentityContext = { identity: "admin@test.com" };
    const result = checkPermission(context, "config.write", config);
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("admin");
  });

  it("denies permission for insufficient role", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "viewer@test.com", role: "viewer" }],
    });
    const context: IdentityContext = { identity: "viewer@test.com" };
    const result = checkPermission(context, "config.write", config);
    expect(result.allowed).toBe(false);
    expect(result.role).toBe("viewer");
    expect(result.reason).toContain("lacks permission");
  });

  it("denies when no role and denyByDefault=true", () => {
    const config = resolveRbacConfig({
      defaultRole: "",
      denyByDefault: true,
    });
    const resolved = { ...config, defaultRole: "" };
    const context: IdentityContext = { identity: "unknown" };
    const result = checkPermission(context, "config.read", resolved);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("No role assigned");
  });

  it("allows all when RBAC disabled", () => {
    const config = resolveRbacConfig({ enabled: false });
    const context: IdentityContext = { identity: "anyone" };
    const result = checkPermission(context, "gateway.shutdown", config);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("RBAC disabled");
  });
});

describe("checkPermissions", () => {
  it("allows when all permissions granted", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "admin@test.com", role: "admin" }],
    });
    const context: IdentityContext = { identity: "admin@test.com" };
    const result = checkPermissions(context, ["config.read", "config.write"], config);
    expect(result.allowed).toBe(true);
  });

  it("denies when any permission missing", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "viewer@test.com", role: "viewer" }],
    });
    const context: IdentityContext = { identity: "viewer@test.com" };
    const result = checkPermissions(context, ["config.read", "config.write"], config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("config.write");
  });
});

describe("checkAnyPermission", () => {
  it("allows when any permission granted", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "viewer@test.com", role: "viewer" }],
    });
    const context: IdentityContext = { identity: "viewer@test.com" };
    const result = checkAnyPermission(context, ["config.read", "config.write"], config);
    expect(result.allowed).toBe(true);
  });

  it("denies when no permission granted", () => {
    const config = resolveRbacConfig({
      bindings: [{ identity: "viewer@test.com", role: "viewer" }],
    });
    const context: IdentityContext = { identity: "viewer@test.com" };
    const result = checkAnyPermission(context, ["config.write", "gateway.shutdown"], config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("lacks any of");
  });
});

describe("getRolePermissions", () => {
  it("returns permissions for existing role", () => {
    const config = resolveRbacConfig();
    const permissions = getRolePermissions("admin", config);
    expect(permissions).toContain("config.write");
    expect(permissions).toContain("gateway.shutdown");
  });

  it("returns empty array for non-existent role", () => {
    const config = resolveRbacConfig();
    const permissions = getRolePermissions("nonexistent", config);
    expect(permissions).toEqual([]);
  });
});

describe("getAvailableRoles", () => {
  it("includes predefined roles", () => {
    const config = resolveRbacConfig();
    const roles = getAvailableRoles(config);
    expect(roles).toContain("admin");
    expect(roles).toContain("operator");
    expect(roles).toContain("viewer");
  });

  it("includes custom roles", () => {
    const config = resolveRbacConfig({
      roles: { custom: { permissions: ["config.read"] } },
    });
    const roles = getAvailableRoles(config);
    expect(roles).toContain("custom");
  });
});

describe("getPredefinedRoles", () => {
  it("returns predefined role names", () => {
    const roles = getPredefinedRoles();
    expect(roles).toEqual(["admin", "operator", "viewer"]);
  });
});

describe("getAllPermissions", () => {
  it("returns all available permissions", () => {
    const permissions = getAllPermissions();
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions).toContain("config.read");
    expect(permissions).toContain("config.write");
    expect(permissions).toContain("gateway.shutdown");
  });
});

describe("createContextFromAuth", () => {
  it("creates context from auth params", () => {
    const context = createContextFromAuth({
      user: "alice@example.com",
      method: "token",
      clientIp: "192.168.1.1",
    });
    expect(context.identity).toBe("alice@example.com");
    expect(context.authMethod).toBe("token");
    expect(context.clientIp).toBe("192.168.1.1");
  });

  it("defaults to anonymous when no user", () => {
    const context = createContextFromAuth({});
    expect(context.identity).toBe("anonymous");
  });
});

describe("predefined role permissions", () => {
  it("admin has all permissions", () => {
    const config = resolveRbacConfig();
    const admin = config.roles.get("admin")!;
    const allPerms = getAllPermissions();
    for (const perm of allPerms) {
      expect(hasPermission(admin, perm)).toBe(true);
    }
  });

  it("viewer cannot write or modify", () => {
    const config = resolveRbacConfig();
    const viewer = config.roles.get("viewer")!;
    const writePerms: Permission[] = [
      "config.write",
      "sessions.delete",
      "agents.create",
      "agents.delete",
      "channels.configure",
      "exec.elevated",
      "gateway.restart",
      "gateway.shutdown",
      "nodes.register",
      "nodes.remove",
      "users.manage",
      "roles.manage",
    ];
    for (const perm of writePerms) {
      expect(hasPermission(viewer, perm)).toBe(false);
    }
  });

  it("operator can execute but not configure", () => {
    const config = resolveRbacConfig();
    const operator = config.roles.get("operator")!;
    expect(hasPermission(operator, "exec.run")).toBe(true);
    expect(hasPermission(operator, "agents.execute")).toBe(true);
    expect(hasPermission(operator, "config.write")).toBe(false);
    expect(hasPermission(operator, "gateway.shutdown")).toBe(false);
  });
});
