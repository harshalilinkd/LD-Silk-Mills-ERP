/**
 * The calendar helpers now live in `@/lib/dates`, shared with Petty Cash.
 *
 * They were written here first, and moved when a second module needed the same
 * answers: two copies of `todayIso()` would be two answers to what day it is
 * in Bhiwandi, which is the exact bug the module was written to avoid.
 *
 * This file stays as a re-export so every existing import keeps working and the
 * move touched no other file.
 */
export * from "@/lib/dates";
