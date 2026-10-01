import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function BridgeArticle() {
  const accent = "#33C47C"

  return (
    <>
      <div className="mt-8 max-w-3xl mx-auto flex flex-wrap gap-2 justify-center px-2 md:px-0">
        {[
          { href: "#what-is", label: "What is a Bridge" },
          { href: "#why", label: "Why Peridot" },
          { href: "#supported", label: "Supported Chains" },
          { href: "#how", label: "How to Bridge" },
          { href: "#fees", label: "Fees & Slippage" },
          { href: "#security", label: "Security" },
          { href: "#paths", label: "Popular Paths" },
          { href: "#troubleshooting", label: "Troubleshoot" },
          { href: "#faq", label: "FAQ" },
        ].map((item) => (
          <a key={item.href} href={item.href}>
            <Badge
              className="cursor-pointer transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent, color: "white" }}
            >
              {item.label}
            </Badge>
          </a>
        ))}
      </div>

      <div className="mt-6 px-2 md:px-0 max-w-3xl mx-auto space-y-8">
        <section id="what-is" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>What Is a Cross-Chain Bridge?</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <p className="text-sm md:text-base text-muted-foreground">
            A cross-chain bridge lets you move crypto assets from one blockchain to another without
            centralized intermediaries. Instead of being locked to a single network’s fees, tooling,
            and liquidity, you can route value where it’s cheapest, fastest, or most useful. This
            solves common pain points like fragmented liquidity, high Layer-1 fees, and limited app
            access on a single chain. In short: bridge when you want your tokens to work harder on
            the chain that best fits your goals.
          </p>
        </section>

        <section id="why" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Why Use Peridot Bridge?</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">Single interface, multi-chain reach:</span> Bridge popular
              assets across leading ecosystems in one streamlined flow—no juggling multiple apps.
            </li>
            <li>
              <span className="font-medium">Fast routing and competitive fees:</span> Get efficient
              routes with transparent estimates for cost, slippage, and time to arrival.
            </li>
            <li>
              <span className="font-medium">Self-custodial by design:</span> You stay in control of
              your wallet and keys. Connect, approve, and confirm—simple and secure.
            </li>
            <li>
              <span className="font-medium">Security-minded approach:</span> We integrate reputable
              cross-chain infrastructure and continuously monitor for reliability and uptime.
            </li>
          </ul>
          <Alert className="mt-2" style={{ borderColor: accent, background: "#5e794515" }}>
            <AlertTitle style={{ color: accent }}>Pro tip</AlertTitle>
            <AlertDescription>
              If you are new to bridging, start with a small test transfer to build confidence before
              sending larger amounts.
            </AlertDescription>
          </Alert>
        </section>

        <section id="supported" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Supported Networks and Assets</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <p className="text-sm md:text-base text-muted-foreground">
            Peridot Bridge supports a growing list of chains—commonly including Ethereum, Arbitrum,
            Base, Polygon, Avalanche, and more—plus widely used assets like USDC, USDT, WETH, and
            WBTC. Availability is dynamic and can vary by route and amount; the widget above shows
            current options in real time.
          </p>
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-1">
            <li>Select the same stablecoin on both sides (e.g., USDC → USDC).</li>
            <li>Adjust the amount slightly to unlock new routes.</li>
            <li>Swap into a more liquid asset first, then bridge.</li>
          </ul>
        </section>

        <section id="how" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>How to Bridge Tokens (Step-by-Step)</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ol className="list-decimal pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">Connect your wallet:</span> Choose your wallet and approve the
              connection. Make sure you have a small amount of the native token on your source chain to
              cover gas.
            </li>
            <li>
              <span className="font-medium">Choose source chain and token:</span> Pick the network and asset
              you’re sending from. Double-check your balance and approvals if prompted.
            </li>
            <li>
              <span className="font-medium">Choose destination chain and token:</span> Select where you want
              to arrive and, if needed, the asset you want to receive.
            </li>
            <li>
              <span className="font-medium">Review route, fees, and slippage:</span> The widget displays
              estimated fees, slippage tolerance, and ETA. Adjust slippage if you’re bridging volatile
              assets.
            </li>
            <li>
              <span className="font-medium">Confirm and track your transfer:</span> Approve transactions in
              your wallet and watch the progress indicator. You’ll see confirmations as your transfer
              finalizes.
            </li>
          </ol>
          <Alert className="mt-2" style={{ borderColor: accent, background: "#5e794515" }}>
            <AlertTitle style={{ color: accent }}>Pro tip</AlertTitle>
            <AlertDescription>
              Ensure you have a small amount of the destination chain’s native token ready to make your
              first transaction once funds arrive.
            </AlertDescription>
          </Alert>
        </section>

        <section id="fees" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Fees, Slippage, and Settlement Time</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">Fees:</span> Total cost includes source chain gas,
              bridging/routing fees, and sometimes a small relayer fee. We surface these estimates before
              you confirm.
            </li>
            <li>
              <span className="font-medium">Slippage:</span> If the route involves swaps, prices can move
              slightly. Set a reasonable slippage buffer; stablecoin routes typically need less.
            </li>
            <li>
              <span className="font-medium">Time to settle:</span> Many L2-to-L2 or L2-to-L1 routes complete
              in minutes. Congestion, large amounts, and security parameters can extend settlement.
            </li>
          </ul>
          <Alert className="mt-2" style={{ borderColor: accent, background: "#5e794515" }}>
            <AlertTitle style={{ color: accent }}>Speed tips</AlertTitle>
            <AlertDescription>
              Try smaller transfers during peak congestion, choose more liquid token pairs (like
              stablecoins), or select alternate destinations with lighter traffic.
            </AlertDescription>
          </Alert>
        </section>

        <section id="security" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Security and Risk Considerations</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-1">
            <li>Test small amounts first.</li>
            <li>Verify the destination chain and token before confirming.</li>
            <li>Keep enough native gas on both chains for approvals and follow-up actions.</li>
            <li>Watch status messages and avoid repeated approvals if a transaction is still pending.</li>
          </ul>
          <p className="text-sm md:text-base text-muted-foreground">
            Peridot works with established infrastructure providers and promotes best practices, but always
            use caution—especially with new or illiquid routes.
          </p>
        </section>

        <section id="paths" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Popular Bridging Paths and Examples</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">USDC: Ethereum → Arbitrum/Base/Polygon:</span> Common for
              lower fees and faster DeFi actions on L2s.
            </li>
            <li>
              <span className="font-medium">ETH: Base → Polygon:</span> Useful for accessing different dApps and
              liquidity pockets.
            </li>
            <li>
              <span className="font-medium">Stablecoin hops: L2 ↔ L2:</span> Often the fastest and cheapest when
              chasing yields or opportunities.
            </li>
          </ul>
          <p className="text-sm md:text-base text-muted-foreground">
            Guidance: For large transfers, consider splitting into smaller batches to manage slippage and
            reduce the chance of route changes mid-transaction.
          </p>
        </section>

        <section id="troubleshooting" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Troubleshooting & Common Issues</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">Transaction pending or stuck:</span> Check your wallet and block
              explorer for confirmations. If it’s still pending, wait a few minutes before taking further
              action.
            </li>
            <li>
              <span className="font-medium">Route unavailable:</span> Lower or slightly raise the amount, switch
              to a more liquid token, or try again later.
            </li>
            <li>
              <span className="font-medium">Destination gas shortage:</span> Acquire a small amount of the
              destination chain’s native token so you can move funds immediately after they arrive.
            </li>
            <li>
              <span className="font-medium">Approval loop:</span> If you’re repeatedly asked to approve, refresh,
              reconnect your wallet, and verify token allowances before retrying.
            </li>
          </ul>
          <p className="text-sm md:text-base text-muted-foreground">
            If you ever feel unsure, pause and confirm the details. Small test transfers are the best safety
            net.
          </p>
        </section>

        <section id="faq" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Frequently Asked Questions (FAQ)</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <Accordion type="single" collapsible>
            <AccordionItem value="item-1">
              <AccordionTrigger>What’s the difference between a swap and a bridge?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                A swap exchanges tokens on the same chain. A bridge moves tokens across different chains,
                sometimes with a swap on either side for liquidity.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How long do cross-chain transfers take?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Many complete within minutes, but times vary by chain congestion, amount, and route specifics.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Why is the received amount slightly different?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Slippage, routing, and network fees can cause minor differences. Estimates are shown before you
                confirm.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Do I need gas on the destination chain?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Yes. Keep a small amount of the destination chain’s native token to execute transactions once
                funds land.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>Are there limits or maximum amounts?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Limits can vary by token, chain, and route. If a transfer fails or a route is unavailable, try a
                smaller amount or a more liquid token.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-6">
              <AccordionTrigger>Which wallets are supported?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Most popular EVM wallets are supported. Connect your preferred wallet and follow the prompts in
                the widget.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <p className="text-sm md:text-base text-muted-foreground">
            Ready to move funds where the opportunities are best? Use the bridge above to route your assets
            across chains—fast, secure, and self-custodial.
          </p>
        </section>
      </div>
    </>
  )
}


