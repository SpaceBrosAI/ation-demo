import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

export const db = new Kysely<{}>({
	dialect: new SqliteDialect({
		database: async () => new Database("db.sqlite"),
	}),
});
