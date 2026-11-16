export type Role = 'SUPERADMIN' | 'ADMIN' | 'SCHOOL' | 'TEACHER' | 'STUDENT' | 'PARENT';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
