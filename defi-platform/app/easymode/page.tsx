"use client";

import { EasyMode } from "@/components/app-modes/EasyMode";
import { useRouter } from "next/navigation";

export default function EasyModePage() {
  const router = useRouter();

  const handleExitEasyMode = () => {
    // Navigate to the main dashboard or home page when exiting
    router.push("/"); 
  };

  // TODO: Add logic here if needed to check if the user is already connected
  // or has completed onboarding. For now, it directly renders EasyMode.

  return <EasyMode onExitEasyMode={handleExitEasyMode} />;
} 