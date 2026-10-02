import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./dist/schema.js", "./dist/invoiceSchema.js"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
