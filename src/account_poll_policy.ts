export type AccountStatus = "onboarding" | "active" | "suspended";

export type Poll = {
  id: string;
  tenantId: string;
  question: string;
  options: string[];
  votes: number[];
  voters: Set<string>;
  open: boolean;
};

export type VoteDecision =
  | { accepted: true; votes: number[]; totalVotes: number }
  | { accepted: false; reason: "account_inactive" | "poll_closed" | "duplicate_vote" };

export function decideVote(
  accountStatus: AccountStatus,
  poll: Poll,
  participantId: string,
  optionIndex: number,
): VoteDecision {
  if (accountStatus !== "active") return { accepted: false, reason: "account_inactive" };
  if (!poll.open) return { accepted: false, reason: "poll_closed" };
  if (poll.voters.has(participantId)) return { accepted: false, reason: "duplicate_vote" };

  poll.voters.add(participantId);
  poll.votes[optionIndex] += 1;
  return {
    accepted: true,
    votes: [...poll.votes],
    totalVotes: poll.voters.size,
  };
}
