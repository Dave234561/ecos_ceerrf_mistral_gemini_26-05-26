/**
 * Client-side type definitions for ECOS scenarios
 *
 * This file re-exports types from the shared types directory to maintain
 * backwards compatibility while ensuring type consistency across the stack.
 *
 * All database entity types should be defined in shared/types.ts
 */

// Re-export all shared types
export type {
  Scenario,
  ScenarioBasic,
  Teacher,
  AssignedTeacher,
  EnrolledStudent,
  TrainingSessionFormData,
  TrainingSessionResponse,
  ApiError,
} from '@shared/types';
