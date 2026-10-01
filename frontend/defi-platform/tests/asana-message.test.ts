import { describe, expect, it } from "vitest"
import { buildCommentMessage, buildCompletionMessage, taskLine } from "@/lib/asana/message"
import type { AsanaStory, AsanaTask } from "@/lib/asana/client"

const task = (over: Partial<AsanaTask> = {}): AsanaTask => ({
  gid: "900",
  name: "Finish Multi Signing on Stellar",
  permalink_url: "https://app.asana.com/0/1/900",
  ...over,
})

describe("taskLine", () => {
  it("links the task and appends metadata", () => {
    expect(taskLine(task(), "Joshua", "In Review")).toBe(
      '<a href="https://app.asana.com/0/1/900">Finish Multi Signing on Stellar</a> — <i>Joshua · In Review</i>',
    )
  })

  it("omits the dash when there is no metadata", () => {
    expect(taskLine(task(), null, undefined)).toBe(
      '<a href="https://app.asana.com/0/1/900">Finish Multi Signing on Stellar</a>',
    )
  })

  // Asana names a board's default column "Untitled section"; surfacing it adds
  // nothing and looks like a bug to the reader.
  it("drops Asana's placeholder section names", () => {
    expect(taskLine(task(), "Joshua", "Untitled section")).toBe(
      '<a href="https://app.asana.com/0/1/900">Finish Multi Signing on Stellar</a> — <i>Joshua</i>',
    )
    expect(taskLine(task(), null, "(no section)")).toBe(
      '<a href="https://app.asana.com/0/1/900">Finish Multi Signing on Stellar</a>',
    )
  })

  it("escapes HTML in the task name so a title cannot break the markup", () => {
    expect(taskLine(task({ name: "Fix <b>bold</b> & \"quotes\"" }))).toContain(
      "Fix &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;",
    )
  })

  it("falls back to a constructed URL when permalink_url is absent", () => {
    expect(taskLine(task({ permalink_url: undefined }))).toContain(
      'href="https://app.asana.com/0/0/900"',
    )
  })
})

describe("buildCompletionMessage", () => {
  it("leads with the summary and credits whoever completed it", () => {
    const t = task({
      completed_by: { gid: "1", name: "Joshua Schiemann" },
      memberships: [{ section: { gid: "s", name: "In Review" } }],
    })
    expect(buildCompletionMessage(t, "Multi-Signing steht.")).toBe(
      "✅ <b>Multi-Signing steht.</b>\n\n" +
        '<a href="https://app.asana.com/0/1/900">Finish Multi Signing on Stellar</a> — <i>Joshua Schiemann · In Review</i>',
    )
  })

  // Rule- or integration-driven completions have no completed_by.
  it("falls back to the assignee when nobody is recorded as completer", () => {
    const t = task({ assignee: { gid: "2", name: "Rene" } })
    expect(buildCompletionMessage(t, "Fertig.")).toContain("<i>Rene</i>")
  })

  it("escapes HTML in the summary", () => {
    expect(buildCompletionMessage(task(), "a < b & c")).toContain("a &lt; b &amp; c")
  })
})

describe("buildCommentMessage", () => {
  const story = (over: Partial<AsanaStory> = {}): AsanaStory => ({
    gid: "555",
    resource_subtype: "comment_added",
    text: "Looks good to me",
    created_by: { gid: "1", name: "Joshua Schiemann" },
    ...over,
  })

  it("leads with the summary and links the parent task", () => {
    expect(buildCommentMessage(story(), task(), "Der Ansatz passt.")).toBe(
      "💬 <b>Der Ansatz passt.</b>\n\n" +
        '<a href="https://app.asana.com/0/1/900">Finish Multi Signing on Stellar</a> — <i>Joshua Schiemann</i>',
    )
  })

  // Comments can hang off projects or portfolios, which have no task to link.
  it("still posts when no parent task resolved", () => {
    expect(buildCommentMessage(story(), null, "Kurze Rückfrage.")).toBe(
      "💬 <b>Kurze Rückfrage.</b>\n\n<i>Joshua Schiemann</i>",
    )
  })

  it("omits the author line when the author is unknown", () => {
    expect(buildCommentMessage(story({ created_by: null }), null, "Hinweis.")).toBe(
      "💬 <b>Hinweis.</b>",
    )
  })
})
