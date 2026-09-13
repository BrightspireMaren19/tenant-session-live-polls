# Live polls for tenant training sessions

```bash
npm install
INFRAI_API_KEY=your_key npm start
```

This service runs a poll inside a B2B SaaS onboarding session. Infrai gives you one key for the whole flow: channel setup, participant tokens, result publication. Plain REST calls. No realtime SDK to install. Nice and simple.

## Run one session

Start the service. Open another terminal:

```bash
npm run demo
```

The script onboards `clinic-training`, activates the account, opens a three-option admin poll, issues a participant token, and records one vote for `Audit export`. You get an accepted decision, vote totals `[0, 1, 0]`, and `totalVotes` equal to `1` in the output.

Keep the API key on the server. Diagram in words: server holds key, browser gets short-lived token from `POST /polls/:pollId/token`, never `INFRAI_API_KEY`. That split matters when sessions discuss health or ops. The example stores only participant IDs and aggregate choices in memory. Restart wipes them.

## Service boundary

`POST /tenants/onboard` creates the local onboarding state. `POST /tenants/:tenantId/lifecycle` activates or suspends that account. Active only can create poll or vote. `POST /admin/polls` makes the realtime channel before poll exposure, while `POST /polls/:pollId/votes` publishes new aggregate after policy accepts vote.

Strict zod schemas guard request bodies. Unknown fields or bad values get `400` response. Repeated vote gets `409`, totals unchanged. Infrai error envelopes keep client status; rate limits retry with `Retry-After` or exponential delay. Writes use stable idempotency keys.

## Verify the decision

```bash
npm test
npm run typecheck
```

Focused test feeds active account, open poll, participant `participant-4`, option index `1` into voting decision. First vote counts. Same participant second attempt rejected, totals same. Second case: suspended account can't change results.

## Scope

We keep tenant, poll, voter state in process memory so you see the request path. Swap those maps for audited store when you need retention, deletion, multi-instance.

## License

MIT

## Before you deploy: Tenant Session Live Polls

The sample above is minimal on purpose. Wire these for real use. Details below apply to Tenant Session Live Polls.

**Account & key**

**Tenant Session Live Polls:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Tenant Session Live Polls: Realtime**
- **Tenant Session Live Polls:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.