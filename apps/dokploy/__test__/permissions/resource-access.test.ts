import { beforeEach, describe, expect, it, vi } from "vitest";

const makeMember = (
	role: string,
	{
		accessedProjects = [] as string[],
		accessedServices = [] as string[],
		accessedEnvironments = [] as string[],
	} = {},
) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects,
	accessedServices,
	accessedEnvironments,
	canCreateProjects: false,
	canDeleteProjects: false,
	canCreateServices: false,
	canDeleteServices: false,
	canCreateEnvironments: false,
	canDeleteEnvironments: false,
	canAccessToTraefikFiles: false,
	canAccessToDocker: false,
	canAccessToAPI: false,
	canAccessToSSHKeys: false,
	canAccessToGitProviders: false,
	user: { id: "user-1", email: "test@test.com" },
});

let memberToReturn = makeMember("member");
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

const {
	checkProjectAccess,
	checkServiceAccess,
	checkEnvironmentAccess,
	checkServicePermissionAndAccess,
} = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	orgRolesToReturn = [];
});

// ──────────────────────────────────────────────────────────────
// checkProjectAccess
// ──────────────────────────────────────────────────────────────

describe("checkProjectAccess — custom-role members respect accessedProjects", () => {
	it("owner bypasses accessedProjects restriction on delete", async () => {
		memberToReturn = makeMember("owner");
		await expect(
			checkProjectAccess(ctx, "delete", "proj-x"),
		).resolves.toBeUndefined();
	});

	it("admin bypasses accessedProjects restriction on delete", async () => {
		memberToReturn = makeMember("admin");
		await expect(
			checkProjectAccess(ctx, "delete", "proj-x"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with project.delete and matching projectId passes", async () => {
		memberToReturn = makeMember("editor", {
			accessedProjects: ["proj-a"],
		});
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "editor",
				permission: JSON.stringify({ project: ["delete"] }),
			},
		];
		await expect(
			checkProjectAccess(ctx, "delete", "proj-a"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with project.delete but non-matching projectId is rejected", async () => {
		memberToReturn = makeMember("editor", {
			accessedProjects: ["proj-a"],
		});
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "editor",
				permission: JSON.stringify({ project: ["delete"] }),
			},
		];
		await expect(
			checkProjectAccess(ctx, "delete", "proj-b"),
		).rejects.toThrow("You don't have access to this project");
	});

	it("custom-role member with project.delete and empty accessedProjects is rejected", async () => {
		memberToReturn = makeMember("editor", { accessedProjects: [] });
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "editor",
				permission: JSON.stringify({ project: ["delete"] }),
			},
		];
		await expect(
			checkProjectAccess(ctx, "delete", "proj-a"),
		).rejects.toThrow("You don't have access to this project");
	});
});

// ──────────────────────────────────────────────────────────────
// checkServiceAccess
// ──────────────────────────────────────────────────────────────

describe("checkServiceAccess — custom-role members respect accessedServices", () => {
	it("owner bypasses accessedServices restriction on read", async () => {
		memberToReturn = makeMember("owner");
		await expect(
			checkServiceAccess(ctx, "svc-x", "read"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with service.read and matching serviceId passes", async () => {
		memberToReturn = makeMember("viewer", { accessedServices: ["svc-1"] });
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "viewer",
				permission: JSON.stringify({ service: ["read"] }),
			},
		];
		await expect(
			checkServiceAccess(ctx, "svc-1", "read"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with service.read but non-matching serviceId is rejected", async () => {
		memberToReturn = makeMember("viewer", { accessedServices: ["svc-1"] });
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "viewer",
				permission: JSON.stringify({ service: ["read"] }),
			},
		];
		await expect(
			checkServiceAccess(ctx, "svc-other", "read"),
		).rejects.toThrow("You don't have access to this service");
	});

	it("custom-role member with service.create checks accessedProjects not accessedServices", async () => {
		// For 'create', checkServiceAccess checks accessedProjects (the projectId is passed as serviceId arg)
		memberToReturn = makeMember("creator", {
			accessedProjects: ["proj-1"],
			accessedServices: [],
		});
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "creator",
				permission: JSON.stringify({ service: ["create"] }),
			},
		];
		await expect(
			checkServiceAccess(ctx, "proj-1", "create"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with service.create but non-matching projectId is rejected", async () => {
		memberToReturn = makeMember("creator", {
			accessedProjects: ["proj-1"],
			accessedServices: [],
		});
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "creator",
				permission: JSON.stringify({ service: ["create"] }),
			},
		];
		await expect(
			checkServiceAccess(ctx, "proj-other", "create"),
		).rejects.toThrow("You don't have access to this project");
	});
});

// ──────────────────────────────────────────────────────────────
// checkEnvironmentAccess
// ──────────────────────────────────────────────────────────────

describe("checkEnvironmentAccess — custom-role members respect accessedEnvironments", () => {
	it("owner bypasses accessedEnvironments restriction on read", async () => {
		memberToReturn = makeMember("owner");
		await expect(
			checkEnvironmentAccess(ctx, "env-x", "read"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with environment.read and matching environmentId passes", async () => {
		memberToReturn = makeMember("env-viewer", {
			accessedEnvironments: ["env-1"],
		});
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "env-viewer",
				permission: JSON.stringify({ environment: ["read"] }),
			},
		];
		await expect(
			checkEnvironmentAccess(ctx, "env-1", "read"),
		).resolves.toBeUndefined();
	});

	it("custom-role member with environment.read but non-matching environmentId is rejected", async () => {
		memberToReturn = makeMember("env-viewer", {
			accessedEnvironments: ["env-1"],
		});
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "env-viewer",
				permission: JSON.stringify({ environment: ["read"] }),
			},
		];
		await expect(
			checkEnvironmentAccess(ctx, "env-other", "read"),
		).rejects.toThrow("You don't have access to this environment");
	});
});

// ──────────────────────────────────────────────────────────────
// checkServicePermissionAndAccess — deployment.read without license
// ──────────────────────────────────────────────────────────────

describe("checkServicePermissionAndAccess — custom role with deployment.read, no license", () => {
	it("custom-role member with deployment.read and service access passes without license", async () => {
		memberToReturn = makeMember("deployer", { accessedServices: ["svc-1"] });
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "deployer",
				permission: JSON.stringify({ deployment: ["read", "create"] }),
			},
		];
		await expect(
			checkServicePermissionAndAccess(ctx, "svc-1", { deployment: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("custom-role member with deployment.read but no service access is rejected", async () => {
		memberToReturn = makeMember("deployer", { accessedServices: [] });
		orgRolesToReturn = [
			{
				organizationId: "org-1",
				role: "deployer",
				permission: JSON.stringify({ deployment: ["read", "create"] }),
			},
		];
		await expect(
			checkServicePermissionAndAccess(ctx, "svc-1", { deployment: ["read"] }),
		).rejects.toThrow("You don't have access to this service");
	});
});
