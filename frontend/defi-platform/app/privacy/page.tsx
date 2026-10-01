"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
            Privacy & Cookie Policy
          </h1>

          <p className="text-lg text-muted-foreground mb-8">
            Last Updated: {new Date().toLocaleDateString()}
          </p>

          <p>
            Welcome to Peridot Finance ("Peridot," "we," "us," or "our"). This Privacy & Cookie Policy explains how we collect, use, disclose, and safeguard your information when you visit our website at peridot.finance ("Website") or use our decentralized finance platform. It also explains our use of cookies and similar technologies.
          </p>

          <p>
            Peridot is a decentralized cross-chain lending and borrowing platform. We are committed to protecting your privacy while providing transparent DeFi services. Please read this policy carefully to understand our practices regarding your personal information.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            1. Information We Collect
          </h2>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            1.1 Information You Provide Directly
          </h3>
          <ul>
            <li>
              <strong>Contact Form Submissions:</strong> When you contact us through our contact form, we collect your name, email address, subject, and message content.
            </li>
            <li>
              <strong>Waitlist Registration:</strong> When you join our waitlist, we collect your full name, email address, and intended platform usage (lending, borrowing, or both).
            </li>
            <li>
              <strong>Wallet Authentication:</strong> When you connect your wallet, we collect your wallet address and authentication-related information through our third-party authentication provider.
            </li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            1.2 Information Collected Automatically
          </h3>
          <ul>
            <li>
              <strong>Technical Information:</strong> IP addresses, browser type, operating system, device information, and user agent strings.
            </li>
            <li>
              <strong>Usage Data:</strong> Pages visited, time spent on pages, click patterns, and interaction data collected through PostHog analytics.
            </li>
            <li>
              <strong>Blockchain Data:</strong> Public transaction data including wallet addresses, transaction amounts, token symbols, and timestamps for platform functionality.
            </li>
            <li>
              <strong>Cookies and Similar Technologies:</strong> As detailed in the Cookies section below.
            </li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            1.3 Information from Third Parties
          </h3>
          <ul>
            <li>
              <strong>Privy Authentication:</strong> Wallet connection and user authentication data.
            </li>
            <li>
              <strong>Analytics Providers:</strong> PostHog provides user behavior and analytics data.
            </li>
            <li>
              <strong>Blockchain Networks:</strong> On-chain transaction verification and historical data.
            </li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            2. How We Use Your Information
          </h2>

          <p>We use the information we collect for the following purposes:</p>

          <ul>
            <li>
              <strong>Platform Functionality:</strong> To provide our DeFi lending and borrowing services, verify transactions, and maintain platform security.
            </li>
            <li>
              <strong>Communication:</strong> To respond to your inquiries, provide customer support, and send important platform updates.
            </li>
            <li>
              <strong>Analytics and Improvement:</strong> To understand how users interact with our platform and improve our services.
            </li>
            <li>
              <strong>Compliance and Security:</strong> To prevent fraud, comply with legal obligations, and ensure platform security.
            </li>
            <li>
              <strong>Leaderboard and Rewards:</strong> To track user activity, award badges, and maintain our rewards system.
            </li>
            <li>
              <strong>Marketing:</strong> To send you information about platform updates, new features, and DeFi opportunities (with your consent where required).
            </li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            3. Information Sharing and Disclosure
          </h2>

          <p>We do not sell, trade, or rent your personal information to third parties. We may share your information in the following circumstances:</p>

          <ul>
            <li>
              <strong>Service Providers:</strong> With trusted third-party service providers who assist us in operating our platform (analytics, authentication, etc.).
            </li>
            <li>
              <strong>Legal Requirements:</strong> When required by law, court order, or to protect our rights and safety.
            </li>
            <li>
              <strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.
            </li>
            <li>
              <strong>Public Blockchain Data:</strong> Transaction data on blockchain networks is publicly visible by nature.
            </li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            4. Data Security
          </h2>

          <p>
            We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
          </p>

          <p>
            As a decentralized platform, your funds and assets remain in your wallet at all times. We do not have custody of your cryptocurrency holdings.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            5. Data Retention
          </h2>

          <p>
            We retain your information for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. Specific retention periods vary depending on the type of information:
          </p>

          <ul>
            <li><strong>Contact form data:</strong> Retained for customer service and support purposes</li>
            <li><strong>Waitlist data:</strong> Retained until you request deletion or we launch the platform</li>
            <li><strong>Transaction data:</strong> Retained for platform functionality and compliance purposes</li>
            <li><strong>Analytics data:</strong> Retained according to our analytics provider's policies</li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            6. Your Rights and Choices
          </h2>

          <p>You have certain rights regarding your personal information:</p>

          <ul>
            <li>
              <strong>Access:</strong> Request access to the personal information we hold about you.
            </li>
            <li>
              <strong>Correction:</strong> Request correction of inaccurate or incomplete information.
            </li>
            <li>
              <strong>Deletion:</strong> Request deletion of your personal information, subject to legal and legitimate business requirements.
            </li>
            <li>
              <strong>Portability:</strong> Request a copy of your data in a structured, machine-readable format.
            </li>
            <li>
              <strong>Opt-out:</strong> Opt-out of marketing communications or analytics tracking where applicable.
            </li>
          </ul>

          <p>
            To exercise these rights, please contact us at hello@peridot.finance. We will respond to your request within a reasonable timeframe.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            7. Cookies and Similar Technologies
          </h2>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            What are cookies?
          </h3>
          <p>
            Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners to make their websites work, or to work more efficiently, as well as to provide reporting information.
          </p>
          <p>
            Cookies set by the website owner (in this case, Peridot) are called "first party cookies". Cookies set by parties other than the website owner are called "third party cookies". Third party cookies enable third party features or functionality to be provided on or through the website (e.g. like advertising, interactive content and analytics).
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            Why do we use cookies?
          </h3>
          <p>
            We use first party and third party cookies for several reasons. Some cookies are required for technical reasons in order for our Website to operate, and we refer to these as "essential" or "strictly necessary" cookies. Other cookies also enable us to track and target the interests of our users to enhance the experience on our Online Properties. Third parties serve cookies through our Website for analytics and other purposes.
          </p>

          <h4 className="mt-4 mb-2 text-lg font-semibold">
            Essential Website Cookies:
          </h4>
          <p>
            These cookies are strictly necessary to provide you with services available through our Website and to use some of its features, such as access to secure areas.
          </p>
          <ul>
            <li>
              <strong>Functionality Cookies:</strong> These are used to recognize you when you return to our Website. This enables us to personalize our content for you, greet you by name and remember your preferences.
            </li>
            <li>
              <strong>Session Cookies:</strong> These cookies are temporary and expire once you close your browser (or once your session ends). We use session cookies to link your actions during a particular session.
            </li>
            <li>
              <strong>Preference Cookies:</strong> We use preference cookies to remember your settings and preferences, such as your parallax motion preference (<code>disableParallax</code> in localStorage). This helps us provide a consistent user experience.
            </li>
          </ul>

          <h4 className="mt-4 mb-2 text-lg font-semibold">
            Analytics and Customization Cookies:
          </h4>
          <p>
            These cookies collect information that is used either in aggregate form to help us understand how our Website is being used or how effective our marketing campaigns are, or to help us customize our Website for you.
          </p>
          <ul>
            <li>
              <strong>PostHog Analytics:</strong> We use PostHog to collect information about your use of the Website. This information is used to compile reports and to help us improve the Website. The cookies collect information in an anonymous form, including the number of visitors to the Website, where visitors have come to the Website from and the pages they visited.
            </li>
          </ul>

          <h4 className="mt-4 mb-2 text-lg font-semibold">
            Performance and Functionality Cookies:
          </h4>
          <p>
            These cookies are used to enhance the performance and functionality of our Website but are non-essential to their use. However, without these cookies, certain functionality may become unavailable.
          </p>
          <p>
            One example is the <code>disableParallax</code> setting stored in your browser's localStorage. We use this to remember your preference for enabling or disabling parallax and other motion effects to optimize performance on your device or based on your preference.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            How can I control cookies?
          </h3>
          <p>
            You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting your preferences in the Cookie Consent Manager. The Cookie Consent Manager allows you to select which categories of cookies you accept or reject. Essential cookies cannot be rejected as they are strictly necessary to provide you with services.
          </p>
          <p>
            The Cookie Consent Manager can be found on our website. If you choose to reject cookies, you may still use our website though your access to some functionality and areas of our website may be restricted. You may also set or amend your web browser controls to accept or refuse cookies.
          </p>
          <p>
            For the <code>disableParallax</code> setting, you can toggle this preference using the "Reduce motion" / "Enable motion" button typically found on our website, which directly updates the <code>localStorage</code> value.
          </p>
          <p>
            Most analytics providers offer you a way to opt out of targeted analytics. For PostHog, you can opt out by adjusting your cookie preferences in our Cookie Consent Manager.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            8. International Data Transfers
          </h2>

          <p>
            Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that are different from the laws of your country. When we transfer your information internationally, we implement appropriate safeguards to ensure the protection of your information.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            9. Children's Privacy
          </h2>

          <p>
            Our services are not intended for children under 18 years of age. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and you are aware that your child has provided us with personal information, please contact us so that we can take necessary action.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            10. Third-Party Websites and Services
          </h2>

          <p>
            Our website may contain links to third-party websites and services. We are not responsible for the privacy practices or content of these third-party sites. We encourage you to review the privacy policies of any third-party sites you visit.
          </p>

          <p>
            We integrate with various third-party services including:
          </p>
          <ul>
            <li><strong>Privy:</strong> For wallet authentication and connection</li>
            <li><strong>Biconomy:</strong> For smart account functionality and gas abstraction</li>
            <li><strong>PostHog:</strong> For analytics and user behavior tracking</li>
            <li><strong>Blockchain RPC Providers:</strong> For accessing blockchain data</li>
          </ul>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            11. Changes to This Privacy & Cookie Policy
          </h2>

          <p>
            We may update this Privacy & Cookie Policy from time to time in order to reflect changes to our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by posting the new policy on this page and updating the "Last Updated" date.
          </p>

          <p>
            We encourage you to review this policy periodically to stay informed about how we are protecting your information.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            12. Contact Us
          </h2>

          <p>
            If you have any questions about this Privacy & Cookie Policy, please contact us:
          </p>

          <ul>
            <li><strong>Email:</strong> hello@peridot.finance</li>
            <li><strong>Website:</strong> peridot.finance</li>
          </ul>

          <p>
            We will respond to your inquiries as promptly as possible and work to address any concerns you may have regarding our privacy practices.
          </p>

          <p className="mt-12 text-sm text-muted-foreground">
            This Privacy & Cookie Policy is effective as of the "Last Updated" date shown at the top of this page.
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
