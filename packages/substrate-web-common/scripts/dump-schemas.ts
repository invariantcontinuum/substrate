/**
 * Dumps JSON Schema for zod models that must stay in lockstep with their
 * pydantic counterparts in `packages/substrate-common`. Consumed by
 * `scripts/check-contracts.sh` which diffs this output against the pydantic
 * `.model_json_schema()` dump.
 *
 * Keep the set of exported schemas in sync with the Python side — missing
 * or extra keys will surface as a diff and fail the gate.
 */
import { ErrorResponse, SseEvent } from "../src";

const out = {
  Event: SseEvent,
  ErrorResponse,
};

async function main() {
  const { zodToJsonSchema } = await import("zod-to-json-schema");
  const serialized: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(out)) {
    serialized[name] = zodToJsonSchema(schema, name);
  }
  process.stdout.write(JSON.stringify(serialized, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
