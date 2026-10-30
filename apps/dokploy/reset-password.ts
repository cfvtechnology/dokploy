import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

(async () => {
	try {
		const [{ generateRandomPassword }, { findOwner }, { account }, { user }, { db }] =
			await Promise.all([
				import("../../packages/server/src/auth/random-password"),
				import("../../packages/server/src/services/admin"),
				import("../../packages/server/src/db/schema/account"),
				import("../../packages/server/src/db/schema/user"),
				import("../../packages/server/src/db/index"),
			]);

		const email = process.argv[2]?.trim().toLowerCase();

		const randomPassword = await generateRandomPassword();

		let userId: string;

		if (email) {
			const foundUser = await db.query.user.findFirst({
				where: eq(user.email, email),
			});

			if (!foundUser) {
				console.log(`User not found for email: ${email}`);
				process.exit(1);
			}

			userId = foundUser.id;
		} else {
			const owner = await findOwner();
			userId = owner.userId;
		}

		const update = await db
			.update(account)
			.set({
				password: randomPassword.hashedPassword,
			})
			.where(
				and(eq(account.userId, userId), eq(account.providerId, "credential")),
			);

		if (update.count > 0) {
			console.log("Password reset successful");
			console.log("New password: ", randomPassword.randomPassword);
		} else {
			console.log(
				"Password reset failed: no credential account found for this user",
			);
			process.exit(1);
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting password", error);
		process.exit(1);
	}
})();
