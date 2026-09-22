import type { Metadata } from "next";

import AutoChatBehavior from "@/components/AutoChatBehavior";
import CameraPreviewFix from "@/components/CameraPreviewFix";
import ThemeController from "@/components/ThemeController";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOVA AI",
  description: "Your personal AI assistant",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AutoChatBehavior />
        <CameraPreviewFix />
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
