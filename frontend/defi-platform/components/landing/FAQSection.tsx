"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ArrowRight } from "lucide-react"
import { FloatingElement } from "@/components/shared/FloatingElement"
import { FadeInOnScroll } from "@/components/shared/FadeInOnScroll"
import { cn } from "@/lib/utils"

export const FAQSection = () => {
  return (
    <section className="py-20 bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <FloatingElement xOffset={-50} yOffset={100} duration={8}>
          <div className="w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl absolute left-0 bottom-0" />
        </FloatingElement>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Main Content Container with Leaderboard-style Background */}
        <div 
          className="relative rounded-3xl border border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-xl overflow-hidden p-6 md:p-10 lg:p-12"
          style={{
            backgroundImage: 'radial-gradient(60rem 40rem at 10% 90%, rgba(94,121,69,0.10), transparent), radial-gradient(50rem 40rem at 90% 10%, rgba(99,102,241,0.10), transparent)'
          }}
        >
          <FadeInOnScroll
            className="text-center max-w-3xl mx-auto mb-16 relative z-10"
            threshold={0.1}
            rootMargin="-100px"
          >
          <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
          <p className="text-text/70">Find answers to common questions about Peridot and how to use our platform.</p>
        </FadeInOnScroll>

          <FadeInOnScroll
            className="max-w-3xl mx-auto relative z-10"
            threshold={0.1}
            rootMargin="-100px"
            delay={200}
          >
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-white/60 dark:bg-card/60 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl px-6 overflow-hidden shadow-sm">
              <AccordionTrigger className="text-lg font-medium py-4 group">
                <span>What is Peridot?</span>
              </AccordionTrigger>
              <AccordionContent className="text-text/80 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Peridot is a decentralized cross-chain lending and borrowing platform that enables users to earn
                  interest on their crypto assets and borrow against their collateral. The platform uses algorithmic
                  interest rates based on supply and demand to create efficient money markets for various crypto
                  assets across multiple blockchains.
                </motion.div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-white/60 dark:bg-card/60 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl px-6 overflow-hidden shadow-sm">
              <AccordionTrigger className="text-lg font-medium py-4 group">
                <span>How do I start using Peridot?</span>
              </AccordionTrigger>
              <AccordionContent className="text-text/80 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  To start using Peridot, hit the launch app button on the top right of the page and connect your wallet.
                  You can then supply assets to earn interest or borrow against your collateral.
                  Earn points by interacting with the protocol and climb the leaderboard. (You earn for future rewards)
                </motion.div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-white/60 dark:bg-card/60 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl px-6 overflow-hidden shadow-sm">
              <AccordionTrigger className="text-lg font-medium py-4 group">
                <span>What blockchains does Peridot support?</span>
              </AccordionTrigger>
              <AccordionContent className="text-text/80 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Peridot currently supports Ethereum, Polygon, Avalanche, Binance Smart Chain, Arbitrum, Optimism,
                  Solana (for the bridge) and Monad, XDC and Binance Smart Chain (for the lending and borrowing testnet) . We're continuously working to add support for additional blockchains to enhance
                  cross-chain functionality and provide users with more options.
                </motion.div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-white/60 dark:bg-card/60 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl px-6 overflow-hidden shadow-sm">
              <AccordionTrigger className="text-lg font-medium py-4 group">
                <span>How are interest rates determined?</span>
              </AccordionTrigger>
              <AccordionContent className="text-text/80 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Interest rates on Peridot are determined algorithmically based on the utilization rate of each
                  asset. When demand for borrowing an asset is high (high utilization), interest rates increase to
                  incentivize more supply. When demand is low, rates decrease to encourage more borrowing. This
                  dynamic adjustment ensures optimal capital efficiency and fair rates for all users.
                </motion.div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-white/60 dark:bg-card/60 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl px-6 overflow-hidden shadow-sm">
              <AccordionTrigger className="text-lg font-medium py-4 group">
                <span>Is Peridot secure?</span>
              </AccordionTrigger>
              <AccordionContent className="text-text/80 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  Peridot prioritizes security through multiple measures: our smart contracts have undergone rigorous
                  security audits by leading firms, we implement robust risk management protocols, and we maintain a
                  conservative approach to collateral factors. Additionally, our non-custodial architecture means
                  users always maintain control of their assets.
                </motion.div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <FadeInOnScroll
            className="text-center mt-8"
            threshold={0.1}
            rootMargin="-100px"
            delay={400}
          >
            <Button asChild variant="outline" className="rounded-xl group border-primary/20 hover:border-primary/40 hover:bg-primary/5">
              <Link href="/faq" className="flex items-center">
                View All FAQs
                <motion.div
                  className="ml-2"
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.div>
              </Link>
            </Button>
          </FadeInOnScroll>
          </FadeInOnScroll>
        </div>
      </div>
    </section>
  )
}

export default FAQSection; 