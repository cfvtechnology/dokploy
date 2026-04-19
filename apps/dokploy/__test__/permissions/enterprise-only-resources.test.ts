/**
 * After free-custom-roles: enterpriseOnlyResources is removed from access-control.ts.
 * This file retains only assertions that remain valid after the resource classification is deleted.
 *
 * Specifically: every resource defined in `statements` must be a known, valid resource.
 * There is no longer a distinction between "free" and "enterprise-only" resources for
 * permission evaluation purposes — all resources are evaluated uniformly.
 */
import { statements } from "@dokploy/server/lib/access-control";
import { describe, expect, it } from "vitest";

const ALL_KNOWN_RESOURCES = [
	"organization",
	"member",
	"invitation",
	"team",
	"ac",
	"project",
	"service",
	"environment",
	"docker",
	"sshKeys",
	"gitProviders",
	"traefikFiles",
	"api",
	"volume",
	"deployment",
	"envVars",
	"projectEnvVars",
	"environmentEnvVars",
	"server",
	"registry",
	"certificate",
	"backup",
	"volumeBackup",
	"schedule",
	"domain",
	"destination",
	"notification",
	"tag",
	"logs",
	"monitoring",
	"auditLog",
];

describe("statements resource registry", () => {
	it("statements contains all known resources", () => {
		const statementResources = Object.keys(statements);
		for (const resource of ALL_KNOWN_RESOURCES) {
			expect(statementResources).toContain(resource);
		}
	});

	it("every resource in statements is in the known-resource list", () => {
		const statementResources = Object.keys(statements);
		for (const resource of statementResources) {
			expect(ALL_KNOWN_RESOURCES).toContain(resource);
		}
	});

	it("each resource has at least one action defined", () => {
		for (const [resource, actions] of Object.entries(statements)) {
			expect(
				(actions as readonly string[]).length,
				`${resource} has no actions`,
			).toBeGreaterThan(0);
		}
	});
});
