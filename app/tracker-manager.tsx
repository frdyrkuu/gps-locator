"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tracker } from "@/lib/dashboard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Action = "rotate" | "revoke" | "delete";

export function TrackerManager({ selected, refresh }: { selected: Tracker | null; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<Tracker | null | "new">(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<Tracker["type"]>("ESP32");
  const [mode, setMode] = useState<Tracker["reportingMode"]>("INTERVAL");
  const [interval, setIntervalValue] = useState("30");
  const [confirmation, setConfirmation] = useState<{ id: string; name: string; action: Action } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  function openForm(item: Tracker | "new") {
    setFormError("");
    setEditing(item);
    setName(item === "new" ? "" : item.name);
    setType(item === "new" ? "ESP32" : item.type);
    setMode(item === "new" ? "INTERVAL" : item.reportingMode);
    setIntervalValue(item === "new" ? "30" : String(item.expectedIntervalSeconds ?? 30));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const id = editing && editing !== "new" ? editing.id : null;
      const response = await fetch(id ? `/api/v1/trackers/${encodeURIComponent(id)}` : "/api/v1/trackers", {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, reportingMode: mode,
          expectedIntervalSeconds: mode === "INTERVAL" ? Number(interval) : null }),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "Check the name and interval (10–86400 seconds)." : "Save failed.");
      setEditing(null);
      toast.success(id ? "Tracker updated" : "Tracker added. Issue its device token before reporting.");
      await refresh();
    } catch (error) { setFormError(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!confirmation) return;
    setBusy(true);
    try {
      const { id, action } = confirmation;
      const response = await fetch(`/api/v1/trackers/${encodeURIComponent(id)}${action === "delete" ? "" : "/credentials"}`, {
        method: action === "rotate" ? "POST" : "DELETE",
      });
      if (!response.ok) throw new Error();
      setConfirmation(null);
      if (action === "rotate") setToken((await response.json()).token);
      else toast.success(action === "revoke" ? "Token revoked" : "Tracker deleted");
      await refresh();
    } catch { toast.error("Action failed. Please retry."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => openForm("new")}>Add tracker</Button>
      {selected && <>
        <Button size="sm" variant="outline" onClick={() => openForm(selected)}>Edit</Button>
        {(["rotate", "revoke", "delete"] as const).map((action) => <Button key={action} size="sm" variant={action === "delete" ? "destructive" : "outline"}
          onClick={() => setConfirmation({ id: selected.id, name: selected.name, action })}>
          {action === "rotate" ? "Issue / rotate token" : action === "revoke" ? "Revoke token" : "Delete"}</Button>)}
      </>}

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "Add tracker" : "Edit tracker"}</DialogTitle>
            <DialogDescription>Set how this device reports its location.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <label className="block space-y-1">Name
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
            <label className="block space-y-1">Device type
              <Select value={type} onValueChange={(v) => {
                setType(v as Tracker["type"]);
                if (editing === "new") setMode(v === "ESP32" ? "INTERVAL" : "ON_DEMAND");
              }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ESP32">ESP32</SelectItem><SelectItem value="IPHONE">iPhone</SelectItem><SelectItem value="APPLE_WATCH">Apple Watch (phone-assisted)</SelectItem></SelectContent>
              </Select></label>
            <label className="block space-y-1">Reporting mode
              <Select value={mode} onValueChange={(v) => setMode(v as Tracker["reportingMode"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="INTERVAL">Interval</SelectItem><SelectItem value="ON_DEMAND">On demand</SelectItem></SelectContent>
              </Select></label>
            {mode === "INTERVAL" && <label className="block space-y-1">Expected interval (seconds)
              <Input type="number" min={10} max={86400} step={1} required value={interval} onChange={(e) => setIntervalValue(e.target.value)} /></label>}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save tracker"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
        <AlertDialogContent><AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.action === "delete" ? "Delete tracker?" : confirmation?.action === "revoke" ? "Revoke token?" : "Issue a new token?"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.name}: {confirmation?.action === "delete"
            ? "This permanently deletes its history, last location, and token."
            : "Existing device tokens stop working immediately. Copy the new token if you issue one."}</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={confirmation?.action === "delete" ? "destructive" : "default"} disabled={busy} onClick={confirm}>
            {busy ? "Working…" : "Confirm"}</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={token !== null} onOpenChange={(open) => { if (!open) setToken(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Copy your device token now</DialogTitle>
          <DialogDescription>This token is shown once. Store it securely in your device or Shortcut; it cannot be retrieved later.</DialogDescription></DialogHeader>
          <Input readOnly aria-label="New device token" value={token ?? ""} onFocus={(e) => e.target.select()} />
          <Button onClick={async () => { try { await navigator.clipboard.writeText(token ?? ""); toast.success("Token copied"); } catch { toast.error("Copy failed. Select and copy the token manually."); } }}>Copy token</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
