// Moved to `components/order-entry/shared/column-picker` (Sep 2026), when the
// owner asked for the same control on All orders and Operations. Re-exported
// from here so the Order status board's import is unchanged; new callers
// should import from `shared/` directly.

export { ColumnPicker } from "@/components/order-entry/shared/column-picker";
