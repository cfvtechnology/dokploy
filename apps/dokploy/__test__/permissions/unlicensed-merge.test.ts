import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	isCloud: false,
	hasValidLicense: vi.fn(async () => false),
	getWebServerSettings: vi.fn(),
	getAuditLogs: vi.fn(),
	checkPermission: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	get IS_CLOUD() {
		return mocks.isCloud;
	},
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organization: { findFirst: vi.fn(async () => ({ id: "org-a" })) },
		},
	},
}));
vi.mock("@dokploy/server/index", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));
vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));
vi.mock("@dokploy/server/services/proprietary/audit-log", () => ({
	getAuditLogs: mocks.getAuditLogs,
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	resolvePermissions: vi.fn(),
}));

const { getPublicWhitelabelingConfig } = await import(
	"@dokploy/server/services/proprietary/whitelabeling"
);
const { auditLogRouter } = await import(
	"@/server/api/routers/proprietary/audit-log"
);
const context = {
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-a", role: "owner" },
} as Parameters<typeof auditLogRouter.createCaller>[0];

beforeEach(() => {
	vi.clearAllMocks();
	mocks.isCloud = false;
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });
});

describe("self-hosted branding without a license", () => {
	it("returns public branding including the new light-theme fields", async () => {
		const config = {
			appName: "My deployment",
			appDescription: null,
			logoUrl: null,
			loginLogoUrl: null,
			faviconUrl: null,
			customCss: null,
			ogImageUrl: null,
			errorPageTitle: null,
			errorPageDescription: null,
			footerText: null,
			passwordResetGuide: null,
			supportEmail: null,
			dualModeBranding: true,
			logoLightUrl: "https://example.com/light.svg",
			loginLogoLightUrl: null,
			faviconLightUrl: null,
		};
		mocks.getWebServerSettings.mockResolvedValue({ whitelabelingConfig: config });
		await expect(getPublicWhitelabelingConfig()).resolves.toEqual(config);
		expect(mocks.hasValidLicense).not.toHaveBeenCalled();
	});

	it("keeps cloud branding unavailable", async () => {
		mocks.isCloud = true;
		await expect(getPublicWhitelabelingConfig()).resolves.toBeNull();
		expect(mocks.getWebServerSettings).not.toHaveBeenCalled();
	});
});

describe("audit logs without a license", () => {
	it("lists logs and exports with permission checks and organization scope", async () => {
		const caller = auditLogRouter.createCaller(context);
		await expect(caller.all({})).resolves.toEqual({
			logs: [], total: 0, exportLimit: 10_000,
		});
		await expect(caller.export({ action: "download" })).resolves.toEqual({
			logs: [], total: 0,
		});
		expect(mocks.getAuditLogs).toHaveBeenNthCalledWith(1, {
			organizationId: "org-a", limit: 50, offset: 0,
		});
		expect(mocks.getAuditLogs).toHaveBeenNthCalledWith(2, {
			organizationId: "org-a", action: "download", limit: 10_000,
		});
		expect(mocks.checkPermission).toHaveBeenCalledTimes(2);
		expect(mocks.checkPermission).toHaveBeenCalledWith(
			expect.anything(), { auditLog: ["read"] },
		);
		expect(mocks.hasValidLicense).not.toHaveBeenCalled();
	});

	it("rejects unauthorized reads and exports without fetching logs", async () => {
		mocks.checkPermission.mockRejectedValue(
			new TRPCError({ code: "UNAUTHORIZED", message: "Permission denied" }),
		);
		const caller = auditLogRouter.createCaller(context);
		await expect(caller.all({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(caller.export({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.getAuditLogs).not.toHaveBeenCalled();
	});
});
