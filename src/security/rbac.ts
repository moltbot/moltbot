/**
 * Role-Based Access Control (RBAC)
 *
 * Provides authorization layer on top of authentication:
 * - Predefined roles: admin, operator, viewer
 * - Custom roles with configurable permissions
 * - Permission checking for gateway operations
 * - Identity-to-role mapping
 *
 * This module complements src/gateway/auth.ts which handles authentication.
 * RBAC determines what authenticated users can do.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("rbac");

/**
 * Available permissions in the system.
 */
export type Permission =
  // Configuration management
  | "config.read"
  | "config.write"
  | "config.reload"
  // Session management
  | "sessions.list"
  | "sessions.read"
  | "sessions.delete"
  | "sessions.export"
  // Agent operations
  | "agents.list"
  | "agents.create"
  | "agents.delete"
  | "agents.execute"
  // Channel management
  | "channels.list"
  | "channels.connect"
  | "channels.disconnect"
  | "channels.configure"
  // Command execution
  | "exec.run"
  | "exec.elevated"
  | "exec.approve"
  // Gateway administration
  | "gateway.status"
  | "gateway.restart"
  | "gateway.shutdown"
  // Node management
  | "nodes.list"
  | "nodes.register"
  | "nodes.remove"
  | "nodes.invoke"
  // Audit and monitoring
  | "audit.read"
  | "audit.export"
  | "metrics.read"
  // User management (for future multi-user scenarios)
  | "users.list"
  | "users.manage"
  | "roles.manage";

/**
 * Predefined role types.
 */
export type PredefinedRole = "admin" | "operator" | "viewer";

/**
 * Role definition with associated permissions.
 */
export type Role = {
  name: string;
  description?: string;
  permissions: Permission[];
  /** Inherit permissions from another role */
  inherits?: string;
};

/**
 * Identity-to-role mapping.
 */
export type RoleBinding = {
  /** Identity pattern (exact match or glob) */
  identity: string;
  /** Role name */
  role: string;
  /** Optional expiration timestamp */
  expiresAt?: number;
  /** Optional conditions for the binding */
  conditions?: {
    /** Require specific IP range */
    ipRange?: string[];
    /** Require specific time window (cron expression) */
    timeWindow?: string;
    /** Require MFA verification */
    requireMfa?: boolean;
  };
};

/**
 * RBAC configuration.
 */
export type RbacConfig = {
  /** Enable RBAC (default: true). */
  enabled?: boolean;
  /** Default role for authenticated users without explicit binding (default: viewer). */
  defaultRole?: string;
  /** Custom role definitions */
  roles?: Record<string, Omit<Role, "name">>;
  /** Identity-to-role bindings */
  bindings?: RoleBinding[];
  /** Log permission checks (default: false). */
  logChecks?: boolean;
  /** Deny by default when no role matches (default: true). */
  denyByDefault?: boolean;
};

export type ResolvedRbacConfig = Required<Omit<RbacConfig, "roles" | "bindings">> & {
  roles: Map<string, Role>;
  bindings: RoleBinding[];
};

/**
 * Predefined role permissions.
 */
const PREDEFINED_ROLES: Record<PredefinedRole, Role> = {
  admin: {
    name: "admin",
    description: "Full administrative access",
    permissions: [
      "config.read",
      "config.write",
      "config.reload",
      "sessions.list",
      "sessions.read",
      "sessions.delete",
      "sessions.export",
      "agents.list",
      "agents.create",
      "agents.delete",
      "agents.execute",
      "channels.list",
      "channels.connect",
      "channels.disconnect",
      "channels.configure",
      "exec.run",
      "exec.elevated",
      "exec.approve",
      "gateway.status",
      "gateway.restart",
      "gateway.shutdown",
      "nodes.list",
      "nodes.register",
      "nodes.remove",
      "nodes.invoke",
      "audit.read",
      "audit.export",
      "metrics.read",
      "users.list",
      "users.manage",
      "roles.manage",
    ],
  },
  operator: {
    name: "operator",
    description: "Operational access without admin privileges",
    permissions: [
      "config.read",
      "sessions.list",
      "sessions.read",
      "sessions.export",
      "agents.list",
      "agents.execute",
      "channels.list",
      "channels.connect",
      "channels.disconnect",
      "exec.run",
      "gateway.status",
      "nodes.list",
      "nodes.invoke",
      "audit.read",
      "metrics.read",
    ],
  },
  viewer: {
    name: "viewer",
    description: "Read-only access",
    permissions: [
      "config.read",
      "sessions.list",
      "sessions.read",
      "agents.list",
      "channels.list",
      "gateway.status",
      "nodes.list",
      "audit.read",
      "metrics.read",
    ],
  },
};

