Order Entry backup — 2026-09-10T10-44-41

Taken before importing the old Google Sheet. Read-only copy of every table
the two importers can write to, plus the two config tables they read.

  customer_orders        350 rows
  order_line_items       6460 rows
  line_stage_progress    51680 rows
  design_database        6474 rows
  workflow_stages        8 rows
  lookup_values          15014 rows

To put a bad import back: the orders that were added are the ones whose
order_no is NOT in customer_orders.json. Delete design_database rows by
order_no FIRST (its order_id is ON DELETE SET NULL, so they survive the
order and would be left pointing at nothing), then delete the orders —
lines and stage rows cascade.

The status import only ever ticks stages; line_stage_progress.json holds
every is_done / actual_at / delay_minutes / stock_status as it was.