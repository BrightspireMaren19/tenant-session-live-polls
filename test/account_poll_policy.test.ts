import test from "node:test";
import assert from "node:assert/strict";
import { decideVote, type Poll } from "../src/account_poll_policy.ts";

function poll(): Poll {
  return {
    id: "poll-1",
    tenantId: "tenant-1",
    question: "Ready?",
    options: ["Yes", "No"],
    votes: [0, 0],
    voters: new Set(),
    open: true,
  };
}

test("an active account counts one vote per participant", () => {
  const current = poll();
  assert.deepEqual(decideVote("active", current, "participant-4", 1), {
    accepted: true,
    votes: [0, 1],
    totalVotes: 1,
  });
  assert.deepEqual(decideVote("active", current, "participant-4", 0), {
    accepted: false,
    reason: "duplicate_vote",
  });
  assert.deepEqual(current.votes, [0, 1]);
});

test("a suspended account cannot change poll totals", () => {
  const current = poll();
  assert.deepEqual(decideVote("suspended", current, "participant-9", 0), {
    accepted: false,
    reason: "account_inactive",
  });
  assert.deepEqual(current.votes, [0, 0]);
});
