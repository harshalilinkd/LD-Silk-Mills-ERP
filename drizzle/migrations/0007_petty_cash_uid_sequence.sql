-- Hand-written: drizzle-kit does not model sequences, and the Petty Cash
-- reference number needs one.
--
-- WHY A SEQUENCE AND NOT max(id)+1: two people saving an expense in the same
-- second must not be handed the same reference. A sequence is atomic and
-- never returns a value twice, even when the surrounding transaction rolls
-- back — which is the right trade here. A gap in the numbering is harmless;
-- two entries sharing PC-2026-000123 is not.
--
-- Deliberately separate from the table's own `id` sequence so the reference a
-- person quotes and the internal row id can never be confused for each other.
CREATE SEQUENCE IF NOT EXISTS "ld_petty_cash"."transaction_uid_seq"
  AS bigint START WITH 1 INCREMENT BY 1 NO MAXVALUE NO CYCLE;
