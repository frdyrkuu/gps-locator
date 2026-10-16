"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

function Confirmation({ email }: { email: string }) {
  const { pending } = useFormStatus();
  return <>
    <AlertDialogHeader>
      <AlertDialogTitle>Sign out?</AlertDialogTitle>
      <AlertDialogDescription>You’ll be signed out of {email}. Sign in again to view your things.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
      <Button type="submit" disabled={pending}>{pending ? "Signing out…" : "Sign out"}</Button>
    </AlertDialogFooter>
  </>;
}

export function SignOutButton({ email, action }: { email: string; action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="md:size-10 md:p-0" title={`Sign out (${email})`} />}>
      <LogOut className="hidden md:block" aria-hidden="true" /><span className="md:sr-only">Sign out</span>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <form action={action} className="space-y-4"><Confirmation email={email} /></form>
    </AlertDialogContent>
  </AlertDialog>;
}
