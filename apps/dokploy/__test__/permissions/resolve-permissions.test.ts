import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (
	role: string,
	overrides: Record<string, boolean> = {},
) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects: [] as string[],
	accessedServices: [] as string[],
	accessedEnvironments: [] as string[],
	canCreateProjects: overrides.canCreateProjects ?? false,
	canDeleteProjects: overrides.canDeleteProjects ?? false,
	canCreateServices: overrides.canCreateServices ?? false,
	canDeleteServices: overrides.canDeleteServices ?? false,
	canCreateEnvironments: overrides.canCreateEnvironments ?? false,
	canDeleteEnvironments: overrides.canDeleteEnvironments ?? false,
	canAccessToTraefikFiles: overrides.canAccessToTraefikFiles ?? false,
	canAccessToDocker: overrides.canAccessToDocker ?? false,
	canAccessToAPI: overrides.canAccessToAPI ?? false,
	canAccessToSSHKeys: overrides.canAccessToSSHKeys ?? false,
	canAccessToGitProviders: overrides.canAccessToGitProviders ?? false,
	user: { id: "user-1", email: "test@test.com" },
});

let memberToReturn: ReturnType<typeof mockMemberData> =
	mockMemberData("member");

let orgRolesToReturn: Array<{ organizationId: string; role: string; permission: string }> = [];

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
				findMany: vi.fn(() => Promise.resolve([])),
			},
			organizationRole: {
				findFirst: vi.fn(),
				findMany: vi.fn(() => Promise.resolve(orgRolesToReturn)),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

const { resolvePermissions } = await import(
	"@dokploy/server/services/permission"
);
const { statements } = await import(
	"@dokploy/server/lib/access-control"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	orgRolesToReturn = [];
});

describe("custom role permissions resolved from DB without license check", () => {
	it("custom role member gets granted permissions from DB row", async () => {
		memberToReturn = mockMemberData("deployer");
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "deployer",
				permission: JSON.stringify({
					deployment: ["read", "create", "cancel"],
					service: ["read"],
				}),
			},
		];
		const perms = await resolvePermissions(ctx);
		expect(perms.deployment.read).toBe(true);
		expect(perms.deployment.create).toBe(true);
		expect(perms.deployment.cancel).toBe(true);
		expect(perms.service.read).toBe(true);
	});

	it("custom role member gets false for actions not in role", async () => {
		memberToReturn = mockMemberData("deployer");
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "deployer",
				permission: JSON.stringify({ deployment: ["read"] }),
			},
		];
		const perms = await resolvePermissions(ctx);
		// deployer only has deployment.read — server.delete should be false
		expect(perms.server.delete).toBe(false);
		expect(perms.project.create).toBe(false);
	});

	it("custom role member merges duplicate permission rows", async () => {
		memberToReturn = mockMemberData("hybrid");
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "hybrid",
				permission: JSON.stringify({ service: ["read"] }),
			},
			{
				organizationId: "org-1",
				role: "hybrid",
				permission: JSON.stringify({ service: ["create"], deployment: ["read"] }),
			},
		];
		const perms = await resolvePermissions(ctx);
		// merged: service has read + create, deployment has read
		expect(perms.service.read).toBe(true);
		expect(perms.service.create).toBe(true);
		expect(perms.deployment.read).toBe(true);
	});
});

describe("owner/admin get full permissions through static role definitions", () => {
	it("owner gets true for deployment.read through static role (no bypass)", async () => {
		memberToReturn = mockMemberData("owner");
		const perms = await resolvePermissions(ctx);
		// ownerRole explicitly includes deployment.read
		expect(perms.deployment.read).toBe(true);
		expect(perms.deployment.create).toBe(true);
		expect(perms.server.read).toBe(true);
		expect(perms.server.delete).toBe(true);
	});

	it("admin gets true for server resources through static role", async () => {
		memberToReturn = mockMemberData("admin");
		const perms = await resolvePermissions(ctx);
		expect(perms.server.read).toBe(true);
		expect(perms.registry.read).toBe(true);
		expect(perms.auditLog.read).toBe(true);
	});

	it("owner gets all free-tier permissions as true", async () => {
		memberToReturn = mockMemberData("owner");
		const perms = await resolvePermissions(ctx);
		expect(perms.project.create).toBe(true);
		expect(perms.project.delete).toBe(true);
		expect(perms.service.create).toBe(true);
		expect(perms.service.read).toBe(true);
		expect(perms.service.delete).toBe(true);
		expect(perms.docker.read).toBe(true);
		expect(perms.traefikFiles.read).toBe(true);
		expect(perms.traefikFiles.write).toBe(true);
	});
});

describe("member role permissions resolved correctly", () => {
	it("member gets service.read=true", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.service.read).toBe(true);
	});

	it("member gets true for service-level resources included in memberRole", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.deployment.read).toBe(true);
		expect(perms.deployment.create).toBe(true);
		expect(perms.domain.read).toBe(true);
		expect(perms.backup.read).toBe(true);
		expect(perms.logs.read).toBe(true);
		expect(perms.monitoring.read).toBe(true);
	});

	it("member gets false for org-level resources not in memberRole", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.server.read).toBe(false);
		expect(perms.registry.read).toBe(false);
		expect(perms.certificate.read).toBe(false);
		expect(perms.destination.read).toBe(false);
		expect(perms.notification.read).toBe(false);
		expect(perms.auditLog.read).toBe(false);
	});

	it("member gets project.create=false without legacy override", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.project.create).toBe(false);
	});

	it("member gets project.create=true with canCreateProjects legacy override", async () => {
		memberToReturn = mockMemberData("member", { canCreateProjects: true });
		const perms = await resolvePermissions(ctx);
		expect(perms.project.create).toBe(true);
	});

	it("member gets docker.read=false without legacy override", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.docker.read).toBe(false);
	});

	it("member gets docker.read=true with canAccessToDocker legacy override", async () => {
		memberToReturn = mockMemberData("member", { canAccessToDocker: true });
		const perms = await resolvePermissions(ctx);
		expect(perms.docker.read).toBe(true);
	});
});

describe("all statement resources are present in resolved permissions", () => {
	it("resolvePermissions returns an entry for every resource in statements", async () => {
		memberToReturn = mockMemberData("owner");
		const perms = await resolvePermissions(ctx);
		const resolvedResources = Object.keys(perms);
		const statementResources = Object.keys(statements);
		for (const resource of statementResources) {
			expect(resolvedResources).toContain(resource);
		}
	});
});
