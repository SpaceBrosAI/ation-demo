import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

export const db = new Kysely<DB>({
	dialect: new SqliteDialect({
		database: new Database("db.sqlite"),
	}),
});

export type DB = {
	references: {
		id: string;
		url: string;
		quote: string;
		note: string;
	};

	knowledge: {
		id: string;
		created_at: string;
		use_when: string;
		content: string;
	};
};

export async function initDB() {
	await db.schema
		.createTable("references")
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("url", "text", (col) => col.notNull())
		.addColumn("quote", "text", (col) => col.notNull())
		.addColumn("note", "text", (col) => col.notNull())
		.execute();

	await db.schema
		.createTable("knowledge")
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("created_at", "text", (col) => col.notNull())
		.addColumn("use_when", "text", (col) => col.notNull())
		.addColumn("content", "text", (col) => col.notNull())
		.execute();
}
