import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { ScreenHeader } from "@/components/ScreenHeader";

export const metadata: Metadata = { title: "Sign in · AI Reading" };

// Outside the (app) group: no tab bar. proxy.ts sends signed-in visitors
// to /today, so only people who are not signed in see this page.
// The page reads no request data (the `next` target reaches the login
// action through proxy.ts), so it is static and works without JavaScript.
export default function LoginPage() {
  return (
    <div className="rr-screen rr-screen--narrow">
      <main className="rr-screen__main">
        <ScreenHeader title="Sign in" />
        <div className="rr-screen__body">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
