"use client";

import { Button } from "@/components/ui/button";
import { usePostHog } from "posthog-js/react";

export default function PostHogTestPage() {
  const posthog = usePostHog();

  const handleTestEvent = () => {
    if (posthog) {
      posthog.capture("test_alert_button_clicked", {
        timestamp: new Date().toISOString(),
        component: "PostHogTestPageButton",
        environment: process.env.NODE_ENV,
        description: "Event fired from dedicated test page.",
      });
      alert("Test event 'test_alert_button_clicked' sent to PostHog!");
    } else {
      alert("PostHog not available. Event not sent.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-gray-900 p-4">
      <div className="bg-card dark:bg-gray-800 p-8 rounded-lg shadow-xl text-center">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-6 text-gray-800 dark:text-white">
          PostHog Event Test Page
        </h1>
        <p className="mb-8 text-gray-600 dark:text-gray-300">
          Click the button below to send a custom event named 
          <code className="bg-gray-200 dark:bg-gray-700 p-1 rounded text-sm mx-1">\
test_alert_button_clicked</code> to PostHog.
        </p>
        <Button onClick={handleTestEvent} variant="default" size="lg">
          Send Test Event
        </Button>
        <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
          Ensure your PostHog client is correctly initialized (see PostHogProvider.tsx) 
          and that you have configured your PostHog environment variables 
          (NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST).
        </p>
      </div>
    </div>
  );
} 