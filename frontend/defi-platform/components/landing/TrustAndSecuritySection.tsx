"use client"

import { motion } from "framer-motion"
import { Shield, Lock, Eye, CheckCircle, Users, FileCheck, Zap, Globe } from "lucide-react"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { useMobile } from "@/hooks/use-mobile"
import { FadeInOnScroll } from "@/components/shared/FadeInOnScroll"

export const TrustAndSecuritySection = () => {
  const { isLowPerfDevice } = useReducedMotion()
  const isMobile = useMobile()

  const securityFeatures = [
    {
      icon: Shield,
      title: "Audited Smart Contracts",
      description: "Our contracts have been thoroughly audited by leading security firms including Certik, Trail of Bits, and OpenZeppelin."
    },
    {
      icon: Lock,
      title: "Non-Custodial Design",
      description: "Your assets remain in your wallet. We never have access to your private keys or funds."
    },
    {
      icon: Eye,
      title: "Open Source Code",
      description: "All our smart contracts and core protocols are open source and available for public review."
    },
    {
      icon: CheckCircle,
      title: "Multi-Sig Governance",
      description: "Protocol upgrades require multiple signatures from trusted community members."
    },
    {
      icon: Users,
      title: "Community Governed",
      description: "The protocol is governed by $P token holders through decentralized governance."
    },
    {
      icon: FileCheck,
      title: "Regular Audits",
      description: "Continuous security monitoring and regular third-party audit reviews."
    }
  ]

  const trustBadges = [
    { name: "Audit", status: "Verified" },
    { name: "OpenZeppelin", status: "Audited" },
    { name: "Bug Bounty", status: "Active" }
  ]

  return (
    <section className="py-16 md:py-20 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Main Content Container with Leaderboard-style Background */}
        <div 
          className="relative rounded-3xl border border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-xl overflow-hidden p-6 md:p-10 lg:p-12"
          style={{
            backgroundImage: 'radial-gradient(60rem 40rem at 20% 0%, rgba(94,121,69,0.10), transparent), radial-gradient(50rem 40rem at 80% 100%, rgba(99,102,241,0.10), transparent)'
          }}
        >
          <FadeInOnScroll
            className="text-center max-w-3xl mx-auto mb-16 relative z-10"
            threshold={0.1}
            rootMargin="-100px"
          >
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <div className="w-3 h-3 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>

            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Security & <span className="gradient-text">Trust</span>
            </h2>

            <FadeInOnScroll
              as="p"
              className="text-lg text-text/70"
              threshold={0.1}
              rootMargin="-100px"
              delay={200}
            >
              Your security is our top priority. Built with industry-leading standards and multiple layers of protection.
            </FadeInOnScroll>
          </FadeInOnScroll>

          {/* Security Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16 relative z-10">
            {securityFeatures.map((feature, index) => (
              <FadeInOnScroll
                key={index}
                className="bg-white/60 dark:bg-card/50 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-2xl p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] shadow-sm"
                threshold={0.1}
                rootMargin="-50px"
                delay={index * 100}
                variant="fade-in-up-30"
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/10">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-text/70 text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </FadeInOnScroll>
            ))}
          </div>

          {/* Trust Badges */}
          <FadeInOnScroll
            className="bg-white/70 dark:bg-card/30 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-3xl p-8 shadow-lg relative z-10"
            threshold={0.1}
            rootMargin="-100px"
          >
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Trusted By Industry Leaders
              </h3>
              <p className="text-text/70">
                Our security and compliance standards meet the highest industry requirements
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {trustBadges.map((badge, index) => (
                <FadeInOnScroll
                  key={index}
                  className="text-center group hover:scale-105 transition-transform duration-300"
                  threshold={0.1}
                  rootMargin="-100px"
                  delay={index * 100}
                  variant="fade-in-scale"
                >
                  <div className="bg-white/60 dark:bg-background/50 rounded-xl p-4 border border-white/20 dark:border-white/10 group-hover:border-primary/50 transition-colors duration-300 shadow-sm">
                    <div className="flex items-center justify-center mb-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center border border-primary/10">
                        <CheckCircle className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <h4 className="font-semibold text-foreground text-sm mb-1">
                      {badge.name}
                    </h4>
                    <span className="text-xs text-primary font-medium">
                      {badge.status}
                    </span>
                  </div>
                </FadeInOnScroll>
              ))}
            </div>
          </FadeInOnScroll>

          {/* Floating security elements - using CSS animations instead of framer motion for background elements */}
          {!isLowPerfDevice && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
               {/* Decorative shapes using CSS instead of framer motion for performance */}
               <div className="absolute top-20 left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
               <div className="absolute bottom-20 right-10 w-40 h-40 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default TrustAndSecuritySection
