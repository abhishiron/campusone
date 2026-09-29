export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
