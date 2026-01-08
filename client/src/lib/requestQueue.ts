/**
 * Request Queue Service with Exponential Backoff
 *
 * Handles automatic retry for rate-limited requests (429 errors)
 * Implements exponential backoff strategy to avoid overwhelming the server
 */

interface QueuedRequest {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retryCount: number;
  maxRetries: number;
}

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private activeRequests = 0;
  private maxConcurrent = 3; // Maximum concurrent requests
  private rateLimitDelay = 0; // Current rate limit backoff delay
  private requestCallbacks: Set<(status: QueueStatus) => void> = new Set();

  /**
   * Subscribe to queue status changes
   */
  subscribe(callback: (status: QueueStatus) => void): () => void {
    this.requestCallbacks.add(callback);
    return () => this.requestCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers of queue status change
   */
  private notifySubscribers() {
    const status = this.getStatus();
    this.requestCallbacks.forEach(cb => cb(status));
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      isRateLimited: this.rateLimitDelay > 0,
      estimatedWaitTime: this.calculateEstimatedWaitTime()
    };
  }

  /**
   * Calculate estimated wait time based on queue and rate limits
   */
  private calculateEstimatedWaitTime(): number {
    if (this.queue.length === 0) return 0;

    // Base wait time is the current rate limit delay
    let waitTime = this.rateLimitDelay;

    // Add queue processing time (assuming ~2 seconds per request)
    const queueTime = Math.max(0, this.queue.length - this.maxConcurrent) * 2000;
    waitTime += queueTime;

    return Math.ceil(waitTime / 1000); // Return in seconds
  }

  /**
   * Execute a request with automatic retry and exponential backoff
   */
  async enqueue<T>(
    requestFn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 5,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2
    } = options;

    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: this.generateId(),
        execute: requestFn,
        resolve,
        reject,
        retryCount: 0,
        maxRetries
      };

      this.queue.push(queuedRequest);
      this.notifySubscribers();
      this.processQueue();
    });
  }

  /**
   * Process the queue
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const request = this.queue.shift();
      if (!request) break;

      this.activeRequests++;
      this.notifySubscribers();
      this.executeRequest(request);
    }

    this.processing = false;
  }

  /**
   * Execute a single request with retry logic
   */
  private async executeRequest(request: QueuedRequest) {
    try {
      // Wait for rate limit backoff if needed
      if (this.rateLimitDelay > 0) {
        await this.sleep(this.rateLimitDelay);
        this.rateLimitDelay = 0;
      }

      const result = await request.execute();
      request.resolve(result);

    } catch (error: any) {
      await this.handleRequestError(request, error);
    } finally {
      this.activeRequests--;
      this.notifySubscribers();
      this.processQueue();
    }
  }

  /**
   * Handle request errors with retry logic
   */
  private async handleRequestError(request: QueuedRequest, error: any) {
    const isRateLimitError = this.isRateLimitError(error);
    const isRetryable = this.isRetryableError(error);
    const shouldRetry = isRetryable && request.retryCount < request.maxRetries;

    if (!shouldRetry) {
      // Only log as error if it's truly unexpected
      // 404s are often expected (resource not found) and shouldn't alarm users in console
      const status = error.status || 0;
      const isExpectedError = status === 404; // Not Found - often expected

      if (!isExpectedError) {
        if (request.retryCount > 0) {
          // Retryable error that exhausted all retries
          console.error(`❌ Request failed after ${request.retryCount} retries:`, {
            error: error.message,
            status: error.status,
            errorType: this.getErrorType(error),
            isRetryable
          });
        } else if (isRetryable) {
          // Retryable error on first attempt (shouldn't happen, but log for debugging)
          console.warn(`⚠️ Retryable error but max retries reached:`, {
            error: error.message,
            status: error.status,
            errorType: this.getErrorType(error)
          });
        }
        // Non-retryable errors (400, 401, 403) are handled by the application layer
        // No need to log them here as they're expected to be caught and handled
      }

      request.reject(error);
      return;
    }

    request.retryCount++;

    // Calculate backoff delay
    const delay = this.calculateBackoff(request.retryCount, isRateLimitError, error);

    console.log(`🔄 Retrying request (attempt ${request.retryCount}/${request.maxRetries}) after ${delay}ms`, {
      isRateLimitError,
      status: error.status,
      errorType: this.getErrorType(error),
      error: error.message
    });

    // Set rate limit delay for all requests if this is a rate limit error
    if (isRateLimitError) {
      this.rateLimitDelay = delay;
    }

    // Re-queue the request
    await this.sleep(delay);
    this.queue.unshift(request); // Add to front of queue for priority
    this.notifySubscribers();
  }

  /**
   * Get human-readable error type for logging
   */
  private getErrorType(error: any): string {
    if (this.isRateLimitError(error)) return 'Rate Limit (429)';

    const status = error?.status || 0;
    if (status >= 500) return `Server Error (${status})`;

    const errorMessage = error?.message?.toLowerCase() || '';
    if (errorMessage.includes('timeout')) return 'Timeout';
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) return 'Network Error';

    return `HTTP ${status || 'Unknown'}`;
  }

  /**
   * Check if error is a rate limit error (429)
   */
  private isRateLimitError(error: any): boolean {
    const errorMessage = error?.message || error?.toString() || '';
    const status = error?.status || 0;
    return status === 429 ||
           errorMessage.includes('429') ||
           errorMessage.toLowerCase().includes('rate limit') ||
           errorMessage.toLowerCase().includes('too many requests');
  }

  /**
   * Check if error is retryable (network errors, 5xx, timeouts)
   */
  private isRetryableError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || error?.toString()?.toLowerCase() || '';
    const status = error?.status || 0;

    // Rate limit errors
    if (this.isRateLimitError(error)) return true;

    // Network errors
    const isNetworkError =
      errorMessage.includes('failed to fetch') ||
      errorMessage.includes('network request failed') ||
      errorMessage.includes('networkerror') ||
      errorMessage.includes('network error') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout');

    // Server errors (5xx)
    const isServerError = status >= 500 && status < 600;

    // Timeout errors
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');

    return isNetworkError || isServerError || isTimeout;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(
    retryCount: number,
    isRateLimitError: boolean,
    error: any
  ): number {
    // If server provides Retry-After header, use it
    if (isRateLimitError && error?.retryAfter) {
      return error.retryAfter * 1000; // Convert seconds to ms
    }

    // Exponential backoff: initialDelay * (backoffFactor ^ retryCount)
    const baseDelay = isRateLimitError ? 2000 : 1000; // Longer delay for rate limits
    const backoffFactor = 2;
    const maxDelay = 30000; // 30 seconds max

    const delay = Math.min(
      baseDelay * Math.pow(backoffFactor, retryCount - 1),
      maxDelay
    );

    // Add jitter to avoid thundering herd (±20% randomization)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.max(100, Math.floor(delay + jitter));
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear the queue (useful for logout/cleanup)
   */
  clear() {
    this.queue.forEach(req => {
      req.reject(new Error('Request queue cleared'));
    });
    this.queue = [];
    this.rateLimitDelay = 0;
    this.notifySubscribers();
  }
}

// Export types
export interface QueueStatus {
  queueLength: number;
  activeRequests: number;
  isRateLimited: boolean;
  estimatedWaitTime: number; // in seconds
}

// Singleton instance
export const requestQueue = new RequestQueue();

// Export retry options for external use
export type { RetryOptions };
