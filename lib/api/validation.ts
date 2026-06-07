import { z } from 'zod';

// /api/invite (POST) — Body: { email, communityId?, isAdmin? }
// Aufrufer: lib/db.ts sendInvite()
export const InviteBodySchema = z.object({
  email: z.string().email(),
  communityId: z.string().uuid().nullable().optional(),
  isAdmin: z.boolean().optional(),
});
export type InviteBody = z.infer<typeof InviteBodySchema>;

// /api/admin/users (POST) — Body: { team, communityId? }
// Aufrufer: components/AdminPanel.tsx
export const AdminUsersBodySchema = z.object({
  team: z.string().min(1),
  communityId: z.string().uuid().nullable().optional(),
});
export type AdminUsersBody = z.infer<typeof AdminUsersBodySchema>;

// /api/admin/set-role (POST) — Body: { userId, role }
// Aufrufer: components/AdminPanel.tsx
export const SetRoleBodySchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['user', 'admin']),
});
export type SetRoleBody = z.infer<typeof SetRoleBodySchema>;

// /api/admin/delete-user (DELETE) — Body: { userId }
// Aufrufer: components/AdminPanel.tsx
export const DeleteUserBodySchema = z.object({
  userId: z.string().uuid(),
});
export type DeleteUserBody = z.infer<typeof DeleteUserBodySchema>;

// /api/admin/snapshots (POST) — Body: { planningId, triggerAction }
// Aufrufer: components/ErkiApp.tsx (z. B. 'before_station_delete')
export const SnapshotCreateBodySchema = z.object({
  planningId: z.string().uuid(),
  triggerAction: z.string().min(1),
});
export type SnapshotCreateBody = z.infer<typeof SnapshotCreateBodySchema>;

// /api/admin/snapshots (GET) — Query: ?planningId=...
export const SnapshotListQuerySchema = z.object({
  planningId: z.string().uuid(),
});
export type SnapshotListQuery = z.infer<typeof SnapshotListQuerySchema>;

// /api/admin/snapshots/restore (POST) — Body: { snapshotId }
// Aufrufer: components/PlanningHistory.tsx
export const SnapshotRestoreBodySchema = z.object({
  snapshotId: z.string().uuid(),
});
export type SnapshotRestoreBody = z.infer<typeof SnapshotRestoreBodySchema>;

// /api/admin/plannings/[id] (DELETE) — Path-Param: id (UUID)
// Aufrufer: components/PlanningList.tsx
export const PlanningIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type PlanningIdParam = z.infer<typeof PlanningIdParamSchema>;

// /api/share/generate (POST) — Body: { planning_id, planning_title? }
// Aufrufer: components/ShareButton.tsx (snake_case bewusst beibehalten,
// da die Route diese Felder per Destructuring liest)
export const ShareGenerateBodySchema = z.object({
  planning_id: z.string().uuid(),
  planning_title: z.string().optional().nullable(),
});
export type ShareGenerateBody = z.infer<typeof ShareGenerateBodySchema>;

// /api/share/[token] (GET) — Path-Param: token (Slug-Präfix + UUID erlaubt;
// extractUuid() in lib/slugify zieht die UUID heraus). Optionaler Query-Param ?full=1.
export const ShareTokenParamSchema = z.object({
  token: z.string().min(1),
});
export type ShareTokenParam = z.infer<typeof ShareTokenParamSchema>;

// /api/share/[token]/join (POST) — kein Body, nur Path-Param + Authorization-Header
export const ShareJoinParamSchema = z.object({
  token: z.string().min(1),
});
export type ShareJoinParam = z.infer<typeof ShareJoinParamSchema>;
