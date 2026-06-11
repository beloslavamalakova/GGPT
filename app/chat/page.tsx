import { Suspense } from "react";
import { ChatApp } from "@/components/chat-app";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream dark:bg-[#21141b]" />}>
      <ChatApp />
    </Suspense>
  );
}
