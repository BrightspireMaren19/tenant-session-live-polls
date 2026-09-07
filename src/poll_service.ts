import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decideVote, type AccountStatus, type Poll } from "./account_poll_policy.ts";
import { InfraiError, InfraiRealtime } from "./infrai_realtime.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiRealtime(apiKey);
const accounts = new Map<string, AccountStatus>();
const polls = new Map<string, Poll>();

const onboardingBody = z.object({ tenant_id: z.string().min(1) }).strict();
const lifecycleBody = z.object({ status: z.enum(["active", "suspended"]) }).strict();
const pollBody = z.object({
  tenant_id: z.string().min(1),
  question: z.string().min(1).max(240),
  options: z.array(z.string().min(1).max(80)).min(2).max(8),
}).strict();
const tokenBody = z.object({ participant_id: z.string().min(1) }).strict();
const voteBody = z.object({ participant_id: z.string().min(1), option_index: z.number().int().nonnegative() }).strict();

async function jsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

function channelFor(pollId: string): string {
  return `session-poll-${pollId}`;
}

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (method === "POST" && path === "/tenants/onboard") {
      const input = onboardingBody.parse(await jsonBody(request));
      accounts.set(input.tenant_id, "onboarding");
      return reply(response, 201, { tenant_id: input.tenant_id, status: "onboarding" });
    }

    const lifecycleMatch = path.match(/^\/tenants\/([^/]+)\/lifecycle$/);
    if (method === "POST" && lifecycleMatch) {
      const input = lifecycleBody.parse(await jsonBody(request));
      const tenantId = decodeURIComponent(lifecycleMatch[1]);
      if (!accounts.has(tenantId)) return reply(response, 404, { error: "tenant_not_found" });
      accounts.set(tenantId, input.status);
      return reply(response, 200, { tenant_id: tenantId, status: input.status });
    }

    if (method === "POST" && path === "/admin/polls") {
      const input = pollBody.parse(await jsonBody(request));
      if (accounts.get(input.tenant_id) !== "active") return reply(response, 409, { error: "account_inactive" });
      const pollId = randomUUID();
      const poll: Poll = {
        id: pollId,
        tenantId: input.tenant_id,
        question: input.question,
        options: input.options,
        votes: input.options.map(() => 0),
        voters: new Set(),
        open: true,
      };
      await infrai.createChannel(channelFor(pollId), `poll-create:${pollId}`);
      polls.set(pollId, poll);
      return reply(response, 201, { poll_id: pollId, channel: channelFor(pollId), question: poll.question, options: poll.options });
    }

    const tokenMatch = path.match(/^\/polls\/([^/]+)\/token$/);
    if (method === "POST" && tokenMatch) {
      const input = tokenBody.parse(await jsonBody(request));
      const poll = polls.get(tokenMatch[1]);
      if (!poll) return reply(response, 404, { error: "poll_not_found" });
      const token = await infrai.issueToken(input.participant_id, channelFor(poll.id));
      return reply(response, 200, token);
    }

    const voteMatch = path.match(/^\/polls\/([^/]+)\/votes$/);
    if (method === "POST" && voteMatch) {
      const input = voteBody.parse(await jsonBody(request));
      const poll = polls.get(voteMatch[1]);
      if (!poll) return reply(response, 404, { error: "poll_not_found" });
      if (input.option_index >= poll.options.length) return reply(response, 400, { error: "option_out_of_range" });
      const decision = decideVote(accounts.get(poll.tenantId) ?? "suspended", poll, input.participant_id, input.option_index);
      if (!decision.accepted) return reply(response, 409, { error: decision.reason });
      await infrai.publishResults(
        channelFor(poll.id),
        poll.tenantId,
        { poll_id: poll.id, votes: decision.votes, total_votes: decision.totalVotes },
        `vote:${poll.id}:${input.participant_id}`,
      );
      return reply(response, 202, decision);
    }

    return reply(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) return reply(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof SyntaxError) return reply(response, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return reply(response, status, { error: error.code, detail: error.detail });
    }
    console.error(error);
    return reply(response, 500, { error: "internal_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Live poll service listening on http://localhost:${port}`));
