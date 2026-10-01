/**
 * Minimal ambient types for the `qrcode` browser build.
 *
 * The package's default entry (`qrcode`) resolves to a Node-only server build
 * that pulls in `fs`/`stream`, which breaks the browser bundle. Importing
 * `qrcode/lib/browser` keeps it to the canvas/svg renderers only. `@types/qrcode`
 * doesn't cover the subpath, so we declare just what we use here.
 */
declare module 'qrcode/lib/browser' {
  interface QRCodeToDataURLOptions {
    width?: number
    margin?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    color?: { dark?: string; light?: string }
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>

  const QRCode: { toDataURL: typeof toDataURL }
  export default QRCode
}
