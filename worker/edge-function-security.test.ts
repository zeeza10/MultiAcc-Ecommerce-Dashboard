import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INVITATION_APP_ORIGIN,
  corsHeadersForInvitation,
  isAllowedInvitationOrigin,
  exceedsInvitationBodyLimit,
} from "../supabase/functions/manage-employee-invitation/request-guards";

describe("employee invitation function request guards", () => {
  it("allows the configured application origin and server-to-server calls", () => {
    assert.equal(isAllowedInvitationOrigin(INVITATION_APP_ORIGIN), true);
    assert.equal(isAllowedInvitationOrigin("http://localhost:5173"), true);
    assert.equal(isAllowedInvitationOrigin("http://127.0.0.1:5173"), true);
    assert.equal(isAllowedInvitationOrigin(null), true);
    assert.equal(isAllowedInvitationOrigin("https://attacker.example"), false);
  });

  it("does not emit wildcard CORS headers", () => {
    const allowed = corsHeadersForInvitation(INVITATION_APP_ORIGIN);
    const denied = corsHeadersForInvitation("https://attacker.example");
    assert.equal(allowed["Access-Control-Allow-Origin"], INVITATION_APP_ORIGIN);
    assert.equal(corsHeadersForInvitation("http://localhost:5173")["Access-Control-Allow-Origin"], "http://localhost:5173");
    assert.equal(denied["Access-Control-Allow-Origin"], undefined);
  });

  it("rejects a declared body larger than the configured limit", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Length": "32769" },
      body: "{}",
    });
    assert.equal(await exceedsInvitationBodyLimit(request, 32768), true);
  });

  it("rejects an oversized streamed body without Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(32769)); controller.close(); },
    });
    const request = new Request("https://example.com", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    assert.equal(await exceedsInvitationBodyLimit(request, 32768), true);
  });

  it("rejects a malformed Content-Length value", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Length": "not-a-number" },
      body: "{}",
    });
    assert.equal(await exceedsInvitationBodyLimit(request, 32768), true);
  });

  it("accepts a request body within the configured limit", async () => {
    const request = new Request("https://example.com", { method: "POST", body: "{}" });
    assert.equal(await exceedsInvitationBodyLimit(request, 32768), false);
  });
});
