import { signOut } from "@/auth";
import { requireOwner } from "@/lib/owner";
import { prisma } from "@/lib/db";
import { trackerSelect } from "@/lib/tracker-input";
import { Dashboard } from "./dashboard";
import { SignOutButton } from "./sign-out-button";

export const instant = false;

export default async function Home() {
  const owner = await requireOwner();
  const items = await prisma.tracker.findMany({ where: { ownerId: owner.id }, select: trackerSelect, orderBy: { createdAt: "desc" } });
  return <Dashboard initialItems={items.map(({ latestLocation, ...item }) => ({ ...item,
    latestLocation: latestLocation && { ...latestLocation, reportedAt: latestLocation.reportedAt.toISOString(), receivedAt: latestLocation.receivedAt.toISOString() },
  }))} initialTime={new Date().getTime()} account={<div className="space-y-2 text-xs md:flex md:justify-center md:space-y-0">
    <p className="truncate text-muted-foreground md:hidden" title={owner.email}>{owner.email}</p>
    <SignOutButton email={owner.email} action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} />
  </div>} />;
}
