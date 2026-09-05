import { relations } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "@/db/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ld_checklist_system — recurring duties, and whether they got done
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A rebuild of `github.com/harshalilinkd/Checklist_System`, which runs live at
 * Linkd Prints. **No data comes from there.** That company's system, its
 * database and its people are untouched — this is a new, empty schema for LD
 * Silk Mills, and the two never meet.
 *
 * ── THIS SCHEMA IS OURS, UNLIKE THE OTHER PORTED ONES ────────────────────
 *
 * `ld_order_entry`, `ld_help_slip` and `goods_return` are all shared with a
 * live standalone app, which is why this repo may never migrate them. This one
 * is different: nothing else reads or writes it, so it is added to
 * `drizzle.config.ts`'s `schemaFilter` and managed with ordinary migrations —
 * the same standing `ld_erp_core` has.
 *
 * ── WHAT THE FOUR TABLES ARE ─────────────────────────────────────────────
 *
 *   · a DOER is a person duties are assigned to.
 *   · a TASK is a standing duty — "check the dyeing register", assigned to one
 *     doer, repeating on a frequency.
 *   · an OCCURRENCE is one dated instance of it. A daily task produces about
 *     300 of them a year. This is what people actually tick off, and it is
 *     generated in advance rather than computed on read.
 *   · a HOLIDAY is a date the generator skips.
 *
 * ── WHY THERE IS A `doers` TABLE AT ALL ──────────────────────────────────
 *
 * An earlier draft of this file had no such table: a task pointed straight at
 * `ld_erp_core.users`, on the reasoning that this ERP deliberately keeps ONE
 * People screen and a whole consolidation was done to remove duplicate staff
 * lists. That was wrong for this module, for a plain reason — **most people
 * with a duty on a checklist have no reason to hold an ERP login.** A folder
 * whose job is to fold does not need an account to be accountable for folding.
 * Forcing one would mean creating dozens of logins nobody would ever use, and
 * granting each of them a password into a system holding order values.
 *
 * So a doer is its own row, and `userId` links it to an ERP account only when
 * that person happens to have one. When they do, signing into the ERP finds
 * them by email and shows them their own list; when they do not, an
 * administrator ticks work off on their behalf. The two lists stay honest
 * about being different things: `ld_erp_core.users` is who can sign in, and
 * this is who is accountable.
 *
 * ── THERE IS NO ARCHIVE TABLE, AND THAT IS DELIBERATE ────────────────────
 *
 * The original moves Done rows older than thirty days into an `archive` table
 * and then has to UNION the two back together in every report — which is where
 * most of the complexity in its scorecard query comes from. At roughly two to
 * three thousand occurrences a year, that split buys nothing here and costs a
 * whole class of bug where a figure silently omits the archived half.
 */
export const ldChecklist = pgSchema("ld_checklist_system");

/**
 * How often a task repeats. Codes are the original's, kept verbatim so anybody
 * moving between the two systems reads the same letters:
 *
 *   D  daily          W  weekly           F  fortnightly
 *   M  monthly        Q  quarterly        Y  yearly
 *   SM twice a month (the 1st and the 15th)
 *   E1ST..E4TH  the nth weekday of the month, taken from the start date's
 *               weekday — "every 2nd Tuesday"
 *   ELAST       the last such weekday of the month
 */
export const frequencyEnum = ldChecklist.enum("frequency", [
  "D",
  "W",
  "F",
  "M",
  "Q",
  "Y",
  "SM",
  "E1ST",
  "E2ND",
  "E3RD",
  "E4TH",
  "ELAST",
]);

/**
 * Only two are ever STORED. The other three the screens show — Today, Delayed,
 * Upcoming Focus — are derived from the planned date at read time, exactly as
 * the original derives them in SQL.
 *
 * Storing them would mean every row needing a nightly sweep to stay truthful,
 * and a missed sweep showing yesterday's "Today". A date comparison cannot go
 * stale.
 */
export const occurrenceStatusEnum = ldChecklist.enum("occurrence_status", [
  "Scheduled",
  "Done",
]);

// ─── the people ────────────────────────────────────────────────────────────

/**
 * Somebody duties can be assigned to. See the header for why this is its own
 * table rather than a pointer into `ld_erp_core.users`.
 *
 * `isAdmin` is CHECKLIST admin and is deliberately not the shell's admin flag.
 * CLAUDE.md is explicit that a shell administrator is not automatically a
 * module administrator, and the person who manages ERP accounts is not
 * necessarily the person who decides who checks the dyeing register.
 *
 * `email` is the join to the rest of the ERP and is stored lowercased, because
 * that is the only way a case-different address typed into a bulk import still
 * finds the same person. It is unique for the same reason: two rows for one
 * address would split that person's scorecard in half without ever erroring.
 */
export const doers = ldChecklist.table(
  "doers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    /** Lowercased on write. The identity — see above. */
    email: varchar("email", { length: 255 }).notNull(),
    department: varchar("department", { length: 120 }),
    /**
     * Their ERP account, when they have one. Null is the normal case, not an
     * error state: it means this person is accountable for work but does not
     * sign in. Resolved by email whenever an ERP user opens the module, so a
     * login created later links itself without anybody editing this row.
     */
    userId: uuid("user_id").references(() => users.id),
    isAdmin: boolean("is_admin").notNull().default(false),
    /**
     * Inactive KEEPS every completed row and stops future occurrences being
     * generated. Never delete a doer who has ticked anything: the tick is the
     * record that the work was done.
     */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_doer_email").on(t.email),
    uniqueIndex("uq_doer_user").on(t.userId),
    index("idx_doers_active").on(t.active),
  ],
);

