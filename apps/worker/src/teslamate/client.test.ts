import { describe, expect, it } from "vitest";
import {
  assertTeslamateSchemaCompatibility,
  REQUIRED_TESLAMATE_COLUMNS,
  REQUIRED_TESLAMATE_RELATIONSHIPS,
} from "./client.js";

function compatibleColumns() {
  return Object.entries(REQUIRED_TESLAMATE_COLUMNS).flatMap(([table, columns]) =>
    columns.map((column) => ({
      table_name: table,
      column_name: column.name,
      udt_name: column.postgresType,
    })),
  );
}

function compatibleRelationships() {
  return Object.entries(REQUIRED_TESLAMATE_RELATIONSHIPS).flatMap(
    ([table, relationships]) =>
      relationships.map((relationship) => ({
        table_name: table,
        column_name: relationship.column,
        foreign_table_name: relationship.referencesTable,
        foreign_column_name: relationship.referencesColumn,
      })),
  );
}

describe("TeslaMate schema compatibility contract", () => {
  it("accepts the complete runtime query contract and ignores unrelated additions", () => {
    expect(() =>
      assertTeslamateSchemaCompatibility(
        [
          ...compatibleColumns(),
          { table_name: "future_table", column_name: "future_column", udt_name: "text" },
        ],
        compatibleRelationships(),
      ),
    ).not.toThrow();
  });

  it("requires the independently reported charging end rated range", () => {
    expect(REQUIRED_TESLAMATE_COLUMNS.charging_processes).toContainEqual({ name: "end_rated_range_km", postgresType: "numeric" });
    const columns = compatibleColumns().filter((column) =>
      !(column.table_name === "charging_processes" && column.column_name === "end_rated_range_km"));
    expect(() => assertTeslamateSchemaCompatibility(columns, compatibleRelationships()))
      .toThrow("charging_processes.end_rated_range_km");
  });

  it("reports missing fields, wrong types, and missing relationships before sync", () => {
    const columns = compatibleColumns().filter(
      (column) => !(column.table_name === "states" && column.column_name === "start_date"),
    );
    const positionRange = columns.find(
      (column) =>
        column.table_name === "positions" && column.column_name === "rated_battery_range_km",
    );
    expect(positionRange).toBeDefined();
    positionRange!.udt_name = "text";

    const relationships = compatibleRelationships().filter(
      (relationship) =>
        !(
          relationship.table_name === "charges" &&
          relationship.column_name === "charging_process_id"
        ),
    );

    expect(() => assertTeslamateSchemaCompatibility(columns, relationships)).toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /states\.start_date.*positions\.rated_battery_range_km.*charges\.charging_process_id->charging_processes\.id.*v4\.0\.1 bis v4\.2\.0.*vor der Synchronisierung/s,
        ),
      }),
    );
  });
});
