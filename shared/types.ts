/**
 * Shared TypeScript types for database entities
 * These types are used by both frontend and backend for type-safe data exchange
 */

/**
 * Teacher/Admin user from users table
 * Returned by getTeachers() and used in teacher assignment flows
 */
export interface Teacher {
  id: number;
  email: string;
  role: 'admin' | 'teacher';
  created_at: string;
}

/**
 * Teacher assignment from training_session_teachers table
 * Returned by getSessionTeachers() for a specific training session
 */
export interface AssignedTeacher {
  teacher_email: string;
  assigned_at: string;
}

/**
 * Student enrollment from training_session_students table
 */
export interface EnrolledStudent {
  studentEmail: string;
  assignedAt: string;
  status?: 'active' | 'inactive';
}

/**
 * Scenario from scenarios table (basic info)
 */
export interface ScenarioBasic {
  id: number;
  title: string;
  description?: string;
}

/**
 * Full scenario from scenarios table
 */
export interface Scenario {
  id: number;
  title: string;
  description?: string;
  patient_prompt?: string;
  patientPrompt?: string;
  evaluation_criteria?: any;
  evaluationCriteria?: any;
  pinecone_index?: string;
  pineconeIndex?: string;
  image_url?: string;
  imageUrl?: string;
  created_by?: string;
  createdBy?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Training session form data for create/update operations
 */
export interface TrainingSessionFormData {
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  scenarioIds?: number[];
  studentEmails?: string[];
  selectedScenarios?: number[];
}

/**
 * Training session response from API
 */
export interface TrainingSessionResponse {
  trainingSession?: {
    id: number;
    title: string;
    description?: string;
    students?: EnrolledStudent[];
  };
  message?: string;
  success?: boolean;
}

/**
 * API error response
 */
export interface ApiError {
  message: string;
  error?: string;
  code?: string;
  details?: string;
}
