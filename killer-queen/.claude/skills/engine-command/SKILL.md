---
name: engine-command
description: Recipe for adding or changing an exchange command (createTask, placeOrder, settle and the rest). Use for any change to how the engine changes state.
---
1. In the plan, write the command in the spec's terms: inputs, every
   validation rule, every effect on cash, locks, escrow and positions.
2. Tests first: happy path; each rejection leaves the state hash unchanged;
   conflicts; a property test mixing the new command with all others under
   assertInvariants.
3. Validation runs completely before any change. Apply effects only after
   validation passes.
4. Time and ids come from the command or the engine counter, never the clock.
5. Add the command to the journal, a replay test, and the golden journal;
   explain the new golden hash in docs/BUILD_LOG.md.
6. Expose it over HTTP only through the new-endpoint skill.
7. Run npm test, then the exchange-auditor subagent; fix every BLOCKER.
