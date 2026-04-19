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

// Mutable array so individual tests can override what findMany returns
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

const { checkPermission } = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	orgRolesToReturn = [];
});

describe("static admin/owner access granted by static role definitions (not bypass)", () => {
	it("owner passes deployment.read through static role definition", async () => {
		memberToReturn = mockMemberData("owner");
		// No enterprise-only bypass: owner passes because ownerRole includes deployment.read
		await expect(
			checkPermission(ctx, { deployment: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("admin passes backup.create through static role definition", async () => {
		memberToReturn = mockMemberData("admin");
		await expect(
			checkPermission(ctx, { backup: ["create"] }),
		).resolves.toBeUndefined();
	});

	it("owner passes server.delete through static role definition", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkPermission(ctx, { server: ["delete"] }),
		).resolves.toBeUndefined();
	});
});

describe("custom role authorizes enterprise-shaped resources without a license", () => {
	it("custom-role member with deployment.read permission passes without license", async () => {
		memberToReturn = mockMemberData("deployer");
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "deployer",
				permission: JSON.stringify({ deployment: ["read", "create"] }),
			},
		];
		await expect(
			checkPermission(ctx, { deployment: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("custom-role member with server.read permission passes without license", async () => {
		memberToReturn = mockMemberData("devops");
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "devops",
				permission: JSON.stringify({ server: ["read", "create", "delete"] }),
			},
		];
		await expect(
			checkPermission(ctx, { server: ["read"] }),
		).resolves.toBeUndefined();
	});
});

describe("missing custom role returns unauthorized", () => {
	it("member assigned to non-existent custom role is rejected", async () => {
		memberToReturn = mockMemberData("ghost-role");
		orgRolesToReturn = []; // no matching role in DB
		await expect(
			checkPermission(ctx, { service: ["read"] }),
		).rejects.toThrow();
	});

	it("custom role member denied action not in role permissions", async () => {
		memberToReturn = mockMemberData("read-only");
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "read-only",
				permission: JSON.stringify({ service: ["read"] }),
			},
		];
		await expect(
			checkPermission(ctx, { server: ["delete"] }),
		).rejects.toThrow();
	});
});

describe("static roles validate free-tier resources", () => {
	it("owner passes project.create", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkPermission(ctx, { project: ["create"] }),
		).resolves.toBeUndefined();
	});

	it("member fails project.create (no legacy override)", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { project: ["create"] }),
		).rejects.toThrow();
	});

	it("member passes service.read", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { service: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("member fails service.create", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { service: ["create"] }),
		).rejects.toThrow();
	});
});

describe("legacy boolean overrides for member", () => {
	it("member passes project.create with canCreateProjects=true", async () => {
		memberToReturn = mockMemberData("member", { canCreateProjects: true });
		await expect(
			checkPermission(ctx, { project: ["create"] }),
		).resolves.toBeUndefined();
	});

	it("member passes docker.read with canAccessToDocker=true", async () => {
		memberToReturn = mockMemberData("member", { canAccessToDocker: true });
		await expect(
			checkPermission(ctx, { docker: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("member fails docker.read with canAccessToDocker=false", async () => {
		memberToReturn = mockMemberData("member");
		await expect(checkPermission(ctx, { docker: ["read"] })).rejects.toThrow();
	});
});
