/**
 * These pieces now live in `@/components/ui/module-parts`, shared with Petty
 * Cash. They were written here first and moved when a second module needed the
 * same toolbar, filter panel and dialog — a second copy would be a second
 * chance to drift from `docs/DESIGN.md`.
 *
 * This file stays as a re-export so every existing Checklist import keeps
 * working and the move touched nothing else.
 */
export * from "@/components/ui/module-parts";
