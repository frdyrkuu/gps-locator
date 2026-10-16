type Users = {
  findUnique(args: { where: { id: string }; select: { id: true; email: true } }):
    Promise<{ id: string; email: string } | null>;
};

export async function findSessionOwner(session: { user?: { id?: string } } | null, users: Users) {
  if (!session?.user?.id) return null;
  return users.findUnique({ where: { id: session.user.id }, select: { id: true, email: true } });
}
