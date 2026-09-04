import {
  boolean,
  date,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ld_help_slip's sibling: `goods_return`, mirrored QUERY-ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hand-mirrored from `github.com/mendoza0123/goods-return-system`'s
 * `db/schema.ts`, the same way `src/db/order-entry/schema.ts` mirrors the Order
 * Entry repo. **This repo must never generate or apply a migration against
 * `goods_return`** — `drizzle.config.ts` keeps `schemaFilter: ["ld_erp_core"]`,
 * which is what actually enforces it; this comment only explains why.
 *
 * ── THE SCHEMA IS LIVE, AND IT IS SOMEBODY ELSE'S ─────────────────────────
 *
 * Measured on 4 Sep 2026, before a line of this module was written:
 *
 *     returns          341     (64 posted, 277 received)
 *     return_items     391
 *     parties        5,562     brokers   389
 *     party_brokers  5,359     qualities 923
 *     transports       272     users       3
 *
 * A full JSON export of all eight tables sits outside the repository at
 * `_backups/goods_return_2026-09-04/`, with a MANIFEST recording those counts
 * and the sequence position. Re-check them after any change here.
 *
 * ── `return_display_seq` — THE MOST DANGEROUS OBJECT IN THIS MODULE ───────
 *
 * Every `LD-####` id comes from a Postgres SEQUENCE, not from `max(id) + 1`.
 * It stood at **356** with `LD-0355` issued when this was written.
 *
 * It is deliberately NOT declared in this file. Drizzle can model a sequence,
 * and modelling it here would put a `CREATE SEQUENCE … START WITH 1` into the
 * shape of anything that ever diffed this schema — which, on a mis-aimed push,
 * resets the counter and hands the next return an id that already exists. The
 * unique index on `display_id` then rejects it and entry stops dead.
 *
 * The one place it is referenced is a raw `nextval('goods_return.return_display_seq')`
 * inside `insertReturn`, which is exactly how the standalone app does it. Never
 * create, drop, alter or reset it.
 *
 * ── NO TRIGGERS, NO VIEWS, NO FUNCTIONS ──────────────────────────────────
 *
 * Verified against `pg_trigger`, `pg_proc` and `information_schema.views`: this
 * schema has none. Every rule lives in application code, which is why the port
 * is a genuine port. Do not add database-side logic here — the standalone app
 * is still live against these same tables and would not know about it.
 */
export const goodsReturn = pgSchema("goods_return");

// ─── enums ─────────────────────────────────────────────────────────────────

/**
 * `kalbadevi` is a THIRD role that the office-picker login never used, and it
 * is kept because the enum type in the live database has it. It labels as
 * "Head Office" alongside `admin`, and differs in one respect only: it cannot
 * reach master data. Nothing in the ERP grants it; it exists so a row already
 * carrying it still reads correctly.
 */
export const roleEnum = goodsReturn.enum("role", [
  "admin",
  "kalbadevi",
  "bhiwandi",
]);

/** "posted" is what every screen calls **Pending** — it means goods are in transit. */
export const returnStatusEnum = goodsReturn.enum("return_status", [
  "posted",
  "received",
]);

// ─── users ─────────────────────────────────────────────────────────────────

/**
 * The standalone app's own accounts: two shared office rows with no password
 * behind them and one real person. The ERP does NOT sign anybody in with these
 * — access comes from `ld_erp_core.users` plus a Goods Return role, the same
 * shape Order Entry and Help Slip use.
 *
 * The table is still mirrored because `returns.created_by` and
 * `returns.received_by` are foreign keys into it, and because the standalone
 * app remains live and continues to use it.
 */
export const users = goodsReturn.table("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  /** NEVER selected into anything that reaches a browser. */
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: roleEnum("role").notNull().default("kalbadevi"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── master data ───────────────────────────────────────────────────────────

/**
 * These four lists are Goods Return's own, and they STAY that way.
 *
 * The ERP has its own shared lists in `ld_order_entry.lookup_values`, and the
 * two overlap heavily — but every one of the 341 returns points at these rows
 * BY INTEGER ID. Moving the names into `lookup_values` would mean rewriting
 * those pointers on live records, which is the one class of change this port
 * rules out. So nothing was merged.
 *
 * What WAS done (4 Sep 2026, at the owner's instruction): every name here with
 * no equivalent in the ERP's list was ADDED to `lookup_values` — 1,014 rows,
 * insert-only, ids recorded in `_backups/goods_return_2026-09-04/masters-added.json`
 * so the batch is reversible. Equivalence was measured on the name stripped to
 * letters and digits, so "14 STAR." counted as already present because
 * "14 STAR" was, and the ERP list did not gain 928 punctuation twins.
 *
 * That is a ONE-WAY, ONE-TIME top-up, not a sync. These tables remain the
 * source of truth for this module.
 */
export const parties = goodsReturn.table("parties", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export const brokers = goodsReturn.table("brokers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

/**
 * Which brokers belong to which party — 5,359 pairs.
 *
 * This is what makes the entry form's Broker box fill in only after a Party is
 * chosen, and it is load-bearing: picking a broker who does not trade for that
 * party is the mistake the dependency exists to prevent.
 */
export const partyBrokers = goodsReturn.table(
  "party_brokers",
  {
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    brokerId: integer("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.partyId, t.brokerId] })],
);

export const qualities = goodsReturn.table("qualities", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export const transports = goodsReturn.table("transports", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

// ─── returns ───────────────────────────────────────────────────────────────

/**
 * One goods return. The whole module is this table plus its quality lines.
 *
 * ── THE TWO SETS OF CHARGES, AND WHY BOTH EXIST ──────────────────────────
 *
 * `transportValue` / `otherCharges` are what HEAD OFFICE expects to pay when it
 * records the return. `bhiwandiTransportValue` / `bhiwandiCharges` are what
 * BHIWANDI actually paid when the goods arrived. They are separate columns on
 * purpose: the difference between expected and actual is a real number the
 * business can report on, and overwriting one with the other would destroy it.
 *
 * `bhiwandiTransportValue` is the sheet's "Transport Value Entry From
 * BALASAHEB" and the detail screen still labels it that way — the name means
 * something to the people using it.
 *
 * ── created_by / received_by ARE NULL ON EVERY EXISTING ROW ──────────────
 *
 * All 341 of them, which is why every detail screen reads "Created by —". The
 * old login identified an OFFICE, never a person, so there was never a name to
 * record. The ERP fills these going forward; the old rows stay honest rather
 * than being back-filled with a guess.
 */
export const returns = goodsReturn.table("returns", {
  id: serial("id").primaryKey(),
  /** `LD-####`, from the sequence. Unique — see the header. */
  displayId: varchar("display_id", { length: 20 }).notNull().unique(),
  billNo: varchar("bill_no", { length: 100 }),
  entryFor: varchar("entry_for", { length: 100 }).notNull(),
  /** The lorry receipt / consignment number. */
  trackingNo: varchar("tracking_no", { length: 100 }),
  dated: date("dated").notNull(),
  /** The day it was sent to Bhiwandi — not the day it arrived. */
  postedOn: date("posted_on"),
  partyId: integer("party_id")
    .notNull()
    .references(() => parties.id),
  brokerId: integer("broker_id")
    .notNull()
    .references(() => brokers.id),
  transportId: integer("transport_id").references(() => transports.id),
  totalValue: numeric("total_value", { precision: 14, scale: 2 }),
  transportValue: numeric("transport_value", { precision: 14, scale: 2 }),
  otherCharges: numeric("other_charges", { precision: 14, scale: 2 }),
  returnReason: varchar("return_reason", { length: 255 }).notNull(),
  /** Only written when the reason is "Other" — the form requires it then. */
  customReason: text("custom_reason"),
  attachmentUrl: text("attachment_url"),
  status: returnStatusEnum("status").notNull().default("posted"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  receivedBy: integer("received_by").references(() => users.id),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  receivingNotes: text("receiving_notes"),
  bhiwandiTransportValue: numeric("bhiwandi_transport_value", {
    precision: 14,
    scale: 2,
  }),
  bhiwandiCharges: numeric("bhiwandi_charges", { precision: 14, scale: 2 }),
});

/**
 * The quality lines — what fabric came back, how many metres, how many pieces.
 *
 * `qualityName` is a SNAPSHOT taken at entry, alongside the `qualityId` foreign
 * key, and it is not redundant: it keeps a line readable if the master row is
 * ever renamed, and it carried the values that had no matching master row when
 * the data came off the original spreadsheet. Read it with a `coalesce` onto
 * the joined name, never on its own.
 *
 * `quantity` is `numeric(14,3)` — metres run to three decimals here.
 */
export const returnItems = goodsReturn.table("return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id")
    .notNull()
    .references(() => returns.id, { onDelete: "cascade" }),
  qualityId: integer("quality_id").references(() => qualities.id),
  qualityName: varchar("quality_name", { length: 255 }),
  quantity: numeric("quantity", { precision: 14, scale: 3 }),
  pieces: integer("pieces"),
});

// ─── inferred types ────────────────────────────────────────────────────────

export type GrUser = typeof users.$inferSelect;
export type Party = typeof parties.$inferSelect;
export type Broker = typeof brokers.$inferSelect;
export type Quality = typeof qualities.$inferSelect;
export type Transport = typeof transports.$inferSelect;
export type GoodsReturn = typeof returns.$inferSelect;
export type ReturnItem = typeof returnItems.$inferSelect;
export type ReturnStatus = (typeof returnStatusEnum.enumValues)[number];
