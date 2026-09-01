import { db } from "./index";
import { systems, users, systemAccess } from "./schema";

// TODO_ORDER_ENTRY_URL — placeholder. The Phase 0 audit could not confirm
// Order Entry's real production Vercel URL (no Vercel dashboard access in
// that session). A human must pull the actual URL from Vercel and replace
// this before go-live.
const TODO_ORDER_ENTRY_URL = "https://ld-order-entry.vercel.app";

// TODO_HELP_SLIP_URL — placeholder, same caveat as above, for Help Slip.
const TODO_HELP_SLIP_URL = "https://ld-help-slip.vercel.app";

const SYSTEMS = [
  {
    systemCode: "order-entry",
    systemName: "Order Entry",
    category: "sales" as const,
    status: "active" as const,
    openMode: "external" as const,
    applicationUrl: TODO_ORDER_ENTRY_URL,
    sortOrder: 1,
  },
  {
    systemCode: "help-slip",
    systemName: "Help Slip",
    category: "operations" as const,
    status: "active" as const,
    openMode: "external" as const,
    applicationUrl: TODO_HELP_SLIP_URL,
    sortOrder: 2,
  },
  {
    systemCode: "crr",
    systemName: "CRR",
    category: "sales" as const,
    status: "coming_soon" as const,
    openMode: "internal" as const,
    applicationUrl: null,
    sortOrder: 3,
  },
  {
    systemCode: "nbd",
    systemName: "NBD",
    category: "sales" as const,
    status: "coming_soon" as const,
    openMode: "internal" as const,
    applicationUrl: null,
    sortOrder: 4,
  },
  {
    systemCode: "crm",
    systemName: "CRM",
    category: "sales" as const,
    status: "coming_soon" as const,
    openMode: "internal" as const,
    applicationUrl: null,
    sortOrder: 5,
  },
  {
    systemCode: "scot",
    systemName: "SCOT",
    category: "operations" as const,
    status: "coming_soon" as const,
    openMode: "internal" as const,
    applicationUrl: null,
    sortOrder: 6,
  },
  {
    systemCode: "goods-return-lr",
    systemName: "Goods Return LR",
    category: "operations" as const,
    status: "coming_soon" as const,
    openMode: "internal" as const,
    applicationUrl: null,
    sortOrder: 7,
  },
  {
    systemCode: "petty-cash",
    systemName: "Petty Cash",
    category: "finance" as const,
    status: "coming_soon" as const,
    openMode: "internal" as const,
    applicationUrl: null,
    sortOrder: 8,
  },
];

const USERS = [
  { name: "Aditya Lohar", email: "aditya.linkd@gmail.com" },
  { name: "Aman Ahmed", email: "amandeolinkd@gmail.com" },
  { name: "Krupa Bhadra", email: "crmkrupa99@gmail.com" },
  { name: "Krishna", email: "deokrishna274@gmail.com" },
  { name: "Nikita Dhawde", email: "dhawdenikita25@gmail.com" },
  // Confirmed by human decision: same identity used in both Order Entry
  // and Help Slip — one ERP account for Harshali.
  { name: "Harshali Bhopale", email: "harshali.linkd@gmail.com" },
  { name: "Mahesh Gavhane", email: "maheshgavhane150@gmail.com" },
  // TODO: confirm naushi.linkdprints@gmail.com is her primary ERP login.
  // She also holds naushi500@gmail.com in Order Entry (both kept there
  // untouched); the ERP needs exactly one login identity for her.
  { name: "Naushi Tibrewala", email: "naushi.linkdprints@gmail.com" },
  { name: "Raghav Tibrewala", email: "raghavtibrewala96@gmail.com" },
  { name: "Snigdha Roy", email: "snigdha.deolinkd@gmail.com" },
  // Distinct Help Slip-only account — deliberately kept separate from the
  // harshali.linkd@gmail.com row above, not a duplicate.
  { name: "Harshali Bhopale (Help Slip only)", email: "harshalibhopale9138@gmail.com" },
];

async function seed() {
  console.log("Seeding systems...");
  const insertedSystems = await db
    .insert(systems)
    .values(SYSTEMS)
    .onConflictDoUpdate({
      target: systems.systemCode,
      set: {
        systemName: systems.systemName,
        category: systems.category,
        status: systems.status,
        openMode: systems.openMode,
        applicationUrl: systems.applicationUrl,
        sortOrder: systems.sortOrder,
        updatedAt: new Date(),
      },
    })
    .returning();
  console.log(`  ${insertedSystems.length} systems upserted.`);

  console.log("Seeding users...");
  const insertedUsers = await db
    .insert(users)
    .values(USERS)
    .onConflictDoUpdate({
      target: users.email,
      set: { name: users.name, updatedAt: new Date() },
    })
    .returning();
  console.log(`  ${insertedUsers.length} users upserted.`);

  const activeSystems = insertedSystems.filter((s) => s.status === "active");
  console.log(
    `Granting can_view on ${activeSystems.length} active systems (${activeSystems
      .map((s) => s.systemCode)
      .join(", ")}) to all ${insertedUsers.length} seeded users...`,
  );

  const accessRows = insertedUsers.flatMap((user) =>
    activeSystems.map((system) => ({
      userId: user.id,
      systemId: system.id,
      canView: true,
    })),
  );

  if (accessRows.length > 0) {
    await db
      .insert(systemAccess)
      .values(accessRows)
      .onConflictDoUpdate({
        target: [systemAccess.userId, systemAccess.systemId],
        set: { canView: true, updatedAt: new Date() },
      });
  }
  console.log(`  ${accessRows.length} system_access rows upserted.`);

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
