"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CookiesPolicyPage() {
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
            Cookie Policy
          </h1>

          <p>
            Welcome to Peridot! This Cookie Policy explains how we use cookies
            and similar technologies to recognize you when you visit our
            website at peridot.finance ("Website"). It explains what these
            technologies are and why we use them, as well as your rights to
            control our use of them.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            What are cookies?
          </h2>
          <p>
            Cookies are small data files that are placed on your computer or
            mobile device when you visit a website. Cookies are widely used by
            website owners in order to make their websites work, or to work
            more efficiently, as well as to provide reporting information.
          </p>
          <p>
            Cookies set by the website owner (in this case, Peridot) are
            called "first party cookies". Cookies set by parties other than
            the website owner are called "third party cookies". Third party
            cookies enable third party features or functionality to be
            provided on or through the website (e.g. like advertising,
            interactive content and analytics). The parties that set these
            third party cookies can recognize your computer both when it
            visits the website in question and also when it visits certain
            other websites.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            Why do we use cookies?
          </h2>
          <p>
            We use first party and third party cookies for several reasons.
            Some cookies are required for technical reasons in order for our
            Website to operate, and we refer to these as "essential" or
            "strictly necessary" cookies. Other cookies also enable us to
            track and target the interests of our users to enhance the
            experience on our Online Properties. Third parties serve cookies
            through our Website for advertising, analytics and other
            purposes. This is described in more detail below.
          </p>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            Essential Website Cookies:
          </h3>
          <p>
            These cookies are strictly necessary to provide you with services
            available through our Website and to use some of its features,
            such as access to secure areas.
          </p>
          <ul>
            <li>
              <strong>Functionality Cookies:</strong> These are used to
              recognize you when you return to our Website. This enables us
              to personalize our content for you, greet you by name and
              remember your preferences (for example, your choice of
              language or region).
            </li>
            <li>
              <strong>Session Cookies:</strong> These cookies are temporary and
              expire once you close your browser (or once your session ends).
              We use session cookies to link your actions during a particular
              session.
            </li>
             <li>
              <strong>Preference Cookies:</strong> We use preference cookies to remember your settings and preferences, such as your parallax motion preference (<code>disableParallax</code> in localStorage). This helps us provide a consistent user experience.
            </li>
          </ul>

          <h3 className="mt-6 mb-3 text-xl font-semibold">
            Analytics and Customization Cookies:
          </h3>
          <p>
            These cookies collect information that is used either in aggregate
            form to help us understand how our Website is being used or how
            effective our marketing campaigns are, or to help us customize
            our Website for you.
          </p>
          <ul>
            <li>
              <strong>Google Analytics & Posthog:</strong> We may use Google Analytics and Posthog
              to collect information about your use of the Website. This
              information is used to compile reports and to help us improve
              the Website. The cookies collect information in an anonymous
              form, including the number of visitors to the Website, where
              visitors have come to the Website from and the pages they
              visited.
            </li>
          </ul>
          
          <h3 className="mt-6 mb-3 text-xl font-semibold">
            Performance and Functionality Cookies:
          </h3>
          <p>
            These cookies are used to enhance the performance and
            functionality of our Website but are non-essential to their use.
            However, without these cookies, certain functionality (like videos)
            may become unavailable.
          </p>
           <p>
            One example is the <code>disableParallax</code> setting stored in your browser's localStorage. We use this to remember your preference for enabling or disabling parallax and other motion effects to optimize performance on your device or based on your preference.
          </p>


          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            How can I control cookies?
          </h2>
          <p>
            You have the right to decide whether to accept or reject cookies.
            You can exercise your cookie rights by setting your preferences in
            the Cookie Consent Manager. The Cookie Consent Manager allows you
            to select which categories of cookies you accept or reject.
            Essential cookies cannot be rejected as they are strictly
            necessary to provide you with services.
          </p>
          <p>
            The Cookie Consent Manager can be found on our website. If you
            choose to reject cookies, you may still use our website though
            your access to some functionality and areas of our website may be
            restricted. You may also set or amend your web browser controls to
            accept or refuse cookies.
          </p>
          <p>
            Most advertising networks offer you a way to opt out of targeted
            advertising. If you would like to find out more information,
            please visit{" "}
            <a
              href="http://www.aboutads.info/choices/"
              target="_blank"
              rel="noopener noreferrer"
            >
              http://www.aboutads.info/choices/
            </a>{" "}
            or{" "}
            <a
              href="http://www.youronlinechoices.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              http://www.youronlinechoices.com
            </a>
            .
          </p>
          <p>
             For the <code>disableParallax</code> setting, you can toggle this preference using the "Reduce motion" / "Enable motion" button typically found on our website, which directly updates the <code>localStorage</code> value.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            Changes to This Cookie Policy
          </h2>
          <p>
            We may update this Cookie Policy from time to time in order to
            reflect, for example, changes to the cookies we use or for other
            operational, legal or regulatory reasons. Please therefore
            re-visit this Cookie Policy regularly to stay informed about our
            use of cookies and related technologies.
          </p>
          <p>
            The date at the top of this Cookie Policy indicates when it was
            last updated.
          </p>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">
            Where can I get further information?
          </h2>
          <p>
            If you have any questions about our use of cookies or other
            technologies, please email us at hello@peridot.finance.
          </p>

          <p className="mt-12">
            <em>Last Updated: {new Date().toLocaleDateString()}</em>
          </p>
        </article>
      </main>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        <div className="container">
          © {new Date().getFullYear()} Peridot. All rights reserved.
        </div>
      </footer>
    </div>
  );
} 