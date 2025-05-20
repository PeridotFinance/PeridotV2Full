"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const CookieConsentBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    // Show banner if no consent has been given yet
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleConsent = (consentGiven: boolean) => {
    localStorage.setItem("cookie_consent", consentGiven ? "accepted" : "declined");
    setIsVisible(false);
    // Here you might want to initialize analytics or other services if consent is accepted
    if (consentGiven) {
      console.log("Cookie consent accepted. Initialize tracking services here.");
      // Example: window.gtag('consent', 'update', { 'analytics_storage': 'granted' });
    } else {
      console.log("Cookie consent declined. Disable tracking services here.");
      // Example: window.gtag('consent', 'update', { 'analytics_storage': 'denied' });
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border/40 p-4 shadow-lg">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-foreground">
          We use cookies to enhance your experience. By clicking "Accept", you
          agree to our use of cookies. For more details, please see our{" "}
          <Link href="/cookies" className="underline hover:text-primary">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleConsent(false)}
          >
            Decline
          </Button>
          <Button size="sm" onClick={() => handleConsent(true)}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}; 