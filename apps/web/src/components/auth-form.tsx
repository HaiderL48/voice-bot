"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, type SessionUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }
        : {
            name: String(form.get("name") ?? ""),
            businessName: String(form.get("businessName") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          };

    setPending(true);
    try {
      const result = await api<{ token: string; user: SessionUser }>(
        mode === "login" ? "/auth/login" : "/auth/register",
        { method: "POST", body: JSON.stringify(body) },
      );
      setSession(result.token, result.user);
      router.replace("/agents");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not continue";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary px-10 py-10 text-primary-foreground lg:flex">
        <p className="text-sm font-medium tracking-wide">Voice Bot</p>
        <div className="flex max-w-md flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">A receptionist that picks up every call.</h1>
          <p className="text-sm/6 text-primary-foreground/80">
            Set the greeting, the facts about your business, and the voice. Then talk to the agent the way a caller
            would.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/70">Speech in, a short reply, speech back.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{mode === "login" ? "Sign in" : "Create your workspace"}</CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Use the email you registered with."
                : "We’ll create a front-desk agent you can edit."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit}>
              <FieldGroup>
                {mode === "register" ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="name">Your name</FieldLabel>
                      <Input id="name" name="name" required autoComplete="name" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="businessName">Business name</FieldLabel>
                      <Input id="businessName" name="businessName" required />
                    </Field>
                  </>
                ) : null}
                <Field data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" name="email" type="email" required autoComplete="email" aria-invalid={!!error} />
                </Field>
                <Field data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={mode === "register" ? 8 : 1}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    aria-invalid={!!error}
                  />
                  {error ? <FieldError>{error}</FieldError> : null}
                </Field>
                <Button type="submit" disabled={pending}>
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  {mode === "login" ? "Sign in" : "Create workspace"}
                </Button>
              </FieldGroup>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  New here?{" "}
                  <Link href="/register" className="text-foreground underline underline-offset-4">
                    Create a workspace
                  </Link>
                </>
              ) : (
                <>
                  Already registered?{" "}
                  <Link href="/login" className="text-foreground underline underline-offset-4">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
