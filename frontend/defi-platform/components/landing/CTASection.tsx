"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { FadeInOnScroll } from "@/components/shared/FadeInOnScroll"
import { cn } from "@/lib/utils"

// MagneticButton (simplified, assuming defined elsewhere or props passed)
const MagneticButton = ({ children, className = "", ...props }: { children: React.ReactNode; className?: string; [key: string]: any; }) => {
  return <div className={cn("relative", className)} {...props}>{children}</div>;
};

export const CTASection = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-secondary to-accent/70 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute inset-0 bg-[url('/interconnected-geometric-finance.webp')] bg-no-repeat bg-cover opacity-5"
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%"],
          }}
          transition={{
            duration: 50,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "reverse",
          }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeInOnScroll
          className="max-w-3xl mx-auto text-center"
          threshold={0.1}
          rootMargin="-100px"
        >
          {/* The closing ask has to be the same ask as the hero. This used to
              say "Ready to Start Earning?" above a "Launch App" button while the
              headline at the top of the page was about borrowing — two different
              promises on one page, which is the reason most visitors never
              reached the app at all. */}
          <h2 className="text-3xl font-bold mb-6">
            Ready to borrow without selling?
          </h2>
          <FadeInOnScroll
            as="p"
            className="text-lg mb-8"
            threshold={0.1}
            rootMargin="-100px"
            delay={200}
          >
            See how much you could borrow against what you already hold — and what it keeps earning while it backs the loan.
          </FadeInOnScroll>
          <FadeInOnScroll
            className="flex flex-col sm:flex-row gap-4 justify-center"
            threshold={0.1}
            rootMargin="-100px"
            delay={400}
          >
            <MagneticButton>
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary border border-primary/20 hover:border-primary/40 rounded-xl group relative overflow-hidden transition-all duration-300"
              >
                <Link href="/app/borrow" className="flex items-center">
                  <span className="relative z-10">See what you can borrow</span>
                  <motion.div
                    className="relative z-10 ml-2"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </motion.div>
                  <motion.div
                    className="absolute inset-0 bg-primary/10"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.6 }}
                  />
                </Link>
              </Button>
            </MagneticButton>

            <MagneticButton>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-primary hover:text-primary rounded-xl group transition-all duration-300"
              >
                <Link href="https://peridot-finance.gitbook.io/peridot-protocol" className="flex items-center">
                  Read Documentation
                  <motion.div
                    className="ml-2"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </motion.div>
                </Link>
              </Button>
            </MagneticButton>
          </FadeInOnScroll>
        </FadeInOnScroll>
      </div>
    </section>
  )
}

export default CTASection; 