const DEFAULT_CONFIG: ResolvedRbacConfig = {
  enabled: true,
  defaultRole: "viewer",
  roles: new Map(Object.entries(PREDEFINED_ROLES)),
  bindings: [],
  logChecks: false,
  denyByDefault: true,
};

/**
 * Resolve RBAC configuration with defaults.
 */
export function resolveRbacConfig(config?: Partial<RbacConfig>): ResolvedRbacConfig {
  const roles = new Map<string, Role>(Object.entries(PREDEFINED_ROLES));

  // Add custom roles
  if (config?.roles) {
    for (const [name, def] of Object.entries(config.roles)) {
      const role: Role = {
        name,
        description: def.description,
        permissions: [...def.permissions],
        inherits: def.inherits,
      };

      // Resolve inheritance
      if (def.inherits) {
        const parent = roles.get(def.inherits);
        if (parent) {
          const combined = new Set([...parent.permissions, ...def.permissions]);
          role.permissions = [...combined];
        } else {
          log.warn("Role inheritance failed: parent not found", {
            role: name,
            inherits: def.inherits,
          });
        }
      }

      roles.set(name, role);
    }
  }

  return {
    enabled: config?.enabled ?? DEFAULT_CONFIG.enabled,
    defaultRole: config?.defaultRole ?? DEFAULT_CONFIG.defaultRole,
    roles,
    bindings: config?.bindings ?? DEFAULT_CONFIG.bindings,
    logChecks: config?.logChecks ?? DEFAULT_CONFIG.logChecks,
    denyByDefault: config?.denyByDefault ?? DEFAULT_CONFIG.denyByDefault,
  };
}

/**
 * Identity matching context.
 */
export type IdentityContext = {
  /** Primary identity (e.g., email, username, token hash) */
  identity: string;
  /** Authentication method used */
  authMethod?: "token" | "password" | "tailscale" | "device-token";
  /** Client IP address */
  clientIp?: string;
  /** Additional identity attributes */
  attributes?: Record<string, string>;
};

/**
 * Check if an identity pattern matches a given identity.
 */
function matchesIdentity(pattern: string, identity: string): boolean {
  // Exact match
  if (pattern === identity) return true;

  // Wildcard match
  if (pattern === "*") return true;

  // Glob pattern (simple implementation)
  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      "i",
    );
    return regex.test(identity);
  }

  return false;
}

/**
 * Check if conditions are satisfied.
 */
function checkConditions(
  binding: RoleBinding,
  context: IdentityContext,
  now: number = Date.now(),
): boolean {
  // Check expiration
  if (binding.expiresAt && now > binding.expiresAt) {
    return false;
  }

  const conditions = binding.conditions;
  if (!conditions) return true;

  // Check IP range
  if (conditions.ipRange && context.clientIp) {
    const ipMatches = conditions.ipRange.some((range) => {
      // Simple prefix matching for now
      if (range.endsWith("*")) {
        return context.clientIp?.startsWith(range.slice(0, -1));
      }
      return context.clientIp === range;
    });
    if (!ipMatches) return false;
  }

  // Note: MFA and time window checks would require additional context
  // These are placeholders for enterprise features

  return true;
}

/**
 * Resolve the effective role for an identity.
 */
export function resolveRole(context: IdentityContext, config: ResolvedRbacConfig): Role | null {
  if (!config.enabled) {
    // When RBAC is disabled, grant admin role
    return config.roles.get("admin") ?? null;
  }

  // Find matching binding
  for (const binding of config.bindings) {
    if (matchesIdentity(binding.identity, context.identity)) {
      if (checkConditions(binding, context)) {
        const role = config.roles.get(binding.role);
        if (role) {
          if (config.logChecks) {
            log.debug("Role resolved from binding", {
              identity: context.identity,
              role: role.name,
            });
          }
          return role;
        }
      }
    }
  }

  // Fall back to default role
  if (config.defaultRole) {
    const defaultRole = config.roles.get(config.defaultRole);
    if (defaultRole) {
      if (config.logChecks) {
        log.debug("Using default role", {
          identity: context.identity,
          role: defaultRole.name,
        });
      }
      return defaultRole;
    }
  }

  // No role found
  if (config.logChecks) {
    log.debug("No role found for identity", { identity: context.identity });
  }
  return null;
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role | null, permission: Permission): boolean {
  if (!role) return false;
  return role.permissions.includes(permission);
}

