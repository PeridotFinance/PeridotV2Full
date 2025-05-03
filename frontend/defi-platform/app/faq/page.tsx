import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function FAQ() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Frequently Asked Questions</h1>
            <p className="text-lg text-text/80 mb-8">
              Find answers to common questions about Peridot and how to use our platform.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">What is Peridot?</AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Peridot is a decentralized cross-chain lending and borrowing platform that enables users to earn
                  interest on their crypto assets and borrow against their collateral. The platform uses algorithmic
                  interest rates based on supply and demand to create efficient money markets for various crypto assets
                  across multiple blockchains.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">
                  How do I start using Peridot?
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  To start using Peridot, you need to connect your wallet (such as MetaMask, WalletConnect, or other
                  supported wallets) to our platform. Once connected, you can supply assets to earn interest or borrow
                  against your collateral. Visit our "Launch App" page and click on "Connect Wallet" to get started.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">
                  What blockchains does Peridot support?
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Peridot currently supports Ethereum, Polygon, Avalanche, Binance Smart Chain, Arbitrum, Optimism,
                  Solana, and more. We're continuously working to add support for additional blockchains to enhance
                  cross-chain functionality and provide users with more options.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">
                  How are interest rates determined?
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Interest rates on Peridot are determined algorithmically based on the utilization rate of each
                  asset. When demand for borrowing an asset is high (high utilization), interest rates increase to
                  incentivize more supply. When demand is low, rates decrease to encourage more borrowing. This dynamic
                  adjustment ensures optimal capital efficiency and fair rates for all users.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">What are cTokens?</AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  cTokens are interest-bearing tokens that represent your deposit in the Peridot protocol. When you
                  supply assets, you receive cTokens in return. These tokens automatically accumulate interest over
                  time, increasing in value relative to the underlying asset. When you want to withdraw your assets, you
                  redeem your cTokens for the original asset plus accrued interest.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">How does collateral work?</AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  When you supply assets to Peridot, they can be used as collateral for borrowing other assets. Each
                  asset has a collateral factor (between 0 and 1) that determines how much you can borrow against it.
                  For example, if ETH has a collateral factor of 0.75, you can borrow up to 75% of the value of your
                  supplied ETH. Maintaining a healthy collateral ratio is important to avoid liquidation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">
                  What is liquidation and how can I avoid it?
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Liquidation occurs when the value of your borrowed assets exceeds your allowed borrowing capacity due
                  to price fluctuations or accrued interest. To avoid liquidation, you should maintain a healthy buffer
                  in your collateral ratio by either supplying more assets as collateral or repaying part of your
                  borrowed assets. Regularly monitoring your borrowing capacity and market conditions is recommended.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-8" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">Is Peridot secure?</AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Peridot prioritizes security through multiple measures: our smart contracts have undergone rigorous
                  security audits by leading firms, we implement robust risk management protocols, and we maintain a
                  conservative approach to collateral factors. Additionally, our non-custodial architecture means users
                  always maintain control of their assets. However, as with any DeFi protocol, there are inherent risks,
                  and users should do their own research before participating.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-9" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">
                  How does cross-chain functionality work?
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Peridot's cross-chain functionality allows users to supply assets on one blockchain and borrow on
                  another without manually bridging assets. This is achieved through a combination of cross-chain
                  messaging protocols, liquidity pools on each supported chain, and our proprietary bridging technology.
                  The process is seamless for users, who can interact with assets across multiple blockchains from a
                  single interface.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-10" className="bg-card border border-border/50 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-medium py-4">How is Peridot governed?</AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  Peridot is governed by a decentralized autonomous organization (DAO) where token holders can propose
                  and vote on changes to the protocol. This includes decisions about adding new markets, adjusting
                  interest rate models, managing price oracles, and more. The governance process ensures that the
                  protocol evolves according to the community's needs and preferences.
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-12 text-center">
              <p className="text-text/70 mb-6">Still have questions? Reach out to our community or support team.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild variant="outline">
                  <Link href="/contact">Contact Support</Link>
                </Button>
                <Button asChild className="bg-primary text-background hover:bg-primary/90">
                  <Link href="https://discord.gg/Peridot" target="_blank" rel="noopener noreferrer">
                    Join Discord Community
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
