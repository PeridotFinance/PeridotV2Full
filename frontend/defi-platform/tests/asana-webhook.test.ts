import crypto from "crypto"
import { describe, expect, it } from "vitest"
import {
  extractCandidates,
  verifyAgainstAnySecret,
  verifyHookSignature,
} from "@/lib/asana/webhook"

const SECRET = "test-hook-secret-not-real"

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

describe("verifyHookSignature", () => {
  const body = JSON.stringify({ events: [{ action: "changed" }] })

  it("accepts a correctly signed body", () => {
    expect(verifyHookSignature(sign(body), body, SECRET)).toBe(true)
  })

  it("accepts an uppercase hex signature", () => {
    expect(verifyHookSignature(sign(body).toUpperCase(), body, SECRET)).toBe(true)
  })

  it("rejects a body altered after signing", () => {
    expect(verifyHookSignature(sign(body), `${body} `, SECRET)).toBe(false)
  })

  it("rejects a signature made with a different secret", () => {
    expect(verifyHookSignature(sign(body, "other-secret"), body, SECRET)).toBe(false)
  })

  it("rejects a missing or malformed header without throwing", () => {
    expect(verifyHookSignature(null, body, SECRET)).toBe(false)
    expect(verifyHookSignature("", body, SECRET)).toBe(false)
    expect(verifyHookSignature("not-hex", body, SECRET)).toBe(false)
  })

  it("rejects when no secret is stored", () => {
    expect(verifyHookSignature(sign(body), body, "")).toBe(false)
  })
})

describe("verifyAgainstAnySecret", () => {
  const body = JSON.stringify({ events: [] })

  // Re-registering a webhook mints a new secret while the previous one may
  // still be delivering — both must validate during that overlap.
  it("accepts a delivery signed with a rotated-out secret", () => {
    expect(verifyAgainstAnySecret(sign(body, "old"), body, ["new", "old"])).toBe(true)
  })

  it("rejects when none of the stored secrets match", () => {
    expect(verifyAgainstAnySecret(sign(body, "other"), body, ["new", "old"])).toBe(false)
  })

  it("rejects when the secret list is empty", () => {
    expect(verifyAgainstAnySecret(sign(body), body, [])).toBe(false)
  })
})

describe("extractCandidates", () => {
  const completionEvent = (gid: string) => ({
    action: "changed",
    resource: { gid, resource_type: "task" },
    change: { field: "completed", action: "changed" },
  })

  const commentEvent = (storyGid: string, taskGid = "900") => ({
    action: "added",
    resource: { gid: storyGid, resource_type: "story", resource_subtype: "comment_added" },
    parent: { gid: taskGid, resource_type: "task" },
  })

  it("picks out tasks whose completed field changed", () => {
    expect(extractCandidates({ events: [completionEvent("111")] })).toEqual([
      { kind: "completed", taskGid: "111" },
    ])
  })

  it("picks out added comments with their parent task", () => {
    expect(extractCandidates({ events: [commentEvent("555", "900")] })).toEqual([
      { kind: "comment", storyGid: "555", taskGid: "900" },
    ])
  })

  it("keeps both kinds from one delivery, in order", () => {
    const body = { events: [completionEvent("111"), commentEvent("555")] }
    expect(extractCandidates(body).map((c) => c.kind)).toEqual(["completed", "comment"])
  })

  it("dedupes a resource repeated within one batched delivery", () => {
    const body = {
      events: [completionEvent("111"), completionEvent("111"), commentEvent("555"), commentEvent("555")],
    }
    expect(extractCandidates(body)).toHaveLength(2)
  })

  // A completion and a comment on the SAME task are different events and must
  // both survive — they only share a task gid, not an identity.
  it("does not collapse a comment into a completion on the same task", () => {
    const body = { events: [completionEvent("900"), commentEvent("555", "900")] }
    expect(extractCandidates(body)).toHaveLength(2)
  })

  it("nulls the task gid when the comment's parent is not a task", () => {
    const body = {
      events: [
        {
          action: "added",
          resource: { gid: "555", resource_type: "story", resource_subtype: "comment_added" },
          parent: { gid: "777", resource_type: "project" },
        },
      ],
    }
    expect(extractCandidates(body)).toEqual([{ kind: "comment", storyGid: "555", taskGid: null }])
  })

  it("ignores changes to other fields", () => {
    const body = {
      events: [
        {
          action: "changed",
          resource: { gid: "222", resource_type: "task" },
          change: { field: "assignee", action: "changed" },
        },
      ],
    }
    expect(extractCandidates(body)).toEqual([])
  })

  // The Events API (polling transport) omits resource_subtype entirely. Real
  // comments must still survive here; the handler discards system stories
  // after fetching them.
  it("keeps story events that arrive without a subtype", () => {
    const body = {
      events: [
        {
          action: "added",
          resource: { gid: "555", resource_type: "story" },
          parent: { gid: "900", resource_type: "task" },
        },
      ],
    }
    expect(extractCandidates(body)).toEqual([{ kind: "comment", storyGid: "555", taskGid: "900" }])
  })

  // System stories ("marked complete", "assigned to …") share the story type
  // and would otherwise duplicate every completion post.
  it("ignores system stories that are not comments", () => {
    const body = {
      events: [
        {
          action: "added",
          resource: { gid: "666", resource_type: "story", resource_subtype: "marked_complete" },
          parent: { gid: "900", resource_type: "task" },
        },
      ],
    }
    expect(extractCandidates(body)).toEqual([])
  })

  it("ignores non-task resources and non-changed actions", () => {
    const body = {
      events: [
        {
          action: "changed",
          resource: { gid: "333", resource_type: "story" },
          change: { field: "completed" },
        },
        {
          action: "added",
          resource: { gid: "444", resource_type: "task" },
          change: { field: "completed" },
        },
      ],
    }
    expect(extractCandidates(body)).toEqual([])
  })

  it("handles an empty or absent events array", () => {
    expect(extractCandidates({})).toEqual([])
    expect(extractCandidates({ events: [] })).toEqual([])
  })
})
