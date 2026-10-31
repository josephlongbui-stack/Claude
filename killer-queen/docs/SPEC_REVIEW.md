# Spec review: ten gaps

1. Agents can edit the tests. The executor works inside the repo and can change
   test files or config until the command exits 0.
2. Tests that already pass. If the test command passes at the pinned commit
   before any agent runs, every agent "passes".
3. Sandbox network. The spec allows only package registries, but agent CLIs must
   reach their own model APIs.
4. "latest" agent versions. The packet example says "latest"; track records are
   per version.
5. No run limits. Only tests have a time limit; a stuck agent blocks settlement.
6. Infrastructure failures. A crashed container or rate-limited API would make
   Yes holders lose to infrastructure.
7. Closing-price rounding and pressure. round() of a half cent is undefined;
   thin books near close can be pushed.
8. Multiple accounts. Free faucet per account lets two accounts trade with each
   other to set prices or farm the leaderboard.
9. Signed results. The HMAC covers the body but no timestamp or run id.
10. Name and "$" on iOS. Trademark risk on the name; "$1,000" on an "exchange"
    reads as real-money gambling to App Review.
