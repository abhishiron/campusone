export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export interface User { id: string; name: string; email: string; role: Role }
export interface StudentRef { id: string; name: string; rollNo: string; classroom: string }
export interface Session { user: User; students: StudentRef[] }
export interface Course { id: string; code: string; name: string; classroomId: string; classroom: string; teacherId: string; teacher: string }
export interface Classroom { id: string; name: string; studentCount: number; courseCount: number }
export interface Person {
  id: string; name: string; email: string; role: Role; rollNo: string | null; classroom: string | null;
  parentName: string | null; childCount: number; courseCount: number;
}
export type AttStatus = 'PRESENT' | 'LATE' | 'ABSENT';
export interface RosterRow { studentId: string; name: string; rollNo: string; status: AttStatus | null }
export interface CourseAttendance { courseId: string; code: string; name: string; present: number; late: number; absent: number; total: number; percentage: number | null }
export interface AttendanceSummary { overall: number | null; total: number; courses: CourseAttendance[]; recent: { id: string; date: string; status: AttStatus; course: string }[] }
export interface Submission { id: string; content: string; submittedAt: string; marks: number | null; feedback: string | null; gradedAt: string | null }
export interface Assignment {
  id: string; title: string; description: string; dueDate: string; maxMarks: number; createdAt: string;
  course: { id: string; code: string; name: string };
  classSize?: number; submittedCount?: number; gradedCount?: number; // teacher view
  submission?: Submission | null; // student / parent view
}
export interface SubmissionsPayload {
  assignment: { id: string; title: string; description: string; dueDate: string; maxMarks: number; course: { code: string; name: string } };
  rows: { studentId: string; name: string; rollNo: string; submission: Submission | null }[];
}
export interface GradesPayload {
  overall: number | null;
  courses: { courseId: string; code: string; name: string; gradedCount: number; earned: number; possible: number; percentage: number | null;
    items: { id: string; title: string; marks: number; maxMarks: number; feedback: string | null; gradedAt: string }[] }[];
}
export interface Announcement { id: string; title: string; body: string; audience: string; createdAt: string; author: string; authorRole: Role; canDelete: boolean }
export interface AppNotification { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }
