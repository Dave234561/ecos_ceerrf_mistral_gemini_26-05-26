/**
 * Retry Utility with Exponential Backoff
 *
 * Server-side utility for retrying operations with exponential backoff
 * Supports custom retry conditions, timeout, and logging
 */

import { logger } from '../services/logger.service.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  timeout?: number;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
  operationName?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: number;
  totalTime: number;
}

/**
 * Execute an async operation with exponential backoff retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    timeout,
    retryCondition = () => true,
    onRetry,
    operationName = 'operation'
  } = options;

  let lastError: any;
  let attempt = 0;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    try {
      // Apply timeout if specified
      if (timeout) {
        return await executeWithTimeout(operation, timeout);
      }

      return await operation();

    } catch (error: any) {
      lastError = error;
      attempt++;

      // Check if we should retry
      const shouldRetry = attempt <= maxRetries && retryCondition(error);

      if (!shouldRetry) {
        logger.error(`${operationName} failed after ${attempt} attempts`, {
          error: error.message,
          totalTime: Date.now() - startTime,
          attempts: attempt
        });
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, initialDelay, maxDelay, backoffFactor);

      // Log retry attempt
      logger.warn(`${operationName} failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`, {
        error: error.message,
        attempt,
        delay
      });

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt);
      }

      // Wait before retry
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoff(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffFactor: number
): number {
  // Exponential backoff: initialDelay * (backoffFactor ^ (attempt - 1))
  const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±20% randomization) to avoid thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);

  return Math.max(100, Math.floor(cappedDelay + jitter));
}

/**
 * Execute operation with timeout
 */
async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([operation(), timeoutPromise]);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Common retry conditions
 */
export const RetryConditions = {
  /**
   * Retry on network errors and 5xx server errors
   */
  networkAndServerErrors: (error: any): boolean => {
    const errorMessage = error?.message?.toLowerCase() || '';
    const statusCode = error?.status || error?.statusCode || 0;

    // Network errors
    const isNetworkError =
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('fetch failed');

    // Server errors (5xx)
    const isServerError = statusCode >= 500 && statusCode < 600;

    // Rate limiting (429)
    const isRateLimited = statusCode === 429;

    return isNetworkError || isServerError || isRateLimited;
  },

  /**
   * Retry on timeout errors only
   */
  timeoutOnly: (error: any): boolean => {
    const errorMessage = error?.message?.toLowerCase() || '';
    return errorMessage.includes('timeout') || errorMessage.includes('etimedout');
  },

  /**
   * Retry on rate limit errors (429)
   */
  rateLimitOnly: (error: any): boolean => {
    const errorMessage = error?.message?.toLowerCase() || '';
    const statusCode = error?.status || error?.statusCode || 0;
    return statusCode === 429 || errorMessage.includes('rate limit');
  },

  /**
   * Always retry (use with caution)
   */
  always: (): boolean => true,

  /**
   * Never retry
   */
  never: (): boolean => false
};

/**
 * Preset configurations for common use cases
 */
export const RetryPresets = {
  /**
   * Default preset for API calls
   */
  api: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    timeout: 45000, // Increased from 30s to 45s
    retryCondition: RetryConditions.networkAndServerErrors
  } as RetryOptions,

  /**
   * Aggressive preset for critical operations
   */
  critical: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 30000,
    backoffFactor: 2,
    timeout: 90000, // Increased from 60s to 90s
    retryCondition: RetryConditions.networkAndServerErrors
  } as RetryOptions,

  /**
   * Conservative preset for non-critical operations
   */
  conservative: {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffFactor: 2,
    timeout: 15000,
    retryCondition: RetryConditions.networkAndServerErrors
  } as RetryOptions,

  /**
   * Database preset with longer timeouts
   */
  database: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 2,
    timeout: 60000, // Increased from 45s to 60s
    retryCondition: RetryConditions.networkAndServerErrors
  } as RetryOptions,

  /**
   * External API preset with rate limit handling
   */
  externalApi: {
    maxRetries: 4,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2,
    timeout: 45000, // Increased from 30s to 45s
    retryCondition: RetryConditions.networkAndServerErrors
  } as RetryOptions
};
