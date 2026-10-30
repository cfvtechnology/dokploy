import { createAccessControl } from "better-auth/plugins/access";

/**
 * Dokploy Access Control Statements
 *
 * Defines all resources and their possible actions across the platform.
 * The first 5 (organization, member, invitation, team, ac) are better-auth defaults
 * used internally by the organization plugin.
 * The rest are Dokploy-specific resources.
 * All resources are evaluated uniformly — there is no enterprise-only bypass.
 */
export const statements = {
	// better-auth organization plugin defaults
	organization: ["update", "delete"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],

	// Dokploy core resources
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],
	telemetryProvider: ["read", "create", "delete"],

	// Extended resources (assignable to any custom role without a license)
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	server: ["read", "create", "delete", "terminal"],
	registry: ["read", "create", "delete"],
	certificate: ["read", "create", "update", "delete"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	destination: ["read", "create", "delete"],
	notification: ["read", "create", "update", "delete"],
	tag: ["read", "create", "update", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	auditLog: ["read"],
	vaultProvider: ["read", "create", "update", "delete"],
	dnsProvider: ["read", "create", "update", "delete"],
	ai: ["read", "create", "update", "delete"],
} as const;

export const ac = createAccessControl(statements);

/**
 * Owner role — full access to everything
 */
export const ownerRole = ac.newRole({
	organization: ["update", "delete"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	server: ["read", "create", "delete", "terminal"],
	registry: ["read", "create", "delete"],
	certificate: ["read", "create", "update", "delete"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	destination: ["read", "create", "delete"],
	notification: ["read", "create", "update", "delete"],
	tag: ["read", "create", "update", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	auditLog: ["read"],
	vaultProvider: ["read", "create", "update", "delete"],
	dnsProvider: ["read", "create", "update", "delete"],
	telemetryProvider: ["read", "create", "delete"],
	ai: ["read", "create", "update", "delete"],
});

/**
 * Admin role — same as owner but cannot delete the organization
 */
export const adminRole = ac.newRole({
	organization: ["update"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	server: ["read", "create", "delete", "terminal"],
	registry: ["read", "create", "delete"],
	certificate: ["read", "create", "update", "delete"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	destination: ["read", "create", "delete"],
	notification: ["read", "create", "update", "delete"],
	tag: ["read", "create", "update", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	auditLog: ["read"],
	vaultProvider: ["read", "create", "update", "delete"],
	dnsProvider: ["read", "create", "update", "delete"],
	telemetryProvider: ["read", "create", "delete"],
	ai: ["read", "create", "update", "delete"],
});

/**
 * Member role — read-only base permissions.
 * Members can read projects/services/environments they have access to,
 * but cannot create, delete, or access admin resources.
 * Service-scoped resources (deployments, env vars, volumes, etc.) are
 * accessible when the member has been granted access to those services.
 * Org-wide resources (servers, registries, certificates, etc.) are not available.
 */
export const memberRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
	project: [],
	service: ["read"],
	environment: ["read"],
	docker: [],
	sshKeys: [],
	gitProviders: [],
	traefikFiles: [],
	api: [],
	// Service-scoped resources — member can operate within services they have access to
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	// Org-wide resources — member cannot manage these
	server: [],
	registry: [],
	certificate: [],
	destination: [],
	notification: [],
	telemetryProvider: [],
	tag: ["read"],
	auditLog: [],
	// Members need provider/secret names for env editor autocomplete; values are never exposed
	vaultProvider: ["read"],
	dnsProvider: [],
	ai: [],
});
