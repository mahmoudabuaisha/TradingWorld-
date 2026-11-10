import type { Metadata } from "next";
import { AuthExperience } from "@/components/auth/AuthExperience";
import "./auth.css";

export const metadata: Metadata = { title: "TraderWorld · Sign in" };

export default function Page() {
  return <AuthExperience />;
}
