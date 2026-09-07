const serviceUrl = process.env.POLL_SERVICE_URL ?? "http://localhost:3000";
const tenantId = "clinic-training";

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${serviceUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${path} rejected: ${JSON.stringify(data)}`);
  return data;
}

await post("/tenants/onboard", { tenant_id: tenantId });
await post(`/tenants/${tenantId}/lifecycle`, { status: "active" });
const poll = await post("/admin/polls", {
  tenant_id: tenantId,
  question: "Which onboarding control needs a follow-up?",
  options: ["Access review", "Audit export", "Retention policy"],
});
const pollId = String(poll.poll_id);
await post(`/polls/${pollId}/token`, { participant_id: "facilitator-7" });
const result = await post(`/polls/${pollId}/votes`, { participant_id: "facilitator-7", option_index: 1 });
console.log(JSON.stringify({ poll_id: pollId, result }, null, 2));
