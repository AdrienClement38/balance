import { pgTable, uuid, varchar, timestamp, integer, decimal, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  gender: varchar("gender", { length: 10 }).notNull(), // 'male' | 'female'
  birthdate: date("birthdate").notNull(),
  heightCm: integer("height_cm").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const measurements = pgTable("measurements", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }).notNull(),
  impedanceOhms: integer("impedance_ohms").notNull(),
  fatPct: decimal("fat_pct", { precision: 4, scale: 2 }),
  musclePct: decimal("muscle_pct", { precision: 4, scale: 2 }),
  waterPct: decimal("water_pct", { precision: 4, scale: 2 }),
  boneMassKg: decimal("bone_mass_kg", { precision: 4, scale: 2 }),
  bmr: integer("bmr"),
  visceralFat: integer("visceral_fat"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Journal des erreurs de pesée (échec d'enregistrement, impédance anormale, etc.)
export const errorLogs = pgTable("error_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  code: varchar("code", { length: 50 }).notNull(), // ex: 'low_impedance' | 'save_failed' | 'bluetooth'
  message: varchar("message", { length: 500 }).notNull(),
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }),
  impedanceOhms: integer("impedance_ohms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  profiles: many(profiles),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
  measurements: many(measurements),
  errorLogs: many(errorLogs),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
  profile: one(profiles, {
    fields: [measurements.profileId],
    references: [profiles.id],
  }),
}));

export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  profile: one(profiles, {
    fields: [errorLogs.profileId],
    references: [profiles.id],
  }),
}));
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Measurement = typeof measurements.$inferSelect;
export type NewMeasurement = typeof measurements.$inferInsert;
export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;
