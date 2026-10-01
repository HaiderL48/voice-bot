import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">Voice Bot</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          An AI receptionist for the businesses that cannot miss a call.
        </h1>
        <p className="max-w-xl text-sm/6 text-muted-foreground">
          Configure the greeting, the voice, and the facts about your business. Then place a test call from the browser:
          speech comes in, Gemini replies, and ElevenLabs speaks it back.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button render={<Link href="/register" />}>Create a workspace</Button>
        <Button variant="outline" render={<Link href="/login" />}>
          Sign in
        </Button>
      </div>
    </main>
  );
}