/**
 * Permission check result.
 */
export type PermissionCheckResult = {
  allowed: boolean;
  role?: string;
  reason?: string;
};

/**
 * Check if an identity has a specific permission.
 */
export function checkPermission(
  context: IdentityContext,
  permission: Permission,
  config: ResolvedRbacConfig,
): PermissionCheckResult {
  if (!config.enabled) {
    return { allowed: true, reason: "RBAC disabled" };
  }

  const role = resolveRole(context, config);

  if (!role) {
    const allowed = !config.denyByDefault;
    if (config.logChecks) {
      log.debug("Permission check (no role)", {
        identity: context.identity,
        permission,
        allowed,
      });
    }
    return {
      allowed,
      reason: allowed ? "No role, deny-by-default disabled" : "No role assigned",
    };
  }

  const allowed = hasPermission(role, permission);

  if (config.logChecks) {
    log.debug("Permission check", {
      identity: context.identity,
      role: role.name,
      permission,
      allowed,
    });
  }

  return {
    allowed,
    role: role.name,
    reason: allowed ? undefined : `Role '${role.name}' lacks permission '${permission}'`,
  };
}

/**
 * Check multiple permissions (all must pass).
 */
export function checkPermissions(
  context: IdentityContext,
  permissions: Permission[],
  config: ResolvedRbacConfig,
): PermissionCheckResult {
  if (!config.enabled) {
    return { allowed: true, reason: "RBAC disabled" };
  }

  const role = resolveRole(context, config);

  if (!role) {
    const allowed = !config.denyByDefault;
    return {
      allowed,
      reason: allowed ? "No role, deny-by-default disabled" : "No role assigned",
    };
  }

  const missing = permissions.filter((p) => !hasPermission(role, p));

  if (missing.length > 0) {
    return {
      allowed: false,
      role: role.name,
      reason: `Role '${role.name}' lacks permissions: ${missing.join(", ")}`,
    };
  }

  return { allowed: true, role: role.name };
}

/**
 * Check any of multiple permissions (at least one must pass).
 */
export function checkAnyPermission(
  context: IdentityContext,
  permissions: Permission[],
  config: ResolvedRbacConfig,
): PermissionCheckResult {
  if (!config.enabled) {
    return { allowed: true, reason: "RBAC disabled" };
  }

  const role = resolveRole(context, config);

  if (!role) {
    const allowed = !config.denyByDefault;
    return {
      allowed,
      reason: allowed ? "No role, deny-by-default disabled" : "No role assigned",
    };
  }

  const hasAny = permissions.some((p) => hasPermission(role, p));

  if (!hasAny) {
    return {
      allowed: false,
      role: role.name,
      reason: `Role '${role.name}' lacks any of: ${permissions.join(", ")}`,
    };
  }

  return { allowed: true, role: role.name };
}

/**
 * Get all permissions for a role.
 */
export function getRolePermissions(roleName: string, config: ResolvedRbacConfig): Permission[] {
  const role = config.roles.get(roleName);
  return role ? [...role.permissions] : [];
}

/**
 * Get all available roles.
 */
export function getAvailableRoles(config: ResolvedRbacConfig): string[] {
  return [...config.roles.keys()];
}

/**
 * Get predefined roles (always available).
 */
export function getPredefinedRoles(): PredefinedRole[] {
  return ["admin", "operator", "viewer"];
}

/**
 * Get all available permissions.
 */
export function getAllPermissions(): Permission[] {
  return [
    "config.read",
    "config.write",
    "config.reload",
    "sessions.list",
    "sessions.read",
    "sessions.delete",
    "sessions.export",
    "agents.list",
    "agents.create",
    "agents.delete",
    "agents.execute",
    "channels.list",
    "channels.connect",
    "channels.disconnect",
    "channels.configure",
    "exec.run",
    "exec.elevated",
    "exec.approve",
    "gateway.status",
    "gateway.restart",
    "gateway.shutdown",
    "nodes.list",
    "nodes.register",
    "nodes.remove",
    "nodes.invoke",
    "audit.read",
    "audit.export",
    "metrics.read",
    "users.list",
    "users.manage",
    "roles.manage",
  ];
}

/**
 * Create an RBAC context from gateway auth result.
 */
export function createContextFromAuth(params: {
  user?: string;
  method?: "token" | "password" | "tailscale" | "device-token";
  clientIp?: string;
}): IdentityContext {
  return {
    identity: params.user ?? "anonymous",
    authMethod: params.method,
    clientIp: params.clientIp,
  };
}
