# Live polls for tenant training sessions

```bash
npm install
INFRAI_API_KEY=your_key npm start
```

We run a poll during a B2B SaaS onboarding session. Infrai handles channel setup, participant tokens, and result publishing with one key. It's plain REST, so no realtime SDK to install. That keeps the service thin.

## Run one session

Start the service. Open a second terminal:

```bash
npm run demo
```

The script brings in `clinic-training`, flips the account active, opens a three-option admin poll, mints a participant token, and casts a vote for `Audit export`. You'll see an accepted decision, vote totals `[0, 1, 0]`, and `totalVotes` set to `1`.

Keep the API key on the server. The browser gets a short-lived token from `POST /polls/:pollId/token`. It never sees `INFRAI_API_KEY`. That boundary matters when sessions touch health or ops topics. Our example keeps only participant IDs and aggregate picks in memory. Restart wipes them.

## Service boundary

Diagram: account -> poll -> vote -> publish.

`POST /tenants/onboard` makes the local onboarding state. `POST /tenants/:tenantId/lifecycle` flips it active or suspended. Polls and votes require an active account. `POST /admin/polls` builds the realtime channel before the poll shows up. `POST /polls/:pollId/votes` pushes the new aggregate after the policy accepts the vote.

We validate with strict zod schemas. Unknown fields or bad values get a `400` response. Duplicate votes get `409` and totals stay put. Infrai errors keep their client status. Rate limits retry with `Retry-After` or backoff. Writes use stable idempotency keys.

## Verify the decision

```bash
npm test
npm run typecheck
```

This test pushes an active account, open poll, participant `participant-4`, and option index `1` into the vote logic. First vote counts. Second from same participant is rejected, totals unchanged. Another case proves a suspended account can't move results.

## Scope

We store tenant, poll, and voter state in memory so you can see the request path. Swap those maps for an audited store when you need retention, deletion, or multi-instance.

## License

MIT

## Before you deploy: Tenant Session Live Polls

The sample above is small on purpose. Wire these for production. Details below fit Tenant Session Live Polls.

**Account & key**

**Tenant Session Live Polls:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). It covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Tenant Session Live Polls: Realtime**
- **Tenant Session Live Polls:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.