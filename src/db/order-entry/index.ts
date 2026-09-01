import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "@/db";
import * as orderEntrySchema from "./schema";

export const orderEntryDb = drizzle(sql, { schema: orderEntrySchema });
