export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export interface User { id: string; name: string; email: string; role: Role; title: string }
export interface StudentRef { id: string; name: string; email: string; rollNo: string; classroom: string; program: string; batch: string; semester: number }
export interface Session { user: User; students: StudentRef[] }
export interface FileRef { id: string; name: string; size?: number }
export type Level = 'OK' | 'WARN' | 'DANGER';

export interface Course { id: string; code: string; name: string; credits: number; capacity: number; hue: number; classroomId: string; classroom: string; enrolled: number; teacherId: string; teacher: string }
export interface Classroom { id: string; name: string; dept: string; studentCount: number; courseCount: number }
export interface Person { id: string; name: string; email: string; role: Role; status: string; dept: string; designation: string | null; rollNo: string | null; classroom: string | null }

export interface Timetable { label: string; periods: string[]; slots: { day: number; slot: number; room: string; code: string; courseId: string }[]; courses: { code: string; name: string; hue: number }[] }

export interface TrackerCourse { courseId: string; code: string; name: string; a: number; t: number; pct: number | null; plan: number; rem: number; need: number; miss: number; minRest: number; level: Level; hist: number[] }
export interface AttendanceAlert { id: string; code: string; level: Level; pct: number; read: boolean; createdAt: string; channels: string[]; text: string }
export interface AttendanceSummary {
  warnAt: number; alertParent: boolean; hasParent: boolean; overall: number | null; attended: number; total: number; warnOptions: number[];
  courses: TrackerCourse[]; alerts: AttendanceAlert[]; recent: { date: string; status: string; source: string; code: string }[];
}
export interface RosterRow { studentId: string; name: string; rollNo: string; status: string | null; checkIn: string | null }

export interface Submission { id: string; note: string; submittedAt: string; marks: number | null; feedback: string | null; gradedAt: string | null; file: FileRef | null }
export interface Assignment {
  id: string; title: string; description: string; dueDate: string; maxMarks: number; files: FileRef[];
  course: { id: string; code: string; name: string };
  classSize?: number; submittedCount?: number; gradedCount?: number; // professor view
  submission?: Submission | null; // student and parent view
}

export interface Grades {
  max: number; cgpa: number | null; creditsEarned: number; degreeCredits: number;
  semesters: { semester: number; sgpa: number }[];
  internals: { code: string; name: string; marks: number | null }[];
  assignments: { id: string; title: string; code: string; marks: number; maxMarks: number; feedback: string | null; gradedAt: string }[];
}

export interface Announcement { id: string; title: string; body: string; audience: string; createdAt: string; by: string; canDelete: boolean }
export interface AppNotification { id: string; title: string; body: string; link: string | null; kind: 'INFO' | 'WARN'; read: boolean; createdAt: string }

export interface Exam { id: string; date: string; time: string; code: string; name: string; syllabus: string; room: string; seat: string; maxMarks: number; attendance: number | null; eligible: boolean }
export interface ExamsPayload { student: { name: string; rollNo: string; program: string; semester: number; classroom: string; batch: string }; clearBy: string | null; exams: Exam[] }

export interface StudySession {
  id: string; title: string; description: string; start: string; durationMin: number; link: string; capacity: number;
  course: { id: string; code: string } | null; host: string; isHost: boolean; going: string[]; imGoing: boolean;
}
export interface Resource { id: string; title: string; type: 'NOTES' | 'PYQ'; code: string; courseId: string; createdAt: string; by: string; file: FileRef & { size: number }; votes: number; voted: boolean }
export interface Book { id: string; title: string; author: string; issuedOn: string; dueOn: string; renewals: number; daysLeft: number; fine: number }
export interface LibraryPayload { limit: number; finePerDay: number; maxRenewals: number; renewDays: number; fine: number; books: Book[] }
export interface Fees {
  student: { name: string; rollNo: string; semester: number };
  items: { label: string; amount: number }[]; total: number; paid: number; balance: number; due: string | null;
  payments: { txn: string; amount: number; method: string; paidBy: string; createdAt: string }[];
}
export interface Leave { id: string; name: string; type: string; from: string; to: string; days: number; reason: string; status: string; createdAt: string; file: FileRef | null }
export interface LeavesPayload { types: string[]; certTypes: string[]; coordinator: string | null; leaves: Leave[] }
export interface Certificate { id: string; name: string; type: string; purpose: string; status: string; createdAt: string }
export interface Drive { id: string; company: string; role: string; pkg: string; type: string; minCgpa: number; maxBacklogs: number; deadline: string; daysLeft: number; closed: boolean; cgpaOk: boolean; backlogsOk: boolean; registered: boolean }

export interface Campus { name: string; lat: number; lng: number; radius: number }
export interface CheckInRec { id: string; studentId: string; courseId: string; date: string; dist: number; acc: number; method: string; simulated: boolean; flags: string[]; status: string; photo: string; createdAt: string; name?: string; code?: string; courseName?: string }
