export const ROLES = ["user", "student", "coach", "moderator", "admin", "developer"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { user: 0, student: 1, coach: 2, moderator: 3, admin: 4, developer: 5 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}
