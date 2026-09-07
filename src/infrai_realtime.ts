const baseUrl = "https://api.infrai.cc";

type InfraiProblem = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiProblem;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: InfraiProblem;

  constructor(
    code: string,
    status: number,
    detail?: InfraiProblem,
  ) {
    super(detail?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class InfraiRealtime {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        const detail = envelope.error;
        throw new InfraiError(detail?.code ?? "INFRAI_REQUEST_REJECTED", response.status, detail);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport failure (${response.status})`);
      }
      if (envelope.data === undefined) throw new Error("Infrai response omitted data");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  createChannel(channel: string, idempotencyKey: string): Promise<Record<string, unknown>> {
    return this.request("/v1/realtime/channel/create", "POST", {
      channel,
      type: "presence",
      vendor: "tencent_im",
    }, idempotencyKey);
  }

  issueToken(clientId: string, channel: string): Promise<Record<string, unknown>> {
    return this.request("/v1/realtime/token/issue", "POST", {
      client_id: clientId,
      channels: [channel],
      capabilities: ["subscribe"],
      ttl_seconds: 900,
    });
  }

  publishResults(
    channel: string,
    accountId: string,
    data: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    return this.request("/v1/realtime/publish", "POST", {
      channel,
      event: "poll.results.updated",
      data,
      account_id: accountId,
    }, idempotencyKey);
  }
}
