/**
 * Evaluation Job Service
 *
 * Manages asynchronous evaluation jobs to reduce perceived wait time
 * Jobs are processed in background while client receives immediate response
 */

import { logger } from './logger.service.js';
import { EventEmitter } from 'events';

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface EvaluationJob {
  jobId: string;
  sessionId: string;
  email: string;
  status: JobStatus;
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
}

export interface EvaluationJobInput {
  sessionId: string;
  email: string;
  criteria?: any;
  responses?: any;
}

class EvaluationJobService extends EventEmitter {
  private jobs = new Map<string, EvaluationJob>();
  private jobsBySession = new Map<string, string>(); // sessionId -> jobId mapping
  private processingQueue: string[] = [];
  private isProcessing = false;
  private maxConcurrent = 10; // Maximum concurrent evaluation jobs (increased for load testing)
  private activeJobs = 0;

  constructor() {
    super();
    this.startProcessor();
    this.startCleanup();
  }

  /**
   * Create a new evaluation job
   */
  createJob(input: EvaluationJobInput): EvaluationJob {
    const jobId = `eval_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if there's already a job for this session
    const existingJobId = this.jobsBySession.get(input.sessionId);
    if (existingJobId) {
      const existingJob = this.jobs.get(existingJobId);
      if (existingJob && (existingJob.status === JobStatus.PENDING || existingJob.status === JobStatus.PROCESSING)) {
        logger.info('Returning existing job for session', { sessionId: input.sessionId, jobId: existingJobId });
        return existingJob;
      }
    }

    const job: EvaluationJob = {
      jobId,
      sessionId: input.sessionId,
      email: input.email,
      status: JobStatus.PENDING,
      createdAt: new Date(),
      progress: 0
    };

    this.jobs.set(jobId, job);
    this.jobsBySession.set(input.sessionId, jobId);
    this.processingQueue.push(jobId);

    logger.info('Created evaluation job', { jobId, sessionId: input.sessionId, email: input.email });

    // Trigger processing
    this.processQueue();

    return job;
  }

  /**
   * Get job status by job ID
   */
  getJob(jobId: string): EvaluationJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get job by session ID
   */
  getJobBySessionId(sessionId: string): EvaluationJob | null {
    const jobId = this.jobsBySession.get(sessionId);
    if (!jobId) return null;
    return this.jobs.get(jobId) || null;
  }

  /**
   * Update job status
   */
  private updateJob(jobId: string, updates: Partial<EvaluationJob>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    Object.assign(job, updates);
    this.jobs.set(jobId, job);

    // Emit event for status change
    this.emit('job:updated', job);

    logger.info('Updated job status', {
      jobId,
      sessionId: job.sessionId,
      status: job.status,
      progress: job.progress
    });
  }

  /**
   * Mark job as processing
   */
  startProcessing(jobId: string): void {
    this.updateJob(jobId, {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      progress: 10
    });
  }

  /**
   * Update job progress
   */
  updateProgress(jobId: string, progress: number): void {
    this.updateJob(jobId, { progress });
  }

  /**
   * Mark job as completed
   */
  completeJob(jobId: string, result: any): void {
    this.updateJob(jobId, {
      status: JobStatus.COMPLETED,
      result,
      completedAt: new Date(),
      progress: 100
    });
  }

  /**
   * Mark job as failed
   */
  failJob(jobId: string, error: string): void {
    this.updateJob(jobId, {
      status: JobStatus.FAILED,
      error,
      completedAt: new Date()
    });
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.processingQueue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const jobId = this.processingQueue.shift();
      if (!jobId) continue;

      const job = this.jobs.get(jobId);
      if (!job || job.status !== JobStatus.PENDING) continue;

      this.activeJobs++;

      // Process job asynchronously without awaiting
      this.processJob(jobId).finally(() => {
        this.activeJobs--;
        // Continue processing queue
        setImmediate(() => this.processQueue());
      });
    }

    this.isProcessing = false;
  }

  /**
   * Process a single evaluation job
   */
  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      this.startProcessing(jobId);

      // Import the evaluation logic dynamically to avoid circular dependencies
      const { executeEvaluation } = await import('./evaluation-executor.service.js');

      logger.info('Processing evaluation job', { jobId, sessionId: job.sessionId });

      // Execute the evaluation
      const result = await executeEvaluation(job.sessionId, job.email, (progress) => {
        this.updateProgress(jobId, progress);
      });

      this.completeJob(jobId, result);
      logger.info('Evaluation job completed', { jobId, sessionId: job.sessionId });

    } catch (error: any) {
      logger.error('Evaluation job failed', {
        jobId,
        sessionId: job.sessionId,
        error: error.message
      });
      this.failJob(jobId, error.message || 'Evaluation failed');
    }
  }

  /**
   * Start background processor
   */
  private startProcessor(): void {
    // Check for pending jobs every 5 seconds
    setInterval(() => {
      if (this.processingQueue.length > 0) {
        this.processQueue();
      }
    }, 5000);
  }

  /**
   * Clean up old completed/failed jobs
   */
  private startCleanup(): void {
    // Clean up jobs older than 1 hour every 10 minutes
    setInterval(() => {
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour

      for (const [jobId, job] of this.jobs) {
        if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
          const age = now - (job.completedAt?.getTime() || job.createdAt.getTime());
          if (age > maxAge) {
            this.jobs.delete(jobId);
            this.jobsBySession.delete(job.sessionId);
            logger.info('Cleaned up old job', { jobId, sessionId: job.sessionId, status: job.status });
          }
        }
      }
    }, 10 * 60 * 1000); // Every 10 minutes
  }

  /**
   * Get statistics about job processing
   */
  getStats(): {
    totalJobs: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    queueLength: number;
    activeJobs: number;
  } {
    let pending = 0, processing = 0, completed = 0, failed = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case JobStatus.PENDING: pending++; break;
        case JobStatus.PROCESSING: processing++; break;
        case JobStatus.COMPLETED: completed++; break;
        case JobStatus.FAILED: failed++; break;
      }
    }

    return {
      totalJobs: this.jobs.size,
      pending,
      processing,
      completed,
      failed,
      queueLength: this.processingQueue.length,
      activeJobs: this.activeJobs
    };
  }
}

// Singleton instance
export const evaluationJobService = new EvaluationJobService();
