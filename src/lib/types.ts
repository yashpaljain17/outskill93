export type Species = "dog" | "cat" | "bird" | "rabbit" | "fish" | "reptile" | "other";

export interface Pet {
  id: string;
  owner_id: string;
  name: string;
  species: Species | string;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  photo_url: string | null;
  allergies: string | null;
  notes: string | null;
  created_at: string;
}

export type RoutineKind =
  | "feeding"
  | "walk"
  | "medication"
  | "grooming"
  | "play"
  | "training"
  | "other";

export interface Routine {
  id: string;
  pet_id: string;
  kind: RoutineKind;
  title: string;
  times: string[];
  days: number[];
  amount: string | null;
  notes: string | null;
  active: boolean;
  ends_on: string | null;
  created_at: string;
}

export interface RoutineLog {
  id: string;
  routine_id: string;
  pet_id: string;
  log_date: string;
  slot: string;
  done_at: string;
}

export interface Vaccination {
  id: string;
  pet_id: string;
  vaccine: string;
  given_on: string | null;
  next_due: string | null;
  clinic: string | null;
  notes: string | null;
}

export type AppointmentKind = "vet" | "grooming" | "training" | "other";

export interface Appointment {
  id: string;
  pet_id: string;
  kind: AppointmentKind;
  title: string;
  starts_at: string;
  location: string | null;
  notes: string | null;
  status: "requested" | "scheduled" | "done" | "cancelled";
}

export interface Checklist {
  id: string;
  pet_id: string | null;
  title: string;
  summary: string | null;
  source_text: string | null;
  safety_notes: string[];
  created_at: string;
  checklist_items?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  position: number;
  title: string;
  details: string | null;
  frequency: string | null;
  time_of_day: string | null;
  category: string | null;
  done: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Question {
  id: string;
  author_id: string;
  title: string;
  body: string;
  species: string | null;
  tags: string[];
  ai_answer: string | null;
  accepted_answer_id: string | null;
  created_at: string;
  profiles?: Pick<Profile, "display_name"> | null;
  answers?: { count: number }[];
}

export interface Answer {
  id: string;
  author_id: string;
  question_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "display_name"> | null;
  answer_votes?: { user_id: string }[];
}