// ─── the standing duties ───────────────────────────────────────────────────

export const tasks = ldChecklist.table(
  "tasks",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 300 }).notNull(),
    doerId: integer("doer_id")
      .notNull()
      .references(() => doers.id),
    frequency: frequencyEnum("frequency").notNull(),
    /**
     * The anchor for every calculation, not merely the first date. "Every 2nd
     * Tuesday" takes its weekday from here, and a monthly task takes its day
     * of the month from here — so changing it re-shapes the whole series.
     */
    startDate: date("start_date").notNull(),
    /** Open-ended when null; generation then stops at the financial year end. */
    endDate: date("end_date"),
    /**
     * Free text, as it is in the original — "Harshali", "Head office". Who
     * asked for the duty is a note on the record, not a foreign key: the
     * person who set a task may have left, and the task is still theirs.
     */
    assignedBy: varchar("assigned_by", { length: 160 }),
    notes: text("notes"),
    /**
     * Inactive stops NEW occurrences being generated and leaves everything
     * already generated alone. Turning a task off should not erase the record
     * of the times it was done.
     */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_tasks_doer").on(t.doerId),
    index("idx_tasks_active").on(t.active),
  ],
);

// ─── the dated instances people tick off ──────────────────────────────────

/**
 * One row per date a task is due. This is the checklist.
 *
 * ── WHY THEY ARE GENERATED, NOT COMPUTED ─────────────────────────────────
 *
 * A daily task produces roughly 300 rows a year and could in principle be
 * worked out on the fly from the frequency. It is not, for one reason that
 * matters more than storage: **a tick has to attach to something.** Marking a
 * date done, and later asking whether it was on time, needs a row that exists
 * before it is ticked. Deriving the schedule on read would leave nowhere to
 * record the answer.
 *
 * `taskName` and `frequency` are snapshotted here so a renamed or deleted task
 * still reads correctly in history — the same reason Goods Return snapshots
 * its quality names on the line.
 */
export const occurrences = ldChecklist.table(
  "occurrences",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /**
     * `{taskId}_{plannedDate}`. Unique, and it is what makes generation safe
     * to re-run: regenerating a task's series inserts on conflict do nothing,
     * so an existing tick is never overwritten by a fresh schedule.
     */
    occurrenceKey: varchar("occurrence_key", { length: 80 }).notNull(),
    // `integer`, NOT `serial`. A serial here would give the foreign-key column
    // its own sequence and a default drawn from it — so an insert that omitted
    // the task id would silently point at whatever number came next instead of
    // failing. It is a reference, and references have no defaults.
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    doerId: integer("doer_id")
      .notNull()
      .references(() => doers.id),
    taskName: varchar("task_name", { length: 300 }).notNull(),
    /** Denormalised from the task so the screens can group without a join. */
    frequency: frequencyEnum("frequency").notNull(),
    plannedDate: date("planned_date").notNull(),
    /** When it was actually ticked. On time means actual <= planned. */
    actualDate: date("actual_date"),
    /**
     * The ERP account that clicked Done — usually the doer themselves, but an
     * administrator may tick on behalf of somebody with no login, which is the
     * ordinary case for shop-floor duties. Null on rows still Scheduled.
     */
    completedBy: uuid("completed_by").references(() => users.id),
    status: occurrenceStatusEnum("status").notNull().default("Scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_occurrence_key").on(t.occurrenceKey),
    index("idx_occ_planned").on(t.plannedDate),
    index("idx_occ_doer_planned").on(t.doerId, t.plannedDate),
    index("idx_occ_task").on(t.taskId),
  ],
);

// ─── non-working days ─────────────────────────────────────────────────────

/**
 * Days no occurrence is scheduled on.
 *
 * SUNDAYS ARE NOT IN HERE. They are excluded by the generator itself, so
 * nobody has to enter fifty-two rows a year and forget the fifty-third. This
 * table is for the extra days — Diwali, Republic Day, a shutdown week.
 */
export const holidays = ldChecklist.table(
  "holidays",
  {
    id: serial("id").primaryKey(),
    holidayDate: date("holiday_date").notNull().unique(),
    name: varchar("name", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_holidays_date").on(t.holidayDate)],
);

// ─── relations ────────────────────────────────────────────────────────────

export const doersRelations = relations(doers, ({ many }) => ({
  tasks: many(tasks),
  occurrences: many(occurrences),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  doer: one(doers, { fields: [tasks.doerId], references: [doers.id] }),
  occurrences: many(occurrences),
}));

export const occurrencesRelations = relations(occurrences, ({ one }) => ({
  task: one(tasks, { fields: [occurrences.taskId], references: [tasks.id] }),
  doer: one(doers, { fields: [occurrences.doerId], references: [doers.id] }),
}));

// ─── inferred types ───────────────────────────────────────────────────────

export type Doer = typeof doers.$inferSelect;
export type ChecklistTask = typeof tasks.$inferSelect;
export type Occurrence = typeof occurrences.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type Frequency = (typeof frequencyEnum.enumValues)[number];
