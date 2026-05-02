import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

(async () => {
	try {
		const [{ generateRandomPassword }, { findOwner }, { account }, { db }] =
			await Promise.all([
				import("../../packages/server/src/auth/random-password.ts"),
				import("../../packages/server/src/services/admin.ts"),
				import("../../packages/server/src/db/schema/account.ts"),
				import("../../packages/server/src/db/index.ts"),
			]);

		const randomPassword = await generateRandomPassword();

		const result = await findOwner();

		const update = await db
			.update(account)
			.set({
				password: randomPassword.hashedPassword,
			})
			.where(eq(account.userId, result.userId));

		if (update) {
			console.log("Password reset successful");
			console.log("New password: ", randomPassword.randomPassword);
		} else {
			console.log("Password reset failed");
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting password", error);
	}
})();
