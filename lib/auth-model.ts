export type UserRole =
  | "employee"
  | "recruiter"
  | "hiring_manager"
  | "learning_development"
  | "system_admin";

export type SessionUser = {
  name: string;
  email: string;
  role: UserRole;
};

export const demoUsers: SessionUser[] = [
  { name: "Alex Smith", email: "alex.smith@amazon.com", role: "employee" },
  { name: "Priya Recruiter", email: "priya.recruiter@amazon.com", role: "recruiter" },
  { name: "Yash Admin", email: "yash.admin@amazon.com", role: "system_admin" },
  { name: "Lina L&D", email: "lina.learning@amazon.com", role: "learning_development" }
];
