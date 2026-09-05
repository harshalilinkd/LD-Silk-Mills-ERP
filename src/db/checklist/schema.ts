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
 * ── WHAT THE THREE MAIN TABLES ARE ───────────────────────────────────────
 *
 *   · a TASK is a standing duty — "check the dyeing register", assigned to one
 *     person, repeating on a frequency.
 *   · an OCCURRENCE is one dated instance of it. A daily task produces about
 *     300 of them a year. This is what people actually tick off, and it is
 *     generated in advance rather than computed on read.
 *   · the ARCHIVE holds occurrences aged out of the working set.
 *
 * ── THE ONE REAL DEPARTURE FROM THE ORIGINAL ─────────────────────────────
 *
 * That system keeps its own `doers` table — a second staff list with its own
 * emails, maintained by hand. This ERP deliberately has ONE People screen, and
 * a whole consolidation was done to remove exactly that kind of duplicate (14
 * records for one team, one person present in all three lists). So there is no
 * `doers` table: a task is assigned to an `ld_erp_core.users.id`, and being a
 * checklist administrator is a flag on `checklist_members` rather than a
 * separate account.
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

// ─── who takes part ────────────────────────────────────────────────────────

/**
 * A person's standing in the checklist module.
 *
 * NOT a staff list — the staff list is `ld_erp_core.users`. This says only
 * which of those people take part and which of them administer it. Somebody
 * with no row here can open the module (if granted it in Settings → Access)
 * and simply has nothing to do.
 *
 * `isAdmin` is module admin and is deliberately NOT the shell's admin flag:
 * CLAUDE.md is explicit that a shell administrator is not automatically a
 * module administrator, and the person who manages ERP accounts is not
 * necessarily the person who decides who checks the dyeing register.
 */
export const members = ldChecklist.table(
  "members",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    isAdmin: boolean("is_admin").notNull().default(false),
    /** Their department for this module — grouping on scorecards. */
    department: varchar("department", { length: 120 }),
    /**
     * Inactive KEEPS every completed row and stops future occurrences being
     * generated. Never delete a member who has ticked anything: the tick is
     * the record that the work was done.
     */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_members_active").on(t.active)],
);

// ─── the standing duties ───────────────────────────────────────────────────

export const tasks = ldChecklist.table(
  "tasks",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 300 }).notNull(),
    /** Who has to do it. An ERP account, not a separate checklist identity. */
    doerId: uuid("doer_id")
      .notNull()
      .references(() => users.id),
    frequency: frequencyEnum("frequency").notNull(),
    /**
     * The anchor for every calculation, not merely the first date. "Every 2nd
     * Tuesday" takes its weekday from here, and a monthly task takes its day
     * of the month from here — so changing it re-shapes the whole series.
     */
    startDate: date("start_date").notNull(),
    /** Open-ended when null; generation then stops at the year window. */
    endDate: date("end_date"),
    assignedBy: uuid("assigned_by").references(() => users.id),
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
  (t) => [index("idx_tasks_doer").on(t.doerId), index("idx_tasks_active").on(t.active)],
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
 * `taskName` is snapshotted here so a renamed or deleted task still reads
 * correctly in history — the same reason Goods Return snapshots its quality
 * names on the line.
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
    doerId: uuid("doer_id")
      .notNull()
      .references(() => users.id),
    taskName: varchar("task_name", { length: 300 }).notNull(),
    /** Denormalised from the task so the screens can group without a join. */
    frequency: frequencyEnum("frequency").notNull(),
    plannedDate: date("planned_date").notNull(),
    /** When it was actually ticked. On time means actual <= planned. */
    actualDate: date("actual_date"),
    /** Who ticked it — usually the doer, but an admin may tick on their behalf. */
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

export const tasksRelations = relations(tasks, ({ many }) => ({
  occurrences: many(occurrences),
}));

export const occurrencesRelations = relations(occurrences, ({ one }) => ({
  task: one(tasks, { fields: [occurrences.taskId], references: [tasks.id] }),
}));

// ─── inferred types ───────────────────────────────────────────────────────

export type ChecklistMember = typeof members.$inferSelect;
export type ChecklistTask = typeof tasks.$inferSelect;
export type Occurrence = typeof occurrences.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type Frequency = (typeof frequencyEnum.enumValues)[number];
