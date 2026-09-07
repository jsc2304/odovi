# TeslaMate compatibility

Odovi v0.3.0 retains support for TeslaMate **v4.0.1 through v4.2.0**. The lower and upper
boundaries run in CI against schema fixtures generated from the official
TeslaMate images. Each boundary test first probes the complete source-schema
contract and then executes every SQL query used by synchronization.
The queries run as a non-owner role with SELECT-only grants, not as the fixture
administrator. The tests also verify that this role has no write privileges.

| TeslaMate version | Support status | Executable evidence |
| --- | --- | --- |
| v4.0.1 | Supported | lower-boundary schema fixture, probe, and all sync queries |
| v4.0.2 through v4.1.x | Supported range | bounded by the tested endpoints; not every patch has its own fixture |
| v4.2.0 | Supported | upper-boundary schema fixture, probe, and all sync queries |
| v2.1.0 | Unsupported | outside the tested range; no support claim |
| Any other version | Untested compatibility candidate | not supported until its boundary evidence is added and passes CI |

Passing the schema probe on a version outside the table does not turn that
version into a supported release. It only means the fields currently read by
Odovi look compatible.

## Startup probe

Before the first synchronization, the worker verifies every table, column,
PostgreSQL type, and foreign-key relationship used by its TeslaMate queries. An
incomplete or incompatible schema stops the worker before data is synchronized
and reports the exact missing field, wrong type, or relationship.

Foreign-key metadata is read from PostgreSQL's system catalog: the
`information_schema.table_constraints` view intentionally hides it from roles
that only have SELECT privileges. No additional TeslaMate privileges are needed.
See the PostgreSQL 17 documentation for
[table constraints](https://www.postgresql.org/docs/17/infoschema-table-constraints.html)
and [the constraint catalog](https://www.postgresql.org/docs/17/catalog-pg-constraint.html).

Run both disposable boundary fixtures locally:

```bash
pnpm test:teslamate-compatibility
```

Run one boundary:

```bash
./scripts/test-teslamate-compatibility.sh 4.2.0
```

The runner starts its own temporary PostgreSQL container and deletes it on exit.
It does not connect to a productive TeslaMate instance.
