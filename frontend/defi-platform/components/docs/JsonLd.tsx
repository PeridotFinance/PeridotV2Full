/**
 * Renders a JSON-LD graph into the document.
 *
 * A plain script tag rather than next/script: this has to be in the server-
 * rendered HTML, because a crawler that does not execute JavaScript is exactly
 * the reader the markup is for.
 */
export function JsonLd({ data, id }: { data: unknown; id: string }) {
  return (
    <script
      id={id}
      type="application/ld+json"
      // JSON.stringify output, not user input. The < escape keeps a stray
      // sequence in the data from closing the script tag early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}
