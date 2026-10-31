# Invariants

1. Conservation: sum of every account's cash and locked plus all market escrow
   equals total deposits, after every command.
2. Escrow: each market's escrow equals 100 cents times its open interest.
3. Net positions: no account holds Yes and No in the same market.
4. Locks: an account's locked funds equal the sum over its open orders of
   remaining quantity times (price + fee rate).
5. Settlement: escrow empties exactly; open orders are cancelled and unlocked at
   close.
6. Rejection is free: a rejected command leaves the state hash unchanged.
7. Determinism: replaying the journal produces a byte-identical state hash.
8. Conflicts: no order from the customer, the agent's maker org, staff or runner
   operators ever rests or fills.
9. Signed settlement: the chosen market settles only from a valid signed result
   for a task in running.
10. Durability: a command is acknowledged only after its journal row commits.
