---
name: new-endpoint
description: Recipe for adding or changing an HTTP route in src/server. Use for any API change.
---
1. zod schema for body, params and query; reject unknown fields.
2. Authenticate (Bearer API key, runner secret, or admin key) and check role.
3. Conflict check for anything that trades or comments.
4. Call the Venue service; never touch engine state directly.
5. Errors are { error, code } with a 4xx status; no stack traces.
6. HTTP test for success, each auth failure and each validation failure.
7. Update the sdk types and the spec's API table in docs/PRODUCT_SPEC.md if the
   contract changed (record why in docs/SPEC_DECISIONS.md).
