"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsConditionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <ArrowLeft className="h-6 w-6" />
            <span className="font-bold sm:inline-block">
              Back to Home
            </span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-12 md:py-16 lg:py-20">
        <article className="prose prose-lg dark:prose-invert mx-auto">
          <h1 className="mb-8 text-4xl font-bold tracking-tight text-primary">
            Terms & Conditions
          </h1>

          <p className="text-lg text-muted-foreground mb-8">
            Last Updated: {new Date().toLocaleDateString()}
          </p>

          <p className="mb-8">
            Welcome to Peridot Finance ("Peridot," "we," "us," or "our"). These Terms & Conditions ("Terms") govern your access to and use of our website at peridot.finance ("Website") and our decentralized finance platform ("Platform"). By accessing or using our Platform, you agree to be bound by these Terms.
          </p>

          <p className="mb-8">
            <strong>Please read these Terms carefully.</strong> If you do not agree to these Terms, you may not access or use our Platform. These Terms constitute a legally binding agreement between you and Peridot Finance.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            1. Platform Description
          </h2>

          <p>
            Peridot Finance is a decentralized cross-chain lending and borrowing platform that enables users to:
          </p>

          <ul>
            <li>Supply cryptocurrency assets as collateral to earn interest</li>
            <li>Borrow against supplied collateral</li>
            <li>Repay borrowed assets with interest</li>
            <li>Redeem supplied collateral</li>
            <li>Access cross-chain functionality across multiple blockchain networks</li>
          </ul>

          <p>
            Our Platform operates on various blockchain networks including Ethereum, BSC, Arbitrum, Base, and other supported networks. We provide smart account functionality through integrations with third-party providers like Biconomy.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            2. Eligibility and Account Registration
          </h2>

          <p>To use our Platform, you must:</p>

          <ul>
            <li>Be at least 18 years old (or the age of majority in your jurisdiction)</li>
            <li>Have the legal capacity to enter into these Terms</li>
            <li>Connect a compatible cryptocurrency wallet</li>
            <li>Not be a resident of a restricted jurisdiction</li>
            <li>Not be subject to economic or trade sanctions</li>
          </ul>

          <p>
            By connecting your wallet and using our Platform, you represent and warrant that you meet all eligibility requirements.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            3. User Responsibilities
          </h2>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            3.1 Wallet Security
          </h3>
          <p>You are solely responsible for:</p>
          <ul>
            <li>Maintaining the security of your wallet and private keys</li>
            <li>All transactions initiated from your connected wallet</li>
            <li>Protecting your wallet from unauthorized access</li>
            <li>Backing up your wallet recovery phrases</li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            3.2 Transaction Authorization
          </h3>
          <p>
            You must carefully review all transaction details before signing and submitting transactions. You acknowledge that blockchain transactions are irreversible once confirmed on the network.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            3.3 Compliance with Laws
          </h3>
          <p>
            You agree to comply with all applicable laws, regulations, and rules in your jurisdiction. You are responsible for determining whether your use of the Platform is legal in your jurisdiction and for obtaining any necessary licenses or approvals.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            3.4 Accurate Information
          </h3>
          <p>
            You agree to provide accurate and complete information when using our contact forms, waitlist, or any other Platform features.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            4. Risk Disclosures
          </h2>

          <p className="text-red-600 dark:text-red-400 font-semibold mb-4">
            ⚠️ IMPORTANT: Using decentralized finance protocols involves substantial risk of loss. Please read these risk disclosures carefully.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            4.1 Smart Contract Risks
          </h3>
          <p>
            Smart contracts are software code that may contain bugs, vulnerabilities, or errors. Despite audits and security measures, smart contracts may be exploited, resulting in total loss of funds. We do not guarantee the security or proper functioning of any smart contracts.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            4.2 Financial Loss Risks
          </h3>
          <p>You may lose all or part of your cryptocurrency due to:</p>
          <ul>
            <li>Liquidation if your collateral value falls below required thresholds</li>
            <li>Market volatility and price fluctuations</li>
            <li>Smart contract exploits or hacks</li>
            <li>Wallet compromise or loss of private keys</li>
            <li>Network congestion or transaction failures</li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            4.3 Liquidity Risks
          </h3>
          <p>
            There may be insufficient liquidity in certain markets, preventing you from supplying, borrowing, or redeeming assets when desired. Market conditions can change rapidly, and you may not be able to execute transactions at expected prices.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            4.4 Oracle Risks
          </h3>
          <p>
            Our Platform relies on price oracles to determine asset values. Oracle failures, manipulation, or inaccuracies may result in incorrect valuations, leading to unintended liquidations or other financial losses.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            4.5 Cross-Chain Risks
          </h3>
          <p>
            Cross-chain functionality introduces additional risks including:
          </p>
          <ul>
            <li>Bridge failures or exploits</li>
            <li>Network incompatibilities</li>
            <li>Inter-chain communication delays</li>
            <li>Different security models across chains</li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            4.6 Regulatory Risks
          </h3>
          <p>
            The regulatory landscape for decentralized finance is evolving rapidly. Changes in laws or regulations may affect your ability to use the Platform or result in legal restrictions on your assets.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            5. Platform Limitations
          </h2>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            5.1 No Financial Advice
          </h3>
          <p>
            <strong>We do not provide financial, investment, or trading advice.</strong> All information provided through our Platform is for informational purposes only. You should not rely on any information provided by us in making financial decisions. You should consult with qualified financial advisors before using our Platform.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            5.2 Experimental Nature
          </h3>
          <p>
            Our Platform is experimental technology. It may contain bugs, experience unexpected behavior, or cease functioning as expected. We make no guarantees about the Platform's reliability, availability, or future development.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            5.3 Service Availability
          </h3>
          <p>
            We may experience downtime for maintenance, upgrades, or unforeseen issues. We do not guarantee continuous availability of the Platform and are not liable for any losses resulting from service interruptions.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            5.4 Third-Party Dependencies
          </h3>
          <p>
            Our Platform depends on third-party services including blockchain networks, oracles, and other infrastructure. We are not responsible for the performance, security, or availability of these third-party services.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            6. Prohibited Activities
          </h2>

          <p>You agree not to engage in any of the following activities:</p>

          <ul>
            <li>
              <strong>Fraudulent Activity:</strong> Money laundering, terrorist financing, fraud, or any other illegal activities
            </li>
            <li>
              <strong>Market Manipulation:</strong> Wash trading, spoofing, front-running, or other manipulative practices
            </li>
            <li>
              <strong>Platform Abuse:</strong> Exploiting bugs, vulnerabilities, or attempting unauthorized access
            </li>
            <li>
              <strong>Violation of Laws:</strong> Using the Platform in violation of applicable laws or regulations
            </li>
            <li>
              <strong>Spam or Harassment:</strong> Sending unsolicited communications or harassing other users
            </li>
            <li>
              <strong>Impersonation:</strong> Pretending to be another person or entity
            </li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            7. Intellectual Property
          </h2>

          <p>
            All intellectual property rights in our Platform, including but not limited to software, designs, trademarks, and content, are owned by Peridot Finance or our licensors. You are granted a limited, non-exclusive, non-transferable license to use our Platform in accordance with these Terms.
          </p>

          <p>
            You may not copy, modify, distribute, sell, or lease any part of our Platform without our prior written consent.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            8. Disclaimers and Limitations of Liability
          </h2>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            8.1 General Disclaimers
          </h3>
          <p>
            <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.</strong> We disclaim all warranties, whether express or implied, including but not limited to:
          </p>
          <ul>
            <li>Merchantability, fitness for a particular purpose, and non-infringement</li>
            <li>Security, reliability, or availability</li>
            <li>Accuracy of information or functionality</li>
            <li>Compatibility with your systems or devices</li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            8.2 Limitations of Liability
          </h3>
          <p>
            <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL PERIDOT FINANCE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,</strong> including but not limited to:
          </p>
          <ul>
            <li>Loss of profits, revenue, or data</li>
            <li>Loss of cryptocurrency or digital assets</li>
            <li>Trading losses or missed opportunities</li>
            <li>Costs of procurement of substitute goods or services</li>
          </ul>

          <p>
            Our total liability to you for any claims arising out of or relating to these Terms or your use of the Platform shall not exceed the amount of fees paid by you to us in the 12 months preceding the claim.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            9. Indemnification
          </h2>

          <p>
            You agree to indemnify, defend, and hold harmless Peridot Finance, our affiliates, directors, officers, employees, and agents from and against any claims, demands, losses, damages, costs, liabilities, and expenses (including reasonable attorneys' fees) arising out of or related to:
          </p>

          <ul>
            <li>Your use of or inability to use our Platform</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any rights of another party</li>
            <li>Any content or materials you submit or transmit through our Platform</li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            10. Governing Law and Dispute Resolution
          </h2>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            10.1 Governing Law
          </h3>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of Singapore, without regard to its conflict of law principles.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            10.2 Dispute Resolution
          </h3>
          <p>
            Any disputes arising out of or relating to these Terms or your use of the Platform shall be resolved through binding arbitration administered by the Singapore International Arbitration Centre (SIAC) in accordance with its Arbitration Rules.
          </p>

          <p>
            You agree that any arbitration shall be conducted on an individual basis and not on a class, collective, or representative basis. You waive any right to participate in class actions or collective arbitration proceedings.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            11. Termination
          </h2>

          <p>
            We reserve the right to suspend or terminate your access to the Platform at any time, with or without cause, and with or without notice. Upon termination:
          </p>

          <ul>
            <li>Your right to use the Platform will cease immediately</li>
            <li>You remain responsible for all outstanding obligations</li>
            <li>Sections that by their nature should survive termination will continue to apply</li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            12. Changes to Terms
          </h2>

          <p>
            We reserve the right to modify these Terms at any time. When we make changes, we will update the "Last Updated" date at the top of this page and may provide additional notice (such as through our Platform or email).
          </p>

          <p>
            Your continued use of the Platform after any changes to these Terms constitutes acceptance of the new Terms. If you do not agree to the modified Terms, you must stop using the Platform.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            13. Severability
          </h2>

          <p>
            If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            14. Entire Agreement
          </h2>

          <p>
            These Terms, together with our Privacy & Cookie Policy, constitute the entire agreement between you and Peridot Finance regarding your use of the Platform and supersede all prior agreements and understandings.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            15. Contact Information
          </h2>

          <p>
            If you have any questions about these Terms & Conditions, please contact us:
          </p>

          <ul>
            <li><strong>Email:</strong> hello@peridot.finance</li>
            <li><strong>Website:</strong> peridot.finance</li>
          </ul>

          <p>
            We will respond to your inquiries as promptly as possible.
          </p>

          <p className="mt-12 text-sm text-muted-foreground">
            These Terms & Conditions are effective as of the "Last Updated" date shown at the top of this page.
          </p>
        </article>
      </main>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        <div className="container">
          © {new Date().getFullYear()} Peridot Finance. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
