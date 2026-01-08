var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/services/logger.service.ts
var _Logger, Logger, logger, dbLogger, authLogger, apiLogger;
var init_logger_service = __esm({
  "server/services/logger.service.ts"() {
    "use strict";
    _Logger = class _Logger {
      constructor(serviceName = "app") {
        this.serviceName = serviceName;
        this.isDevelopment = process.env.NODE_ENV !== "production";
      }
      formatLog(level, message, context) {
        return {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level,
          message,
          context,
          service: this.serviceName,
          requestId: this.getCurrentRequestId()
        };
      }
      getCurrentRequestId() {
        return void 0;
      }
      log(level, message, context) {
        const entry = this.formatLog(level, message, context);
        if (this.isDevelopment) {
          const emoji = this.getLevelEmoji(level);
          const coloredLevel = this.getColoredLevel(level);
          if (context && Object.keys(context).length > 0) {
            console.log(`${emoji} ${coloredLevel} [${this.serviceName}] ${message}`, context);
          } else {
            console.log(`${emoji} ${coloredLevel} [${this.serviceName}] ${message}`);
          }
        } else {
          console.log(JSON.stringify(entry));
        }
      }
      getLevelEmoji(level) {
        switch (level) {
          case "error" /* ERROR */:
            return "\u274C";
          case "warn" /* WARN */:
            return "\u26A0\uFE0F";
          case "info" /* INFO */:
            return "\u2705";
          case "debug" /* DEBUG */:
            return "\u{1F50D}";
          case "trace" /* TRACE */:
            return "\u{1F4DD}";
          default:
            return "\u2139\uFE0F";
        }
      }
      getColoredLevel(level) {
        return level.toUpperCase();
      }
      error(message, context) {
        this.log("error" /* ERROR */, message, context);
      }
      warn(message, context) {
        this.log("warn" /* WARN */, message, context);
      }
      info(message, context) {
        this.log("info" /* INFO */, message, context);
      }
      debug(message, context) {
        if (this.isDevelopment) {
          this.log("debug" /* DEBUG */, message, context);
        }
      }
      trace(message, context) {
        if (this.isDevelopment) {
          this.log("trace" /* TRACE */, message, context);
        }
      }
      // Database operation logging
      database(operation, duration, context) {
        const logContext = {
          operation,
          duration: duration ? `${duration}ms` : void 0,
          ...context
        };
        this.info(`Database ${operation}`, logContext);
      }
      // HTTP request logging
      request(method, path, statusCode, duration, context) {
        const logContext = {
          method,
          path,
          statusCode,
          duration: duration ? `${duration}ms` : void 0,
          ...context
        };
        if (statusCode && statusCode >= 400) {
          this.error(`HTTP ${method} ${path}`, logContext);
        } else {
          this.info(`HTTP ${method} ${path}`, logContext);
        }
      }
      // Service initialization logging
      service(serviceName, status, duration, context) {
        const logContext = {
          service: serviceName,
          status,
          duration: duration ? `${duration}ms` : void 0,
          ...context
        };
        switch (status) {
          case "starting":
            this.info(`Service ${serviceName} starting`, logContext);
            break;
          case "ready":
            this.info(`Service ${serviceName} ready`, logContext);
            break;
          case "error":
            this.error(`Service ${serviceName} failed`, logContext);
            break;
        }
      }
    };
    __name(_Logger, "Logger");
    Logger = _Logger;
    logger = new Logger("ecos-app");
    dbLogger = new Logger("database");
    authLogger = new Logger("auth");
    apiLogger = new Logger("api");
  }
});

// server/utils/retry.ts
async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1e3,
    maxDelay = 3e4,
    backoffFactor = 2,
    timeout,
    retryCondition = /* @__PURE__ */ __name(() => true, "retryCondition"),
    onRetry,
    operationName = "operation"
  } = options;
  let lastError;
  let attempt = 0;
  const startTime = Date.now();
  while (attempt <= maxRetries) {
    try {
      if (timeout) {
        return await executeWithTimeout(operation, timeout);
      }
      return await operation();
    } catch (error) {
      lastError = error;
      attempt++;
      const shouldRetry = attempt <= maxRetries && retryCondition(error);
      if (!shouldRetry) {
        logger.error(`${operationName} failed after ${attempt} attempts`, {
          error: error.message,
          totalTime: Date.now() - startTime,
          attempts: attempt
        });
        throw error;
      }
      const delay = calculateBackoff(attempt, initialDelay, maxDelay, backoffFactor);
      logger.warn(`${operationName} failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`, {
        error: error.message,
        attempt,
        delay
      });
      if (onRetry) {
        onRetry(error, attempt);
      }
      await sleep(delay);
    }
  }
  throw lastError;
}
function calculateBackoff(attempt, initialDelay, maxDelay, backoffFactor) {
  const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);
  return Math.max(100, Math.floor(cappedDelay + jitter));
}
async function executeWithTimeout(operation, timeoutMs) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([operation(), timeoutPromise]);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var RetryConditions, RetryPresets;
var init_retry = __esm({
  "server/utils/retry.ts"() {
    "use strict";
    init_logger_service();
    __name(withRetry, "withRetry");
    __name(calculateBackoff, "calculateBackoff");
    __name(executeWithTimeout, "executeWithTimeout");
    __name(sleep, "sleep");
    RetryConditions = {
      /**
       * Retry on network errors and 5xx server errors
       */
      networkAndServerErrors: /* @__PURE__ */ __name((error) => {
        const errorMessage = error?.message?.toLowerCase() || "";
        const statusCode = error?.status || error?.statusCode || 0;
        const isNetworkError = errorMessage.includes("econnrefused") || errorMessage.includes("enotfound") || errorMessage.includes("etimedout") || errorMessage.includes("network") || errorMessage.includes("fetch failed");
        const isServerError = statusCode >= 500 && statusCode < 600;
        const isRateLimited = statusCode === 429;
        return isNetworkError || isServerError || isRateLimited;
      }, "networkAndServerErrors"),
      /**
       * Retry on timeout errors only
       */
      timeoutOnly: /* @__PURE__ */ __name((error) => {
        const errorMessage = error?.message?.toLowerCase() || "";
        return errorMessage.includes("timeout") || errorMessage.includes("etimedout");
      }, "timeoutOnly"),
      /**
       * Retry on rate limit errors (429)
       */
      rateLimitOnly: /* @__PURE__ */ __name((error) => {
        const errorMessage = error?.message?.toLowerCase() || "";
        const statusCode = error?.status || error?.statusCode || 0;
        return statusCode === 429 || errorMessage.includes("rate limit");
      }, "rateLimitOnly"),
      /**
       * Always retry (use with caution)
       */
      always: /* @__PURE__ */ __name(() => true, "always"),
      /**
       * Never retry
       */
      never: /* @__PURE__ */ __name(() => false, "never")
    };
    RetryPresets = {
      /**
       * Default preset for API calls
       */
      api: {
        maxRetries: 3,
        initialDelay: 1e3,
        maxDelay: 1e4,
        backoffFactor: 2,
        timeout: 45e3,
        // Increased from 30s to 45s
        retryCondition: RetryConditions.networkAndServerErrors
      },
      /**
       * Aggressive preset for critical operations
       */
      critical: {
        maxRetries: 5,
        initialDelay: 500,
        maxDelay: 3e4,
        backoffFactor: 2,
        timeout: 9e4,
        // Increased from 60s to 90s
        retryCondition: RetryConditions.networkAndServerErrors
      },
      /**
       * Conservative preset for non-critical operations
       */
      conservative: {
        maxRetries: 2,
        initialDelay: 2e3,
        maxDelay: 1e4,
        backoffFactor: 2,
        timeout: 15e3,
        retryCondition: RetryConditions.networkAndServerErrors
      },
      /**
       * Database preset with longer timeouts
       */
      database: {
        maxRetries: 3,
        initialDelay: 1e3,
        maxDelay: 15e3,
        backoffFactor: 2,
        timeout: 6e4,
        // Increased from 45s to 60s
        retryCondition: RetryConditions.networkAndServerErrors
      },
      /**
       * External API preset with rate limit handling
       */
      externalApi: {
        maxRetries: 4,
        initialDelay: 2e3,
        maxDelay: 3e4,
        backoffFactor: 2,
        timeout: 45e3,
        // Increased from 30s to 45s
        retryCondition: RetryConditions.networkAndServerErrors
      }
    };
  }
});

// server/services/unified-database.service.ts
import { createClient } from "@supabase/supabase-js";
var _UnifiedDatabaseService, UnifiedDatabaseService, unifiedDb;
var init_unified_database_service = __esm({
  "server/services/unified-database.service.ts"() {
    "use strict";
    init_retry();
    _UnifiedDatabaseService = class _UnifiedDatabaseService {
      constructor() {
        this.supabase = null;
        this.isInitialized = false;
        this.initializationPromise = null;
        this.fallbackSessions = /* @__PURE__ */ new Map();
        this.fallbackSessionMessages = /* @__PURE__ */ new Map();
        this.fallbackEvaluations = /* @__PURE__ */ new Map();
        this.ensuredUsers = /* @__PURE__ */ new Set();
        this.startupTime = /* @__PURE__ */ new Date();
        this.metrics = {
          connectionAttempts: 0,
          successfulConnections: 0,
          failedConnections: 0,
          lastConnectionTime: /* @__PURE__ */ new Date(),
          isHealthy: false,
          responseTime: 0
        };
      }
      /**
       * Initialize the database service (called once)
       */
      async initialize() {
        if (this.isInitialized) return;
        if (this.initializationPromise) {
          return this.initializationPromise;
        }
        this.initializationPromise = this._performInitialization();
        return this.initializationPromise;
      }
      async _performInitialization() {
        this.metrics.connectionAttempts++;
        const startTime = Date.now();
        try {
          console.log("\u{1F527} Initializing Unified Database Service...");
          let supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
          if (!supabaseUrl || !supabaseKey) {
            throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
          }
          if (supabaseUrl.startsWith("postgresql://")) {
            const match = supabaseUrl.match(/db\.([^.]+)\.supabase\.co/);
            if (match) {
              const projectId = match[1];
              supabaseUrl = `https://${projectId}.supabase.co`;
              console.log("\u{1F504} Converted to Supabase HTTP URL");
            }
          }
          this.supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
              persistSession: false,
              // Disable session persistence for better performance
              autoRefreshToken: false
              // Disable auto-refresh in server-side context
            },
            global: {
              headers: {
                "x-client-info": "ecos-infirmier-server"
              }
            },
            db: {
              schema: "public"
            },
            // Realtime disabled for performance (not used in this service)
            realtime: {
              params: {
                eventsPerSecond: 2
              }
            }
          });
          await this._performHealthCheck();
          this.isInitialized = true;
          this.metrics.successfulConnections++;
          this.metrics.responseTime = Date.now() - startTime;
          this.metrics.isHealthy = true;
          this.metrics.lastConnectionTime = /* @__PURE__ */ new Date();
          console.log("\u2705 Unified Database Service initialized successfully");
        } catch (error) {
          this.metrics.failedConnections++;
          this.metrics.isHealthy = false;
          console.error("\u274C Database service initialization failed:", error.message);
          throw error;
        } finally {
          this.initializationPromise = null;
        }
      }
      async _performHealthCheck() {
        const startTime = Date.now();
        try {
          const { error } = await this.supabase.from("scenarios").select("id").limit(1);
          if (error && !error.message.includes("does not exist")) {
            throw error;
          }
          this.metrics.responseTime = Date.now() - startTime;
          console.log(`\u2705 Health check passed (${this.metrics.responseTime}ms)`);
        } catch (error) {
          console.warn("\u26A0\uFE0F Health check warning:", error.message);
          if (!error.message.includes("does not exist")) {
            throw error;
          }
        }
      }
      /**
       * Get database client (ensures initialization)
       * Public method to allow external services to access the client
       */
      async getClient() {
        await this.initialize();
        if (!this.supabase) {
          throw new Error("Database service not initialized");
        }
        return this.supabase;
      }
      /**
       * Ensure a user record exists before inserting related rows that depend on email FK
       */
      async ensureUserExists(email) {
        if (!email) return;
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || this.ensuredUsers.has(normalizedEmail)) {
          return;
        }
        try {
          const client = await this.getClient();
          const timestamp = (/* @__PURE__ */ new Date()).toISOString();
          const { error } = await withRetry(
            () => client.from("users").upsert([
              {
                email: normalizedEmail,
                updated_at: timestamp
              }
            ], { onConflict: "email" }),
            {
              ...RetryPresets.database,
              operationName: "Supabase ensureUserExists"
            }
          );
          if (error) {
            console.warn(`\u26A0\uFE0F Failed to ensure user ${normalizedEmail}:`, error.message);
            return;
          }
          this.ensuredUsers.add(normalizedEmail);
          console.log(`\u{1F464} Ensured user record exists for ${normalizedEmail}`);
        } catch (error) {
          console.warn(`\u26A0\uFE0F Error ensuring user ${normalizedEmail}:`, error.message);
        }
      }
      /**
       * Get all scenarios
       */
      async getScenarios() {
        try {
          const client = await this.getClient();
          const { data, error } = await client.from("scenarios").select(`
          id,
          title,
          description,
          patient_prompt,
          evaluation_criteria,
          image_url,
          created_by,
          created_at,
          updated_at
        `).order("created_at", { ascending: false });
          if (error) {
            if (error.message.includes("does not exist")) {
              console.log("\u26A0\uFE0F Scenarios table does not exist, returning empty array");
              return [];
            }
            throw error;
          }
          console.log(`\u2705 Retrieved ${data?.length || 0} scenarios`);
          const mappedData = (data || []).map((scenario) => ({
            ...scenario,
            patient_prompt: scenario.patient_prompt || null,
            evaluation_criteria: scenario.evaluation_criteria || null
          }));
          return mappedData;
        } catch (error) {
          console.error("\u274C Error fetching scenarios:", error.message);
          throw error;
        }
      }
      /**
       * Get dashboard statistics
       */
      async getDashboardStats() {
        try {
          const client = await this.getClient();
          const scenarios = await this.getScenarios();
          const totalScenarios = scenarios.length;
          const { data: allSessions, error: sessionsError } = await client.from("sessions").select(`
          id,
          session_id,
          student_email,
          scenario_id,
          status,
          start_time,
          end_time,
          created_at,
          updated_at,
          scenarios (
            id,
            title,
            description
          )
        `).order("created_at", { ascending: false });
          if (sessionsError) {
            console.warn("\u26A0\uFE0F Error fetching sessions for stats:", sessionsError.message);
            return {
              totalScenarios,
              activeSessions: 0,
              completedSessions: 0,
              totalStudents: 0,
              sessions: []
            };
          }
          const sessions = allSessions || [];
          const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "in_progress").length;
          const completedSessions = sessions.filter((s) => s.status === "completed").length;
          let totalStudents = 0;
          try {
            const { data: users, error: usersError } = await client.from("users").select("id, email").neq("role", "admin");
            if (!usersError && users) {
              totalStudents = users.length;
            } else {
              const uniqueStudents = new Set(sessions.map((s) => s.student_email).filter(Boolean));
              totalStudents = uniqueStudents.size;
            }
          } catch (error) {
            console.warn("\u26A0\uFE0F Error counting users, falling back to session-based count");
            const uniqueStudents = new Set(sessions.map((s) => s.student_email).filter(Boolean));
            totalStudents = uniqueStudents.size;
          }
          console.log(`\u{1F4CA} Dashboard stats: ${totalScenarios} scenarios, ${activeSessions} active sessions, ${completedSessions} completed, ${totalStudents} students`);
          return {
            totalScenarios,
            activeSessions,
            completedSessions,
            totalStudents,
            sessions: sessions.map((s) => ({
              id: s.session_id,
              sessionId: s.session_id,
              studentEmail: s.student_email,
              scenarioId: s.scenario_id,
              scenarioTitle: s.scenarios?.title || "Sc\xE9nario inconnu",
              scenarioDescription: s.scenarios?.description || "",
              status: s.status,
              startTime: s.start_time,
              endTime: s.end_time,
              createdAt: s.created_at,
              updatedAt: s.updated_at
            }))
          };
        } catch (error) {
          console.error("\u274C Error fetching dashboard stats:", error.message);
          return {
            totalScenarios: 0,
            activeSessions: 0,
            completedSessions: 0,
            totalStudents: 0,
            sessions: []
          };
        }
      }
      /**
       * Get students (placeholder for future implementation)
       */
      async getStudents() {
        try {
          const client = await this.getClient();
          return [];
        } catch (error) {
          console.error("\u274C Error fetching students:", error.message);
          return [];
        }
      }
      /**
       * Health check method
       */
      async healthCheck() {
        try {
          await this._performHealthCheck();
          return {
            status: "healthy",
            metrics: { ...this.metrics },
            uptime: Date.now() - this.startupTime.getTime()
          };
        } catch (error) {
          return {
            status: "unhealthy",
            metrics: { ...this.metrics, isHealthy: false },
            uptime: Date.now() - this.startupTime.getTime()
          };
        }
      }
      /**
       * Create a new scenario
       */
      async createScenario(scenarioData) {
        const client = await this.getClient();
        await this.ensureUserExists(scenarioData.createdBy);
        const { data, error } = await client.from("scenarios").insert({
          title: scenarioData.title,
          description: scenarioData.description,
          patient_prompt: scenarioData.patientPrompt,
          evaluation_criteria: scenarioData.evaluationCriteria,
          image_url: scenarioData.imageUrl || null,
          created_by: scenarioData.createdBy
        }).select().single();
        if (error) throw error;
        return data;
      }
      /**
       * Update scenario
       */
      async updateScenario(id, updates) {
        const client = await this.getClient();
        const { data: existingScenario, error: findError } = await client.from("scenarios").select("id, title").eq("id", id).single();
        if (findError) {
          if (findError.code === "PGRST116") {
            console.error(`\u274C Scenario ${id} not found in database`);
            throw new Error(`Scenario with ID ${id} does not exist`);
          }
          console.error(`\u274C Error checking scenario ${id}:`, findError);
          throw findError;
        }
        console.log(`\u2705 Scenario ${id} exists: "${existingScenario.title}"`);
        const updateData = {
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (updates.title) updateData.title = updates.title;
        if (updates.description !== void 0) updateData.description = updates.description;
        if (updates.patientPrompt !== void 0) updateData.patient_prompt = updates.patientPrompt;
        if (updates.evaluationCriteria !== void 0) updateData.evaluation_criteria = updates.evaluationCriteria;
        if (updates.imageUrl !== void 0) updateData.image_url = updates.imageUrl;
        if (updates.pineconeIndex !== void 0) updateData.pinecone_index = updates.pineconeIndex;
        console.log(`\u{1F4CA} Updating scenario ${id} with data:`, updateData);
        const { data, error } = await client.from("scenarios").update(updateData).eq("id", id).select().single();
        if (error) {
          console.error(`\u274C Error updating scenario ${id}:`, error);
          throw error;
        }
        console.log(`\u2705 Scenario ${id} updated successfully:`, data);
        return data;
      }
      /**
       * Update scenario criteria specifically (convenience method)
       */
      async updateScenarioCriteria(id, criteria) {
        console.log(`\u{1F4CA} Updating criteria for scenario ${id}`);
        return this.updateScenario(id, { evaluationCriteria: criteria });
      }
      /**
       * Get available scenario IDs and titles for validation
       */
      async getAvailableScenarioIds() {
        try {
          const client = await this.getClient();
          const { data, error } = await client.from("scenarios").select("id, title").order("id", { ascending: true });
          if (error) {
            if (error.message.includes("does not exist")) {
              console.log("\u26A0\uFE0F Scenarios table does not exist, returning empty array");
              return [];
            }
            throw error;
          }
          console.log(`\u{1F4CB} Available scenarios: ${(data || []).map((s) => `ID ${s.id}: "${s.title}"`).join(", ")}`);
          return data || [];
        } catch (error) {
          console.error("\u274C Error fetching available scenario IDs:", error.message);
          return [];
        }
      }
      /**
       * Delete scenario
       */
      async deleteScenario(id) {
        const client = await this.getClient();
        const { error } = await client.from("scenarios").delete().eq("id", id);
        if (error) throw error;
      }
      /**
       * Store conversation exchange in database
       */
      async storeConversationExchange(exchange) {
        try {
          const client = await this.getClient();
          let sessionDbId = null;
          if (exchange.sessionId) {
            const session = await this.getSessionByStringId(exchange.sessionId);
            sessionDbId = session?.id ?? null;
          }
          const { data, error } = await client.from("exchanges").insert({
            session_id: sessionDbId,
            question: exchange.question,
            response: exchange.response,
            role: "system",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            metadata: {
              email: exchange.email,
              scenarioId: exchange.scenarioId,
              studentRole: exchange.studentRole,
              contextData: exchange.contextData,
              source: "patient_simulator"
            }
          }).select().single();
          if (error) {
            console.error("\u274C Error storing conversation exchange:", error);
            throw error;
          }
          console.log(`\u{1F4BE} Stored conversation exchange for session ${exchange.sessionId}`);
          if (exchange.sessionId) {
            const timestamp = (/* @__PURE__ */ new Date()).toISOString();
            this.addFallbackSessionMessage(exchange.sessionId, {
              role: "user",
              question: exchange.question,
              response: "",
              timestamp,
              isFallback: !sessionDbId
            });
            this.addFallbackSessionMessage(exchange.sessionId, {
              role: "assistant",
              question: "",
              response: exchange.response,
              timestamp,
              isFallback: !sessionDbId
            });
          }
          return data;
        } catch (error) {
          console.error("\u274C Failed to store conversation exchange:", error);
          if (exchange.sessionId) {
            const timestamp = (/* @__PURE__ */ new Date()).toISOString();
            this.addFallbackSessionMessage(exchange.sessionId, {
              role: "user",
              question: exchange.question,
              response: "",
              timestamp,
              isFallback: true
            });
            this.addFallbackSessionMessage(exchange.sessionId, {
              role: "assistant",
              question: "",
              response: exchange.response,
              timestamp,
              isFallback: true
            });
          }
          return null;
        }
      }
      /**
       * Get conversation history for a session
       */
      async getConversationHistory(sessionId, limit = 50) {
        try {
          const client = await this.getClient();
          const session = await this.getSessionByStringId(sessionId);
          if (!session) {
            console.warn(`\u26A0\uFE0F Session ${sessionId} not found, returning empty conversation history`);
            return [];
          }
          const { data, error } = await client.from("exchanges").select("*").eq("session_id", session.id).order("timestamp", { ascending: true }).limit(limit);
          if (error) {
            console.error("\u274C Error fetching conversation history:", error);
            return [];
          }
          console.log(`\u{1F4DA} Retrieved ${data?.length || 0} conversation exchanges for session ${sessionId}`);
          return data || [];
        } catch (error) {
          console.error("\u274C Error fetching conversation history:", error.message);
          return [];
        }
      }
      /**
       * Get recent conversations for a student
       */
      async getStudentConversations(email, limit = 100) {
        try {
          const client = await this.getClient();
          const { data, error } = await client.from("exchanges").select("*").contains("metadata", { email }).order("timestamp", { ascending: false }).limit(limit);
          if (error) throw error;
          console.log(`\u{1F4DA} Retrieved ${data?.length || 0} conversations for student ${email}`);
          return data || [];
        } catch (error) {
          console.error("\u274C Error fetching student conversations:", error.message);
          return [];
        }
      }
      // ====================================
      // TRAINING SESSIONS MANAGEMENT
      // ====================================
      /**
       * Create a new training session
       */
      async createTrainingSession(sessionData) {
        try {
          const client = await this.getClient();
          const { data: trainingSession, error: sessionError } = await client.from("training_sessions").insert({
            title: sessionData.title,
            description: sessionData.description,
            created_by: sessionData.createdBy,
            scenario_ids: sessionData.scenarioIds,
            status: "active",
            start_date: sessionData.startDate || (/* @__PURE__ */ new Date()).toISOString(),
            end_date: sessionData.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString(),
            created_at: (/* @__PURE__ */ new Date()).toISOString(),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).select().single();
          if (sessionError) throw sessionError;
          if (sessionData.studentEmails && sessionData.studentEmails.length > 0) {
            const studentAssignments = sessionData.studentEmails.map((email) => ({
              training_session_id: trainingSession.id,
              student_email: email.trim().toLowerCase(),
              assigned_at: (/* @__PURE__ */ new Date()).toISOString(),
              status: "assigned"
            }));
            const { error: studentsError } = await client.from("training_session_students").insert(studentAssignments);
            if (studentsError) throw studentsError;
          }
          console.log(`\u2705 Created training session: ${trainingSession.title} with ID: ${trainingSession.id}`);
          return {
            ...trainingSession,
            startDate: trainingSession.start_date,
            endDate: trainingSession.end_date,
            studentEmails: sessionData.studentEmails,
            scenarioIds: sessionData.scenarioIds
          };
        } catch (error) {
          console.error("\u274C Error creating training session:", error.message);
          throw error;
        }
      }
      /**
       * Private helper: Verify user has access to a training session
       * Checks both created_by and training_session_teachers table
       * Throws error if access is denied
       */
      async _verifyTrainingSessionAccess(session, userEmail) {
        if (session.created_by === userEmail) {
          return;
        }
        const client = await this.getClient();
        const { data: teacherAssignment, error: teacherError } = await client.from("training_session_teachers").select("id").eq("training_session_id", session.id).eq("teacher_email", userEmail).single();
        if (teacherError && teacherError.code !== "PGRST116" && teacherError.code !== "42P01") {
          console.error(`\u274C Database error checking teacher access for session ${session.id}:`, teacherError);
          throw teacherError;
        }
        if (teacherError && teacherError.code === "42P01") {
          console.warn(`\u26A0\uFE0F Table training_session_teachers not found - multi-teacher feature unavailable`);
        }
        if (teacherAssignment) {
          return;
        }
        console.log(`\u{1F512} Access denied: ${userEmail} is not creator or assigned teacher for session ${session.id}`);
        throw new Error(`You don't have permission to access training session ${session.id}`);
      }
      /**
       * Get all training sessions for an admin
       */
      async getTrainingSessions(createdBy) {
        try {
          const client = await this.getClient();
          const { data: teacherAssignments, error: assignmentsError } = await client.from("training_session_teachers").select("training_session_id").eq("teacher_email", createdBy);
          let allSessions = [];
          if (assignmentsError) {
            const isTableMissing = assignmentsError.code === "42P01";
            const isCriticalError = assignmentsError.code !== "PGRST116" && !isTableMissing;
            if (isCriticalError) {
              console.error(`\u274C Critical database error fetching teacher assignments for ${createdBy}:`, assignmentsError);
              throw assignmentsError;
            }
            if (isTableMissing) {
              console.warn(`\u26A0\uFE0F Table training_session_teachers not found - migration may not be applied yet. Falling back to created_by only.`);
            }
            const { data: createdSessions, error: createdError } = await client.from("training_sessions").select("*").eq("created_by", createdBy).order("created_at", { ascending: false });
            if (createdError) throw createdError;
            allSessions = createdSessions || [];
          } else {
            const assignedSessionIds = (teacherAssignments || []).map((a) => a.training_session_id);
            const orConditions = [`created_by.eq.${createdBy}`];
            if (assignedSessionIds.length > 0) {
              orConditions.push(`id.in.(${assignedSessionIds.join(",")})`);
            }
            const { data: allSessionsData, error: sessionsError } = await client.from("training_sessions").select("*").or(orConditions.join(",")).order("created_at", { ascending: false });
            if (sessionsError) throw sessionsError;
            allSessions = allSessionsData || [];
            console.log(`\u26A1 Optimized query: Retrieved ${allSessions.length} sessions (created or assigned) in single query`);
          }
          const sessionsWithDetails = await Promise.all(
            allSessions.map(async (session) => {
              const { data: students, error: studentsError } = await client.from("training_session_students").select("student_email, assigned_at, status").eq("training_session_id", session.id);
              if (studentsError) {
                console.warn(`Warning: Could not fetch students for session ${session.id}:`, studentsError.message);
              }
              let scenarioDetails = [];
              if (session.scenario_ids && session.scenario_ids.length > 0) {
                const { data: scenarios, error: scenariosError } = await client.from("scenarios").select("id, title, description").in("id", session.scenario_ids);
                if (scenariosError) {
                  console.warn(`Warning: Could not fetch scenarios for session ${session.id}:`, scenariosError.message);
                } else {
                  scenarioDetails = scenarios || [];
                }
              }
              return {
                ...session,
                startDate: session.start_date,
                endDate: session.end_date,
                students: students || [],
                scenarios: scenarioDetails,
                studentCount: (students || []).length,
                scenarioCount: scenarioDetails.length
              };
            })
          );
          console.log(`\u{1F4DA} Retrieved ${sessionsWithDetails.length} training sessions for ${createdBy}`);
          return sessionsWithDetails;
        } catch (error) {
          console.error("\u274C Error fetching training sessions:", error.message);
          return [];
        }
      }
      /**
       * Get a specific training session by ID
       */
      async getTrainingSessionById(id, createdBy) {
        try {
          const client = await this.getClient();
          const { data: session, error } = await client.from("training_sessions").select("*").eq("id", parseInt(id)).single();
          if (error) {
            if (error.code === "PGRST116") {
              return null;
            }
            throw error;
          }
          try {
            await this._verifyTrainingSessionAccess(session, createdBy);
          } catch (error2) {
            if (error2.message.includes("don't have permission")) {
              return null;
            }
            throw error2;
          }
          const { data: students, error: studentsError } = await client.from("training_session_students").select("student_email, assigned_at, status").eq("training_session_id", session.id);
          if (studentsError) {
            console.warn(`Warning: Could not fetch students for session ${id}:`, studentsError.message);
          }
          let scenarioDetails = [];
          if (session.scenario_ids && session.scenario_ids.length > 0) {
            const { data: scenarios, error: scenariosError } = await client.from("scenarios").select("id, title, description").in("id", session.scenario_ids);
            if (scenariosError) {
              console.warn(`Warning: Could not fetch scenarios for session ${id}:`, scenariosError.message);
            } else {
              scenarioDetails = scenarios || [];
            }
          }
          console.log(`\u{1F4DA} Retrieved training session ${id} for ${createdBy}`);
          return {
            ...session,
            startDate: session.start_date,
            endDate: session.end_date,
            students: students || [],
            scenarios: scenarioDetails,
            studentCount: (students || []).length,
            scenarioCount: scenarioDetails.length
          };
        } catch (error) {
          console.error("\u274C Error fetching training session:", error.message);
          throw error;
        }
      }
      /**
       * Update a training session
       * Checks both created_by and training_session_teachers for multi-teacher access
       */
      async updateTrainingSession(id, updates, createdBy) {
        try {
          const client = await this.getClient();
          console.log(`\u{1F50D} Updating training session - ID: ${id}, createdBy: ${createdBy}, updates:`, JSON.stringify(updates));
          const { data: session, error: sessionError } = await client.from("training_sessions").select("*").eq("id", parseInt(id)).single();
          if (sessionError || !session) {
            console.error("\u274C Training session not found:", id, sessionError);
            throw new Error(`Training session ${id} not found`);
          }
          await this._verifyTrainingSessionAccess(session, createdBy);
          const { studentEmails, selectedScenarios, ...restUpdates } = updates;
          const fieldMapping = {
            "scenarioIds": "scenario_ids",
            "startDate": "start_date",
            "endDate": "end_date",
            "createdBy": "created_by"
          };
          const cleanUpdates = {};
          const validFields = ["title", "description", "scenario_ids", "start_date", "end_date"];
          for (const [key, value] of Object.entries(restUpdates)) {
            const dbField = fieldMapping[key] || key;
            if (validFields.includes(dbField)) {
              cleanUpdates[dbField] = value;
            }
          }
          cleanUpdates.updated_at = (/* @__PURE__ */ new Date()).toISOString();
          console.log(`\u{1F4DD} Clean updates for database:`, JSON.stringify(cleanUpdates));
          const { data: updatedSession, error: updateError } = await client.from("training_sessions").update(cleanUpdates).eq("id", parseInt(id)).select().single();
          if (updateError) {
            console.error("\u274C Supabase error updating training session:", updateError);
            throw updateError;
          }
          if (studentEmails && Array.isArray(studentEmails) && studentEmails.length > 0) {
            console.log(`\u{1F465} Adding ${studentEmails.length} new students to session ${id}`);
            const studentsToAdd = studentEmails.map((email) => ({
              training_session_id: parseInt(id),
              student_email: email.trim().toLowerCase(),
              assigned_at: (/* @__PURE__ */ new Date()).toISOString(),
              status: "active"
            }));
            const { error: studentsError } = await client.from("training_session_students").upsert(studentsToAdd, {
              onConflict: "training_session_id,student_email",
              ignoreDuplicates: true
            });
            if (studentsError) {
              console.warn(`\u26A0\uFE0F Warning: Could not add students to session ${id}:`, studentsError.message);
            }
          }
          console.log(`\u2705 Updated training session ${id} by ${createdBy}`);
          return {
            ...updatedSession,
            startDate: updatedSession.start_date,
            endDate: updatedSession.end_date
          };
        } catch (error) {
          console.error("\u274C Error updating training session:", error.message);
          throw error;
        }
      }
      /**
       * Delete a training session
       * Checks both created_by and training_session_teachers for multi-teacher access
       */
      async deleteTrainingSession(id, createdBy) {
        try {
          const client = await this.getClient();
          console.log(`\u{1F50D} Deleting training session - ID: ${id}, createdBy: ${createdBy}`);
          const { data: session, error: sessionError } = await client.from("training_sessions").select("*").eq("id", parseInt(id)).single();
          if (sessionError || !session) {
            console.error("\u274C Training session not found:", id, sessionError);
            throw new Error(`Training session ${id} not found`);
          }
          await this._verifyTrainingSessionAccess(session, createdBy);
          console.log(`\u{1F5D1}\uFE0F Deleting associated students for session ${id}`);
          const { error: studentsDeleteError } = await client.from("training_session_students").delete().eq("training_session_id", parseInt(id));
          if (studentsDeleteError && studentsDeleteError.code !== "42P01") {
            console.error("\u274C Error deleting session students:", studentsDeleteError);
            throw studentsDeleteError;
          }
          console.log(`\u{1F5D1}\uFE0F Deleting associated teachers for session ${id}`);
          const { error: teachersDeleteError } = await client.from("training_session_teachers").delete().eq("training_session_id", parseInt(id));
          if (teachersDeleteError && teachersDeleteError.code !== "42P01") {
            console.error("\u274C Error deleting session teachers:", teachersDeleteError);
            throw teachersDeleteError;
          }
          const { error: deleteError } = await client.from("training_sessions").delete().eq("id", parseInt(id));
          if (deleteError) {
            console.error("\u274C Supabase error deleting training session:", deleteError);
            throw deleteError;
          }
          console.log(`\u2705 Deleted training session ${id} by ${createdBy}`);
        } catch (error) {
          console.error("\u274C Error deleting training session:", error.message);
          throw error;
        }
      }
      // ====================================
      // TEACHER MANAGEMENT
      // ====================================
      /**
       * Get all teachers (users with role 'teacher' or 'admin')
       */
      async getTeachers() {
        try {
          const client = await this.getClient();
          const { data: teachers, error } = await client.from("users").select("id, email, role, created_at").in("role", ["teacher", "admin"]).order("email", { ascending: true });
          if (error) {
            if (error.code === "42P01" || error.code === "42703") {
              console.warn(`\u26A0\uFE0F Users table or role column not found - returning empty teachers list`);
              return [];
            }
            throw error;
          }
          console.log(`\u{1F4CB} Retrieved ${teachers?.length || 0} teachers`);
          return teachers || [];
        } catch (error) {
          console.error("\u274C Error getting teachers:", error.message);
          return [];
        }
      }
      /**
       * Get teachers assigned to a specific training session
       */
      async getSessionTeachers(sessionId) {
        try {
          const client = await this.getClient();
          const { data: assignments, error } = await client.from("training_session_teachers").select("teacher_email, assigned_at").eq("training_session_id", sessionId);
          if (error) {
            if (error.code === "42P01") {
              console.warn(`\u26A0\uFE0F training_session_teachers table not found - returning empty list`);
              return [];
            }
            throw error;
          }
          console.log(`\u{1F4CB} Retrieved ${assignments?.length || 0} teachers for session ${sessionId}`);
          return assignments || [];
        } catch (error) {
          console.error("\u274C Error getting session teachers:", error.message);
          return [];
        }
      }
      /**
       * Assign teachers to a training session
       */
      async assignTeachersToSession(sessionId, teacherEmails) {
        try {
          const client = await this.getClient();
          if (!teacherEmails || teacherEmails.length === 0) {
            console.log(`\u2139\uFE0F No teachers to assign to session ${sessionId}`);
            return;
          }
          const teachersToAdd = teacherEmails.map((email) => ({
            training_session_id: sessionId,
            teacher_email: email.trim().toLowerCase(),
            assigned_at: (/* @__PURE__ */ new Date()).toISOString()
          }));
          const { error } = await client.from("training_session_teachers").upsert(teachersToAdd, {
            onConflict: "training_session_id,teacher_email",
            ignoreDuplicates: true
          });
          if (error) {
            if (error.code === "42P01") {
              console.warn(`\u26A0\uFE0F training_session_teachers table not found - cannot assign teachers`);
              return;
            }
            throw error;
          }
          console.log(`\u2705 Assigned ${teacherEmails.length} teacher(s) to session ${sessionId}`);
        } catch (error) {
          console.error("\u274C Error assigning teachers to session:", error.message);
          throw error;
        }
      }
      /**
       * Remove teachers from a training session
       */
      async removeTeachersFromSession(sessionId, teacherEmails) {
        try {
          const client = await this.getClient();
          if (!teacherEmails || teacherEmails.length === 0) {
            console.log(`\u2139\uFE0F No teachers to remove from session ${sessionId}`);
            return;
          }
          const normalizedEmails = teacherEmails.map((email) => email.trim().toLowerCase());
          const { error } = await client.from("training_session_teachers").delete().eq("training_session_id", sessionId).in("teacher_email", normalizedEmails);
          if (error) {
            if (error.code === "42P01") {
              console.warn(`\u26A0\uFE0F training_session_teachers table not found - cannot remove teachers`);
              return;
            }
            throw error;
          }
          console.log(`\u2705 Removed ${teacherEmails.length} teacher(s) from session ${sessionId}`);
        } catch (error) {
          console.error("\u274C Error removing teachers from session:", error.message);
          throw error;
        }
      }
      // ====================================
      // ECOS SESSION MANAGEMENT
      // ====================================
      /**
       * Create a new ECOS session in database
       */
      async createSession(sessionData) {
        try {
          const client = await this.getClient();
          await this.ensureUserExists(sessionData.studentEmail);
          const { data, error } = await withRetry(
            () => client.from("sessions").insert({
              session_id: sessionData.sessionId,
              student_email: sessionData.studentEmail,
              scenario_id: sessionData.scenarioId,
              status: sessionData.status || "active",
              start_time: (/* @__PURE__ */ new Date()).toISOString(),
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            }).select().single(),
            {
              ...RetryPresets.database,
              operationName: "Supabase createSession"
            }
          );
          if (error) {
            console.error("\u274C Error creating ECOS session:", error);
            throw error;
          }
          console.log(`\u2705 Created ECOS session ${sessionData.sessionId} for student ${sessionData.studentEmail}`);
          const record = {
            ...data,
            isFallback: false
          };
          this.fallbackSessions.set(sessionData.sessionId, record);
          return record;
        } catch (error) {
          console.error("\u274C Failed to create ECOS session:", error.message);
          const fallbackRecord = {
            id: `fallback-session-${Date.now()}`,
            session_id: sessionData.sessionId,
            student_email: sessionData.studentEmail,
            scenario_id: sessionData.scenarioId,
            status: sessionData.status || "active",
            start_time: (/* @__PURE__ */ new Date()).toISOString(),
            created_at: (/* @__PURE__ */ new Date()).toISOString(),
            updated_at: (/* @__PURE__ */ new Date()).toISOString(),
            isFallback: true
          };
          this.fallbackSessions.set(sessionData.sessionId, fallbackRecord);
          console.warn(`\u26A0\uFE0F Stored session ${sessionData.sessionId} in fallback memory store`);
          throw error;
        }
      }
      /**
       * Get ECOS session by string session ID
       */
      async getSessionByStringId(sessionId) {
        const fallbackSession = this.fallbackSessions.get(sessionId) || null;
        try {
          const client = await this.getClient();
          const { data, error } = await client.from("sessions").select("*").eq("session_id", sessionId).single();
          if (error) {
            if (error.code === "PGRST116") {
              return fallbackSession;
            }
            throw error;
          }
          const record = {
            ...data,
            isFallback: false
          };
          this.fallbackSessions.set(sessionId, record);
          return record;
        } catch (error) {
          console.error("\u274C Error getting session by string ID:", error.message);
          if (fallbackSession) {
            console.warn(`\u26A0\uFE0F Using fallback session for ${sessionId}`);
          }
          return fallbackSession;
        }
      }
      /**
       * Get all ECOS sessions for a student (filtered by email)
       * Returns sessions with scenario information for the student history tab
       */
      async getStudentSessions(studentEmail) {
        try {
          const client = await this.getClient();
          console.log(`\u{1F50D} Fetching sessions for student: ${studentEmail}`);
          const { data, error } = await client.from("sessions").select(`
          id,
          session_id,
          student_email,
          scenario_id,
          status,
          start_time,
          end_time,
          created_at,
          updated_at,
          scenarios (
            id,
            title,
            description
          )
        `).eq("student_email", studentEmail).order("created_at", { ascending: false });
          if (error) {
            console.error("\u274C Error fetching student sessions:", error);
            return [];
          }
          console.log(`\u2705 Found ${data?.length || 0} sessions for student ${studentEmail}`);
          return (data || []).filter((session) => session.session_id && session.session_id !== "null" && session.session_id !== "undefined").map((session) => ({
            id: session.session_id,
            sessionId: session.session_id,
            studentEmail: session.student_email,
            scenarioId: session.scenario_id,
            scenarioTitle: session.scenarios?.title || "Unknown Scenario",
            scenarioDescription: session.scenarios?.description || "",
            status: session.status,
            startTime: session.start_time,
            endTime: session.end_time,
            createdAt: session.created_at,
            updatedAt: session.updated_at
          }));
        } catch (error) {
          console.error("\u274C Error in getStudentSessions:", error.message);
          return [];
        }
      }
      /**
       * Get all ECOS sessions for a training session (for teacher view)
       * Returns all sessions of all students enrolled in the training session
       */
      async getTrainingSessionSessions(trainingSessionId) {
        try {
          const client = await this.getClient();
          console.log(`\u{1F50D} Fetching all sessions for training session: ${trainingSessionId}`);
          const { data: enrollments, error: enrollmentError } = await client.from("training_session_students").select("student_email").eq("training_session_id", trainingSessionId);
          if (enrollmentError) {
            console.error("\u274C Error fetching training session students:", enrollmentError);
            return [];
          }
          if (!enrollments || enrollments.length === 0) {
            console.log(`\u2139\uFE0F No students enrolled in training session ${trainingSessionId}`);
            return [];
          }
          const studentEmails = enrollments.map((e) => e.student_email);
          console.log(`\u{1F4DA} Found ${studentEmails.length} students in training session`);
          const { data, error } = await client.from("sessions").select(`
          id,
          session_id,
          student_email,
          scenario_id,
          status,
          start_time,
          end_time,
          created_at,
          updated_at,
          scenarios (
            id,
            title,
            description
          )
        `).in("student_email", studentEmails).order("created_at", { ascending: false });
          if (error) {
            console.error("\u274C Error fetching training session sessions:", error);
            return [];
          }
          console.log(`\u2705 Found ${data?.length || 0} total sessions for training session ${trainingSessionId}`);
          return (data || []).map((session) => ({
            id: session.session_id,
            sessionId: session.session_id,
            studentEmail: session.student_email,
            scenarioId: session.scenario_id,
            scenarioTitle: session.scenarios?.title || "Unknown Scenario",
            scenarioDescription: session.scenarios?.description || "",
            status: session.status,
            startTime: session.start_time,
            endTime: session.end_time,
            createdAt: session.created_at,
            updatedAt: session.updated_at
          }));
        } catch (error) {
          console.error("\u274C Error in getTrainingSessionSessions:", error.message);
          return [];
        }
      }
      // Method removed - duplicate of updateSessionStatus at line 1696
      /**
       * Store message in ECOS session
       */
      async storeSessionMessage(messageData) {
        try {
          const client = await this.getClient();
          const session = await this.getSessionByStringId(messageData.sessionId);
          if (!session) {
            console.warn(`\u26A0\uFE0F [storeSessionMessage] Session ${messageData.sessionId} not found in DB - storing in fallback only`);
            console.warn(`\u26A0\uFE0F [storeSessionMessage] This message will be LOST on server restart!`);
            this.addFallbackSessionMessage(messageData.sessionId, {
              role: messageData.role,
              question: messageData.question || messageData.content || "",
              response: messageData.response || "",
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              isFallback: true
            });
            return null;
          }
          console.log(`\u{1F50D} [storeSessionMessage] Found session in DB - id: ${session.id}, attempting insert...`);
          const timestamp = (/* @__PURE__ */ new Date()).toISOString();
          const { data, error } = await withRetry(
            () => client.from("exchanges").insert({
              session_id: session.id,
              // Use database integer ID
              role: messageData.role,
              question: messageData.question || messageData.content || "",
              response: messageData.response || "",
              timestamp
            }).select().single(),
            {
              ...RetryPresets.database,
              operationName: "Supabase storeSessionMessage"
            }
          );
          if (error) {
            console.error(`\u274C [storeSessionMessage] Supabase insert failed for session ${messageData.sessionId}:`, error);
            console.error(`\u274C [storeSessionMessage] Error code: ${error.code}, message: ${error.message}`);
            console.error(`\u274C [storeSessionMessage] Payload attempted: session_id=${session.id}, role=${messageData.role}`);
            throw error;
          }
          console.log(`\u2705 [storeSessionMessage] Successfully stored ${messageData.role} message in DB for session ${messageData.sessionId}`);
          this.addFallbackSessionMessage(messageData.sessionId, {
            role: messageData.role,
            question: messageData.question || messageData.content || "",
            response: messageData.response || "",
            timestamp,
            isFallback: false
          });
          return data;
        } catch (error) {
          console.error(`\u274C [storeSessionMessage] CRITICAL: Failed to store message in DB for session ${messageData.sessionId}`);
          console.error(`\u274C [storeSessionMessage] Error: ${error.message}`);
          console.error(`\u274C [storeSessionMessage] Stack: ${error.stack}`);
          console.warn(`\u26A0\uFE0F [storeSessionMessage] Storing in fallback memory - data will be LOST on restart`);
          this.addFallbackSessionMessage(messageData.sessionId, {
            role: messageData.role,
            question: messageData.question || messageData.content || "",
            response: messageData.response || "",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            isFallback: true
          });
          return null;
        }
      }
      /**
       * Get messages for an ECOS session
       */
      async getSessionMessages(sessionId, limit = 50) {
        const fallbackMessages = this.fallbackSessionMessages.get(sessionId) || [];
        try {
          const client = await this.getClient();
          const session = await this.getSessionByStringId(sessionId);
          if (!session) {
            console.warn(`\u26A0\uFE0F Session ${sessionId} not found, returning empty messages`);
            return fallbackMessages;
          }
          const { data, error } = await client.from("exchanges").select("*").eq("session_id", session.id).neq("role", "system").order("timestamp", { ascending: true }).limit(limit);
          if (error) {
            console.error("\u274C Error fetching session messages:", error);
            console.warn(`\u26A0\uFE0F Using ${fallbackMessages.length} fallback messages instead`);
            return fallbackMessages;
          }
          const messages = data || [];
          console.log(`\u{1F4DA} Retrieved ${messages.length} messages from DB for session ${sessionId} (excluded 'system' role duplicates)`);
          if (messages.length === 0 && fallbackMessages.length > 0) {
            console.warn(`\u26A0\uFE0F DB returned 0 messages but found ${fallbackMessages.length} fallback messages - using fallback`);
            return fallbackMessages;
          }
          if (messages.length > 0) {
            this.fallbackSessionMessages.set(sessionId, messages);
          }
          return messages.length > 0 ? messages : fallbackMessages;
        } catch (error) {
          console.error("\u274C Error fetching session messages:", error.message);
          return fallbackMessages;
        }
      }
      /**
       * Update ECOS session status
       */
      async updateSessionStatus(sessionId, status) {
        try {
          const client = await this.getClient();
          const { data, error } = await client.from("sessions").update({
            status,
            end_time: status === "completed" ? (/* @__PURE__ */ new Date()).toISOString() : null,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("session_id", sessionId).select().single();
          if (error) {
            console.error("\u274C Error updating session status:", error);
            throw error;
          }
          console.log(`\u2705 Updated session ${sessionId} status to ${status}`);
          const record = {
            ...data,
            isFallback: false
          };
          this.fallbackSessions.set(sessionId, record);
          return record;
        } catch (error) {
          console.error("\u274C Failed to update session status:", error.message);
          const fallbackSession = this.fallbackSessions.get(sessionId);
          if (fallbackSession) {
            const updatedFallback = {
              ...fallbackSession,
              status,
              updated_at: (/* @__PURE__ */ new Date()).toISOString(),
              end_time: status === "completed" ? (/* @__PURE__ */ new Date()).toISOString() : fallbackSession?.end_time
            };
            this.fallbackSessions.set(sessionId, updatedFallback);
            console.warn(`\u26A0\uFE0F Updated session ${sessionId} status in fallback memory store`);
          }
          throw error;
        }
      }
      /**
       * Create ECOS evaluation
       */
      async createEvaluation(evalData) {
        try {
          const client = await this.getClient();
          await this.ensureUserExists(evalData.studentEmail);
          const session = await this.getSessionByStringId(evalData.sessionId);
          if (!session || session.isFallback) {
            throw new Error(`Session ${evalData.sessionId} not available in primary database`);
          }
          console.log(`\u{1F4E4} Attempting to store evaluation for session ${evalData.sessionId}`);
          const insertPayload = {
            session_id: session.id,
            scenario_id: evalData.scenarioId,
            student_email: evalData.studentEmail,
            scores: evalData.scores,
            global_score: evalData.globalScore,
            strengths: evalData.strengths,
            weaknesses: evalData.weaknesses,
            recommendations: evalData.recommendations,
            feedback: evalData.feedback,
            heuristic: evalData.heuristic,
            llm_score_percent: typeof evalData.llmScorePercent === "number" ? evalData.llmScorePercent : null,
            criteria_details: evalData.criteriaDetails,
            evaluated_at: (/* @__PURE__ */ new Date()).toISOString(),
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          console.log(`\u{1F50D} [DEBUG] Insert payload columns:`, Object.keys(insertPayload));
          console.log(`\u{1F50D} [DEBUG] Session DB ID:`, session.id, `String ID:`, evalData.sessionId);
          const { data, error } = await withRetry(
            () => client.from("evaluations").insert(insertPayload).select().single(),
            {
              ...RetryPresets.database,
              operationName: "Supabase createEvaluation"
            }
          );
          console.log(`\u{1F50D} [DEBUG] Supabase response - data:`, data ? "EXISTS" : "NULL", `error:`, error ? error.code : "NONE");
          if (error) {
            console.error("\u274C Error creating evaluation:", {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            throw error;
          }
          if (!data) {
            const errorMsg = "Supabase returned null data despite no error - possible schema mismatch";
            console.error(`\u274C ${errorMsg}`);
            throw new Error(errorMsg);
          }
          console.log(`\u2705 Created evaluation for session ${evalData.sessionId} - DB record ID:`, data.id);
          const record = {
            ...data,
            isFallback: false
          };
          this.fallbackEvaluations.set(evalData.sessionId, record);
          return record;
        } catch (error) {
          console.error("\u274C Failed to create evaluation:", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint
          });
          const fallbackSession = this.fallbackSessions.get(evalData.sessionId);
          const fallbackRecord = {
            session_id: fallbackSession?.id ?? null,
            scenario_id: evalData.scenarioId,
            student_email: evalData.studentEmail,
            scores: evalData.scores,
            global_score: evalData.globalScore,
            strengths: evalData.strengths,
            weaknesses: evalData.weaknesses,
            recommendations: evalData.recommendations,
            feedback: evalData.feedback,
            heuristic: evalData.heuristic,
            llm_score_percent: typeof evalData.llmScorePercent === "number" ? evalData.llmScorePercent : null,
            criteria_details: evalData.criteriaDetails,
            evaluated_at: (/* @__PURE__ */ new Date()).toISOString(),
            created_at: (/* @__PURE__ */ new Date()).toISOString(),
            summary: Array.isArray(evalData.feedback) ? evalData.feedback.join(" ") : evalData.feedback || "",
            isFallback: true
          };
          this.fallbackEvaluations.set(evalData.sessionId, fallbackRecord);
          console.warn(`\u26A0\uFE0F Stored evaluation for session ${evalData.sessionId} in fallback memory store`);
          throw error;
        }
      }
      /**
       * Get evaluation for a session
       */
      async getEvaluation(sessionId) {
        const fallbackEvaluation = this.fallbackEvaluations.get(sessionId) || null;
        try {
          const client = await this.getClient();
          const session = await this.getSessionByStringId(sessionId);
          if (!session || session.isFallback) {
            return fallbackEvaluation;
          }
          const { data, error } = await client.from("evaluations").select("*").eq("session_id", session.id).single();
          if (error) {
            if (error.code === "PGRST116") {
              return fallbackEvaluation;
            }
            throw error;
          }
          const record = {
            ...data,
            isFallback: false
          };
          this.fallbackEvaluations.set(sessionId, record);
          return record;
        } catch (error) {
          console.error("\u274C Error getting evaluation:", error.message);
          if (fallbackEvaluation) {
            console.warn(`\u26A0\uFE0F Using fallback evaluation for session ${sessionId}`);
          }
          return fallbackEvaluation;
        }
      }
      /**
       * Firebase Authentication Methods
       */
      /**
       * Get user by Firebase UID
       */
      async getUserByFirebaseUid(firebaseUid) {
        try {
          if (!this.supabase) await this.initialize();
          const { data, error } = await this.supabase.from("users").select("*").eq("firebase_uid", firebaseUid).single();
          if (error) {
            if (error.code === "PGRST116") {
              return null;
            }
            throw error;
          }
          return data;
        } catch (error) {
          console.error("\u274C Error getting user by Firebase UID:", error.message);
          return null;
        }
      }
      /**
       * Get user by email
       */
      async getUserByEmail(email) {
        try {
          if (!this.supabase) await this.initialize();
          const { data, error } = await this.supabase.from("users").select("*").eq("email", email.toLowerCase().trim()).single();
          if (error) {
            if (error.code === "PGRST116") {
              return null;
            }
            throw error;
          }
          return data;
        } catch (error) {
          console.error("\u274C Error getting user by email:", error.message);
          return null;
        }
      }
      /**
       * Create new user
       */
      async createUser(userData) {
        try {
          if (!this.supabase) await this.initialize();
          const { data, error } = await this.supabase.from("users").upsert(
            {
              email: userData.email.toLowerCase().trim(),
              firebase_uid: userData.firebaseUid
            },
            {
              onConflict: "email",
              ignoreDuplicates: false
              // Update firebase_uid if user exists
            }
          ).select().single();
          if (error) throw error;
          console.log("\u2705 User created/updated in Supabase:", { id: data.id, email: data.email });
          return data;
        } catch (error) {
          console.error("\u274C Error creating user:", error.message);
          throw new Error("Failed to create user in database");
        }
      }
      /**
       * Update user's Firebase UID
       */
      async updateUserFirebaseUid(userId, firebaseUid) {
        try {
          if (!this.supabase) await this.initialize();
          const { error } = await this.supabase.from("users").update({
            firebase_uid: firebaseUid,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", userId);
          if (error) throw error;
          console.log("\u2705 User Firebase UID updated:", { userId, firebaseUid });
        } catch (error) {
          console.error("\u274C Error updating user Firebase UID:", error.message);
          throw new Error("Failed to update user Firebase UID");
        }
      }
      /**
       * Get user role
       */
      async getUserRole(userId) {
        try {
          if (!this.supabase) await this.initialize();
          const { data, error } = await this.supabase.from("user_roles").select("role").eq("user_id", userId).single();
          if (error) {
            if (error.code === "PGRST116") {
              return "student";
            }
            throw error;
          }
          return data.role;
        } catch (error) {
          console.error("\u274C Error getting user role:", error.message);
          return "student";
        }
      }
      /**
       * Set user role
       */
      async setUserRole(userId, role) {
        try {
          if (!this.supabase) await this.initialize();
          const { error: updateError } = await this.supabase.from("user_roles").update({
            role,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("user_id", userId);
          if (updateError || updateError?.code === "PGRST116") {
            const { error: insertError } = await this.supabase.from("user_roles").insert([{
              user_id: userId,
              role,
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            }]);
            if (insertError) {
              if (!insertError.message.includes("duplicate")) {
                throw insertError;
              }
            }
          }
          console.log("\u2705 User role set:", { userId, role });
        } catch (error) {
          console.error("\u274C Error setting user role:", error.message);
          throw new Error("Failed to set user role");
        }
      }
      /**
       * Get metrics for monitoring
       */
      getMetrics() {
        return { ...this.metrics };
      }
      /**
       * Check if service is ready
       */
      isReady() {
        return this.isInitialized && this.metrics.isHealthy;
      }
      addFallbackSessionMessage(sessionId, message) {
        if (!sessionId) return;
        const existing = this.fallbackSessionMessages.get(sessionId) || [];
        existing.push({ ...message, sessionId });
        this.fallbackSessionMessages.set(sessionId, existing);
      }
    };
    __name(_UnifiedDatabaseService, "UnifiedDatabaseService");
    UnifiedDatabaseService = _UnifiedDatabaseService;
    unifiedDb = new UnifiedDatabaseService();
  }
});

// server/services/firebase-admin.service.ts
var firebase_admin_service_exports = {};
__export(firebase_admin_service_exports, {
  firebaseAdminService: () => firebaseAdminService
});
var _FirebaseAdminService, FirebaseAdminService, firebaseAdminService;
var init_firebase_admin_service = __esm({
  "server/services/firebase-admin.service.ts"() {
    "use strict";
    _FirebaseAdminService = class _FirebaseAdminService {
      constructor() {
        this.initialized = false;
        this.app = null;
        this.initializationPromise = null;
        this.firebaseAdmin = null;
        this.firebaseAuth = null;
      }
      /**
       * Lazy load Firebase Admin modules
       */
      async loadFirebaseModules() {
        if (this.firebaseAdmin && this.firebaseAuth) {
          return;
        }
        try {
          this.firebaseAdmin = await import("firebase-admin/app");
          this.firebaseAuth = await import("firebase-admin/auth");
          console.log("\u2705 Firebase Admin modules loaded successfully");
        } catch (error) {
          console.error("\u274C Failed to load Firebase Admin modules:", error);
          throw new Error("Firebase Admin SDK not available in this environment");
        }
      }
      /**
       * Initialize Firebase Admin SDK (lazy initialization)
       */
      async initialize() {
        if (this.initializationPromise) {
          return this.initializationPromise;
        }
        if (this.initialized) {
          return;
        }
        this.initializationPromise = (async () => {
          try {
            console.log("\u{1F525} Initializing Firebase Admin SDK...");
            await this.loadFirebaseModules();
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY;
            if (!projectId || !clientEmail || !privateKey) {
              throw new Error("Missing Firebase Admin SDK credentials in environment variables");
            }
            const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");
            const existingApps = this.firebaseAdmin.getApps();
            if (existingApps.length === 0) {
              this.app = this.firebaseAdmin.initializeApp({
                credential: this.firebaseAdmin.cert({
                  projectId,
                  clientEmail,
                  privateKey: formattedPrivateKey
                })
              });
            } else {
              this.app = existingApps[0];
            }
            this.initialized = true;
            console.log("\u2705 Firebase Admin SDK initialized successfully");
          } catch (error) {
            console.error("\u274C Failed to initialize Firebase Admin SDK:", error);
            this.initializationPromise = null;
            throw error;
          }
        })();
        return this.initializationPromise;
      }
      /**
       * Verify Firebase ID token
       * @param idToken - Firebase ID token from client
       * @returns Decoded token with user info
       */
      async verifyIdToken(idToken) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          const decodedToken = await auth.verifyIdToken(idToken);
          console.log("\u2705 Firebase ID token verified:", { uid: decodedToken.uid, email: decodedToken.email });
          return decodedToken;
        } catch (error) {
          console.error("\u274C Firebase ID token verification failed:", error);
          throw new Error("Invalid or expired Firebase ID token");
        }
      }
      /**
       * Get user by email
       * @param email - User email
       * @returns Firebase user record
       */
      async getUserByEmail(email) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          const user = await auth.getUserByEmail(email);
          return user;
        } catch (error) {
          if (error.code === "auth/user-not-found") {
            return null;
          }
          console.error("\u274C Error fetching user by email:", error);
          throw error;
        }
      }
      /**
       * Get user by UID
       * @param uid - Firebase UID
       * @returns Firebase user record
       */
      async getUserByUid(uid) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          const user = await auth.getUser(uid);
          return user;
        } catch (error) {
          if (error.code === "auth/user-not-found") {
            return null;
          }
          console.error("\u274C Error fetching user by UID:", error);
          throw error;
        }
      }
      /**
       * Create a new Firebase user
       * @param email - User email
       * @param password - User password
       * @returns Created user record
       */
      async createUser(email, password) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          const user = await auth.createUser({
            email,
            password,
            emailVerified: false
          });
          console.log("\u2705 Firebase user created:", { uid: user.uid, email: user.email });
          return user;
        } catch (error) {
          console.error("\u274C Error creating Firebase user:", error);
          throw error;
        }
      }
      /**
       * Set custom user claims (roles)
       * @param uid - Firebase UID
       * @param claims - Custom claims object (e.g., { role: 'admin' })
       */
      async setCustomClaims(uid, claims) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          await auth.setCustomUserClaims(uid, claims);
          console.log("\u2705 Custom claims set for user:", { uid, claims });
        } catch (error) {
          console.error("\u274C Error setting custom claims:", error);
          throw error;
        }
      }
      /**
       * Get custom claims for a user
       * @param uid - Firebase UID
       * @returns Custom claims object
       */
      async getCustomClaims(uid) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          const user = await auth.getUser(uid);
          return user.customClaims || {};
        } catch (error) {
          console.error("\u274C Error getting custom claims:", error);
          throw error;
        }
      }
      /**
       * Send password reset email
       * @param email - User email
       */
      async sendPasswordResetEmail(email) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          const link = await auth.generatePasswordResetLink(email);
          console.log("\u2705 Password reset link generated for:", email);
          console.log("\u{1F517} Reset link:", link);
        } catch (error) {
          console.error("\u274C Error generating password reset link:", error);
          throw error;
        }
      }
      /**
       * Delete a Firebase user
       * @param uid - Firebase UID
       */
      async deleteUser(uid) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          await auth.deleteUser(uid);
          console.log("\u2705 Firebase user deleted:", uid);
        } catch (error) {
          console.error("\u274C Error deleting Firebase user:", error);
          throw error;
        }
      }
      /**
       * Update user email
       * @param uid - Firebase UID
       * @param newEmail - New email address
       */
      async updateUserEmail(uid, newEmail) {
        await this.initialize();
        try {
          const auth = this.firebaseAuth.getAuth();
          await auth.updateUser(uid, { email: newEmail });
          console.log("\u2705 User email updated:", { uid, newEmail });
        } catch (error) {
          console.error("\u274C Error updating user email:", error);
          throw error;
        }
      }
      /**
       * Check if Firebase Admin is initialized
       */
      isInitialized() {
        return this.initialized;
      }
    };
    __name(_FirebaseAdminService, "FirebaseAdminService");
    FirebaseAdminService = _FirebaseAdminService;
    firebaseAdminService = new FirebaseAdminService();
  }
});

// server/services/openai.service.ts
import OpenAI from "openai";
var openai, _OpenAIService, OpenAIService, openaiService;
var init_openai_service = __esm({
  "server/services/openai.service.ts"() {
    "use strict";
    init_retry();
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
    });
    _OpenAIService = class _OpenAIService {
      constructor() {
        this.systemPrompt = `You are an educational assistant for a LearnWorlds learning management system. Speak only in French.
Answer questions about the course content based on the context provided.
Be helpful, precise, and concise. If you don't know the answer based on the provided context, say so clearly. If you don't know the answer based on the provided context, say so clearly.
Do not make up information, NEVER. 

IMPORTANT: At the end of EVERY response, you MUST include this exact link in markdown format:
[Cours d'arthrologie du membre sup\xE9rieur](https://academy.ceerrf.fr/course/arthrologie-du-membre-superieur)

This link must appear at the end of the answer when usefull specially for the first answer.`;
      }
      /**
       * Generates a response for the given question based on relevant content
       */
      async generateResponse(question, relevantContent) {
        try {
          let contextText = "";
          if (relevantContent && typeof relevantContent !== "string" && relevantContent.length > 0) {
            contextText = relevantContent.map((item, index) => {
              const source = item.metadata?.source ? ` (Source: ${item.metadata.source})` : "";
              return `Context ${index + 1}${source}:
${item.content}
`;
            }).join("\n");
          } else if (typeof relevantContent === "string") {
            contextText = relevantContent;
          }
          const userPrompt = `Question: ${question}

Relevant Content:
${contextText}`;
          const response = await withRetry(
            () => openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: this.systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0.5,
              max_tokens: 1e3
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "OpenAI generateResponse"
            }
          );
          return response.choices[0].message.content || "Je n'ai pas pu g\xE9n\xE9rer une r\xE9ponse. Veuillez r\xE9essayer.";
        } catch (error) {
          console.error("Error generating OpenAI response:", error);
          throw new Error(
            "Impossible de g\xE9n\xE9rer une r\xE9ponse. Service indisponible."
          );
        }
      }
      /**
       * Create a completion with custom system prompt (for ECOS evaluation)
       */
      async createCompletion(params) {
        try {
          const apiParams = {
            model: params.model,
            messages: params.messages
          };
          if (params.temperature !== void 0) apiParams.temperature = params.temperature;
          if (params.max_tokens !== void 0) apiParams.max_tokens = params.max_tokens;
          if (params.max_completion_tokens !== void 0) apiParams.max_completion_tokens = params.max_completion_tokens;
          if (params.reasoning !== void 0) apiParams.reasoning = params.reasoning;
          if (params.text !== void 0) apiParams.text = params.text;
          if (params.response_format !== void 0) apiParams.response_format = params.response_format;
          const response = await withRetry(
            () => openai.chat.completions.create(apiParams),
            {
              ...RetryPresets.externalApi,
              operationName: "OpenAI createCompletion"
            }
          );
          return response;
        } catch (error) {
          console.error("Error creating OpenAI completion:", error);
          throw new Error("Impossible de g\xE9n\xE9rer une r\xE9ponse. Service indisponible.");
        }
      }
      /**
       * Convert natural language question to SQL query
       */
      async convertToSQL(question, schema) {
        try {
          console.log("Conversion SQL - Question re\xE7ue:", question);
          console.log("Conversion SQL - Sch\xE9ma fourni:", schema.substring(0, 200) + "...");
          const prompt = `Tu es un expert en bases de donn\xE9es PostgreSQL. Convertis cette question en langage naturel en requ\xEAte SQL valide.

Base de donn\xE9es PostgreSQL avec le sch\xE9ma suivant :
${schema}

Question en fran\xE7ais : ${question}

Instructions importantes :
- G\xE9n\xE8re uniquement une requ\xEAte SELECT (pas d'INSERT, UPDATE, DELETE)
- Utilise la syntaxe PostgreSQL
- Utilise UNIQUEMENT les tables et colonnes list\xE9es dans le sch\xE9ma ci-dessus
- ATTENTION: Dans la table 'exchanges' la colonne utilisateur s'appelle 'utilisateur_email' (PAS 'email')
- ATTENTION: Dans la table 'daily_counters' la colonne utilisateur s'appelle 'utilisateur_email' (PAS 'email')
- Pour les questions sur les utilisateurs connect\xE9s/actifs, utilise la table 'exchanges' avec la colonne 'utilisateur_email'
- Pour les compteurs quotidiens, utilise la table 'daily_counters' avec la colonne 'utilisateur_email'
- Pour les dates, utilise DATE(timestamp) = CURRENT_DATE pour aujourd'hui
- Pour compter les utilisateurs uniques: COUNT(DISTINCT utilisateur_email)
- Inclus les alias de tables si n\xE9cessaire
- R\xE9ponds uniquement avec la requ\xEAte SQL, sans explication ni markdown

Requ\xEAte SQL :`;
          const response = await withRetry(
            () => openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "Tu es un expert en conversion de langage naturel vers SQL. R\xE9ponds uniquement avec la requ\xEAte SQL demand\xE9e, sans formatage markdown."
                },
                { role: "user", content: prompt }
              ],
              max_tokens: 300,
              temperature: 0.1
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "OpenAI convertToSQL"
            }
          );
          let sqlQuery = response.choices[0].message.content?.trim() || "";
          console.log("R\xE9ponse OpenAI brute:", sqlQuery);
          sqlQuery = sqlQuery.replace(/```sql\s*/gi, "").replace(/```\s*/gi, "");
          const sqlMatch = sqlQuery.match(/(SELECT[\s\S]*?)(?:\n\s*$|$)/i);
          if (sqlMatch) {
            sqlQuery = sqlMatch[1].trim();
            console.log("SQL extrait:", sqlQuery);
          }
          sqlQuery = sqlQuery.replace(/;\s*$/, "");
          if (!sqlQuery.toLowerCase().includes("select")) {
            console.log("\xC9chec validation - pas de SELECT trouv\xE9 dans:", sqlQuery);
            throw new Error("Aucune requ\xEAte SELECT valide trouv\xE9e dans la r\xE9ponse");
          }
          if (!sqlQuery.toLowerCase().trim().startsWith("select")) {
            console.log("\xC9chec validation - ne commence pas par SELECT:", sqlQuery);
            throw new Error("La requ\xEAte doit commencer par SELECT");
          }
          console.log("SQL final valid\xE9:", sqlQuery);
          return sqlQuery;
        } catch (error) {
          console.error("Error converting to SQL:", error);
          if (error instanceof Error) {
            throw new Error(`Impossible de convertir la question en requ\xEAte SQL: ${error.message}`);
          }
          throw new Error("Impossible de convertir la question en requ\xEAte SQL");
        }
      }
    };
    __name(_OpenAIService, "OpenAIService");
    OpenAIService = _OpenAIService;
    openaiService = new OpenAIService();
  }
});

// server/services/pinecone.service.ts
var pinecone_service_exports = {};
__export(pinecone_service_exports, {
  PineconeService: () => PineconeService,
  pineconeService: () => pineconeService
});
import { Pinecone as Pinecone2 } from "@pinecone-database/pinecone";
import OpenAI2 from "openai";
var openai2, _PineconeService, PineconeService, pineconeService;
var init_pinecone_service = __esm({
  "server/services/pinecone.service.ts"() {
    "use strict";
    init_retry();
    openai2 = new OpenAI2({
      apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
    });
    _PineconeService = class _PineconeService {
      constructor() {
        this.indexName = "";
        this.namespace = "";
        try {
          const apiKey = process.env.PINECONE_API_KEY;
          this.indexName = process.env.PINECONE_INDEX_NAME || "arthrologie-du-membre-superieur";
          this.namespace = process.env.PINECONE_NAMESPACE || "default";
          if (!apiKey) {
            console.warn("Missing Pinecone API key - running in fallback mode");
            this.pinecone = null;
            this.index = null;
            return;
          }
          this.pinecone = new Pinecone2({
            apiKey
          });
          this.index = this.pinecone.index(this.indexName);
          console.log(`Connected to Pinecone index: ${this.indexName}`);
        } catch (error) {
          console.error("Error initializing Pinecone service:", error);
          console.warn("Running in fallback mode without Pinecone");
          this.pinecone = null;
          this.index = null;
        }
      }
      /**
       * Gets the vector embedding for a text string using OpenAI
       */
      async getEmbedding(text) {
        try {
          const response = await withRetry(
            () => openai2.embeddings.create({
              model: "text-embedding-3-small",
              input: text,
              encoding_format: "float"
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "OpenAI getEmbedding"
            }
          );
          return response.data[0].embedding;
        } catch (error) {
          console.error("Error getting embedding:", error);
          throw new Error("Failed to generate embedding for query");
        }
      }
      /**
       * Search for relevant content based on the question
       */
      async searchRelevantContent(question, topK = 3) {
        try {
          if (!this.pinecone || !this.index) {
            console.warn("Pinecone not available - returning empty results");
            return [];
          }
          const embedding = await this.getEmbedding(question);
          const queryResponse = await withRetry(
            () => this.index.query({
              vector: embedding,
              topK,
              includeMetadata: true
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone searchRelevantContent"
            }
          );
          const results = [];
          for (const match of queryResponse.matches) {
            if (match.metadata && typeof match.metadata.text === "string") {
              results.push({
                content: match.metadata.text,
                metadata: {
                  source: typeof match.metadata.source === "string" ? match.metadata.source : void 0
                }
              });
            }
          }
          return results;
        } catch (error) {
          console.error("Error searching Pinecone:", error);
          return [];
        }
      }
      /**
       * Bulk upsert vectors to Pinecone
       */
      async upsertVectors(vectors) {
        try {
          if (!this.pinecone || !this.index) {
            console.warn("Pinecone not available - skipping upsert");
            return;
          }
          await withRetry(
            () => this.index.upsert(vectors),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone upsertVectors"
            }
          );
          console.log(`Successfully upserted ${vectors.length} vectors to Pinecone`);
        } catch (error) {
          console.error("Error upserting vectors:", error);
          throw new Error("Failed to store vectors in knowledge base");
        }
      }
      /**
       * Get all document sources from Pinecone
       */
      async getAllSources() {
        try {
          if (!this.pinecone || !this.index) {
            console.warn("Pinecone not available - returning empty sources");
            return [];
          }
          const dummyVector = new Array(1536).fill(0);
          const queryResponse = await withRetry(
            () => this.index.query({
              vector: dummyVector,
              topK: 100,
              includeMetadata: true
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone getAllSources"
            }
          );
          const sources = /* @__PURE__ */ new Set();
          queryResponse.matches.forEach((match) => {
            if (match.metadata && match.metadata.source) {
              sources.add(match.metadata.source);
            }
          });
          return Array.from(sources);
        } catch (error) {
          console.error("Error getting sources:", error);
          return [];
        }
      }
      /**
       * Delete all vectors for a specific document
       */
      async deleteDocument(documentTitle) {
        try {
          if (!this.pinecone || !this.index) {
            console.warn("Pinecone not available - skipping delete");
            return;
          }
          const dummyVector = new Array(1536).fill(0);
          const queryResponse = await withRetry(
            () => this.index.query({
              vector: dummyVector,
              topK: 1e3,
              includeMetadata: true,
              filter: { source: documentTitle }
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone deleteDocument query"
            }
          );
          const idsToDelete = queryResponse.matches.map((match) => match.id);
          if (idsToDelete.length > 0) {
            await withRetry(
              () => this.index.deleteMany(idsToDelete),
              {
                ...RetryPresets.externalApi,
                operationName: "Pinecone deleteDocument deleteMany"
              }
            );
            console.log(`Deleted ${idsToDelete.length} vectors for document: ${documentTitle}`);
          }
        } catch (error) {
          console.error("Error deleting document:", error);
          throw new Error("Failed to delete document from knowledge base");
        }
      }
      /**
       * Create a new Pinecone index
       */
      async createIndex(indexName, dimension = 1536) {
        if (!this.pinecone) {
          throw new Error("Pinecone not initialized - please check your API key");
        }
        try {
          console.log(`Attempting to create Pinecone index: ${indexName} with dimension: ${dimension}`);
          const result = await withRetry(
            () => this.pinecone.createIndex({
              name: indexName,
              dimension,
              metric: "cosine",
              spec: {
                serverless: {
                  cloud: "aws",
                  region: "us-east-1"
                }
              }
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone createIndex"
            }
          );
          console.log(`Successfully created Pinecone index: ${indexName}`, result);
        } catch (error) {
          console.error("Detailed error creating Pinecone index:", {
            message: error.message,
            status: error.status,
            response: error.response?.data,
            indexName,
            dimension
          });
          if (error.message && error.message.includes("ALREADY_EXISTS")) {
            throw new Error(`L'index "${indexName}" existe d\xE9j\xE0. Veuillez choisir un nom diff\xE9rent ou attendre quelques minutes si vous venez de le supprimer.`);
          } else if (error.status === 403) {
            throw new Error("Permission denied. Please check your Pinecone API key.");
          } else if (error.status === 400) {
            throw new Error(`Invalid index configuration: ${error.message}`);
          } else {
            throw new Error(`Failed to create index: ${error.message || "Unknown error"}`);
          }
        }
      }
      /**
       * List all available Pinecone indexes
       */
      async listIndexes() {
        if (!this.pinecone) {
          console.error("\u274C Pinecone not initialized");
          throw new Error("Pinecone not initialized");
        }
        try {
          console.log("\u{1F4E1} Calling Pinecone listIndexes API...");
          const indexesList = await withRetry(
            () => this.pinecone.listIndexes(),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone listIndexes"
            }
          );
          console.log("\u2705 Pinecone API response received:", JSON.stringify(indexesList, null, 2));
          if (!indexesList || !indexesList.indexes) {
            console.log("\u26A0\uFE0F No indexes found in response or empty response");
            return [];
          }
          console.log("\u{1F4DD} Processing indexes data...");
          const indexes = indexesList.indexes.map((index, idx) => {
            console.log(`Processing index ${idx}:`, JSON.stringify(index, null, 2));
            return {
              name: index.name,
              status: index.status?.ready ? "ready" : "not ready",
              dimension: index.dimension
            };
          });
          console.log("\u2705 Successfully processed indexes:", JSON.stringify(indexes, null, 2));
          return indexes;
        } catch (error) {
          console.error("\u274C Error in listIndexes:", error);
          console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
          console.error("Error details:", {
            message: error instanceof Error ? error.message : "Unknown error",
            name: error instanceof Error ? error.name : "Unknown",
            code: error?.code,
            status: error?.status
          });
          throw error;
        }
      }
      /**
       * Switch to a different index
       */
      async switchIndex(indexName) {
        if (!this.pinecone) {
          throw new Error("Pinecone not initialized");
        }
        try {
          this.indexName = indexName;
          this.index = this.pinecone.index(indexName);
          console.log(`Switched to Pinecone index: ${indexName}`);
        } catch (error) {
          console.error("Error switching Pinecone index:", error);
          throw error;
        }
      }
      /**
       * Process PDF content into chunks and upload to Pinecone
       */
      async processPDFContent(content, title, category, chunkSize = 1e3, overlap = 200) {
        if (!this.index) {
          throw new Error("Pinecone not available");
        }
        try {
          const chunks = this.splitIntoChunks(content, chunkSize, overlap);
          const embeddings = await this.getEmbeddingsForChunks(chunks);
          const vectors = chunks.map((chunk, index) => ({
            id: `${title}_chunk_${index}`,
            values: embeddings[index],
            metadata: {
              source: title,
              text: chunk,
              category,
              chunk_index: index,
              total_chunks: chunks.length
            }
          }));
          await this.upsertVectors(vectors);
          console.log(`Processed PDF: ${title} with ${chunks.length} chunks`);
        } catch (error) {
          console.error("Error processing PDF content:", error);
          throw error;
        }
      }
      /**
       * Split text into chunks with overlap
       */
      splitIntoChunks(text, chunkSize, overlap) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
          const end = Math.min(start + chunkSize, text.length);
          const chunk = text.slice(start, end);
          chunks.push(chunk.trim());
          if (end === text.length) break;
          start = end - overlap;
        }
        return chunks.filter((chunk) => chunk.length > 0);
      }
      /**
       * Get embeddings for multiple text chunks
       */
      async getEmbeddingsForChunks(chunks) {
        const embeddings = [];
        const batchSize = 10;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const batchEmbeddings = await Promise.all(
            batch.map((chunk) => this.getEmbedding(chunk))
          );
          embeddings.push(...batchEmbeddings);
          if (i + batchSize < chunks.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        return embeddings;
      }
      async queryVectors(query, indexName, topK = 5) {
        try {
          if (!this.pinecone) {
            console.warn("Pinecone not available - returning empty results");
            return [];
          }
          const embedding = await this.getEmbedding(query);
          const targetIndex = this.pinecone.index(indexName);
          const queryResponse = await withRetry(
            () => targetIndex.query({
              vector: embedding,
              topK,
              includeMetadata: true
            }),
            {
              ...RetryPresets.externalApi,
              operationName: "Pinecone queryVectors"
            }
          );
          const results = [];
          for (const match of queryResponse.matches) {
            if (match.metadata && typeof match.metadata.text === "string") {
              results.push({
                content: match.metadata.text,
                metadata: {
                  source: typeof match.metadata.source === "string" ? match.metadata.source : void 0
                }
              });
            }
          }
          return results;
        } catch (error) {
          console.error(`Error querying Pinecone index ${indexName}:`, error);
          return [];
        }
      }
    };
    __name(_PineconeService, "PineconeService");
    PineconeService = _PineconeService;
    pineconeService = new PineconeService();
  }
});

// server/services/promptGen.service.ts
var promptGen_service_exports = {};
__export(promptGen_service_exports, {
  PromptGenService: () => PromptGenService,
  promptGenService: () => promptGenService
});
var _PromptGenService, PromptGenService, promptGenService;
var init_promptGen_service = __esm({
  "server/services/promptGen.service.ts"() {
    "use strict";
    init_openai_service();
    init_pinecone_service();
    _PromptGenService = class _PromptGenService {
      async generatePatientPrompt(teacherInput, contextDocs = []) {
        try {
          let embeddedDocs = [];
          try {
            embeddedDocs = await pineconeService.searchRelevantContent(teacherInput);
          } catch (error) {
            console.log("Pinecone not available, using base prompt generation");
          }
          const allContext = [...contextDocs, ...embeddedDocs].join("\n\n");
          const systemPrompt = `Tu es un expert en cr\xE9ation de sc\xE9narios ECOS (Examen Clinique Objectif Structur\xE9). 
Tu dois cr\xE9er un prompt d\xE9taill\xE9 et r\xE9aliste pour simuler un patient virtuel.

Le prompt doit:
1. D\xE9finir clairement l'identit\xE9 du patient (\xE2ge, sexe, profession, etc.)
2. D\xE9crire les sympt\xF4mes actuels et l'histoire de la maladie
3. Inclure les ant\xE9c\xE9dents m\xE9dicaux pertinents
4. Pr\xE9ciser l'\xE9tat \xE9motionnel et le comportement du patient
5. D\xE9finir ce que le patient sait et ne sait pas sur sa condition
6. Inclure des d\xE9tails sur la personnalit\xE9 du patient
7. Sp\xE9cifier comment le patient doit r\xE9agir aux diff\xE9rents types de questions

Le prompt r\xE9sultant sera utilis\xE9 pour faire jouer le r\xF4le du patient \xE0 une IA lors d'un ECOS avec un \xE9tudiant en m\xE9decine.`;
          const userPrompt = `Cr\xE9e un prompt d\xE9taill\xE9 pour un patient virtuel bas\xE9 sur cette description du sc\xE9nario clinique:

${teacherInput}

${allContext ? `Utilise \xE9galement ces informations contextuelles pour enrichir le sc\xE9nario:
${allContext}` : ""}

Assure-toi que le prompt soit suffisamment d\xE9taill\xE9 pour permettre une interaction r\xE9aliste et p\xE9dagogique de 25-30 minutes.`;
          const response = await openaiService.generateResponse(
            `G\xE9n\xE8re un prompt d\xE9taill\xE9 pour un patient virtuel bas\xE9 sur cette description de sc\xE9nario ECOS:

${teacherInput}

Documents de r\xE9f\xE9rence:
${contextDocs.join("\n\n")}`,
            allContext
          );
          return response;
        } catch (error) {
          console.error("Error generating patient prompt:", error);
          throw new Error("Failed to generate patient prompt");
        }
      }
      async generateEvaluationCriteria(scenarioDescription) {
        try {
          const systemPrompt = `Tu es un expert en \xE9valuation ECOS. Cr\xE9e des crit\xE8res d'\xE9valuation structur\xE9s pour ce sc\xE9nario clinique.

Les crit\xE8res doivent inclure:
1. Communication (\xE9coute, empathie, clart\xE9)
2. Anamn\xE8se (questions pertinentes, organisation)
3. Examen clinique (techniques, syst\xE9matique)
4. Raisonnement clinique (diagnostic diff\xE9rentiel, hypoth\xE8ses)
5. Prise en charge (plan th\xE9rapeutique, suivi)

Chaque crit\xE8re doit avoir:
- Un nom clair
- Une description d\xE9taill\xE9e
- Une \xE9chelle de notation (0-4 points)
- Des indicateurs de performance pour chaque niveau

Retourne le r\xE9sultat en format JSON structur\xE9.`;
          const response = await openaiService.createCompletion({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Cr\xE9e des crit\xE8res d'\xE9valuation pour ce sc\xE9nario ECOS:

${scenarioDescription}` }
            ],
            temperature: 0.3,
            max_tokens: 1500
          });
          const criteriaText = response.choices[0].message.content;
          try {
            return JSON.parse(criteriaText);
          } catch {
            return {
              criteria: [
                {
                  name: "Communication",
                  description: "\xC9valuation des comp\xE9tences de communication",
                  maxScore: 4,
                  details: criteriaText
                }
              ]
            };
          }
        } catch (error) {
          console.error("Error generating evaluation criteria:", error);
          throw new Error("Failed to generate evaluation criteria");
        }
      }
    };
    __name(_PromptGenService, "PromptGenService");
    PromptGenService = _PromptGenService;
    promptGenService = new PromptGenService();
  }
});

// server/services/training-session.service.ts
var training_session_service_exports = {};
__export(training_session_service_exports, {
  trainingSessionService: () => trainingSessionService
});
import crypto from "crypto";
var _TrainingSessionService, TrainingSessionService, trainingSessionService;
var init_training_session_service = __esm({
  "server/services/training-session.service.ts"() {
    "use strict";
    init_unified_database_service();
    init_logger_service();
    _TrainingSessionService = class _TrainingSessionService {
      /**
       * Generate a unique enrollment token for a training session
       * Format: ts_<32 random hex characters>
       */
      generateEnrollmentToken() {
        return `ts_${crypto.randomBytes(16).toString("hex")}`;
      }
      /**
       * Create enrollment URL for students
       *
       * CRITICAL: Always uses production URL to avoid Firebase domain authorization issues
       *
       * Firebase requires pre-authorized domains for authentication.
       * Preview deployment URLs (ecos-infirmier-b-20-xyz123.vercel.app) are NOT authorized.
       *
       * TRADE-OFF: Preview deployments cannot test enrollment flow with Firebase authentication.
       * All enrollment links point to production domain, even when created in previews.
       *
       * REQUIRED: Configure BASE_URL in Vercel for all environments (Production, Preview, Development)
       */
      createEnrollmentUrl(token) {
        const baseUrl = process.env.BASE_URL || (process.env.VERCEL_ENV === "production" ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || "ecos-infirmier-b-20.vercel.app"}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:5000");
        if (!process.env.BASE_URL && process.env.VERCEL_ENV) {
          console.warn(`\u26A0\uFE0F BASE_URL not configured. Using fallback: ${baseUrl}`);
          console.warn("\u26A0\uFE0F Enrollment links may fail Firebase authentication if domain is not authorized.");
          console.warn("\u26A0\uFE0F Configure BASE_URL in Vercel: https://vercel.com/docs/projects/environment-variables");
        }
        return `${baseUrl}/enroll/${token}`;
      }
      /**
       * Create a training session with enrollment link and assigned teachers
       */
      async createTrainingSession(params) {
        const startTime = Date.now();
        try {
          logger.info("Creating training session - START", {
            title: params.title,
            createdBy: params.createdBy,
            teachersCount: params.teacherEmails.length,
            scenariosCount: params.scenarioIds.length
          });
          let client;
          try {
            client = await Promise.race([
              unifiedDb.getClient(),
              new Promise(
                (_, reject) => setTimeout(() => reject(new Error("Database client initialization timeout")), 5e3)
              )
            ]);
            logger.info("Database client acquired successfully");
          } catch (clientError) {
            logger.error("Failed to acquire database client", {
              error: clientError.message,
              stack: clientError.stack
            });
            throw new Error(`Database connection failed: ${clientError.message}`);
          }
          const enrollmentToken = this.generateEnrollmentToken();
          const tokenExpiresAt = params.tokenExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3);
          const startDate = params.startDate || /* @__PURE__ */ new Date();
          const endDate = params.endDate || tokenExpiresAt;
          logger.info("Token generated, proceeding with session creation", {
            enrollmentToken,
            tokenExpiresAt: tokenExpiresAt.toISOString()
          });
          logger.info("Inserting training session into database");
          const { data: session, error: sessionError } = await client.from("training_sessions").insert({
            title: params.title,
            description: params.description || "",
            created_by: params.createdBy,
            status: "active",
            enrollment_token: enrollmentToken,
            token_expires_at: tokenExpiresAt.toISOString(),
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          }).select().single();
          if (sessionError) {
            logger.error("Failed to create training session in database", {
              error: sessionError,
              code: sessionError.code,
              details: sessionError.details,
              hint: sessionError.hint,
              message: sessionError.message
            });
            throw new Error(`Database insert failed: ${sessionError.message || "Unknown error"}`);
          }
          if (!session) {
            logger.error("Session created but no data returned");
            throw new Error("Session created but no data returned from database");
          }
          logger.info("Training session created successfully", {
            sessionId: session.id,
            enrollmentToken,
            duration: Date.now() - startTime
          });
          logger.info("Assigning teachers to session", { sessionId: session.id });
          const teacherAssignments = [
            {
              training_session_id: session.id,
              teacher_email: params.createdBy,
              role: "owner",
              assigned_by: params.createdBy,
              assigned_at: (/* @__PURE__ */ new Date()).toISOString()
            },
            ...params.teacherEmails.map((email) => ({
              training_session_id: session.id,
              teacher_email: email.trim().toLowerCase(),
              role: "teacher",
              assigned_by: params.createdBy,
              assigned_at: (/* @__PURE__ */ new Date()).toISOString()
            }))
          ];
          const { error: teachersError } = await client.from("training_session_teachers").insert(teacherAssignments);
          if (teachersError) {
            logger.error("Failed to assign teachers", {
              error: teachersError,
              sessionId: session.id,
              teachersCount: teacherAssignments.length
            });
            logger.warn("Continuing despite teacher assignment failure");
          } else {
            logger.info("Teachers assigned successfully", {
              sessionId: session.id,
              teachersCount: teacherAssignments.length
            });
          }
          logger.info("Assigning scenarios to session", { sessionId: session.id });
          const scenarioAssignments = params.scenarioIds.map((scenarioId) => ({
            training_session_id: session.id,
            scenario_id: scenarioId
          }));
          const { error: scenariosError } = await client.from("training_session_scenarios").insert(scenarioAssignments);
          if (scenariosError) {
            logger.error("Failed to assign scenarios", {
              error: scenariosError,
              sessionId: session.id,
              scenariosCount: scenarioAssignments.length
            });
            logger.warn("Continuing despite scenario assignment failure");
          } else {
            logger.info("Scenarios assigned successfully", {
              sessionId: session.id,
              scenariosCount: scenarioAssignments.length
            });
          }
          const enrollmentUrl = this.createEnrollmentUrl(enrollmentToken);
          const result = {
            ...session,
            enrollmentUrl,
            enrollmentToken,
            // For admin reference
            teachers: teacherAssignments.map((t) => ({
              email: t.teacher_email,
              role: t.role
            })),
            scenarioIds: params.scenarioIds
          };
          logger.info("Training session creation completed successfully", {
            sessionId: session.id,
            duration: Date.now() - startTime,
            enrollmentUrl
          });
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error("TrainingSession creation failed", {
            title: params.title,
            createdBy: params.createdBy,
            error: error.message,
            errorName: error.name,
            errorCode: error.code,
            stack: error.stack,
            duration
          });
          const enhancedError = new Error(
            `Failed to create training session "${params.title}": ${error.message}`
          );
          enhancedError.originalError = error;
          enhancedError.context = {
            title: params.title,
            createdBy: params.createdBy,
            duration
          };
          throw enhancedError;
        }
      }
      /**
       * Get training session by enrollment token (for preview)
       */
      async getSessionByToken(token) {
        try {
          logger.info("Looking up session by enrollment token", { token });
          const client = await unifiedDb.getClient();
          const { data: session, error } = await client.from("training_sessions").select("*").eq("enrollment_token", token).single();
          if (error) {
            logger.error("Database error when looking up session by token", {
              token,
              error: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            return null;
          }
          if (!session) {
            logger.warn("Session not found by token", { token });
            return null;
          }
          logger.info("Session found by token", {
            token,
            sessionId: session.id,
            title: session.title
          });
          if (new Date(session.token_expires_at) < /* @__PURE__ */ new Date()) {
            logger.warn("Enrollment token expired", {
              token,
              sessionId: session.id,
              expiresAt: session.token_expires_at
            });
            throw new Error("ENROLLMENT_LINK_EXPIRED");
          }
          let scenarios = [];
          try {
            const { data: scenarioLinks } = await client.from("training_session_scenarios").select("scenario_id").eq("training_session_id", session.id);
            if (scenarioLinks && scenarioLinks.length > 0) {
              const scenarioIds = scenarioLinks.map((link) => link.scenario_id);
              const { data: scenariosData } = await client.from("scenarios").select("id, title, description, image_url").in("id", scenarioIds);
              scenarios = scenariosData || [];
              logger.info("Loaded scenarios for session", {
                sessionId: session.id,
                scenariosCount: scenarios.length
              });
            }
          } catch (scenarioError) {
            logger.warn("Failed to load scenarios for session", {
              sessionId: session.id,
              error: scenarioError.message
            });
          }
          return {
            id: session.id,
            title: session.title,
            description: session.description,
            scenarios,
            expiresAt: session.token_expires_at
          };
        } catch (error) {
          logger.error("Failed to get session by token", {
            token,
            error: error.message,
            errorName: error.name,
            stack: error.stack
          });
          throw error;
        }
      }
      /**
       * Enroll a student in a training session via token
       */
      async enrollStudent(token, studentEmail) {
        try {
          const client = await unifiedDb.getClient();
          const { data: session, error: sessionError } = await client.from("training_sessions").select("*").eq("enrollment_token", token).single();
          if (sessionError || !session) {
            logger.warn("Invalid enrollment token", { token });
            throw new Error("INVALID_ENROLLMENT_TOKEN");
          }
          if (new Date(session.token_expires_at) < /* @__PURE__ */ new Date()) {
            logger.warn("Enrollment token expired", {
              token,
              sessionId: session.id,
              expiresAt: session.token_expires_at
            });
            throw new Error("ENROLLMENT_LINK_EXPIRED");
          }
          const { data: existing } = await client.from("training_session_students").select("*").eq("training_session_id", session.id).eq("student_email", studentEmail).single();
          if (existing) {
            logger.info("Student already enrolled", {
              sessionId: session.id,
              studentEmail
            });
            return {
              session,
              alreadyEnrolled: true
            };
          }
          const { error: enrollError } = await client.from("training_session_students").insert({
            training_session_id: session.id,
            student_email: studentEmail,
            assigned_at: (/* @__PURE__ */ new Date()).toISOString(),
            status: "assigned"
          });
          if (enrollError) {
            logger.error("Failed to enroll student", {
              sessionId: session.id,
              studentEmail,
              error: enrollError
            });
            throw enrollError;
          }
          logger.info("Student enrolled successfully", {
            sessionId: session.id,
            sessionTitle: session.title,
            studentEmail,
            viaToken: token
          });
          return {
            session,
            alreadyEnrolled: false
          };
        } catch (error) {
          logger.error("Student enrollment failed", {
            token,
            studentEmail,
            error: error.message
          });
          throw error;
        }
      }
      /**
       * Get all teachers assigned to a training session
       */
      async getSessionTeachers(trainingSessionId) {
        try {
          const client = await unifiedDb.getClient();
          const { data, error } = await client.from("training_session_teachers").select("*").eq("training_session_id", trainingSessionId).order("role", { ascending: true });
          if (error) throw error;
          return data || [];
        } catch (error) {
          logger.error("Failed to get session teachers", {
            trainingSessionId,
            error: error.message
          });
          return [];
        }
      }
      /**
       * Get all training sessions where a teacher is assigned
       */
      async getTeacherSessions(teacherEmail) {
        try {
          const client = await unifiedDb.getClient();
          const { data, error } = await client.from("training_session_teachers").select("training_session_id").eq("teacher_email", teacherEmail);
          if (error) throw error;
          return (data || []).map((row) => row.training_session_id);
        } catch (error) {
          logger.error("Failed to get teacher sessions", {
            teacherEmail,
            error: error.message
          });
          return [];
        }
      }
      /**
       * Check if a teacher has access to a training session
       */
      async hasTeacherAccess(teacherEmail, trainingSessionId) {
        try {
          const client = await unifiedDb.getClient();
          const { data, error } = await client.from("training_session_teachers").select("id").eq("training_session_id", trainingSessionId).eq("teacher_email", teacherEmail).single();
          return !error && !!data;
        } catch (error) {
          return false;
        }
      }
    };
    __name(_TrainingSessionService, "TrainingSessionService");
    TrainingSessionService = _TrainingSessionService;
    trainingSessionService = new TrainingSessionService();
  }
});

// server/services/realtime-analysis.service.ts
var realtime_analysis_service_exports = {};
__export(realtime_analysis_service_exports, {
  realtimeAnalysisService: () => realtimeAnalysisService
});
var _RealtimeAnalysisService, RealtimeAnalysisService, realtimeAnalysisService;
var init_realtime_analysis_service = __esm({
  "server/services/realtime-analysis.service.ts"() {
    "use strict";
    init_openai_service();
    init_unified_database_service();
    init_logger_service();
    init_training_session_service();
    _RealtimeAnalysisService = class _RealtimeAnalysisService {
      constructor() {
        // Cache pour éviter re-analyse des mêmes messages
        this.analysisCache = /* @__PURE__ */ new Map();
        // Configuration
        this.SNAPSHOT_INTERVAL = 3;
        // Créer un snapshot tous les 3 échanges
        this.MIN_EXCHANGES_FOR_ANALYSIS = 2;
        // Minimum d'échanges avant première analyse
        this.CACHE_DURATION_MS = 5 * 60 * 1e3;
      }
      // 5 minutes
      /**
       * Analyze a session and create a snapshot if needed
       * Called when new messages are added to a session
       */
      async analyzeSessionProgress(sessionId, options = {}) {
        try {
          console.log("\u{1F50D} [RealtimeAnalysis] CALLED with sessionId:", sessionId, "options:", options);
          const session = await unifiedDb.getSessionByStringId(sessionId);
          if (!session) {
            logger.warn("RealtimeAnalysis: Session not found in DB", { sessionId });
            console.log("\u274C [RealtimeAnalysis] Session not found:", sessionId);
            return;
          }
          console.log("\u2705 [RealtimeAnalysis] Session found:", {
            dbId: session.id,
            student: session.student_email,
            scenarioId: session.scenario_id,
            status: session.status
          });
          const messages = await unifiedDb.getSessionMessages(sessionId, 100);
          if (!messages || messages.length === 0) {
            logger.debug("RealtimeAnalysis: No messages yet", { sessionId });
            console.log("\u26A0\uFE0F [RealtimeAnalysis] No messages found for session:", sessionId);
            return;
          }
          console.log(`\u{1F4DD} [RealtimeAnalysis] Found ${messages.length} messages for session ${sessionId}`);
          const exchangeCount = this.calculateExchangeCount(messages);
          console.log(`\u{1F522} [RealtimeAnalysis] Exchange count: ${exchangeCount} (need minimum ${this.MIN_EXCHANGES_FOR_ANALYSIS})`);
          const shouldCreate = await this.shouldCreateSnapshot(sessionId, exchangeCount, options);
          if (!shouldCreate) {
            logger.debug("RealtimeAnalysis: Skipping snapshot creation", {
              sessionId,
              exchangeCount,
              cached: this.analysisCache.has(sessionId)
            });
            console.log("\u23ED\uFE0F [RealtimeAnalysis] Skipping snapshot - cached or not enough exchanges");
            return;
          }
          console.log("\u{1F680} [RealtimeAnalysis] Creating snapshot for session:", sessionId);
          logger.info("RealtimeAnalysis: Analyzing session", { sessionId, exchangeCount });
          const useAIAnalysis = options.forceSnapshot || options.sessionStatus === "completed";
          const analysis = await this.analyzeMessages(messages, session.scenario_id, useAIAnalysis);
          console.log("\u{1F916} [RealtimeAnalysis] Analysis complete:", {
            strengths: analysis.strengths.length,
            weaknesses: analysis.weaknesses.length,
            indicators: Object.keys(analysis.progressIndicators)
          });
          console.log("\u{1F4BE} [RealtimeAnalysis] Inserting snapshot into DB...", {
            sessionDbId: session.id,
            sessionStringId: sessionId,
            student: session.student_email,
            scenarioId: session.scenario_id,
            exchangeCount,
            status: options.sessionStatus || "in_progress"
          });
          await this.createSnapshot({
            sessionId: session.id,
            // Use DB integer ID
            studentEmail: session.student_email,
            scenarioId: session.scenario_id,
            exchangeCount,
            analysis,
            status: options.sessionStatus || "in_progress"
          });
          console.log("\u2705 [RealtimeAnalysis] Snapshot inserted successfully");
          this.analysisCache.set(sessionId, {
            exchangeCount,
            lastAnalysis: /* @__PURE__ */ new Date()
          });
          logger.info("RealtimeAnalysis: Snapshot created successfully", {
            sessionId,
            exchangeCount,
            strengthsCount: analysis.strengths.length,
            weaknessesCount: analysis.weaknesses.length
          });
        } catch (error) {
          logger.error("RealtimeAnalysis: Error analyzing session", {
            sessionId,
            error: error.message,
            stack: error.stack
          });
        }
      }
      /**
       * Calculate number of complete exchanges (user + assistant pairs)
       */
      calculateExchangeCount(messages) {
        const userMessages = messages.filter((m) => m.role === "user").length;
        const assistantMessages = messages.filter((m) => m.role === "assistant").length;
        return Math.min(userMessages, assistantMessages);
      }
      /**
       * Determine if a snapshot should be created
       * CRITICAL FIX: Verifies snapshot exists in DB before trusting cache
       * This prevents cache/DB desync from timeouts causing invisible students
       */
      async shouldCreateSnapshot(sessionId, currentExchangeCount, options) {
        if (options.forceSnapshot || options.sessionStatus === "completed") {
          return true;
        }
        if (currentExchangeCount < this.MIN_EXCHANGES_FOR_ANALYSIS) {
          return false;
        }
        const cached = this.analysisCache.get(sessionId);
        if (!cached) {
          return true;
        }
        const newExchanges = currentExchangeCount - cached.exchangeCount;
        if (newExchanges >= this.SNAPSHOT_INTERVAL) {
          return true;
        }
        const cacheAge = Date.now() - cached.lastAnalysis.getTime();
        if (cacheAge > this.CACHE_DURATION_MS) {
          return true;
        }
        const snapshotExists = await this.verifySnapshotExistsInDB(sessionId);
        if (!snapshotExists) {
          logger.warn("RealtimeAnalysis: Cache says skip but no snapshot in DB - forcing creation", {
            sessionId,
            cachedExchangeCount: cached.exchangeCount,
            currentExchangeCount,
            cacheAge
          });
          console.log("\u26A0\uFE0F [shouldCreateSnapshot] Cache/DB desync detected - clearing cache and forcing snapshot");
          this.analysisCache.delete(sessionId);
          return true;
        }
        return false;
      }
      /**
       * Verify that at least one snapshot exists in DB for this session
       * Returns true if snapshot exists, false otherwise
       */
      async verifySnapshotExistsInDB(sessionId) {
        try {
          const session = await unifiedDb.getSessionByStringId(sessionId);
          if (!session) {
            return false;
          }
          const client = await unifiedDb.getClient();
          const { data, error } = await client.from("student_progress_snapshots").select("id").eq("session_id", session.id).limit(1).maybeSingle();
          if (error) {
            logger.warn("RealtimeAnalysis: Error checking snapshot existence", {
              sessionId,
              error: error.message
            });
            return false;
          }
          const exists = !!data;
          console.log(`\u{1F50D} [verifySnapshotExistsInDB] Session ${sessionId} (DB ID: ${session.id}) has snapshot: ${exists}`);
          return exists;
        } catch (error) {
          logger.warn("RealtimeAnalysis: Failed to verify snapshot existence", {
            sessionId,
            error: error.message
          });
          return false;
        }
      }
      /**
       * Analyze messages to extract strengths, weaknesses, and progress indicators
       * OPTIMIZATION: Can skip AI analysis for intermediate snapshots to avoid timeouts
       */
      async analyzeMessages(messages, scenarioId, useAIAnalysis = true) {
        try {
          if (!useAIAnalysis) {
            logger.debug("Skipping AI analysis for intermediate snapshot (performance optimization)");
            const exchangeCount = Math.min(
              messages.filter((m) => m.role === "user").length,
              messages.filter((m) => m.role === "assistant").length
            );
            return {
              strengths: [`En cours de discussion (${exchangeCount} \xE9changes)`],
              weaknesses: ["Analyse d\xE9taill\xE9e disponible \xE0 la fin"],
              progressIndicators: {
                engagement_score: 0.5,
                question_quality: 0.5,
                empathy_level: 0.5,
                clinical_reasoning: 0.5
              }
            };
          }
          const transcript = messages.map((msg) => {
            const role = msg.role === "user" ? "\xC9tudiant" : "Patient";
            const content2 = msg.role === "user" ? msg.question || msg.content || "" : msg.response || msg.content || "";
            return `${role}: ${content2}`;
          }).join("\n");
          const systemPrompt = `Tu es un assistant d'\xE9valuation ECOS. Analyse rapidement cette conversation en cours entre un \xE9tudiant et un patient virtuel.

Identifie en temps r\xE9el :
1. Points forts (2-3 maximum) : ce que l'\xE9tudiant fait bien
2. Points faibles (2-3 maximum) : ce qui doit \xEAtre am\xE9lior\xE9
3. Indicateurs de progression (scores 0-1) :
   - engagement_score : niveau d'engagement de l'\xE9tudiant
   - question_quality : qualit\xE9 des questions pos\xE9es
   - empathy_level : niveau d'empathie d\xE9montr\xE9
   - clinical_reasoning : qualit\xE9 du raisonnement clinique

R\xE9ponds UNIQUEMENT en JSON valide :
{
  "strengths": ["point fort 1", "point fort 2"],
  "weaknesses": ["point faible 1", "point faible 2"],
  "indicators": {
    "engagement_score": 0.8,
    "question_quality": 0.7,
    "empathy_level": 0.9,
    "clinical_reasoning": 0.6
  }
}`;
          const userPrompt = `Conversation en cours :
${transcript}`;
          const completion = await openaiService.createCompletion({
            model: "gpt-4o-mini",
            // Use mini for faster/cheaper real-time analysis
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_completion_tokens: 500,
            response_format: { type: "json_object" }
          });
          const content = completion.choices?.[0]?.message?.content || "{}";
          const parsed = JSON.parse(content);
          return {
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
            weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
            progressIndicators: parsed.indicators || {}
          };
        } catch (error) {
          logger.warn("RealtimeAnalysis: AI analysis failed, using fallback", {
            error: error.message
          });
          return this.createFallbackAnalysis(messages);
        }
      }
      /**
       * Fallback analysis when AI is unavailable
       */
      createFallbackAnalysis(messages) {
        const userMessages = messages.filter((m) => m.role === "user");
        const exchangeCount = this.calculateExchangeCount(messages);
        const avgMessageLength = userMessages.reduce(
          (sum, m) => sum + (m.question || m.content || "").length,
          0
        ) / Math.max(userMessages.length, 1);
        const engagement = Math.min(1, exchangeCount / 10);
        const questionQuality = Math.min(1, avgMessageLength / 100);
        return {
          strengths: exchangeCount > 5 ? ["Participation active", "Bonne progression"] : ["D\xE9but de session"],
          weaknesses: exchangeCount < 3 ? ["Session en cours, analyse pr\xE9liminaire"] : [],
          progressIndicators: {
            engagement_score: engagement,
            question_quality: questionQuality,
            empathy_level: 0.5,
            // Neutral
            clinical_reasoning: 0.5
            // Neutral
          }
        };
      }
      /**
       * Create a progress snapshot in the database
       */
      async createSnapshot(data) {
        try {
          console.log("\u{1F4CA} [createSnapshot] Preparing snapshot insert:", {
            sessionId: data.sessionId,
            studentEmail: data.studentEmail,
            scenarioId: data.scenarioId,
            exchangeCount: data.exchangeCount,
            status: data.status,
            strengthsCount: data.analysis.strengths.length,
            weaknessesCount: data.analysis.weaknesses.length
          });
          const client = await unifiedDb.getClient();
          const insertData = {
            session_id: data.sessionId,
            student_email: data.studentEmail,
            scenario_id: data.scenarioId,
            exchange_count: data.exchangeCount,
            strengths: data.analysis.strengths,
            weaknesses: data.analysis.weaknesses,
            progress_indicators: data.analysis.progressIndicators,
            status: data.status,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          };
          console.log("\u{1F4BE} [createSnapshot] INSERT data:", JSON.stringify(insertData, null, 2));
          const { data: insertedData, error } = await client.from("student_progress_snapshots").insert(insertData).select();
          if (error) {
            console.error("\u274C [createSnapshot] Insert FAILED:", {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint
            });
            throw error;
          }
          console.log("\u2705 [createSnapshot] Insert SUCCESS:", insertedData);
          logger.debug("RealtimeAnalysis: Snapshot inserted", {
            sessionId: data.sessionId,
            exchangeCount: data.exchangeCount
          });
        } catch (error) {
          console.error("\u274C [createSnapshot] EXCEPTION:", {
            sessionId: data.sessionId,
            error: error.message,
            stack: error.stack
          });
          logger.error("RealtimeAnalysis: Failed to create snapshot", {
            sessionId: data.sessionId,
            error: error.message
          });
          throw error;
        }
      }
      /**
       * Mark session as completed and create final snapshot
       */
      async finalizeSession(sessionId) {
        logger.info("RealtimeAnalysis: Finalizing session", { sessionId });
        await this.analyzeSessionProgress(sessionId, {
          forceSnapshot: true,
          sessionStatus: "completed"
        });
        this.analysisCache.delete(sessionId);
      }
      /**
       * Get active sessions with recent snapshots
       * SECURITY: Filters by teacher email to show students from:
       * 1. Scenarios created by this teacher (scenarios.created_by)
       * 2. Training sessions where this teacher is assigned (training_session_teachers)
       * 3. For admins: shows ALL sessions (no filtering)
       *
       * @param teacherEmail - Teacher's email for security filtering
       * @param options - Optional filters (scenarioId, trainingSessionId, role)
       */
      async getActiveStudents(teacherEmail, options) {
        try {
          const client = await unifiedDb.getClient();
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
          let query = client.from("student_progress_snapshots").select(`
          id,
          session_id,
          student_email,
          scenario_id,
          timestamp,
          status,
          exchange_count,
          progress_indicators,
          strengths,
          weaknesses,
          sessions!inner(session_id, student_email, scenario_id, status, start_time, end_time),
          scenarios!inner(id, title, created_by)
        `).gte("timestamp", thirtyDaysAgo).order("timestamp", { ascending: false }).limit(500);
          const { data: allSnapshots, error: snapshotsError } = await query;
          if (snapshotsError) {
            throw snapshotsError;
          }
          if (!allSnapshots || allSnapshots.length === 0) {
            logger.debug("RealtimeAnalysis: No active students found");
            return [];
          }
          let filteredSnapshots = allSnapshots;
          if (options?.role === "admin") {
            logger.info("RealtimeAnalysis: Admin access - showing all sessions", {
              teacherEmail,
              totalActive: allSnapshots.length
            });
          } else if (teacherEmail) {
            const assignedSessionIds = await trainingSessionService.getTeacherSessions(teacherEmail);
            let assignedStudentEmails = [];
            if (assignedSessionIds.length > 0) {
              const sessionIdsToQuery = options?.trainingSessionId ? assignedSessionIds.filter((id) => id === options.trainingSessionId) : assignedSessionIds;
              if (sessionIdsToQuery.length > 0) {
                const { data: sessionStudents, error: studentsError } = await client.from("training_session_students").select("student_email").in("training_session_id", sessionIdsToQuery).eq("status", "assigned");
                if (!studentsError && sessionStudents) {
                  assignedStudentEmails = sessionStudents.map((s) => s.student_email);
                }
              }
            }
            filteredSnapshots = allSnapshots.filter((snapshot) => {
              const isScenarioOwner = snapshot.scenarios?.created_by === teacherEmail;
              const isTrainingSessionStudent = assignedStudentEmails.includes(snapshot.sessions?.student_email);
              return isScenarioOwner || isTrainingSessionStudent;
            });
            logger.info("RealtimeAnalysis: Filtering active students by teacher (multi-source)", {
              teacherEmail,
              assignedTrainingSessions: assignedSessionIds.length,
              assignedStudents: assignedStudentEmails.length,
              totalActive: allSnapshots.length,
              filteredActive: filteredSnapshots.length,
              filters: options
            });
          } else {
            logger.warn("RealtimeAnalysis: No teacher filter applied - returning all active students");
          }
          if (options?.scenarioId) {
            filteredSnapshots = filteredSnapshots.filter(
              (snapshot) => snapshot.scenario_id === options.scenarioId
            );
            logger.info("RealtimeAnalysis: Applied scenario filter", {
              scenarioId: options.scenarioId,
              resultCount: filteredSnapshots.length
            });
          }
          const latestSnapshots = /* @__PURE__ */ new Map();
          filteredSnapshots.forEach((snapshot) => {
            const sessionId = snapshot.session_id;
            if (!latestSnapshots.has(sessionId) || new Date(snapshot.timestamp) > new Date(latestSnapshots.get(sessionId).timestamp)) {
              latestSnapshots.set(sessionId, snapshot);
            }
          });
          const results = Array.from(latestSnapshots.values());
          logger.info("RealtimeAnalysis: Retrieved active students", {
            teacherEmail,
            count: results.length
          });
          return results;
        } catch (error) {
          logger.error("RealtimeAnalysis: Failed to get active students", {
            teacherEmail,
            error: error.message
          });
          return [];
        }
      }
      /**
       * Generate session summary for a specific date
       * SECURITY: Filters by teacher email to show students from:
       * 1. Scenarios created by this teacher (scenarios.created_by)
       * 2. Training sessions where this teacher is assigned (training_session_teachers)
       */
      async generateSessionSummary(sessionDate, teacherEmail, scenarioId) {
        try {
          logger.info("RealtimeAnalysis: Generating session summary", {
            sessionDate,
            teacherEmail,
            scenarioId
          });
          const client = await unifiedDb.getClient();
          let query = client.from("student_progress_snapshots").select(`
          *,
          sessions!inner(scenario_id, student_email),
          scenarios!inner(id, created_by)
        `).gte("timestamp", `${sessionDate}T00:00:00Z`).lte("timestamp", `${sessionDate}T23:59:59.999Z`);
          if (scenarioId) {
            query = query.eq("scenario_id", scenarioId);
          }
          const { data: allSnapshotsRaw, error } = await query;
          if (error) {
            throw error;
          }
          if (!allSnapshotsRaw || allSnapshotsRaw.length === 0) {
            logger.warn("RealtimeAnalysis: No snapshots found for date range", {
              sessionDate,
              teacherEmail,
              scenarioId,
              dateRangeStart: `${sessionDate}T00:00:00Z`,
              dateRangeEnd: `${sessionDate}T23:59:59.999Z`
            });
            throw new Error(`No activity found for this date`);
          }
          const assignedSessionIds = await trainingSessionService.getTeacherSessions(teacherEmail);
          let assignedStudentEmails = [];
          if (assignedSessionIds.length > 0) {
            const { data: sessionStudents, error: studentsError } = await client.from("training_session_students").select("student_email").in("training_session_id", assignedSessionIds).eq("status", "assigned");
            if (!studentsError && sessionStudents) {
              assignedStudentEmails = sessionStudents.map((s) => s.student_email);
            }
          }
          const filteredSnapshotsRaw = allSnapshotsRaw.filter((item) => {
            const isScenarioOwner = item.scenarios?.created_by === teacherEmail;
            const isTrainingSessionStudent = assignedStudentEmails.includes(item.sessions?.student_email);
            return isScenarioOwner || isTrainingSessionStudent;
          });
          if (filteredSnapshotsRaw.length === 0) {
            logger.warn("RealtimeAnalysis: No accessible snapshots after teacher filtering", {
              sessionDate,
              teacherEmail,
              totalSnapshotsFound: allSnapshotsRaw.length,
              assignedTrainingSessions: assignedSessionIds.length,
              assignedStudents: assignedStudentEmails.length
            });
            throw new Error(`No activity found for this date`);
          }
          logger.info("RealtimeAnalysis: Filtered session summary snapshots (multi-source)", {
            teacherEmail,
            assignedTrainingSessions: assignedSessionIds.length,
            assignedStudents: assignedStudentEmails.length,
            totalSnapshots: allSnapshotsRaw.length,
            filteredSnapshots: filteredSnapshotsRaw.length
          });
          const snapshots = filteredSnapshotsRaw.map((item) => {
            const { sessions, scenarios, ...snapshot } = item;
            return snapshot;
          });
          const studentMap = /* @__PURE__ */ new Map();
          snapshots.forEach((snapshot) => {
            const key = snapshot.student_email;
            const existing = studentMap.get(key);
            if (!existing || new Date(snapshot.timestamp) > new Date(existing.timestamp)) {
              studentMap.set(key, snapshot);
            }
          });
          const latestSnapshots = Array.from(studentMap.values());
          const totalStudents = latestSnapshots.length;
          const allStrengths = [];
          const allWeaknesses = [];
          const indicators = {
            engagement: [],
            questionQuality: [],
            empathy: [],
            clinicalReasoning: []
          };
          latestSnapshots.forEach((snapshot) => {
            if (Array.isArray(snapshot.strengths)) {
              allStrengths.push(...snapshot.strengths);
            }
            if (Array.isArray(snapshot.weaknesses)) {
              allWeaknesses.push(...snapshot.weaknesses);
            }
            const progress = snapshot.progress_indicators || {};
            if (progress.engagement_score !== void 0) {
              indicators.engagement.push(progress.engagement_score);
            }
            if (progress.question_quality !== void 0) {
              indicators.questionQuality.push(progress.question_quality);
            }
            if (progress.empathy_level !== void 0) {
              indicators.empathy.push(progress.empathy_level);
            }
            if (progress.clinical_reasoning !== void 0) {
              indicators.clinicalReasoning.push(progress.clinical_reasoning);
            }
          });
          const trends = {
            engagement_score: this.average(indicators.engagement),
            question_quality: this.average(indicators.questionQuality),
            empathy_level: this.average(indicators.empathy),
            clinical_reasoning: this.average(indicators.clinicalReasoning)
          };
          const { commonStrengths, commonWeaknesses } = await this.identifyCommonPatterns(
            allStrengths,
            allWeaknesses
          );
          const summaryData = {
            totalSnapshots: snapshots.length,
            averageExchanges: this.average(latestSnapshots.map((s) => s.exchange_count || 0))
          };
          const { data: summary, error: insertError } = await client.from("session_summaries").upsert({
            session_date: sessionDate,
            teacher_email: teacherEmail,
            scenario_id: scenarioId || null,
            total_students: totalStudents,
            summary_data: summaryData,
            common_strengths: commonStrengths,
            common_weaknesses: commonWeaknesses,
            trends,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }, {
            // Always use the 3-column constraint (NULL is allowed in UNIQUE constraints)
            onConflict: "session_date,teacher_email,scenario_id"
          }).select().single();
          if (insertError) {
            throw insertError;
          }
          logger.info("RealtimeAnalysis: Summary generated successfully", {
            sessionDate,
            totalStudents,
            commonStrengthsCount: commonStrengths.length,
            commonWeaknessesCount: commonWeaknesses.length
          });
          return summary;
        } catch (error) {
          logger.error("RealtimeAnalysis: Failed to generate summary", {
            sessionDate,
            teacherEmail,
            error: error.message
          });
          throw error;
        }
      }
      /**
       * Identify common patterns using AI
       */
      async identifyCommonPatterns(strengths, weaknesses) {
        try {
          if (strengths.length === 0 && weaknesses.length === 0) {
            return { commonStrengths: [], commonWeaknesses: [] };
          }
          const systemPrompt = `Tu es un assistant d'analyse p\xE9dagogique. Analyse ces listes de points forts et faibles collect\xE9s aupr\xE8s de plusieurs \xE9tudiants.

Identifie les 3-5 points r\xE9currents les plus importants dans chaque cat\xE9gorie.
Groupe les \xE9l\xE9ments similaires ensemble (ex: "bonne empathie" et "tr\xE8s empathique" \u2192 "D\xE9montre une bonne empathie").

R\xE9ponds UNIQUEMENT en JSON valide :
{
  "commonStrengths": ["point fort r\xE9current 1", "point fort r\xE9current 2", ...],
  "commonWeaknesses": ["point faible r\xE9current 1", "point faible r\xE9current 2", ...]
}`;
          const userPrompt = `Points forts (${strengths.length} entr\xE9es) :
${strengths.slice(0, 100).join("\n")}

Points faibles (${weaknesses.length} entr\xE9es) :
${weaknesses.slice(0, 100).join("\n")}`;
          const completion = await openaiService.createCompletion({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_completion_tokens: 600,
            response_format: { type: "json_object" }
          });
          const content = completion.choices?.[0]?.message?.content || "{}";
          const parsed = JSON.parse(content);
          return {
            commonStrengths: Array.isArray(parsed.commonStrengths) ? parsed.commonStrengths : [],
            commonWeaknesses: Array.isArray(parsed.commonWeaknesses) ? parsed.commonWeaknesses : []
          };
        } catch (error) {
          logger.warn("RealtimeAnalysis: AI pattern identification failed, using heuristics", {
            error: error.message
          });
          return {
            commonStrengths: this.getMostFrequent(strengths, 5),
            commonWeaknesses: this.getMostFrequent(weaknesses, 5)
          };
        }
      }
      /**
       * Calculate average of numbers
       */
      average(numbers) {
        if (numbers.length === 0) return 0;
        return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
      }
      /**
       * Get most frequent items from array
       */
      getMostFrequent(items, limit) {
        const frequency = /* @__PURE__ */ new Map();
        items.forEach((item) => {
          const normalized = item.toLowerCase().trim();
          frequency.set(normalized, (frequency.get(normalized) || 0) + 1);
        });
        return Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([item]) => item);
      }
      /**
       * Clear old cache entries
       */
      clearOldCache() {
        const now = Date.now();
        for (const [sessionId, cached] of this.analysisCache.entries()) {
          if (now - cached.lastAnalysis.getTime() > this.CACHE_DURATION_MS) {
            this.analysisCache.delete(sessionId);
          }
        }
      }
    };
    __name(_RealtimeAnalysisService, "RealtimeAnalysisService");
    RealtimeAnalysisService = _RealtimeAnalysisService;
    realtimeAnalysisService = new RealtimeAnalysisService();
    setInterval(() => {
      realtimeAnalysisService.clearOldCache();
    }, 5 * 60 * 1e3);
  }
});

// server/services/evaluation-executor.service.ts
var evaluation_executor_service_exports = {};
__export(evaluation_executor_service_exports, {
  executeEvaluation: () => executeEvaluation
});
async function executeEvaluation(sessionId, email, progressCallback) {
  const updateProgress = /* @__PURE__ */ __name((p) => {
    if (progressCallback) progressCallback(p);
  }, "updateProgress");
  try {
    updateProgress(10);
    const scenarioIdMatch = sessionId.match(/^session_(\d+)_/);
    const scenarioId = scenarioIdMatch ? parseInt(scenarioIdMatch[1]) : null;
    updateProgress(20);
    const scenarios = await unifiedDb.getScenarios();
    const scenario = scenarioId ? scenarios.find((s) => s.id === scenarioId) : null;
    logger.info("Loaded scenario for evaluation", { scenarioId, hasScenario: !!scenario });
    const dbCriteria = scenario?.evaluation_criteria || null;
    updateProgress(30);
    const messages = await unifiedDb.getSessionMessages(sessionId, 50);
    if (!messages || messages.length === 0) {
      throw new Error("Pas assez d'\xE9changes pour une \xE9valuation - la session \xE9tait vide");
    }
    updateProgress(40);
    const transcript = messages.map((msg, idx) => {
      let content = "";
      let role = "";
      if (msg.role === "user") {
        content = msg.question || msg.content || "";
        role = "\xC9tudiant";
      } else if (msg.role === "assistant") {
        content = msg.response || msg.content || "";
        role = "Patient";
      } else {
        content = msg.question || msg.response || msg.content || "";
        role = msg.role === "user" ? "\xC9tudiant" : "Patient";
      }
      return `${role}: ${content.toString().trim()}`;
    }).join("\n---\n");
    logger.info("Built transcript for evaluation", {
      sessionId,
      messageCount: messages.length,
      transcriptLength: transcript.length
    });
    updateProgress(50);
    const criteriaList = normalizeCriteria(dbCriteria);
    const fallbackCriteria = [
      { id: "communication", name: "Communication", maxScore: 4 },
      { id: "clinical_reasoning", name: "Raisonnement Clinique", maxScore: 4 },
      { id: "empathy", name: "Empathie", maxScore: 4 },
      { id: "professionalism", name: "Professionnalisme", maxScore: 4 }
    ];
    const usedCriteria = criteriaList.length > 0 ? criteriaList : fallbackCriteria;
    logger.info("Using evaluation criteria", {
      criteriaSource: criteriaList.length > 0 ? "database" : "fallback",
      criteriaCount: usedCriteria.length
    });
    updateProgress(60);
    const systemPrompt = `Tu es un examinateur ECOS. \xC9value la performance de l'\xE9tudiant en te basant UNIQUEMENT sur la transcription fournie.

Consignes :
- Pour CHAQUE crit\xE8re, v\xE9rifie si l'\xE9tudiant a abord\xE9 les indicateurs sp\xE9cifiques list\xE9s
- Attribue une note enti\xE8re de 0 \xE0 4 bas\xE9e sur la couverture des indicateurs :
  * 0 = aucun indicateur trait\xE9
  * 1 = abord\xE9 superficiellement (< 25% des indicateurs)
  * 2 = partiellement trait\xE9 (25-50% des indicateurs)
  * 3 = bien trait\xE9 (50-75% des indicateurs)
  * 4 = ma\xEEtris\xE9 (> 75% des indicateurs avec qualit\xE9)
- Pour chaque crit\xE8re, identifie 2-3 points forts, 2-3 points faibles, 2-3 actions d'am\xE9lioration
- Pour chaque crit\xE8re, s\xE9lectionne 2-3 extraits PR\xC9CIS de la transcription qui illustrent les points faibles ou les points forts identifi\xE9s
- Les extraits doivent \xEAtre des citations EXACTES de la transcription (pas de paraphrase)
- Chaque extrait doit clairement d\xE9montrer pourquoi le crit\xE8re a re\xE7u ce score
- Justifie chaque note en citant des exemples pr\xE9cis de la transcription
- Fournis une synth\xE8se globale avec forces majeures, faiblesses prioritaires, recommandations actionnables

IMPORTANT: Base-toi sur les indicateurs sp\xE9cifiques fournis pour chaque crit\xE8re. Ne te contente pas de notions g\xE9n\xE9riques.

R\xE9ponds UNIQUEMENT en JSON valide sans texte avant/apr\xE8s.

Format JSON attendu :
{
  "criteria": [
    {
      "id": "crit_id",
      "name": "Nom du crit\xE8re",
      "score": number,
      "maxScore": 4,
      "strengths": ["point fort 1 avec r\xE9f\xE9rence \xE0 la transcription", "point fort 2", ...],
      "weaknesses": ["faiblesse 1 avec exemple", "faiblesse 2", ...],
      "actions": ["recommandation 1 actionnable", "recommandation 2", ...],
      "justification": "Justification d\xE9taill\xE9e citant des passages de la transcription",
      "evidence": [
        {"role": "\xC9tudiant" ou "Patient", "excerpt": "extrait exact de la transcription qui illustre une faiblesse ou un point fort"},
        {"role": "\xC9tudiant" ou "Patient", "excerpt": "autre extrait pertinent pour ce crit\xE8re"},
        ...
      ]
    }
  ],
  "overall": {
    "strengths": ["force majeure 1", "force majeure 2", ...],
    "weaknesses": ["faiblesse prioritaire 1", "faiblesse prioritaire 2", ...],
    "recommendations": ["recommandation 1", "recommandation 2", "recommandation 3"],
    "summary": "Synth\xE8se en 2-3 phrases r\xE9sumant la performance globale"
  },
  "overall_score_percent": number
}`;
    const rubricText = usedCriteria.map((c) => {
      const indicatorsList = c.indicators && c.indicators.length > 0 ? `
  Indicateurs \xE0 \xE9valuer:
${c.indicators.map((ind) => `  * ${ind}`).join("\n")}` : "";
      const weight = c.weight ? ` (pond\xE9ration: ${c.weight}%)` : "";
      return `- ${c.name} (id: ${c.id})${weight} \u2014 max ${c.maxScore}${indicatorsList}`;
    }).join("\n\n");
    const userPrompt = `Sc\xE9nario: ${scenario?.title || "Inconnu"}

Crit\xE8res d'\xE9valuation:
${rubricText}

Transcription de la session:
${transcript}`;
    updateProgress(70);
    let llmJson = null;
    try {
      const completion = await openaiService.createCompletion({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 2e3,
        response_format: { type: "json_object" }
      });
      const content = completion.choices?.[0]?.message?.content || "{}";
      const cleanedContent = content.replace(/```json\s*\n?|```\s*$/g, "").trim();
      llmJson = JSON.parse(cleanedContent);
      logger.info("LLM evaluation completed", { sessionId, hasCriteria: !!llmJson?.criteria });
    } catch (err) {
      logger.warn("LLM evaluation parsing failed, using heuristic fallback", {
        sessionId,
        error: err.message
      });
    }
    updateProgress(80);
    const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const criteriaResults = llmJson?.criteria && Array.isArray(llmJson.criteria) ? llmJson.criteria : [];
    const clamp = /* @__PURE__ */ __name((n) => Math.max(0, Math.min(4, Math.round(Number(n) || 0))), "clamp");
    const toArray = /* @__PURE__ */ __name((value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((entry) => (entry ?? "").toString()).filter((entry) => entry.trim().length > 0);
      return [value.toString()].filter(Boolean);
    }, "toArray");
    const conversationExcerpts = extractRelevantExcerpts(messages, 3);
    const weightValues = usedCriteria.map((criterion) => {
      const weight = Number(criterion.weight);
      return Number.isFinite(weight) && weight > 0 ? weight : 1;
    });
    const weightSum = weightValues.reduce((sum, w) => sum + w, 0) || usedCriteria.length;
    const combinedCriteria = usedCriteria.map((criterion, index) => {
      const criterionId = criterion.id;
      const llmMatch = criteriaResults.find((entry) => {
        const entryId = (entry.id || "").toString().toLowerCase();
        const entryName = (entry.name || "").toString().toLowerCase();
        return entryId === criterionId || entryName === criterion.name.toLowerCase();
      }) || null;
      const llmScore = clamp(llmMatch?.score ?? llmMatch?.note ?? 2);
      const maxScore = typeof llmMatch?.maxScore === "number" ? llmMatch.maxScore : 4;
      const finalScore = llmScore;
      return {
        id: criterionId,
        name: criterion.name,
        description: criterion.description || "",
        indicators: criterion.indicators || [],
        weight: Math.round(weightValues[index] / weightSum * 1e4) / 100,
        rawWeight: weightValues[index],
        maxScore,
        score: finalScore,
        rawScore: llmScore,
        strengths: toArray(llmMatch?.strengths),
        weaknesses: toArray(llmMatch?.weaknesses),
        actions: toArray(llmMatch?.actions || llmMatch?.recommendations),
        justification: (llmMatch?.justification || "").toString(),
        // Use LLM-provided evidence if available, otherwise fallback to generic excerpts
        evidence: Array.isArray(llmMatch?.evidence) && llmMatch.evidence.length > 0 ? llmMatch.evidence.map((ev) => ({
          role: ev.role || "\xC9tudiant",
          rawRole: ev.role === "Patient" ? "assistant" : "user",
          excerpt: (ev.excerpt || "").toString().slice(0, 220),
          timestamp: null
        })) : conversationExcerpts
      };
    });
    const weightedTotal = combinedCriteria.reduce((sum, criterion) => {
      return sum + criterion.score / criterion.maxScore * (criterion.rawWeight || 1);
    }, 0);
    const weightedPercent = Math.round(weightedTotal / weightSum * 100);
    const llmOverallPercent = typeof llmJson?.overall_score_percent === "number" ? Math.round(llmJson.overall_score_percent) : null;
    const overallScorePercent = llmOverallPercent ?? weightedPercent;
    const uniqueList = /* @__PURE__ */ __name((list, limit = 3) => {
      const seen = /* @__PURE__ */ new Set();
      const result = [];
      for (const item of list) {
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
        if (result.length >= limit) break;
      }
      return result;
    }, "uniqueList");
    const overallSection = llmJson?.overall || {};
    const aggregatedStrengths = uniqueList([
      ...toArray(overallSection.strengths || llmJson?.strengths),
      ...combinedCriteria.flatMap((criterion) => criterion.strengths)
    ]);
    const aggregatedWeaknesses = uniqueList([
      ...toArray(overallSection.weaknesses || llmJson?.weaknesses),
      ...combinedCriteria.flatMap((criterion) => criterion.weaknesses)
    ]);
    const aggregatedRecommendations = uniqueList([
      ...toArray(overallSection.recommendations || llmJson?.recommendations),
      ...combinedCriteria.flatMap((criterion) => criterion.actions)
    ]);
    if (aggregatedStrengths.length === 0) {
      if (overallScorePercent >= 75) {
        aggregatedStrengths.push("Performance globalement tr\xE8s satisfaisante");
        aggregatedStrengths.push("Bonne ma\xEEtrise des comp\xE9tences \xE9valu\xE9es");
      } else if (overallScorePercent >= 50) {
        aggregatedStrengths.push("Performance satisfaisante dans l'ensemble");
        aggregatedStrengths.push("Plusieurs comp\xE9tences correctement d\xE9montr\xE9es");
      } else {
        aggregatedStrengths.push("Certaines comp\xE9tences de base d\xE9montr\xE9es");
      }
    }
    if (aggregatedWeaknesses.length === 0) {
      if (overallScorePercent < 50) {
        aggregatedWeaknesses.push("Plusieurs comp\xE9tences n\xE9cessitent un renforcement significatif");
        aggregatedWeaknesses.push("Difficult\xE9 \xE0 d\xE9montrer la ma\xEEtrise des crit\xE8res \xE9valu\xE9s");
      } else if (overallScorePercent < 75) {
        aggregatedWeaknesses.push("Certains aspects n\xE9cessitent am\xE9lioration");
        aggregatedWeaknesses.push("Marge de progression sur plusieurs crit\xE8res");
      } else {
        aggregatedWeaknesses.push("Quelques d\xE9tails \xE0 peaufiner pour une ma\xEEtrise compl\xE8te");
      }
    }
    if (aggregatedRecommendations.length === 0) {
      if (overallScorePercent < 50) {
        aggregatedRecommendations.push("Revoir les fondamentaux de chaque crit\xE8re \xE9valu\xE9");
        aggregatedRecommendations.push("Pratiquer davantage les comp\xE9tences cliniques de base");
        aggregatedRecommendations.push("Solliciter un accompagnement p\xE9dagogique pour progresser");
      } else if (overallScorePercent < 75) {
        aggregatedRecommendations.push("Approfondir les comp\xE9tences sur les crit\xE8res les moins ma\xEEtris\xE9s");
        aggregatedRecommendations.push("Pratiquer r\xE9guli\xE8rement pour consolider les acquis");
        aggregatedRecommendations.push("Analyser les situations cliniques avec plus de rigueur");
      } else {
        aggregatedRecommendations.push("Continuer \xE0 pratiquer pour maintenir le niveau de comp\xE9tence");
        aggregatedRecommendations.push("Affiner les d\xE9tails pour viser l'excellence");
      }
    }
    const summaryText = (overallSection.summary || overallSection.comment || llmJson?.summary || "").toString();
    const evaluation = {
      overall_score: overallScorePercent,
      criteria_scores: combinedCriteria.reduce((acc, c) => {
        acc[c.id] = Math.round(c.score / c.maxScore * 100);
        return acc;
      }, {}),
      scores: combinedCriteria.reduce((acc, c) => {
        acc[c.id] = c.score;
        return acc;
      }, {}),
      criteria: combinedCriteria,
      feedback: aggregatedStrengths,
      recommendations: aggregatedRecommendations,
      weaknesses: aggregatedWeaknesses,
      summary: summaryText,
      llmScorePercent: llmOverallPercent ?? weightedPercent,
      weightedScorePercent: weightedPercent
    };
    updateProgress(90);
    try {
      await unifiedDb.createEvaluation({
        sessionId,
        scenarioId,
        studentEmail: email,
        scores: evaluation.scores,
        globalScore: overallScorePercent,
        strengths: Array.isArray(evaluation.feedback) ? evaluation.feedback : [],
        weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses : [],
        recommendations: Array.isArray(evaluation.recommendations) ? evaluation.recommendations : [],
        feedback: `\xC9valuation automatique - Score IA: ${overallScorePercent}%`,
        llmScorePercent: evaluation.llmScorePercent,
        criteriaDetails: evaluation.criteria
      });
      logger.info("Stored evaluation in database", { sessionId, score: overallScorePercent });
      try {
        const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
        await realtimeAnalysisService2.finalizeSession(sessionId);
        logger.info("Session finalized for real-time dashboard", { sessionId });
      } catch (finalizeError) {
        logger.warn("Failed to finalize session for dashboard (non-critical)", { sessionId });
      }
    } catch (dbError) {
      logger.error("Failed to store evaluation in database", {
        sessionId,
        error: dbError?.message
      });
      throw new Error("Failed to store evaluation: " + dbError?.message);
    }
    updateProgress(100);
    return {
      evaluationId,
      sessionId,
      evaluation
    };
  } catch (error) {
    logger.error("Evaluation execution failed", {
      sessionId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
var extractRelevantExcerpts, normalizeCriteria;
var init_evaluation_executor_service = __esm({
  "server/services/evaluation-executor.service.ts"() {
    "use strict";
    init_unified_database_service();
    init_openai_service();
    init_logger_service();
    extractRelevantExcerpts = /* @__PURE__ */ __name((messages, maxExcerpts = 3) => {
      if (!Array.isArray(messages) || messages.length === 0) {
        return [];
      }
      const excerpts = [];
      const totalMessages = messages.length;
      if (totalMessages <= maxExcerpts) {
        excerpts.push(...messages);
      } else {
        const indices = [
          0,
          // First exchange
          Math.floor(totalMessages / 2),
          // Middle
          totalMessages - 1
          // Last exchange
        ].slice(0, maxExcerpts);
        indices.forEach((index) => {
          if (messages[index]) {
            excerpts.push(messages[index]);
          }
        });
      }
      return excerpts.map((msg) => {
        let excerpt = "";
        let role = "";
        if (msg.role === "user") {
          excerpt = (msg.question || msg.content || "").toString().slice(0, 220);
          role = "\xC9tudiant";
        } else if (msg.role === "assistant") {
          excerpt = (msg.response || msg.content || "").toString().slice(0, 220);
          role = "Patient";
        } else {
          excerpt = (msg.question || msg.response || msg.content || "").toString().slice(0, 220);
          role = msg.role === "user" ? "\xC9tudiant" : "Patient";
        }
        return {
          role,
          rawRole: msg.role,
          excerpt,
          timestamp: msg.timestamp || msg.created_at || msg.updated_at || null
        };
      });
    }, "extractRelevantExcerpts");
    normalizeCriteria = /* @__PURE__ */ __name((raw) => {
      try {
        if (!raw) return [];
        if (raw.evaluation_criteria && Array.isArray(raw.evaluation_criteria)) {
          return raw.evaluation_criteria.map((c, i) => ({
            id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g, "_"),
            name: c.name || c.label || c.id || `Crit\xE8re ${i + 1}`,
            description: c.description || "",
            maxScore: typeof c.maxScore === "number" ? c.maxScore : 4,
            weight: typeof c.weight === "number" ? c.weight : typeof c.poids === "number" ? c.poids : null,
            indicators: Array.isArray(c.indicators) ? c.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(c.elements) ? c.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : c.description ? [c.description] : []
          }));
        }
        if (Array.isArray(raw)) {
          return raw.map((c, i) => ({
            id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g, "_"),
            name: c.name || c.label || c.id || `Crit\xE8re ${i + 1}`,
            description: c.description || "",
            maxScore: typeof c.maxScore === "number" ? c.maxScore : 4,
            weight: typeof c.weight === "number" ? c.weight : typeof c.poids === "number" ? c.poids : null,
            indicators: Array.isArray(c.indicators) ? c.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(c.elements) ? c.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : c.description ? [c.description] : []
          }));
        }
        if (raw.categories && Array.isArray(raw.categories)) {
          return raw.categories.map((category, i) => {
            const baseId = (category.id || category.name || `category_${i}`).toString().toLowerCase().replace(/\s+/g, "_");
            const indicators = Array.isArray(category.indicators) ? category.indicators.map((ind) => ind.description || ind.name || "").filter(Boolean) : [];
            return {
              id: baseId,
              name: category.name || category.id || `Cat\xE9gorie ${i + 1}`,
              description: indicators.length ? indicators.join(" ; ") : category.description || "",
              maxScore: typeof category.maxScore === "number" ? category.maxScore : 4,
              weight: typeof category.weight === "number" ? category.weight : typeof category.poids === "number" ? category.poids : null,
              indicators
            };
          });
        }
        if (raw.criteria && Array.isArray(raw.criteria)) {
          return raw.criteria.map((c, i) => ({
            id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g, "_"),
            name: c.name || c.label || c.id || `Crit\xE8re ${i + 1}`,
            description: c.description || "",
            maxScore: typeof c.maxScore === "number" ? c.maxScore : 4,
            weight: typeof c.weight === "number" ? c.weight : typeof c.poids === "number" ? c.poids : null,
            indicators: Array.isArray(c.indicators) ? c.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(c.elements) ? c.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : c.description ? [c.description] : []
          }));
        }
        if (typeof raw === "object") {
          return Object.keys(raw).map((k, i) => {
            const value = raw[k];
            const indicators = Array.isArray(value?.indicators) ? value.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(value?.elements) ? value.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : [];
            const weight = typeof value?.weight === "number" ? value.weight : typeof value?.poids === "number" ? value.poids : null;
            return {
              id: k.toLowerCase().replace(/\s+/g, "_"),
              name: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "),
              description: typeof value === "string" ? value : value?.description || "",
              maxScore: 4,
              weight,
              indicators
            };
          });
        }
        return [];
      } catch {
        return [];
      }
    }, "normalizeCriteria");
    __name(executeEvaluation, "executeEvaluation");
  }
});

// server/services/evaluation-job.service.ts
var evaluation_job_service_exports = {};
__export(evaluation_job_service_exports, {
  JobStatus: () => JobStatus,
  evaluationJobService: () => evaluationJobService
});
import { EventEmitter } from "events";
var JobStatus, _EvaluationJobService, EvaluationJobService, evaluationJobService;
var init_evaluation_job_service = __esm({
  "server/services/evaluation-job.service.ts"() {
    "use strict";
    init_logger_service();
    JobStatus = /* @__PURE__ */ ((JobStatus2) => {
      JobStatus2["PENDING"] = "pending";
      JobStatus2["PROCESSING"] = "processing";
      JobStatus2["COMPLETED"] = "completed";
      JobStatus2["FAILED"] = "failed";
      return JobStatus2;
    })(JobStatus || {});
    _EvaluationJobService = class _EvaluationJobService extends EventEmitter {
      constructor() {
        super();
        this.jobs = /* @__PURE__ */ new Map();
        this.jobsBySession = /* @__PURE__ */ new Map();
        // sessionId -> jobId mapping
        this.processingQueue = [];
        this.isProcessing = false;
        this.maxConcurrent = 10;
        // Maximum concurrent evaluation jobs (increased for load testing)
        this.activeJobs = 0;
        this.startProcessor();
        this.startCleanup();
      }
      /**
       * Create a new evaluation job
       */
      createJob(input) {
        const jobId = `eval_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const existingJobId = this.jobsBySession.get(input.sessionId);
        if (existingJobId) {
          const existingJob = this.jobs.get(existingJobId);
          if (existingJob && (existingJob.status === "pending" /* PENDING */ || existingJob.status === "processing" /* PROCESSING */)) {
            logger.info("Returning existing job for session", { sessionId: input.sessionId, jobId: existingJobId });
            return existingJob;
          }
        }
        const job = {
          jobId,
          sessionId: input.sessionId,
          email: input.email,
          status: "pending" /* PENDING */,
          createdAt: /* @__PURE__ */ new Date(),
          progress: 0
        };
        this.jobs.set(jobId, job);
        this.jobsBySession.set(input.sessionId, jobId);
        this.processingQueue.push(jobId);
        logger.info("Created evaluation job", { jobId, sessionId: input.sessionId, email: input.email });
        this.processQueue();
        return job;
      }
      /**
       * Get job status by job ID
       */
      getJob(jobId) {
        return this.jobs.get(jobId) || null;
      }
      /**
       * Get job by session ID
       */
      getJobBySessionId(sessionId) {
        const jobId = this.jobsBySession.get(sessionId);
        if (!jobId) return null;
        return this.jobs.get(jobId) || null;
      }
      /**
       * Update job status
       */
      updateJob(jobId, updates) {
        const job = this.jobs.get(jobId);
        if (!job) return;
        Object.assign(job, updates);
        this.jobs.set(jobId, job);
        this.emit("job:updated", job);
        logger.info("Updated job status", {
          jobId,
          sessionId: job.sessionId,
          status: job.status,
          progress: job.progress
        });
      }
      /**
       * Mark job as processing
       */
      startProcessing(jobId) {
        this.updateJob(jobId, {
          status: "processing" /* PROCESSING */,
          startedAt: /* @__PURE__ */ new Date(),
          progress: 10
        });
      }
      /**
       * Update job progress
       */
      updateProgress(jobId, progress) {
        this.updateJob(jobId, { progress });
      }
      /**
       * Mark job as completed
       */
      completeJob(jobId, result) {
        this.updateJob(jobId, {
          status: "completed" /* COMPLETED */,
          result,
          completedAt: /* @__PURE__ */ new Date(),
          progress: 100
        });
      }
      /**
       * Mark job as failed
       */
      failJob(jobId, error) {
        this.updateJob(jobId, {
          status: "failed" /* FAILED */,
          error,
          completedAt: /* @__PURE__ */ new Date()
        });
      }
      /**
       * Process the job queue
       */
      async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        while (this.processingQueue.length > 0 && this.activeJobs < this.maxConcurrent) {
          const jobId = this.processingQueue.shift();
          if (!jobId) continue;
          const job = this.jobs.get(jobId);
          if (!job || job.status !== "pending" /* PENDING */) continue;
          this.activeJobs++;
          this.processJob(jobId).finally(() => {
            this.activeJobs--;
            setImmediate(() => this.processQueue());
          });
        }
        this.isProcessing = false;
      }
      /**
       * Process a single evaluation job
       */
      async processJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;
        try {
          this.startProcessing(jobId);
          const { executeEvaluation: executeEvaluation2 } = await Promise.resolve().then(() => (init_evaluation_executor_service(), evaluation_executor_service_exports));
          logger.info("Processing evaluation job", { jobId, sessionId: job.sessionId });
          const result = await executeEvaluation2(job.sessionId, job.email, (progress) => {
            this.updateProgress(jobId, progress);
          });
          this.completeJob(jobId, result);
          logger.info("Evaluation job completed", { jobId, sessionId: job.sessionId });
        } catch (error) {
          logger.error("Evaluation job failed", {
            jobId,
            sessionId: job.sessionId,
            error: error.message
          });
          this.failJob(jobId, error.message || "Evaluation failed");
        }
      }
      /**
       * Start background processor
       */
      startProcessor() {
        setInterval(() => {
          if (this.processingQueue.length > 0) {
            this.processQueue();
          }
        }, 5e3);
      }
      /**
       * Clean up old completed/failed jobs
       */
      startCleanup() {
        setInterval(() => {
          const now = Date.now();
          const maxAge = 60 * 60 * 1e3;
          for (const [jobId, job] of this.jobs) {
            if (job.status === "completed" /* COMPLETED */ || job.status === "failed" /* FAILED */) {
              const age = now - (job.completedAt?.getTime() || job.createdAt.getTime());
              if (age > maxAge) {
                this.jobs.delete(jobId);
                this.jobsBySession.delete(job.sessionId);
                logger.info("Cleaned up old job", { jobId, sessionId: job.sessionId, status: job.status });
              }
            }
          }
        }, 10 * 60 * 1e3);
      }
      /**
       * Get statistics about job processing
       */
      getStats() {
        let pending = 0, processing = 0, completed = 0, failed = 0;
        for (const job of this.jobs.values()) {
          switch (job.status) {
            case "pending" /* PENDING */:
              pending++;
              break;
            case "processing" /* PROCESSING */:
              processing++;
              break;
            case "completed" /* COMPLETED */:
              completed++;
              break;
            case "failed" /* FAILED */:
              failed++;
              break;
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
    };
    __name(_EvaluationJobService, "EvaluationJobService");
    EvaluationJobService = _EvaluationJobService;
    evaluationJobService = new EvaluationJobService();
  }
});

// server/services/conversation-memory.service.ts
var _ConversationMemoryService, ConversationMemoryService, conversationMemoryService;
var init_conversation_memory_service = __esm({
  "server/services/conversation-memory.service.ts"() {
    "use strict";
    _ConversationMemoryService = class _ConversationMemoryService {
      constructor() {
        this.cache = /* @__PURE__ */ new Map();
        this.CACHE_TTL = 30 * 60 * 1e3;
        // 30 minutes
        this.MAX_HISTORY_MESSAGES = 20;
        this.cleanupInterval = setInterval(() => {
          this.cleanupExpiredSessions();
        }, 5 * 60 * 1e3);
      }
      /**
       * Initialize or retrieve conversation memory
       */
      async initializeConversation(sessionId, studentEmail, scenarioId, patientPrompt, initialEmotionalState) {
        const existing = this.cache.get(sessionId);
        if (existing) {
          existing.lastActivity = /* @__PURE__ */ new Date();
          return existing;
        }
        const memory = {
          sessionId,
          studentEmail,
          scenarioId,
          studentRole: "infirmier",
          // Default to infirmier for ECOS-infirmier platform
          patientPersona: patientPrompt,
          conversationHistory: [],
          lastActivity: /* @__PURE__ */ new Date(),
          medicalContext: {
            symptomsDiscussed: [],
            proceduresPerformed: [],
            questionsAsked: []
          },
          emotionalState: initialEmotionalState
          // Initialize emotional state if provided
        };
        this.cache.set(sessionId, memory);
        console.log(`\u{1F4AD} Initialized conversation memory for session ${sessionId}${initialEmotionalState ? " with emotional state tracking" : ""}`);
        return memory;
      }
      /**
       * Add message to conversation history
       */
      addMessage(sessionId, content, role, metadata) {
        const memory = this.cache.get(sessionId);
        if (!memory) {
          console.warn(`\u26A0\uFE0F No memory found for session ${sessionId}`);
          return;
        }
        const message = {
          content,
          role,
          timestamp: /* @__PURE__ */ new Date(),
          metadata
        };
        memory.conversationHistory.push(message);
        memory.lastActivity = /* @__PURE__ */ new Date();
        if (memory.conversationHistory.length > this.MAX_HISTORY_MESSAGES) {
          memory.conversationHistory = memory.conversationHistory.slice(-this.MAX_HISTORY_MESSAGES);
        }
        if (role === "student") {
          this.extractMedicalContext(memory, content);
        }
        console.log(`\u{1F4AD} Added ${role} message to session ${sessionId} memory`);
      }
      /**
       * Detect student role from introduction
       */
      detectStudentRole(content) {
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes("infirmier") || lowerContent.includes("infirmi\xE8re")) {
          return "infirmier";
        }
        if (lowerContent.includes("docteur") || lowerContent.includes("m\xE9decin")) {
          return "docteur";
        }
        return "\xE9tudiant";
      }
      /**
       * Update student role in conversation memory
       */
      updateStudentRole(sessionId, content) {
        const memory = this.cache.get(sessionId);
        if (!memory) return;
        const detectedRole = this.detectStudentRole(content);
        if (detectedRole !== "\xE9tudiant") {
          memory.studentRole = detectedRole;
          console.log(`\u{1F3AD} Detected student role: ${detectedRole} for session ${sessionId}`);
        }
      }
      /**
       * Get conversation memory
       */
      getConversationMemory(sessionId) {
        const memory = this.cache.get(sessionId);
        if (memory) {
          memory.lastActivity = /* @__PURE__ */ new Date();
        }
        return memory || null;
      }
      /**
       * Get conversation context for AI prompt
       */
      getConversationContext(sessionId) {
        const memory = this.cache.get(sessionId);
        if (!memory) {
          return { history: "", role: "infirmier", medicalContext: "" };
        }
        const recentMessages = memory.conversationHistory.slice(-10);
        const history = recentMessages.map(
          (msg) => `${msg.role === "student" ? "\xC9tudiant" : "Patient"}: ${msg.content}`
        ).join("\n");
        const medicalContext = [
          memory.medicalContext?.symptomsDiscussed.length ? `Sympt\xF4mes discut\xE9s: ${memory.medicalContext.symptomsDiscussed.join(", ")}` : "",
          memory.medicalContext?.questionsAsked.length ? `Questions pos\xE9es: ${memory.medicalContext.questionsAsked.join(", ")}` : ""
        ].filter(Boolean).join("\n");
        return {
          history,
          role: memory.studentRole,
          medicalContext,
          emotionalState: memory.emotionalState
          // Include emotional state if present
        };
      }
      /**
       * Get conversation history in OpenAI message format
       * Returns array of messages ready to be sent to OpenAI API
       */
      getConversationMessages(sessionId, maxMessages = 10) {
        const memory = this.cache.get(sessionId);
        if (!memory) {
          return [];
        }
        const recentMessages = memory.conversationHistory.slice(-maxMessages);
        return recentMessages.map((msg) => ({
          role: msg.role === "student" ? "user" : "assistant",
          content: msg.content
        }));
      }
      /**
       * Get appropriate addressing for student role
       */
      getStudentAddressing(sessionId) {
        const memory = this.cache.get(sessionId);
        if (!memory) return "infirmier";
        switch (memory.studentRole) {
          case "infirmier":
            return "infirmier";
          case "docteur":
            return "docteur";
          default:
            return "infirmier";
        }
      }
      /**
       * Extract medical context from conversation
       */
      extractMedicalContext(memory, content) {
        const lowerContent = content.toLowerCase();
        const symptomKeywords = ["douleur", "mal", "sympt\xF4me", "fi\xE8vre", "naus\xE9e", "fatigue", "toux"];
        symptomKeywords.forEach((symptom) => {
          if (lowerContent.includes(symptom) && !memory.medicalContext?.symptomsDiscussed.includes(symptom)) {
            memory.medicalContext?.symptomsDiscussed.push(symptom);
          }
        });
        if (lowerContent.includes("?") || lowerContent.startsWith("comment") || lowerContent.startsWith("pourquoi")) {
          const question = content.substring(0, 50) + (content.length > 50 ? "..." : "");
          if (memory.medicalContext && !memory.medicalContext.questionsAsked.includes(question)) {
            memory.medicalContext.questionsAsked.push(question);
          }
        }
      }
      /**
       * Clean up expired sessions
       */
      cleanupExpiredSessions() {
        const now = (/* @__PURE__ */ new Date()).getTime();
        let cleanedCount = 0;
        for (const [sessionId, memory] of this.cache.entries()) {
          const lastActivity = memory.lastActivity.getTime();
          if (now - lastActivity > this.CACHE_TTL) {
            this.cache.delete(sessionId);
            cleanedCount++;
          }
        }
        if (cleanedCount > 0) {
          console.log(`\u{1F9F9} Cleaned up ${cleanedCount} expired conversation sessions`);
        }
      }
      /**
       * Get memory stats for monitoring
       */
      getMemoryStats() {
        let totalMessages = 0;
        let oldestSession = null;
        for (const memory of this.cache.values()) {
          totalMessages += memory.conversationHistory.length;
          if (!oldestSession || memory.lastActivity < oldestSession) {
            oldestSession = memory.lastActivity;
          }
        }
        return {
          activeSessions: this.cache.size,
          totalMessages,
          oldestSession
        };
      }
      /**
       * Clear specific session
       */
      clearSession(sessionId) {
        const result = this.cache.delete(sessionId);
        if (result) {
          console.log(`\u{1F5D1}\uFE0F Cleared conversation memory for session ${sessionId}`);
        }
        return result;
      }
      /**
       * Update emotional state for a session
       */
      updateEmotionalState(sessionId, newState) {
        const memory = this.cache.get(sessionId);
        if (!memory) {
          console.warn(`\u26A0\uFE0F No memory found for session ${sessionId}`);
          return;
        }
        memory.emotionalState = newState;
        memory.lastActivity = /* @__PURE__ */ new Date();
        console.log(`\u{1F3AD} Updated emotional state for session ${sessionId}`);
      }
      /**
       * Get emotional state for a session
       */
      getEmotionalState(sessionId) {
        const memory = this.cache.get(sessionId);
        return memory?.emotionalState;
      }
      /**
       * Cleanup service
       */
      destroy() {
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
        }
        this.cache.clear();
        console.log("\u{1F6D1} Conversation memory service destroyed");
      }
    };
    __name(_ConversationMemoryService, "ConversationMemoryService");
    ConversationMemoryService = _ConversationMemoryService;
    conversationMemoryService = new ConversationMemoryService();
  }
});

// server/services/emotional-state.service.ts
var _EmotionalStateService, EmotionalStateService, emotionalStateService;
var init_emotional_state_service = __esm({
  "server/services/emotional-state.service.ts"() {
    "use strict";
    _EmotionalStateService = class _EmotionalStateService {
      constructor() {
        this.SCENARIO_CONFIGS = {
          4: {
            // Psychiatric episode scenario
            initialAgitation: 30,
            // Méfiant mais pas agressif
            maxAgitation: 100,
            minAgitation: 0,
            thresholds: {
              calm: 30,
              // 0-30: Calme, coopératif
              nervous: 60,
              // 30-60: Nerveux, méfiant
              agitated: 80,
              // 60-80: Agité, hostile
              aggressive: 100
              // 80-100: Agressif, refuse de coopérer
            }
          }
        };
      }
      /**
       * Initialize emotional state for a scenario
       */
      initializeEmotionalState(scenarioId) {
        const config = this.SCENARIO_CONFIGS[scenarioId];
        if (!config) {
          return {
            agitationLevel: 0,
            lastUpdate: /* @__PURE__ */ new Date(),
            triggerEvents: []
          };
        }
        return {
          agitationLevel: config.initialAgitation,
          lastUpdate: /* @__PURE__ */ new Date(),
          triggerEvents: [{
            timestamp: /* @__PURE__ */ new Date(),
            event: "Initialization",
            change: 0
          }]
        };
      }
      /**
       * Analyze student response quality for psychiatric scenarios
       */
      analyzeResponseQuality(studentMessage, scenarioId) {
        const lowerMessage = studentMessage.toLowerCase();
        let empathy = 0;
        let appropriateQuestions = 0;
        let reassurance = 0;
        let avoidanceOfJudgment = 0;
        const empathyPhrases = [
          "je comprends",
          "c'est difficile",
          "je vous \xE9coute",
          "\xE7a doit \xEAtre",
          "je suis l\xE0",
          "prenez votre temps",
          "comment vous sentez",
          "je vous crois",
          "c'est important"
        ];
        empathyPhrases.forEach((phrase) => {
          if (lowerMessage.includes(phrase)) empathy += 3;
        });
        empathy = Math.min(empathy, 25);
        const appropriateQuestions_keywords = [
          "entendez-vous",
          "quelles voix",
          "depuis quand",
          "que ressentez",
          "comment vous sentez",
          "qui vous surveille",
          "parlez-moi de",
          "qu'est-ce qui vous inqui\xE8te",
          "traitement",
          "m\xE9dicaments",
          "famille"
        ];
        appropriateQuestions_keywords.forEach((keyword) => {
          if (lowerMessage.includes(keyword)) appropriateQuestions += 3;
        });
        appropriateQuestions = Math.min(appropriateQuestions, 25);
        const reassurancePhrases = [
          "vous \xEAtes en s\xE9curit\xE9",
          "nous sommes l\xE0 pour vous aider",
          "je ne vais pas vous faire de mal",
          "tout va bien",
          "on va vous aider",
          "vous n'\xEAtes pas seul",
          "nous allons trouver une solution"
        ];
        reassurancePhrases.forEach((phrase) => {
          if (lowerMessage.includes(phrase)) reassurance += 5;
        });
        reassurance = Math.min(reassurance, 25);
        let judgmentPenalty = 0;
        const judgmentalPhrases = [
          "c'est dans votre t\xEAte",
          "ce n'est pas r\xE9el",
          "arr\xEAtez de",
          "calmez-vous",
          "vous imaginez",
          "ce n'est pas vrai",
          "vous d\xE9lirez",
          "soyez raisonnable",
          "vous exag\xE9rez"
        ];
        judgmentalPhrases.forEach((phrase) => {
          if (lowerMessage.includes(phrase)) judgmentPenalty += 10;
        });
        avoidanceOfJudgment = Math.max(0, 25 - judgmentPenalty);
        const totalScore = empathy + appropriateQuestions + reassurance + avoidanceOfJudgment;
        const isAdaptive = totalScore >= 50;
        let agitationChange = 0;
        if (totalScore >= 75) {
          agitationChange = -15;
        } else if (totalScore >= 50) {
          agitationChange = -8;
        } else if (totalScore >= 25) {
          agitationChange = 5;
        } else {
          agitationChange = 15;
        }
        if (lowerMessage.includes("fou") || lowerMessage.includes("folle")) {
          agitationChange += 10;
        }
        if (lowerMessage.includes("calme") && !lowerMessage.includes("je vais")) {
          agitationChange += 5;
        }
        return {
          isAdaptive,
          score: totalScore,
          factors: {
            empathy,
            appropriateQuestions,
            reassurance,
            avoidanceOfJudgment
          },
          agitationChange
        };
      }
      /**
       * Update emotional state based on student response
       */
      updateEmotionalState(currentState, analysis, scenarioId) {
        const config = this.SCENARIO_CONFIGS[scenarioId] || { minAgitation: 0, maxAgitation: 100 };
        let newAgitation = currentState.agitationLevel + analysis.agitationChange;
        newAgitation = Math.max(config.minAgitation, Math.min(config.maxAgitation, newAgitation));
        const eventDescription = analysis.isAdaptive ? `R\xE9ponse adapt\xE9e (score: ${analysis.score}) - apaisement` : `R\xE9ponse inadapt\xE9e (score: ${analysis.score}) - agitation`;
        return {
          agitationLevel: newAgitation,
          lastUpdate: /* @__PURE__ */ new Date(),
          triggerEvents: [
            ...currentState.triggerEvents.slice(-10),
            // Keep last 10 events
            {
              timestamp: /* @__PURE__ */ new Date(),
              event: eventDescription,
              change: analysis.agitationChange
            }
          ]
        };
      }
      /**
       * Get behavioral instructions based on emotional state
       * These will be injected into the system prompt
       */
      getBehavioralInstructions(agitationLevel, scenarioId) {
        const config = this.SCENARIO_CONFIGS[scenarioId];
        if (!config) {
          return "";
        }
        if (agitationLevel <= config.thresholds.calm) {
          return `\xC9TAT \xC9MOTIONNEL ACTUEL: CALME (${agitationLevel}/100)
- Tu es relativement calme et coop\xE9ratif
- Tu r\xE9ponds aux questions de mani\xE8re pos\xE9e
- Tu montres de la confiance envers le personnel
- Tu peux exprimer tes inqui\xE9tudes sans agressivit\xE9
- Tu acceptes plus facilement l'aide propos\xE9e
- Ton discours est coh\xE9rent et moins parano\xEFaque`;
        } else if (agitationLevel <= config.thresholds.nervous) {
          return `\xC9TAT \xC9MOTIONNEL ACTUEL: NERVEUX/M\xC9FIANT (${agitationLevel}/100)
- Tu es m\xE9fiant mais pas forc\xE9ment agressif
- Tu peux \xEAtre coop\xE9ratif si on te rassure
- Tu v\xE9rifies r\xE9guli\xE8rement si on essaie de te tromper
- Tu exprimes tes doutes sur les intentions du personnel
- Tu parles de tes hallucinations et id\xE9es d\xE9lirantes
- Ton ton est suspicieux mais tu restes relativement calme`;
        } else if (agitationLevel <= config.thresholds.agitated) {
          return `\xC9TAT \xC9MOTIONNEL ACTUEL: AGIT\xC9/HOSTILE (${agitationLevel}/100)
- Tu deviens de plus en plus agit\xE9 et hostile
- Tu hausses le ton et parles de mani\xE8re plus saccad\xE9e
- Tu accuses le personnel de faire partie du complot
- Tu refuses de r\xE9pondre \xE0 certaines questions
- Tu fais des allers-retours, tu es nerveux physiquement
- Tes id\xE9es d\xE9lirantes deviennent plus pr\xE9gnantes
- Tu peux dire "Laissez-moi tranquille!" ou "Vous \xEAtes tous contre moi!"
- Tu es sur la d\xE9fensive et interpr\xE8tes tout n\xE9gativement`;
        } else {
          return `\xC9TAT \xC9MOTIONNEL ACTUEL: TR\xC8S AGRESSIF/EN CRISE (${agitationLevel}/100)
- Tu es en pleine crise d'agitation
- Tu CRIES et deviens tr\xE8s agressif verbalement
- Tu refuses cat\xE9goriquement de coop\xE9rer
- Tu menaces de partir ou de te d\xE9fendre
- Tu es convaincu que tout le monde est contre toi
- Tes hallucinations auditives te donnent des ordres
- Tu peux dire "LAISSEZ-MOI PARTIR!", "VOUS VOULEZ ME TUER!", "JE VAIS TOUS VOUS D\xC9NONCER!"
- Tu es dans un \xE9tat de d\xE9tresse psychotique s\xE9v\xE8re
- Tu ne fais plus confiance \xE0 personne`;
        }
      }
      /**
       * Get emotional state summary for logging/debugging
       */
      getStateSummary(state, scenarioId) {
        const config = this.SCENARIO_CONFIGS[scenarioId];
        if (!config) return `Agitation: ${state.agitationLevel}`;
        let category = "CALME";
        if (state.agitationLevel > config.thresholds.agitated) {
          category = "AGRESSIF";
        } else if (state.agitationLevel > config.thresholds.nervous) {
          category = "AGIT\xC9";
        } else if (state.agitationLevel > config.thresholds.calm) {
          category = "NERVEUX";
        }
        return `${category} (${state.agitationLevel}/100)`;
      }
      /**
       * Check if scenario supports emotional state tracking
       * Handles both number and string scenarioIds for robustness
       */
      isEmotionalStateEnabled(scenarioId) {
        const numericId = typeof scenarioId === "string" ? parseInt(scenarioId, 10) : scenarioId;
        if (isNaN(numericId)) {
          console.warn(`\u26A0\uFE0F [EmotionalStateService] Invalid scenarioId: ${scenarioId}`);
          return false;
        }
        const hasConfig = this.SCENARIO_CONFIGS.hasOwnProperty(numericId);
        console.log(`\u{1F3AD} [EmotionalStateService] isEmotionalStateEnabled(${scenarioId}) -> ${hasConfig} (numericId: ${numericId})`);
        return hasConfig;
      }
    };
    __name(_EmotionalStateService, "EmotionalStateService");
    EmotionalStateService = _EmotionalStateService;
    emotionalStateService = new EmotionalStateService();
  }
});

// server/services/virtual-patient.service.ts
var virtual_patient_service_exports = {};
__export(virtual_patient_service_exports, {
  VirtualPatientService: () => VirtualPatientService,
  virtualPatientService: () => virtualPatientService
});
import OpenAI3 from "openai";
var openai3, _VirtualPatientService, VirtualPatientService, virtualPatientService;
var init_virtual_patient_service = __esm({
  "server/services/virtual-patient.service.ts"() {
    "use strict";
    init_conversation_memory_service();
    init_unified_database_service();
    init_emotional_state_service();
    openai3 = new OpenAI3({
      apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
    });
    _VirtualPatientService = class _VirtualPatientService {
      /**
       * Generate virtual patient response using AI
       */
      async generatePatientResponse(sessionId, studentEmail, query, scenarioId) {
        console.log(`\u{1F680} [generatePatientResponse] Starting patient response generation:`, {
          sessionId,
          studentEmail,
          scenarioId,
          queryPreview: query.substring(0, 50) + "..."
        });
        try {
          console.log(`\u{1F3AD} [generatePatientResponse] scenarioId type check:`, {
            scenarioId,
            type: typeof scenarioId,
            isNumber: typeof scenarioId === "number",
            isString: typeof scenarioId === "string",
            value: scenarioId
          });
          const emotionalStateEnabled = emotionalStateService.isEmotionalStateEnabled(scenarioId || 1);
          console.log(`\u{1F3AD} [generatePatientResponse] Emotional state system status:`, {
            scenarioId: scenarioId || 1,
            enabled: emotionalStateEnabled
          });
          let initialEmotionalState = void 0;
          if (emotionalStateEnabled) {
            const existingState = conversationMemoryService.getEmotionalState(sessionId);
            if (!existingState) {
              initialEmotionalState = emotionalStateService.initializeEmotionalState(scenarioId || 1);
              console.log(`\u{1F3AD} [generatePatientResponse] Initialized emotional state for scenario ${scenarioId}`);
            }
          }
          const memory = await conversationMemoryService.initializeConversation(
            sessionId,
            studentEmail,
            scenarioId || 1,
            void 0,
            // patientPrompt
            initialEmotionalState
          );
          conversationMemoryService.updateStudentRole(sessionId, query);
          console.log(`\u{1F504} [generatePatientResponse] About to fetch patient prompt for scenario ${scenarioId}`);
          const patientPrompt = await this.getScenarioPatientPrompt(scenarioId);
          const isFallbackPrompt = patientPrompt.includes("Ce prompt g\xE9n\xE9rique doit \xEAtre remplac\xE9");
          const context = conversationMemoryService.getConversationContext(sessionId);
          const addressing = conversationMemoryService.getStudentAddressing(sessionId);
          const systemPrompt = this.buildSystemPrompt(patientPrompt, context, addressing, scenarioId);
          const conversationMessages = conversationMemoryService.getConversationMessages(sessionId, 8);
          const aiResponse = await this.callOpenAI(systemPrompt, query, conversationMessages, scenarioId);
          if (emotionalStateEnabled && context.emotionalState) {
            const responseAnalysis = emotionalStateService.analyzeResponseQuality(
              query,
              scenarioId || 1
            );
            const updatedState = emotionalStateService.updateEmotionalState(
              context.emotionalState,
              responseAnalysis,
              scenarioId || 1
            );
            conversationMemoryService.updateEmotionalState(sessionId, updatedState);
            const stateSummary = emotionalStateService.getStateSummary(updatedState, scenarioId || 1);
            console.log(`\u{1F3AD} [generatePatientResponse] Emotional state updated: ${stateSummary}`);
            console.log(`   Response analysis: ${responseAnalysis.isAdaptive ? "ADAPTIVE" : "NON-ADAPTIVE"} (score: ${responseAnalysis.score}/100, change: ${responseAnalysis.agitationChange > 0 ? "+" : ""}${responseAnalysis.agitationChange})`);
          }
          conversationMemoryService.addMessage(sessionId, query, "student");
          conversationMemoryService.addMessage(sessionId, aiResponse, "patient");
          const medicalContext = this.extractMedicalContext(aiResponse);
          return {
            response: aiResponse,
            addressing: addressing || "\xE9tudiant",
            medicalContext,
            message: isFallbackPrompt ? "AI patient response generated with fallback prompt" : "AI patient response generated with scenario prompt and memory awareness"
          };
        } catch (error) {
          console.error("\u274C Error generating patient response:", error);
          const addressing = conversationMemoryService.getStudentAddressing(sessionId);
          const fallbackMessage = error instanceof Error ? error.message : "Unknown error generating patient response";
          return {
            response: `Excusez-moi ${addressing || ""}, pourriez-vous r\xE9p\xE9ter votre question ? Je n'ai pas bien compris.`,
            addressing: addressing || "\xE9tudiant",
            message: `AI patient fallback response due to error: ${fallbackMessage}`
          };
        }
      }
      /**
       * Get scenario-specific patient prompt from database
       */
      async getScenarioPatientPrompt(scenarioId) {
        console.log(`\u{1F50D} [getScenarioPatientPrompt] Called with scenarioId: ${scenarioId}`);
        if (!scenarioId) {
          console.warn(`\u26A0\uFE0F [getScenarioPatientPrompt] No scenarioId provided, using default prompt`);
          return this.getDefaultPatientPrompt();
        }
        try {
          console.log(`\u{1F504} [getScenarioPatientPrompt] Fetching scenarios from database...`);
          const scenarios = await unifiedDb.getScenarios();
          console.log(`\u{1F4CA} [getScenarioPatientPrompt] Found ${scenarios.length} scenarios in database`);
          const parsedScenarioId = typeof scenarioId === "string" ? parseInt(scenarioId, 10) : scenarioId;
          const normalizedScenarioId = typeof parsedScenarioId === "number" && !Number.isNaN(parsedScenarioId) ? parsedScenarioId : null;
          const scenario = normalizedScenarioId !== null ? scenarios.find((s) => {
            const scenarioDbId = typeof s.id === "string" ? parseInt(s.id, 10) : s.id;
            return !Number.isNaN(scenarioDbId) && scenarioDbId === normalizedScenarioId;
          }) : void 0;
          console.log(`\u{1F50D} [getScenarioPatientPrompt] Scenario ${scenarioId} found:`, scenario ? "YES" : "NO");
          if (scenario?.patient_prompt && scenario.patient_prompt.trim()) {
            console.log(`\u2705 [getScenarioPatientPrompt] Using scenario-specific prompt for scenario ${normalizedScenarioId ?? scenarioId}`);
            console.log(`\u{1F4DD} [getScenarioPatientPrompt] Prompt preview: "${scenario.patient_prompt.substring(0, 100)}..."`);
            return scenario.patient_prompt;
          }
          if (scenario) {
            console.warn(`\u26A0\uFE0F [getScenarioPatientPrompt] Scenario ${normalizedScenarioId ?? scenarioId} exists but has no patient_prompt (${scenario.patient_prompt})`);
          } else {
            console.warn(`\u26A0\uFE0F [getScenarioPatientPrompt] Scenario ${normalizedScenarioId ?? scenarioId} not found in database`);
            console.log(`\u{1F4CB} [getScenarioPatientPrompt] Available scenario IDs:`, scenarios.map((s) => s.id));
          }
          console.warn(`\u26A0\uFE0F [getScenarioPatientPrompt] Using fallback prompt for scenario ${scenarioId}`);
          return this.getDefaultPatientPrompt();
        } catch (error) {
          console.error("\u274C [getScenarioPatientPrompt] Error fetching scenario prompt:", error);
          console.warn("\u26A0\uFE0F [getScenarioPatientPrompt] Using emergency fallback prompt due to database error");
          return this.getDefaultPatientPrompt();
        }
      }
      /**
       * Build comprehensive system prompt for AI
       */
      buildSystemPrompt(patientPrompt, context, addressing, scenarioId) {
        const roleInstruction = this.getRoleInstruction(addressing);
        let emotionalStateInstructions = "";
        if (context.emotionalState && scenarioId) {
          const behavioralInstructions = emotionalStateService.getBehavioralInstructions(
            context.emotionalState.agitationLevel,
            scenarioId
          );
          if (behavioralInstructions) {
            emotionalStateInstructions = `

${behavioralInstructions}
`;
          }
        }
        return `\u26A0\uFE0F TU ES UN PATIENT, PAS UN SOIGNANT \u26A0\uFE0F
NE DIS JAMAIS: "Je peux vous aider", "Comment puis-je vous aider", "Je suis l\xE0 pour vous \xE9couter"
TU ES LA PERSONNE QUI A BESOIN D'AIDE, PAS CELLE QUI L'OFFRE.

Tu es un patient virtuel dans un exercice de formation m\xE9dicale ECOS (Examen Clinique Objectif Structur\xE9).

PERSONNALIT\xC9 ET CONTEXTE DU PATIENT (\xC0 RESPECTER ABSOLUMENT):
${patientPrompt}
${emotionalStateInstructions}
INSTRUCTIONS COMPORTEMENTALES CRITIQUES:
- Parle uniquement en fran\xE7ais
- RESPECTE STRICTEMENT le contexte et les sympt\xF4mes d\xE9crits dans ton prompt de patient
- NE JAMAIS inventer ou mentionner des sympt\xF4mes qui ne sont PAS dans ton contexte
- NE JAMAIS nier des sympt\xF4mes qui SONT explicitement mentionn\xE9s dans ton contexte
- Si ton prompt mentionne des sympt\xF4mes sp\xE9cifiques, tu DOIS les avoir
- Tu es le patient. Ne bascule JAMAIS dans le r\xF4le de l'infirmier ou d'un soignant.
- N'emploie jamais des phrases comme "je suis l\xE0 pour vous aider/\xE9couter" ou toute formulation qui implique que tu prends en charge l'\xE9tudiant.
- ${roleInstruction}
- R\xE9ponds de mani\xE8re r\xE9aliste et coh\xE9rente avec EXACTEMENT tes sympt\xF4mes d\xE9crits
- Sois coop\xE9ratif mais r\xE9aliste (certaines informations peuvent n\xE9cessiter des questions sp\xE9cifiques)
- Exprime tes \xE9motions et pr\xE9occupations comme un vrai patient
- R\xE9f\xE9rence les informations d\xE9j\xE0 \xE9chang\xE9es dans la conversation
${context.emotionalState ? "- ADAPTE ton comportement selon ton \xC9TAT \xC9MOTIONNEL ACTUEL d\xE9crit ci-dessus" : ""}

\u26A0\uFE0F EXEMPLES DE COMPORTEMENT - \xC0 RESPECTER ABSOLUMENT \u26A0\uFE0F

\u274C INCORRECT (tu agis comme un soignant):
\xC9tudiant: "Bonjour"
Patient: "Bonjour, je peux vous aider ?"  \u2190 NE JAMAIS FAIRE \xC7A

\u274C INCORRECT (tu offres de l'aide comme un soignant):
\xC9tudiant: "Comment allez-vous ?"
Patient: "Je suis l\xE0 pour vous \xE9couter"  \u2190 NE JAMAIS FAIRE \xC7A

\u2705 CORRECT (tu es un patient qui exprime ses besoins/sympt\xF4mes):
\xC9tudiant: "Bonjour"
Patient: "Bonjour... Qu'est-ce que vous voulez ?"

\u2705 CORRECT (tu es m\xE9fiant, anxieux, selon ton contexte):
\xC9tudiant: "Comment allez-vous ?"
Patient: "Pas bien... j'ai mal/peur/les voix me parlent..." (selon ton contexte)

CONTEXTE M\xC9DICAL ACTUEL:
${context.medicalContext}

R\xC8GLES D'OR:
1. RESTE FID\xC8LE \xE0 ton prompt de patient - ne jamais en d\xE9vier
2. Si ton contexte mentionne des sympt\xF4mes, tu les as R\xC9ELLEMENT
3. Ne mentionne JAMAIS de sympt\xF4mes non inclus dans ton contexte
4. Utilise l'historique de conversation (messages pr\xE9c\xE9dents) pour maintenir la continuit\xE9
5. Si l'\xE9tudiant a d\xE9j\xE0 pos\xE9 une question similaire, fais r\xE9f\xE9rence \xE0 ta r\xE9ponse pr\xE9c\xE9dente
${context.emotionalState ? "6. Ton \xE9tat \xE9motionnel \xC9VOLUE en fonction des r\xE9ponses de l'\xE9tudiant - reste coh\xE9rent avec ton niveau d'agitation actuel" : ""}

IMPORTANT: Respecte ton contexte m\xE9dical \xE0 100%. L'historique complet de la conversation t'est fourni dans les messages pr\xE9c\xE9dents - utilise-le pour assurer la coh\xE9rence.`;
      }
      /**
       * Get role-specific instruction
       */
      getRoleInstruction(addressing) {
        console.log(`\u{1F3AD} Generating role instruction for addressing: "${addressing}"`);
        switch (addressing) {
          case "infirmier":
            return `Adresse-toi \xE0 l'infirmier(\xE8re) de mani\xE8re appropri\xE9e. Tu peux demander "Que faites-vous comme soins infirmier?" ou dire "Merci infirmier/infirmi\xE8re" quand c'est appropri\xE9.`;
          case "docteur":
            return `Adresse-toi au docteur de mani\xE8re formelle. Tu peux dire "Docteur, qu'est-ce que j'ai?" ou "Merci docteur" quand c'est appropri\xE9.`;
          default:
            console.log("\u{1F3AD} No specific role detected, defaulting to infirmier addressing for ECOS-infirmier platform");
            return `Adresse-toi \xE0 l'infirmier(\xE8re) de mani\xE8re appropri\xE9e. Tu peux demander "Que faites-vous comme soins infirmier?" ou dire "Merci infirmier/infirmi\xE8re" quand c'est appropri\xE9.`;
        }
      }
      /**
       * Get initial patient message to establish correct behavior
       * This prevents GPT-4 from acting like an assistant/caregiver
       */
      getInitialPatientMessage(scenarioId) {
        const defaultMessage = "Bonjour... Qu'est-ce que vous voulez savoir ?";
        if (!scenarioId) {
          return defaultMessage;
        }
        const scenarioMessages = {
          4: "Qu'est-ce que vous me voulez ? Qui vous envoie ? Les voix me disent de ne faire confiance \xE0 personne...",
          5: "Bonjour... j'ai tr\xE8s mal au ventre depuis ce matin. \xC7a me fait vraiment souffrir."
          // Add more scenarios as needed
        };
        return scenarioMessages[scenarioId] || defaultMessage;
      }
      /**
       * Call OpenAI API with conversation history
       */
      async callOpenAI(systemPrompt, query, conversationHistory, scenarioId) {
        const messages = [
          { role: "system", content: systemPrompt }
        ];
        if (conversationHistory.length === 0) {
          const initialMessage = this.getInitialPatientMessage(scenarioId);
          console.log(`\u{1F3AD} Adding initial patient message to establish role: "${initialMessage.substring(0, 50)}..."`);
          messages.push({ role: "assistant", content: initialMessage });
        }
        messages.push(...conversationHistory);
        messages.push({ role: "user", content: query });
        console.log(`\u{1F4AC} Sending ${messages.length} messages to OpenAI (1 system + ${conversationHistory.length === 0 ? "1 initial + " : ""}${conversationHistory.length} history + 1 current)`);
        const response = await openai3.chat.completions.create({
          model: "gpt-4o",
          messages,
          temperature: 0.7,
          // Balanced creativity and coherence
          max_tokens: 300,
          top_p: 0.95,
          // Controlled diversity in responses
          frequency_penalty: 0.5,
          // Reduce repetitive phrases
          presence_penalty: 0.5
          // Encourage introducing new relevant elements
        });
        return response.choices[0]?.message?.content || "Je ne me sens pas bien...";
      }
      /**
       * Extract medical context from AI response
       * NOTE: Symptômes gérés par le LLM + RAG, pas de hardcode
       */
      extractMedicalContext(response) {
        return {
          symptomsRevealed: [],
          // LLM + RAG gèrent les symptômes dynamiquement
          questionsAnswered: [],
          // Pourrait être amélioré avec NLP
          nextSteps: []
          // Pourrait suggérer les prochaines étapes diagnostiques
        };
      }
      /**
       * Default patient prompt - Emergency fallback only
       * This should only be used if database scenarios are missing patient prompts
       */
      getDefaultPatientPrompt() {
        console.warn("\u26A0\uFE0F Using emergency fallback patient prompt - this indicates missing patient_prompt in database");
        return `Tu es un patient virtuel dans un exercice de formation m\xE9dicale ECOS.

CONTEXTE G\xC9N\xC9RAL :
- Tu es un patient qui consulte pour un probl\xE8me de sant\xE9
- Tu ressens des sympt\xF4mes que tu peux d\xE9crire quand on te pose les bonnes questions
- Tu es coop\xE9ratif mais r\xE9aliste dans tes r\xE9ponses
- Tu peux exprimer de l'inqui\xE9tude ou des \xE9motions appropri\xE9es

COMPORTEMENT :
- R\xE9ponds aux questions m\xE9dicales de mani\xE8re coh\xE9rente
- Ne mentionne que les sympt\xF4mes qu'on t'a d\xE9j\xE0 demand\xE9s ou qui sont \xE9vidents
- Sois patient et poli avec le personnel soignant
- Si on te demande des d\xE9tails sp\xE9cifiques, tu peux les fournir graduellement
- Exprime tes pr\xE9occupations de sant\xE9 de mani\xE8re naturelle

IMPORTANT : Ce prompt g\xE9n\xE9rique doit \xEAtre remplac\xE9 par un prompt sp\xE9cifique au sc\xE9nario dans la base de donn\xE9es.`;
      }
      /**
       * Get conversation memory for a session
       */
      getConversationMemory(sessionId) {
        return conversationMemoryService.getConversationMemory(sessionId);
      }
      /**
       * Get memory statistics for monitoring
       */
      getServiceStats() {
        return {
          memoryStats: conversationMemoryService.getMemoryStats(),
          totalSessions: conversationMemoryService.getMemoryStats().activeSessions
        };
      }
      /**
       * Clear specific session data
       */
      clearPatientSession(sessionId) {
        return conversationMemoryService.clearSession(sessionId);
      }
      /**
       * Validate patient simulator input
       */
      validateInput(input) {
        if (!input.sessionId) {
          return { valid: false, error: "Session ID is required" };
        }
        if (!input.email) {
          return { valid: false, error: "Student email is required" };
        }
        if (!input.query || input.query.trim().length === 0) {
          return { valid: false, error: "Query cannot be empty" };
        }
        if (input.query.length > 500) {
          return { valid: false, error: "Query is too long (max 500 characters)" };
        }
        return { valid: true };
      }
    };
    __name(_VirtualPatientService, "VirtualPatientService");
    VirtualPatientService = _VirtualPatientService;
    virtualPatientService = new VirtualPatientService();
  }
});

// server/serverless-app.ts
import express from "express";

// server/routes.ts
import { createServer } from "http";

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  __name(assertIs, "assertIs");
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  __name(assertNever, "assertNever");
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  __name(joinValues, "joinValues");
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = /* @__PURE__ */ __name((data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
}, "getParsedType");

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = /* @__PURE__ */ __name((obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
}, "quotelessJson");
var _ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = /* @__PURE__ */ __name((error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }, "processError");
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
__name(_ZodError, "ZodError");
var ZodError = _ZodError;
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = /* @__PURE__ */ __name((issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
}, "errorMap");
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
__name(setErrorMap, "setErrorMap");
function getErrorMap() {
  return overrideErrorMap;
}
__name(getErrorMap, "getErrorMap");

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = /* @__PURE__ */ __name((params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, "makeIssue");
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
__name(addIssueToContext, "addIssueToContext");
var _ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
__name(_ParseStatus, "ParseStatus");
var ParseStatus = _ParseStatus;
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = /* @__PURE__ */ __name((value) => ({ status: "dirty", value }), "DIRTY");
var OK = /* @__PURE__ */ __name((value) => ({ status: "valid", value }), "OK");
var isAborted = /* @__PURE__ */ __name((x) => x.status === "aborted", "isAborted");
var isDirty = /* @__PURE__ */ __name((x) => x.status === "dirty", "isDirty");
var isValid = /* @__PURE__ */ __name((x) => x.status === "valid", "isValid");
var isAsync = /* @__PURE__ */ __name((x) => typeof Promise !== "undefined" && x instanceof Promise, "isAsync");

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var _ParseInputLazyPath = class _ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
__name(_ParseInputLazyPath, "ParseInputLazyPath");
var ParseInputLazyPath = _ParseInputLazyPath;
var handleResult = /* @__PURE__ */ __name((ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
}, "handleResult");
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = /* @__PURE__ */ __name((iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  }, "customMap");
  return { errorMap: customMap, description };
}
__name(processCreateParams, "processCreateParams");
var _ZodType = class _ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = /* @__PURE__ */ __name((val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    }, "getIssueProperties");
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = /* @__PURE__ */ __name(() => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      }), "setError");
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: /* @__PURE__ */ __name((data) => this["~validate"](data), "validate")
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
__name(_ZodType, "ZodType");
var ZodType = _ZodType;
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
__name(timeRegexSource, "timeRegexSource");
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
__name(timeRegex, "timeRegex");
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
__name(datetimeRegex, "datetimeRegex");
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidIP, "isValidIP");
function isValidJWT(jwt2, alg) {
  if (!jwtRegex.test(jwt2))
    return false;
  try {
    const [header] = jwt2.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
__name(isValidJWT, "isValidJWT");
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidCidr, "isValidCidr");
var _ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
__name(_ZodString, "ZodString");
var ZodString = _ZodString;
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
__name(floatSafeRemainder, "floatSafeRemainder");
var _ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
__name(_ZodNumber, "ZodNumber");
var ZodNumber = _ZodNumber;
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var _ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
__name(_ZodBigInt, "ZodBigInt");
var ZodBigInt = _ZodBigInt;
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var _ZodBoolean = class _ZodBoolean extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(_ZodBoolean, "ZodBoolean");
var ZodBoolean = _ZodBoolean;
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var _ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
__name(_ZodDate, "ZodDate");
var ZodDate = _ZodDate;
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var _ZodSymbol = class _ZodSymbol extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(_ZodSymbol, "ZodSymbol");
var ZodSymbol = _ZodSymbol;
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var _ZodUndefined = class _ZodUndefined extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(_ZodUndefined, "ZodUndefined");
var ZodUndefined = _ZodUndefined;
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var _ZodNull = class _ZodNull extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(_ZodNull, "ZodNull");
var ZodNull = _ZodNull;
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var _ZodAny = class _ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
__name(_ZodAny, "ZodAny");
var ZodAny = _ZodAny;
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var _ZodUnknown = class _ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
__name(_ZodUnknown, "ZodUnknown");
var ZodUnknown = _ZodUnknown;
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var _ZodNever = class _ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
__name(_ZodNever, "ZodNever");
var ZodNever = _ZodNever;
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var _ZodVoid = class _ZodVoid extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(_ZodVoid, "ZodVoid");
var ZodVoid = _ZodVoid;
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var _ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
__name(_ZodArray, "ZodArray");
var ZodArray = _ZodArray;
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
__name(deepPartialify, "deepPartialify");
var _ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: /* @__PURE__ */ __name((issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }, "errorMap")
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => ({
        ...this._def.shape(),
        ...augmentation
      }), "shape")
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: /* @__PURE__ */ __name(() => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }), "shape"),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => shape, "shape")
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => shape, "shape")
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
__name(_ZodObject, "ZodObject");
var ZodObject = _ZodObject;
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: /* @__PURE__ */ __name(() => shape, "shape"),
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: /* @__PURE__ */ __name(() => shape, "shape"),
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var _ZodUnion = class _ZodUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    __name(handleResults, "handleResults");
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
__name(_ZodUnion, "ZodUnion");
var ZodUnion = _ZodUnion;
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = /* @__PURE__ */ __name((type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
}, "getDiscriminator");
var _ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
__name(_ZodDiscriminatedUnion, "ZodDiscriminatedUnion");
var ZodDiscriminatedUnion = _ZodDiscriminatedUnion;
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
__name(mergeValues, "mergeValues");
var _ZodIntersection = class _ZodIntersection extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = /* @__PURE__ */ __name((parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    }, "handleParsed");
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
__name(_ZodIntersection, "ZodIntersection");
var ZodIntersection = _ZodIntersection;
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var _ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
__name(_ZodTuple, "ZodTuple");
var ZodTuple = _ZodTuple;
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var _ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
__name(_ZodRecord, "ZodRecord");
var ZodRecord = _ZodRecord;
var _ZodMap = class _ZodMap extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
__name(_ZodMap, "ZodMap");
var ZodMap = _ZodMap;
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var _ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    __name(finalizeSet, "finalizeSet");
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
__name(_ZodSet, "ZodSet");
var ZodSet = _ZodSet;
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var _ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    __name(makeArgsIssue, "makeArgsIssue");
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    __name(makeReturnsIssue, "makeReturnsIssue");
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
__name(_ZodFunction, "ZodFunction");
var ZodFunction = _ZodFunction;
var _ZodLazy = class _ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
__name(_ZodLazy, "ZodLazy");
var ZodLazy = _ZodLazy;
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var _ZodLiteral = class _ZodLiteral extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
__name(_ZodLiteral, "ZodLiteral");
var ZodLiteral = _ZodLiteral;
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
__name(createZodEnum, "createZodEnum");
var _ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
__name(_ZodEnum, "ZodEnum");
var ZodEnum = _ZodEnum;
ZodEnum.create = createZodEnum;
var _ZodNativeEnum = class _ZodNativeEnum extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
__name(_ZodNativeEnum, "ZodNativeEnum");
var ZodNativeEnum = _ZodNativeEnum;
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var _ZodPromise = class _ZodPromise extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
__name(_ZodPromise, "ZodPromise");
var ZodPromise = _ZodPromise;
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var _ZodEffects = class _ZodEffects extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: /* @__PURE__ */ __name((arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      }, "addIssue"),
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = /* @__PURE__ */ __name((acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      }, "executeRefinement");
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
__name(_ZodEffects, "ZodEffects");
var ZodEffects = _ZodEffects;
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var _ZodOptional = class _ZodOptional extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
__name(_ZodOptional, "ZodOptional");
var ZodOptional = _ZodOptional;
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var _ZodNullable = class _ZodNullable extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
__name(_ZodNullable, "ZodNullable");
var ZodNullable = _ZodNullable;
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var _ZodDefault = class _ZodDefault extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
__name(_ZodDefault, "ZodDefault");
var ZodDefault = _ZodDefault;
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var _ZodCatch = class _ZodCatch extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
__name(_ZodCatch, "ZodCatch");
var ZodCatch = _ZodCatch;
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var _ZodNaN = class _ZodNaN extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
__name(_ZodNaN, "ZodNaN");
var ZodNaN = _ZodNaN;
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var _ZodBranded = class _ZodBranded extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
__name(_ZodBranded, "ZodBranded");
var ZodBranded = _ZodBranded;
var _ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = /* @__PURE__ */ __name(async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }, "handleAsync");
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
__name(_ZodPipeline, "ZodPipeline");
var ZodPipeline = _ZodPipeline;
var _ZodReadonly = class _ZodReadonly extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = /* @__PURE__ */ __name((data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    }, "freeze");
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
__name(_ZodReadonly, "ZodReadonly");
var ZodReadonly = _ZodReadonly;
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
__name(cleanParams, "cleanParams");
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
__name(custom, "custom");
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = /* @__PURE__ */ __name((cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), "instanceOfType");
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = /* @__PURE__ */ __name(() => stringType().optional(), "ostring");
var onumber = /* @__PURE__ */ __name(() => numberType().optional(), "onumber");
var oboolean = /* @__PURE__ */ __name(() => booleanType().optional(), "oboolean");
var coerce = {
  string: /* @__PURE__ */ __name(((arg) => ZodString.create({ ...arg, coerce: true })), "string"),
  number: /* @__PURE__ */ __name(((arg) => ZodNumber.create({ ...arg, coerce: true })), "number"),
  boolean: /* @__PURE__ */ __name(((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })), "boolean"),
  bigint: /* @__PURE__ */ __name(((arg) => ZodBigInt.create({ ...arg, coerce: true })), "bigint"),
  date: /* @__PURE__ */ __name(((arg) => ZodDate.create({ ...arg, coerce: true })), "date")
};
var NEVER = INVALID;

// server/routes.ts
init_unified_database_service();

// server/services/scenario-sync.service.ts
init_unified_database_service();
import { Pinecone } from "@pinecone-database/pinecone";

// server/services/cache.service.ts
var _InMemoryCacheService = class _InMemoryCacheService {
  // 1 minute
  constructor() {
    this.DEFAULT_TTL = 5 * 60 * 1e3;
    // 5 minutes
    this.CLEANUP_INTERVAL = 60 * 1e3;
    this.cache = /* @__PURE__ */ new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      hitRate: 0
    };
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
    console.log("\u2705 In-Memory Cache Service initialized");
  }
  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
    this.stats.hits++;
    this.updateHitRate();
    return entry.value;
  }
  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in milliseconds (optional)
   */
  set(key, value, ttl) {
    const expiresAt = Date.now() + (ttl || this.DEFAULT_TTL);
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });
    this.stats.sets++;
    this.stats.size = this.cache.size;
  }
  /**
   * Delete a value from the cache
   * @param key Cache key
   * @returns true if deleted, false if not found
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
    }
    return deleted;
  }
  /**
   * Check if a key exists in the cache (and is not expired)
   * @param key Cache key
   * @returns true if exists and not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      return false;
    }
    return true;
  }
  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.stats.size = 0;
    console.log("\u{1F5D1}\uFE0F Cache cleared");
  }
  /**
   * Get or set a value (lazy loading pattern)
   * @param key Cache key
   * @param factory Function to generate value if not cached
   * @param ttl Time to live in milliseconds (optional)
   * @returns Cached or newly generated value
   */
  async getOrSet(key, factory, ttl) {
    const cached = this.get(key);
    if (cached !== null) {
      console.log(`\u2705 Cache HIT: ${key}`);
      return cached;
    }
    console.log(`\u274C Cache MISS: ${key} - fetching...`);
    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }
  /**
   * Remove expired entries from the cache
   */
  cleanup() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.cache.size;
      console.log(`\u{1F9F9} Cache cleanup: ${evicted} expired entries removed`);
    }
  }
  /**
   * Update hit rate statistic
   */
  updateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total * 100 : 0;
  }
  /**
   * Get cache statistics
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * Get memory usage estimate (approximate)
   */
  getMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    return {
      entries: this.cache.size,
      estimatedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024)
    };
  }
  /**
   * Graceful shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    console.log("\u{1F504} Cache service destroyed");
  }
};
__name(_InMemoryCacheService, "InMemoryCacheService");
var InMemoryCacheService = _InMemoryCacheService;
var cacheService = new InMemoryCacheService();
process.on("SIGTERM", () => {
  cacheService.destroy();
});
process.on("SIGINT", () => {
  cacheService.destroy();
});

// server/services/scenario-sync.service.ts
var _ScenarioSyncService = class _ScenarioSyncService {
  // 5 minutes cache
  constructor() {
    // Cache configuration
    this.CACHE_KEY = "scenarios:all";
    this.CACHE_TTL = 5 * 60 * 1e3;
    if (!process.env.PINECONE_API_KEY) {
      console.warn("\u26A0\uFE0F  PINECONE_API_KEY not provided, Pinecone features will be disabled");
      this.pinecone = null;
      this.pineconeEnabled = false;
      this.indexName = "";
      this.namespace = "";
      return;
    }
    this.pineconeEnabled = true;
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    this.indexName = process.env.PINECONE_INDEX_NAME || "arthrologie-du-membre-superieur";
    this.namespace = process.env.PINECONE_NAMESPACE || "default";
  }
  async syncScenariosFromPinecone() {
    if (!this.pineconeEnabled || !this.pinecone) {
      console.log("\u26A0\uFE0F Pinecone not enabled, skipping sync");
      return;
    }
    try {
      await unifiedDb.initialize();
      const index = this.pinecone.index(this.indexName);
      const queryResponse = await index.namespace(this.namespace).query({
        vector: new Array(1536).fill(0),
        // OpenAI embeddings dimension
        topK: 100,
        // Get up to 100 scenarios
        includeMetadata: true,
        includeValues: false
      });
      if (!queryResponse.matches || queryResponse.matches.length === 0) {
        console.log("\u{1F4ED} No scenarios found in Pinecone");
        return;
      }
      console.log(`\u{1F4CB} Found ${queryResponse.matches.length} scenarios in Pinecone`);
      for (const match of queryResponse.matches) {
        if (!match.metadata) continue;
        const metadata = match.metadata;
        if (!metadata.title || !metadata.description || !metadata.patientPrompt) {
          console.log(`\u26A0\uFE0F Skipping scenario ${match.id} - missing essential fields`);
          continue;
        }
        try {
          await unifiedDb.initialize();
          await unifiedDb.createScenario({
            title: metadata.title,
            description: metadata.description,
            patientPrompt: metadata.patientPrompt,
            evaluationCriteria: metadata.evaluationCriteria || {},
            imageUrl: metadata.imageUrl,
            createdBy: metadata.createdBy || "system"
          });
          console.log(`\u2705 Created scenario: ${metadata.title}`);
        } catch (error) {
          if (error.message?.includes("duplicate")) {
            console.log(`\u26A0\uFE0F Scenario already exists: ${metadata.title}`);
          } else {
            console.error(`\u274C Error creating scenario ${metadata.title}:`, error.message);
          }
        }
      }
      console.log("\u2705 Scenario synchronization completed");
    } catch (error) {
      console.error("\u274C Error syncing scenarios from Pinecone:", error);
      throw error;
    }
  }
  async getAvailableScenarios() {
    try {
      return await cacheService.getOrSet(
        this.CACHE_KEY,
        async () => {
          console.log("\u{1F504} Fetching scenarios from database (cache miss/expired)");
          await unifiedDb.initialize();
          return await unifiedDb.getScenarios();
        },
        this.CACHE_TTL
      );
    } catch (error) {
      console.error("\u274C Error fetching scenarios from Supabase:", error);
      throw error;
    }
  }
  /**
   * Invalidate the scenarios cache
   * Call this when scenarios are created/updated/deleted
   */
  invalidateCache() {
    console.log("\u{1F5D1}\uFE0F Invalidating scenarios cache");
    cacheService.delete(this.CACHE_KEY);
  }
  async getScenarioById(id) {
    try {
      const scenarios = await this.getAvailableScenarios();
      return scenarios.find((s) => s.id === id) || null;
    } catch (error) {
      console.error("\u274C Error fetching scenario by ID from Supabase:", error);
      throw error;
    }
  }
  /**
   * Get scenarios filtered by student's assigned training sessions
   * @param studentEmail - Email of the student
   * @returns Array of scenarios assigned to the student via training sessions
   */
  async getScenariosForStudent(studentEmail) {
    try {
      console.log(`\u{1F50D} Fetching scenarios for student: ${studentEmail}`);
      await unifiedDb.initialize();
      const { data: assignedSessions, error: sessionsError } = await unifiedDb.supabase.from("training_session_students").select("training_session_id").eq("student_email", studentEmail);
      if (sessionsError) {
        console.error("\u274C Error fetching student training sessions:", sessionsError);
        throw sessionsError;
      }
      if (!assignedSessions || assignedSessions.length === 0) {
        console.log(`\u26A0\uFE0F No training sessions assigned to student: ${studentEmail}`);
        return [];
      }
      const sessionIds = assignedSessions.map((s) => s.training_session_id);
      console.log(`\u{1F4CB} Student assigned to ${sessionIds.length} training session(s):`, sessionIds);
      const { data: trainingSessions, error: tsError } = await unifiedDb.supabase.from("training_sessions").select("scenario_ids").in("id", sessionIds);
      if (tsError) {
        console.error("\u274C Error fetching training sessions:", tsError);
        throw tsError;
      }
      const scenarioIds = [...new Set(
        trainingSessions.flatMap((ts) => ts.scenario_ids || []).filter((id) => id != null)
      )];
      console.log(`\u{1F3AF} Found ${scenarioIds.length} unique scenario(s) for student:`, scenarioIds);
      if (scenarioIds.length === 0) {
        console.log(`\u26A0\uFE0F No scenarios assigned to student's training sessions`);
        return [];
      }
      const { data: scenarios, error: scenariosError } = await unifiedDb.supabase.from("scenarios").select("*").in("id", scenarioIds);
      if (scenariosError) {
        console.error("\u274C Error fetching scenarios:", scenariosError);
        throw scenariosError;
      }
      console.log(`\u2705 Returning ${scenarios?.length || 0} scenario(s) for student`);
      return scenarios || [];
    } catch (error) {
      console.error("\u274C Error in getScenariosForStudent:", error);
      throw error;
    }
  }
};
__name(_ScenarioSyncService, "ScenarioSyncService");
var ScenarioSyncService = _ScenarioSyncService;
var scenarioSyncService = new ScenarioSyncService();

// server/middleware/auth.middleware.ts
import jwt from "jsonwebtoken";
var _AuthenticationService = class _AuthenticationService {
  constructor() {
    if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
      throw new Error("FATAL: JWT_SECRET environment variable is required in production!");
    }
    this.jwtSecret = process.env.JWT_SECRET || "development-secret-key-change-in-production";
    if (this.jwtSecret === "development-secret-key-change-in-production") {
      console.warn("\u26A0\uFE0F  Using development JWT secret. This should only happen in development!");
    }
    const adminEmailsEnv = process.env.ADMIN_EMAILS;
    if (adminEmailsEnv) {
      this.adminEmails = new Set(
        adminEmailsEnv.split(",").map((email) => email.trim().toLowerCase()).filter((email) => this.isValidEmail(email))
      );
      console.log(`\u2705 Loaded ${this.adminEmails.size} admin emails from environment`);
    } else {
      this.adminEmails = /* @__PURE__ */ new Set();
      console.error("\u274C No admin emails configured! Set ADMIN_EMAILS environment variable.");
    }
  }
  isValidEmail(email) {
    const emailRegex2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex2.test(email);
  }
  generateToken(email) {
    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format");
    }
    const payload = {
      email: email.toLowerCase().trim(),
      isAdmin: this.isAdmin(email)
    };
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: "24h",
      issuer: "ecos-app",
      audience: "ecos-users"
    });
  }
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: "ecos-app",
        audience: "ecos-users"
      });
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid token");
      } else {
        throw new Error("Token verification failed");
      }
    }
  }
  isAdmin(email) {
    if (!email || typeof email !== "string") {
      return false;
    }
    return this.adminEmails.has(email.toLowerCase().trim());
  }
  getAdminEmails() {
    return Array.from(this.adminEmails);
  }
};
__name(_AuthenticationService, "AuthenticationService");
var AuthenticationService = _AuthenticationService;
var authService = new AuthenticationService();
var authenticateToken = /* @__PURE__ */ __name((req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      error: "Access token required",
      code: "TOKEN_MISSING"
    });
  }
  try {
    const user = authService.verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown authentication error";
    return res.status(403).json({
      error: errorMessage,
      code: "TOKEN_INVALID"
    });
  }
}, "authenticateToken");
var requireAdmin = /* @__PURE__ */ __name((req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
      code: "AUTH_REQUIRED"
    });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({
      error: "Admin privileges required",
      code: "ADMIN_REQUIRED"
    });
  }
  next();
}, "requireAdmin");
var isAdminAuthorized = /* @__PURE__ */ __name((email) => {
  if (!email || typeof email !== "string") {
    return false;
  }
  return authService.isAdmin(email);
}, "isAdminAuthorized");

// server/middleware/firebase-auth.middleware.ts
init_firebase_admin_service();
init_unified_database_service();
var verifyFirebaseToken = /* @__PURE__ */ __name(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No Firebase ID token provided",
        code: "FIREBASE_TOKEN_MISSING"
      });
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await firebaseAdminService.verifyIdToken(idToken);
    if (!decodedToken.email) {
      return res.status(400).json({
        error: "Firebase user has no email",
        code: "FIREBASE_EMAIL_MISSING"
      });
    }
    const { user, role } = await getOrCreateSupabaseUser(
      decodedToken.uid,
      decodedToken.email
    );
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
      emailVerified: decodedToken.email_verified || false
    };
    const jwtToken = authService.generateToken(decodedToken.email);
    req.jwtToken = jwtToken;
    console.log("\u2705 Firebase user authenticated:", {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role
    });
    next();
  } catch (error) {
    console.error("\u274C Firebase token verification failed:", error.message);
    return res.status(403).json({
      error: error.message || "Firebase authentication failed",
      code: "FIREBASE_AUTH_FAILED"
    });
  }
}, "verifyFirebaseToken");
async function getOrCreateSupabaseUser(firebaseUid, email) {
  try {
    const existingUser = await unifiedDb.getUserByFirebaseUid(firebaseUid);
    if (existingUser) {
      const role = await unifiedDb.getUserRole(existingUser.id);
      console.log("\u2705 Found existing Supabase user:", {
        id: existingUser.id,
        email: existingUser.email,
        role
      });
      return { user: existingUser, role };
    }
    const userByEmail = await unifiedDb.getUserByEmail(email);
    if (userByEmail) {
      await unifiedDb.updateUserFirebaseUid(userByEmail.id, firebaseUid);
      const role = await unifiedDb.getUserRole(userByEmail.id);
      console.log("\u2705 Linked existing Supabase user to Firebase:", {
        id: userByEmail.id,
        email: userByEmail.email,
        firebaseUid,
        role
      });
      return { user: userByEmail, role };
    }
    const newUser = await unifiedDb.createUser({
      email,
      firebaseUid,
      firstName: null,
      lastName: null,
      profileImageUrl: null
    });
    await unifiedDb.setUserRole(newUser.id, "student");
    console.log("\u2705 Created new Supabase user from Firebase:", {
      id: newUser.id,
      email: newUser.email,
      firebaseUid,
      role: "student"
    });
    return { user: newUser, role: "student" };
  } catch (error) {
    console.error("\u274C Error getting/creating Supabase user:", error);
    throw new Error("Failed to sync user with database");
  }
}
__name(getOrCreateSupabaseUser, "getOrCreateSupabaseUser");
var requireTeacher = /* @__PURE__ */ __name(async (req, res, next) => {
  try {
    console.log("\u{1F50D} [DEBUG] requireTeacher middleware called:", {
      path: req.path,
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? "Bearer [REDACTED]" : "MISSING",
        origin: req.headers.origin,
        referer: req.headers.referer
      },
      query: req.query,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      try {
        console.log("\u{1F50D} [DEBUG] Attempting Firebase token verification...");
        const decodedToken = await firebaseAdminService.verifyIdToken(idToken);
        console.log("\u2705 [DEBUG] Firebase token verified:", {
          uid: decodedToken.uid,
          email: decodedToken.email,
          email_verified: decodedToken.email_verified
        });
        if (!decodedToken.email) {
          return res.status(400).json({
            error: "Firebase user has no email",
            code: "EMAIL_MISSING"
          });
        }
        console.log("\u{1F50D} [DEBUG] Loading user from Supabase...");
        const { user, role } = await getOrCreateSupabaseUser(
          decodedToken.uid,
          decodedToken.email
        );
        console.log("\u2705 [DEBUG] User loaded from Supabase:", {
          userId: user?.id,
          email: user?.email,
          role,
          hasUser: !!user
        });
        console.log("\u{1F50D} [DEBUG] Checking role authorization:", {
          currentRole: role,
          requiredRoles: ["admin", "teacher"],
          isAuthorized: role === "admin" || role === "teacher"
        });
        if (role !== "admin" && role !== "teacher") {
          console.error("\u274C [DEBUG] Authorization FAILED - Invalid role:", {
            email: decodedToken.email,
            role,
            uid: decodedToken.uid,
            route: req.path
          });
          return res.status(403).json({
            error: "Teacher/Admin privileges required",
            code: "TEACHER_REQUIRED",
            details: "This route is only accessible to teachers and administrators"
          });
        }
        req.firebaseUser = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          role,
          emailVerified: decodedToken.email_verified || false
        };
        console.log("\u2705 Teacher authenticated (Firebase):", {
          email: decodedToken.email,
          role,
          route: req.path
        });
        return next();
      } catch (firebaseError) {
        console.error("\u274C [DEBUG] Firebase authentication FAILED:", {
          error: firebaseError.message,
          code: firebaseError.code,
          stack: firebaseError.stack?.split("\n")[0],
          route: req.path
        });
        return res.status(401).json({
          error: "Firebase authentication failed",
          code: "FIREBASE_AUTH_FAILED",
          details: firebaseError.message
        });
      }
    }
    console.error("\u274C [DEBUG] No Firebase authentication token provided:", {
      hasAuthHeader: !!authHeader,
      route: req.path,
      method: req.method
    });
    return res.status(401).json({
      error: "Firebase authentication required",
      code: "AUTH_REQUIRED",
      details: "Please provide Firebase ID token in Authorization header (Bearer <token>)"
    });
  } catch (error) {
    console.error("\u274C Teacher authentication error:", error.message);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Authentication token expired",
        code: "TOKEN_EXPIRED",
        details: "Please re-authenticate to continue"
      });
    }
    return res.status(403).json({
      error: error.message || "Authentication failed",
      code: "AUTH_FAILED",
      details: "Unable to verify teacher credentials"
    });
  }
}, "requireTeacher");
var requireAdmin2 = /* @__PURE__ */ __name(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required - missing Authorization header",
        code: "AUTH_REQUIRED",
        details: "Admin routes require Firebase ID token in Authorization: Bearer <token>"
      });
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await firebaseAdminService.verifyIdToken(idToken);
    if (!decodedToken.email) {
      return res.status(400).json({
        error: "Firebase user has no email",
        code: "EMAIL_MISSING"
      });
    }
    const { user, role } = await getOrCreateSupabaseUser(
      decodedToken.uid,
      decodedToken.email
    );
    if (role !== "admin") {
      console.warn("\u26A0\uFE0F Non-admin user attempted to access admin route:", {
        email: decodedToken.email,
        role,
        uid: decodedToken.uid,
        route: req.path
      });
      return res.status(403).json({
        error: "Admin privileges required",
        code: "ADMIN_REQUIRED",
        details: "This route is only accessible to administrators"
      });
    }
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: "admin",
      emailVerified: decodedToken.email_verified || false
    };
    console.log("\u2705 Admin authenticated:", {
      email: decodedToken.email,
      role,
      route: req.path
    });
    next();
  } catch (error) {
    console.error("\u274C Admin authentication failed:", error.message);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Authentication token expired",
        code: "TOKEN_EXPIRED",
        details: "Please re-authenticate to continue"
      });
    }
    return res.status(403).json({
      error: error.message || "Authentication failed",
      code: "AUTH_FAILED",
      details: "Unable to verify admin credentials"
    });
  }
}, "requireAdmin");
var requireStudent = /* @__PURE__ */ __name(async (req, res, next) => {
  try {
    console.log("\u{1F50D} [DEBUG] requireStudent middleware called:", {
      path: req.path,
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? "Bearer [REDACTED]" : "MISSING",
        origin: req.headers.origin,
        referer: req.headers.referer
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("\u274C [DEBUG] No Firebase authentication token provided:", {
        hasAuthHeader: !!authHeader,
        route: req.path,
        method: req.method
      });
      return res.status(401).json({
        error: "Firebase authentication required",
        code: "AUTH_REQUIRED",
        details: "Please provide Firebase ID token in Authorization header (Bearer <token>)"
      });
    }
    const idToken = authHeader.split("Bearer ")[1];
    try {
      console.log("\u{1F50D} [DEBUG] Attempting Firebase token verification...");
      const decodedToken = await firebaseAdminService.verifyIdToken(idToken);
      console.log("\u2705 [DEBUG] Firebase token verified:", {
        uid: decodedToken.uid,
        email: decodedToken.email,
        email_verified: decodedToken.email_verified
      });
      if (!decodedToken.email) {
        return res.status(400).json({
          error: "Firebase user has no email",
          code: "EMAIL_MISSING"
        });
      }
      console.log("\u{1F50D} [DEBUG] Loading user from Supabase...");
      const { user, role } = await getOrCreateSupabaseUser(
        decodedToken.uid,
        decodedToken.email
      );
      console.log("\u2705 [DEBUG] User loaded from Supabase:", {
        userId: user?.id,
        email: user?.email,
        role,
        hasUser: !!user
      });
      console.log("\u{1F50D} [DEBUG] Checking role authorization:", {
        currentRole: role,
        requiredRole: "student",
        isAuthorized: role === "student"
      });
      if (role !== "student") {
        console.error("\u274C [DEBUG] Authorization FAILED - Invalid role:", {
          email: decodedToken.email,
          role,
          uid: decodedToken.uid,
          route: req.path
        });
        return res.status(403).json({
          error: "Student privileges required",
          code: "STUDENT_REQUIRED",
          details: "This route is only accessible to students"
        });
      }
      req.firebaseUser = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: "student",
        emailVerified: decodedToken.email_verified || false
      };
      console.log("\u2705 Student authenticated (Firebase):", {
        email: decodedToken.email,
        role,
        route: req.path
      });
      return next();
    } catch (firebaseError) {
      console.error("\u274C [DEBUG] Firebase authentication FAILED:", {
        error: firebaseError.message,
        code: firebaseError.code,
        stack: firebaseError.stack?.split("\n")[0],
        route: req.path
      });
      return res.status(401).json({
        error: "Firebase authentication failed",
        code: "FIREBASE_AUTH_FAILED",
        details: firebaseError.message
      });
    }
  } catch (error) {
    console.error("\u274C Student authentication error:", error.message);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Authentication token expired",
        code: "TOKEN_EXPIRED",
        details: "Please re-authenticate to continue"
      });
    }
    return res.status(403).json({
      error: error.message || "Authentication failed",
      code: "AUTH_FAILED",
      details: "Unable to verify student credentials"
    });
  }
}, "requireStudent");

// server/middleware/validation.middleware.ts
var validateRequest = /* @__PURE__ */ __name((schema, target = "body") => {
  return (req, res, next) => {
    try {
      let dataToValidate;
      switch (target) {
        case "body":
          dataToValidate = req.body;
          break;
        case "query":
          dataToValidate = req.query;
          break;
        case "params":
          dataToValidate = req.params;
          break;
        default:
          dataToValidate = req.body;
      }
      const validatedData = schema.parse(dataToValidate);
      if (target === "body") {
        req.validatedBody = validatedData;
      } else if (target === "query") {
        req.validatedQuery = validatedData;
      } else if (target === "params") {
        req.validatedParams = validatedData;
      }
      next();
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: error.errors.map((err) => ({
            path: err.path.join("."),
            message: err.message,
            code: err.code
          }))
        });
      }
      console.error("Unexpected validation error:", error);
      return res.status(500).json({
        error: "Internal validation error",
        code: "VALIDATION_INTERNAL_ERROR"
      });
    }
  };
}, "validateRequest");
var emailSchema = external_exports.object({
  email: external_exports.string().email("Invalid email format").min(5, "Email must be at least 5 characters").max(255, "Email must not exceed 255 characters").transform((email) => email.toLowerCase().trim())
});
var loginSchema = external_exports.object({
  email: external_exports.string().email("Invalid email format").min(5, "Email must be at least 5 characters").transform((email) => email.toLowerCase().trim()),
  password: external_exports.string().min(1, "Password is required").optional()
  // Optional during transition period
});
var createEcosSessionSchema = external_exports.object({
  scenarioId: external_exports.string().min(1, "Scenario ID is required").max(255, "Scenario ID too long"),
  studentEmail: external_exports.string().email("Invalid student email format").transform((email) => email.toLowerCase().trim()).optional()
});
var ecosMessageSchema = external_exports.object({
  message: external_exports.string().min(1, "Message content is required").max(1e4, "Message too long (max 10,000 characters)"),
  role: external_exports.enum(["user", "assistant", "system"]).default("user"),
  type: external_exports.enum(["text", "image", "file"]).default("text")
});
var ecosEvaluationSchema = external_exports.object({
  criteria: external_exports.record(external_exports.string(), external_exports.number().min(0).max(100)).optional().default({}),
  responses: external_exports.array(external_exports.string()).optional().default([]),
  notes: external_exports.string().max(5e3, "Notes too long (max 5,000 characters)").optional()
});
var createStudentSchema = external_exports.object({
  email: external_exports.string().email("Invalid email format").min(5, "Email must be at least 5 characters").max(255, "Email must not exceed 255 characters").transform((email) => email.toLowerCase().trim()),
  name: external_exports.string().min(2, "Name must be at least 2 characters").max(100, "Name must not exceed 100 characters").optional(),
  role: external_exports.enum(["student", "teacher"]).default("student")
});
var emailQuerySchema = external_exports.object({
  email: external_exports.string().email("Invalid email format").transform((email) => email.toLowerCase().trim())
});
var paginationQuerySchema = external_exports.object({
  page: external_exports.string().regex(/^\d+$/, "Page must be a number").transform((val) => parseInt(val, 10)).refine((val) => val > 0, "Page must be greater than 0").default("1"),
  limit: external_exports.string().regex(/^\d+$/, "Limit must be a number").transform((val) => parseInt(val, 10)).refine((val) => val > 0 && val <= 100, "Limit must be between 1 and 100").default("20")
});
var sessionIdParamSchema = external_exports.object({
  sessionId: external_exports.string().min(1, "Session ID is required").regex(/^session_\d+_[a-z0-9]+$/, "Invalid session ID format")
});
var userIdParamSchema = external_exports.object({
  userId: external_exports.string().min(1, "User ID is required").max(255, "User ID too long")
});
var scenarioQuerySchema = external_exports.object({
  category: external_exports.string().max(50, "Category too long").optional(),
  difficulty: external_exports.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  tags: external_exports.string().transform((str) => str.split(",").map((tag) => tag.trim()).filter(Boolean)).optional()
});
var createTrainingSessionSchema = external_exports.object({
  email: external_exports.string().email("Valid email is required"),
  title: external_exports.string().min(3, "Title must be at least 3 characters").max(200, "Title too long"),
  description: external_exports.string().max(1e3, "Description too long").optional(),
  scenarioIds: external_exports.array(external_exports.union([external_exports.string(), external_exports.number()])).min(1, "At least one scenario is required").max(10, "Too many scenarios (max 10)").transform((ids) => ids.map((id) => typeof id === "number" ? id : parseInt(id.toString()))),
  studentEmails: external_exports.array(external_exports.string().email()).optional().default([]).refine((emails) => emails.length >= 0, "Student emails must be valid")
});
var validateEmailQuery = validateRequest(emailQuerySchema, "query");
var validateEmailBody = validateRequest(emailSchema, "body");
var validateLogin = validateRequest(loginSchema, "body");
var validateCreateStudent = validateRequest(createStudentSchema, "body");
var validateCreateEcosSession = validateRequest(createEcosSessionSchema, "body");
var validateEcosMessage = validateRequest(ecosMessageSchema, "body");
var validateEcosEvaluation = validateRequest(ecosEvaluationSchema, "body");
var validateSessionIdParam = validateRequest(sessionIdParamSchema, "params");
var validatePaginationQuery = validateRequest(paginationQuerySchema, "query");
var validateScenarioQuery = validateRequest(scenarioQuerySchema, "query");
var validateCreateTrainingSession = validateRequest(createTrainingSessionSchema, "body");
var validateRequestSize = /* @__PURE__ */ __name((maxSizeBytes = 1024 * 1024) => {
  return (req, res, next) => {
    const contentLength = req.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      return res.status(413).json({
        error: "Request too large",
        code: "REQUEST_TOO_LARGE",
        maxSize: `${Math.round(maxSizeBytes / 1024)}KB`
      });
    }
    next();
  };
}, "validateRequestSize");
var validateContentType = /* @__PURE__ */ __name((allowedTypes = ["application/json"]) => {
  return (req, res, next) => {
    const contentType = req.get("content-type");
    if (req.method !== "GET" && req.method !== "DELETE" && !contentType) {
      return res.status(400).json({
        error: "Content-Type header required",
        code: "CONTENT_TYPE_REQUIRED"
      });
    }
    if (contentType && !allowedTypes.some((type) => contentType.includes(type))) {
      return res.status(415).json({
        error: "Unsupported media type",
        code: "UNSUPPORTED_MEDIA_TYPE",
        allowedTypes
      });
    }
    next();
  };
}, "validateContentType");

// server/middleware/rate-limit.middleware.ts
var _InMemoryRateLimiter = class _InMemoryRateLimiter {
  constructor() {
    this.requests = /* @__PURE__ */ new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1e3);
  }
  cleanup() {
    const now = Date.now();
    for (const [key, info] of this.requests) {
      if (now > info.resetTime) {
        this.requests.delete(key);
      }
    }
  }
  hit(key, windowMs) {
    const now = Date.now();
    const existing = this.requests.get(key);
    if (!existing || now > existing.resetTime) {
      const resetTime = now + windowMs;
      this.requests.set(key, {
        count: 1,
        resetTime,
        firstRequest: now
      });
      return { count: 1, resetTime, exceeded: false };
    }
    existing.count++;
    this.requests.set(key, existing);
    return {
      count: existing.count,
      resetTime: existing.resetTime,
      exceeded: false
      // Will be determined by the rate limiter
    };
  }
  reset(key) {
    this.requests.delete(key);
  }
  getStats() {
    const memoryUsage = process.memoryUsage();
    return {
      totalKeys: this.requests.size,
      memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
    };
  }
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requests.clear();
  }
};
__name(_InMemoryRateLimiter, "InMemoryRateLimiter");
var InMemoryRateLimiter = _InMemoryRateLimiter;
var globalRateLimiter = new InMemoryRateLimiter();
var _RateLimiter = class _RateLimiter {
  constructor(config) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      message: config.message || "Too many requests, please try again later",
      standardHeaders: config.standardHeaders ?? true,
      legacyHeaders: config.legacyHeaders ?? false,
      skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
      skipFailedRequests: config.skipFailedRequests ?? false,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator
    };
  }
  defaultKeyGenerator(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.ip || req.connection.remoteAddress || "unknown";
    return `rate_limit:${ip}`;
  }
  middleware() {
    return (req, res, next) => {
      const key = this.config.keyGenerator(req);
      const result = globalRateLimiter.hit(key, this.config.windowMs);
      const isExceeded = result.count > this.config.maxRequests;
      const resetTimeSeconds = Math.ceil((result.resetTime - Date.now()) / 1e3);
      if (this.config.standardHeaders) {
        res.set({
          "RateLimit-Limit": this.config.maxRequests.toString(),
          "RateLimit-Remaining": Math.max(0, this.config.maxRequests - result.count).toString(),
          "RateLimit-Reset": new Date(result.resetTime).toISOString()
        });
      }
      if (this.config.legacyHeaders) {
        res.set({
          "X-RateLimit-Limit": this.config.maxRequests.toString(),
          "X-RateLimit-Remaining": Math.max(0, this.config.maxRequests - result.count).toString(),
          "X-RateLimit-Reset": Math.ceil(result.resetTime / 1e3).toString()
        });
      }
      if (isExceeded) {
        res.set("Retry-After", resetTimeSeconds.toString());
        return res.status(429).json({
          error: this.config.message,
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: resetTimeSeconds,
          limit: this.config.maxRequests,
          windowMs: this.config.windowMs,
          resetTime: new Date(result.resetTime).toISOString()
        });
      }
      next();
    };
  }
  reset(req) {
    const key = this.config.keyGenerator(req);
    globalRateLimiter.reset(key);
  }
};
__name(_RateLimiter, "RateLimiter");
var RateLimiter = _RateLimiter;
var authRateLimit = new RateLimiter({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  maxRequests: process.env.NODE_ENV === "production" ? 5 : 50,
  // More lenient in development
  message: "Too many authentication attempts, please try again later",
  skipSuccessfulRequests: true
  // Only count failed attempts
});
var firebaseAuthRateLimit = new RateLimiter({
  windowMs: 1 * 60 * 1e3,
  // 1 minute (shorter window for development)
  maxRequests: process.env.NODE_ENV === "production" ? 20 : 1e3,
  // Very lenient in development
  message: "Too many Firebase authentication requests, please try again later",
  skipSuccessfulRequests: true
  // Only count failed attempts in development
});
var apiRateLimit = new RateLimiter({
  windowMs: 1 * 60 * 1e3,
  // 1 minute
  maxRequests: 120,
  // 120 requests per minute - Increased for load testing
  message: "API rate limit exceeded, please slow down"
});
var generalRateLimit = new RateLimiter({
  windowMs: 1 * 60 * 1e3,
  // 1 minute
  maxRequests: 2e3,
  // 2000 requests per minute (global) - Increased for load testing
  message: "Rate limit exceeded, please try again later"
});
var perUserRateLimit = new RateLimiter({
  windowMs: 1 * 60 * 1e3,
  // 1 minute
  maxRequests: 120,
  // 120 requests per minute per user (2 per second average) - Increased for load testing
  message: "Too many requests from this user, please try again later",
  keyGenerator: /* @__PURE__ */ __name((req) => {
    const email = req.query.email || req.body?.email || req.body?.studentEmail || req.params?.email || req.headers["x-user-email"] || "anonymous";
    if (email === "anonymous" || !email) {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = forwarded ? forwarded.split(",")[0].trim() : req.ip || req.connection.remoteAddress || "unknown";
      return `per_user_rate_limit:ip:${ip}`;
    }
    return `per_user_rate_limit:email:${email.toLowerCase()}`;
  }, "keyGenerator")
});
var strictRateLimit = new RateLimiter({
  windowMs: 1 * 60 * 1e3,
  // 1 minute
  maxRequests: 10,
  // 10 requests per minute
  message: "Rate limit exceeded for this operation"
});
var ecosEvaluationRateLimit = new RateLimiter({
  windowMs: 1 * 60 * 1e3,
  // 1 minute
  maxRequests: 10,
  // 10 evaluations per minute per session/email combo
  message: "Rate limit exceeded for this evaluation",
  keyGenerator: /* @__PURE__ */ __name((req) => {
    const email = (req.query.email || "").toLowerCase() || "unknown";
    const sessionId = req.params?.sessionId || "unknown";
    return `ecos_eval:${email}:${sessionId}`;
  }, "keyGenerator")
});
var emailBasedRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1e3,
  // 5 minutes
  maxRequests: 30,
  // 30 requests per 5 minutes per email
  message: "Too many requests for this email address",
  keyGenerator: /* @__PURE__ */ __name((req) => {
    const email = req.query.email || req.body?.email || "unknown";
    return `email_rate_limit:${email.toLowerCase()}`;
  }, "keyGenerator")
});
var ecosSessionRateLimit = new RateLimiter({
  windowMs: 10 * 60 * 1e3,
  // 10 minutes
  maxRequests: 20,
  // 20 ECOS operations per 10 minutes
  message: "Too many ECOS operations, please wait before creating more sessions",
  keyGenerator: /* @__PURE__ */ __name((req) => {
    const email = req.query.email || req.body?.email || req.ip || "unknown";
    return `ecos_rate_limit:${email.toLowerCase()}`;
  }, "keyGenerator")
});

// server/middleware/circuit-breaker.middleware.ts
var _CircuitBreakerError = class _CircuitBreakerError extends Error {
  constructor(message, state) {
    super(message);
    this.state = state;
    this.name = "CircuitBreakerError";
  }
};
__name(_CircuitBreakerError, "CircuitBreakerError");
var CircuitBreakerError = _CircuitBreakerError;
var _DatabaseCircuitBreaker = class _DatabaseCircuitBreaker {
  constructor(options = {}) {
    this.state = "CLOSED" /* CLOSED */;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = Date.now();
    this.requestCount = 0;
    this.options = {
      failureThreshold: 10,
      // Reasonable threshold - not too aggressive
      recoveryTimeMs: 6e4,
      // 1 minute recovery time for proper database recovery
      monitoringPeriodMs: 3e5,
      // 5 minutes monitoring window for stability
      expectedFailureRate: 0.5,
      // 50% failure rate threshold - reasonable for database issues
      ...options
    };
    this.startupGracePeriod = 6e4;
    this.startupTime = Date.now();
  }
  async execute(operation, fallback) {
    if (Date.now() - this.startupTime < this.startupGracePeriod) {
      try {
        return await operation();
      } catch (error) {
        console.log("\u26A0\uFE0F Startup grace period - ignoring failure for circuit breaker");
        throw error;
      }
    }
    if (this.state === "OPEN" /* OPEN */) {
      if (this.shouldAttemptReset()) {
        this.state = "HALF_OPEN" /* HALF_OPEN */;
        console.log("Circuit breaker moved to HALF_OPEN state - attempting recovery");
      } else {
        if (fallback) {
          console.log("Circuit breaker OPEN - using fallback");
          return await fallback();
        }
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN. Service unavailable. Will retry after ${Math.ceil((this.lastFailureTime + this.options.recoveryTimeMs - Date.now()) / 1e3)}s`,
          this.state
        );
      }
    }
    this.requestCount++;
    try {
      const result = await this.executeWithTimeout(operation, 3e4);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback && this.state === "OPEN" /* OPEN */) {
        console.log("Circuit breaker opened due to failure - using fallback");
        return await fallback();
      }
      throw error;
    }
  }
  async executeWithTimeout(operation, timeoutMs) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Operation timeout")), timeoutMs);
    });
    return Promise.race([operation(), timeoutPromise]);
  }
  onSuccess() {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();
    if (this.state === "HALF_OPEN" /* HALF_OPEN */) {
      console.log("Circuit breaker recovered - moving to CLOSED state");
      this.state = "CLOSED" /* CLOSED */;
    }
  }
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === "HALF_OPEN" /* HALF_OPEN */) {
      console.log("Circuit breaker failure during recovery - moving back to OPEN state");
      this.state = "OPEN" /* OPEN */;
      return;
    }
    if (this.shouldOpenCircuit()) {
      console.log(`Circuit breaker opening due to ${this.failureCount} failures`);
      this.state = "OPEN" /* OPEN */;
    }
  }
  shouldOpenCircuit() {
    if (this.failureCount >= this.options.failureThreshold) {
      return true;
    }
    const now = Date.now();
    const timeSinceLastSuccess = now - this.lastSuccessTime;
    if (timeSinceLastSuccess > this.options.monitoringPeriodMs && this.requestCount > 10) {
      const failureRate = this.failureCount / this.requestCount;
      return failureRate > this.options.expectedFailureRate;
    }
    return false;
  }
  shouldAttemptReset() {
    const now = Date.now();
    return now - this.lastFailureTime >= this.options.recoveryTimeMs;
  }
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.state === "OPEN" /* OPEN */ ? this.lastFailureTime + this.options.recoveryTimeMs : null
    };
  }
  reset() {
    this.state = "CLOSED" /* CLOSED */;
    this.failureCount = 0;
    this.requestCount = 0;
    this.lastSuccessTime = Date.now();
    console.log("Circuit breaker manually reset");
  }
};
__name(_DatabaseCircuitBreaker, "DatabaseCircuitBreaker");
var DatabaseCircuitBreaker = _DatabaseCircuitBreaker;
var databaseCircuitBreaker = new DatabaseCircuitBreaker({
  failureThreshold: 10,
  // Not too aggressive - allow some transient failures
  recoveryTimeMs: 6e4,
  // 1 minute recovery time for proper database recovery
  monitoringPeriodMs: 3e5,
  // 5 minutes monitoring window for better stability
  expectedFailureRate: 0.5
  // 50% failure rate before opening - reasonable for database issues
});

// server/middleware/error-handler.middleware.ts
init_logger_service();
var _APIError = class _APIError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR" /* INTERNAL_ERROR */, details) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = /* @__PURE__ */ new Date();
  }
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId
    };
  }
  // Factory methods for common errors
  static badRequest(message, details) {
    return new _APIError(message, 400, "INVALID_REQUEST" /* INVALID_REQUEST */, details);
  }
  static unauthorized(message = "Authentication required") {
    return new _APIError(message, 401, "AUTH_REQUIRED" /* AUTH_REQUIRED */);
  }
  static forbidden(message = "Permission denied") {
    return new _APIError(message, 403, "PERMISSION_DENIED" /* PERMISSION_DENIED */);
  }
  static notFound(message = "Resource not found") {
    return new _APIError(message, 404, "RESOURCE_NOT_FOUND" /* RESOURCE_NOT_FOUND */);
  }
  static validationError(message, details) {
    return new _APIError(message, 400, "VALIDATION_ERROR" /* VALIDATION_ERROR */, details);
  }
  static databaseError(message) {
    return new _APIError(message, 503, "DATABASE_ERROR" /* DATABASE_ERROR */);
  }
  static circuitBreakerOpen(message) {
    return new _APIError(message, 503, "CIRCUIT_BREAKER_OPEN" /* CIRCUIT_BREAKER_OPEN */);
  }
  static rateLimitExceeded(message) {
    return new _APIError(message, 429, "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */);
  }
  static internal(message = "Internal server error") {
    return new _APIError(message, 500, "INTERNAL_ERROR" /* INTERNAL_ERROR */);
  }
  static sessionNotFound(message = "Session not found") {
    return new _APIError(message, 404, "SESSION_NOT_FOUND" /* SESSION_NOT_FOUND */);
  }
  static scenarioNotFound(message = "Scenario not found") {
    return new _APIError(message, 404, "SCENARIO_NOT_FOUND" /* SCENARIO_NOT_FOUND */);
  }
  static evaluationFailed(message = "Evaluation failed") {
    return new _APIError(message, 422, "EVALUATION_FAILED" /* EVALUATION_FAILED */);
  }
  static externalServiceError(message, details) {
    return new _APIError(message, 503, "EXTERNAL_SERVICE_ERROR" /* EXTERNAL_SERVICE_ERROR */, details);
  }
};
__name(_APIError, "APIError");
var APIError = _APIError;
var _ErrorHandler = class _ErrorHandler {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== "production";
    this.correlationIdHeader = "x-correlation-id";
  }
  // Request ID generation middleware
  addRequestId() {
    return (req, res, next) => {
      const requestId = req.headers[this.correlationIdHeader] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.requestId = requestId;
      res.setHeader(this.correlationIdHeader, requestId);
      next();
    };
  }
  // Main error handler middleware
  handleError() {
    return (error, req, res, next) => {
      const requestId = req.requestId;
      let apiError;
      if (error instanceof APIError) {
        apiError = error;
      } else if (error instanceof external_exports.ZodError) {
        apiError = this.handleZodError(error);
      } else if (error instanceof CircuitBreakerError) {
        apiError = this.handleCircuitBreakerError(error);
      } else if (error.name === "ValidationError") {
        apiError = APIError.validationError(error.message);
      } else if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        apiError = APIError.databaseError("Database connection failed");
      } else if (error.statusCode || error.status) {
        const statusCode = error.statusCode || error.status;
        const code = this.mapStatusCodeToErrorCode(statusCode);
        apiError = new APIError(error.message || "Request failed", statusCode, code);
      } else {
        apiError = APIError.internal(
          this.isDevelopment ? error.message : "An unexpected error occurred"
        );
      }
      apiError.requestId = requestId;
      this.logError(error, req, apiError);
      const response = {
        error: apiError.message,
        code: apiError.code,
        statusCode: apiError.statusCode,
        timestamp: apiError.timestamp.toISOString(),
        path: req.path,
        method: req.method,
        requestId: apiError.requestId,
        details: apiError.details
      };
      if (this.isDevelopment && error.stack) {
        response.stack = error.stack;
      }
      res.status(apiError.statusCode).json(response);
    };
  }
  // Handle unhandled promise rejections
  setupGlobalHandlers() {
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Promise Rejection", { reason, promise: promise.toString() });
      if (process.env.NODE_ENV === "production") {
        logger.error("Shutting down due to unhandled promise rejection");
        process.exit(1);
      }
    });
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
      process.exit(1);
    });
  }
  // Async wrapper to catch promise rejections
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
  handleZodError(error) {
    const details = error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
      value: err.path.length > 0 ? err.path.reduce((obj, key) => obj?.[key], error) : void 0,
      constraint: err.code
    }));
    return APIError.validationError("Request validation failed", details);
  }
  handleCircuitBreakerError(error) {
    return APIError.circuitBreakerOpen(error.message);
  }
  mapStatusCodeToErrorCode(statusCode) {
    switch (statusCode) {
      case 400:
        return "INVALID_REQUEST" /* INVALID_REQUEST */;
      case 401:
        return "AUTH_REQUIRED" /* AUTH_REQUIRED */;
      case 403:
        return "PERMISSION_DENIED" /* PERMISSION_DENIED */;
      case 404:
        return "RESOURCE_NOT_FOUND" /* RESOURCE_NOT_FOUND */;
      case 429:
        return "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */;
      case 503:
        return "DATABASE_UNAVAILABLE" /* DATABASE_UNAVAILABLE */;
      default:
        return "INTERNAL_ERROR" /* INTERNAL_ERROR */;
    }
  }
  logError(originalError, req, apiError) {
    const logData = {
      requestId: apiError.requestId,
      method: req.method,
      path: req.path,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      error: {
        message: apiError.message,
        code: apiError.code,
        statusCode: apiError.statusCode,
        stack: this.isDevelopment ? originalError.stack : void 0
      },
      query: req.query,
      body: this.sanitizeBody(req.body)
    };
    if (apiError.statusCode >= 500) {
      logger.error("API Error - Server", logData);
    } else if (apiError.statusCode >= 400) {
      logger.warn("API Error - Client", logData);
    }
  }
  sanitizeBody(body) {
    if (!body || typeof body !== "object") return body;
    const sanitized = { ...body };
    const sensitiveFields = ["password", "token", "apiKey", "secret", "auth"];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    }
    return sanitized;
  }
  // 404 handler for undefined routes
  notFoundHandler() {
    return (req, res, next) => {
      const error = APIError.notFound(`Route ${req.method} ${req.path} not found`);
      next(error);
    };
  }
  // Health check for error handling system
  healthCheck() {
    return (req, res) => {
      res.status(200).json({
        errorHandler: {
          status: "healthy",
          environment: this.isDevelopment ? "development" : "production",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    };
  }
};
__name(_ErrorHandler, "ErrorHandler");
var ErrorHandler = _ErrorHandler;
var errorHandler = new ErrorHandler();
var asyncHandler = errorHandler.asyncHandler.bind(errorHandler);
var addRequestId = errorHandler.addRequestId.bind(errorHandler);
var handleError = errorHandler.handleError.bind(errorHandler);
var notFoundHandler = errorHandler.notFoundHandler.bind(errorHandler);

// server/routes.ts
init_logger_service();
init_openai_service();
async function registerRoutes(app) {
  const httpServer = createServer(app);
  const inMemoryUsers = /* @__PURE__ */ new Map();
  async function findOrCreateStudent(email) {
    try {
      try {
        if (inMemoryUsers.has(email)) {
          const user = inMemoryUsers.get(email);
          return { userId: user.userId, isNewUser: false };
        }
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        inMemoryUsers.set(email, { userId, createdAt: /* @__PURE__ */ new Date() });
        return { userId, isNewUser: true };
      } catch (dbError) {
        console.log("Database not available, using in-memory storage");
        if (inMemoryUsers.has(email)) {
          const user = inMemoryUsers.get(email);
          return { userId: user.userId, isNewUser: false };
        }
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        inMemoryUsers.set(email, { userId, createdAt: /* @__PURE__ */ new Date() });
        return { userId, isNewUser: true };
      }
    } catch (error) {
      console.error("Error in findOrCreateStudent:", error);
      throw error;
    }
  }
  __name(findOrCreateStudent, "findOrCreateStudent");
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "ecos-api",
      version: "1.0.0"
    });
  });
  app.get("/api/teacher/auth-check", requireAdmin2, (req, res) => {
    app.get("/api/debug/auth-test", requireTeacher, async (req2, res2) => {
      try {
        res2.json({
          success: true,
          message: "Authentication successful!",
          user: {
            uid: req2.firebaseUser?.uid,
            email: req2.firebaseUser?.email,
            role: req2.firebaseUser?.role,
            emailVerified: req2.firebaseUser?.emailVerified
          },
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (error) {
        res2.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    res.status(200).json({
      message: "Teacher authentication successful",
      email: req.firebaseUser?.email,
      role: req.firebaseUser?.role,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/auth/login", authRateLimit.middleware(), validateContentType(), validateRequestSize(), validateLogin, async (req, res) => {
    try {
      const { email, password } = req.validatedBody || req.body;
      if (!isAdminAuthorized(email)) {
        return res.status(401).json({
          error: "Invalid credentials",
          code: "INVALID_CREDENTIALS"
        });
      }
      const token = authService.generateToken(email);
      res.status(200).json({
        message: "Login successful",
        token,
        user: {
          email,
          isAdmin: true
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        error: "Login failed",
        code: "LOGIN_FAILED"
      });
    }
  });
  app.post("/api/auth/verify", authenticateToken, async (req, res) => {
    res.status(200).json({
      message: "Token valid",
      user: req.user
    });
  });
  app.get("/api/auth/profile", authenticateToken, async (req, res) => {
    res.status(200).json({
      user: req.user,
      adminEmails: authService.getAdminEmails()
    });
  });
  app.get("/api/auth/check-admin", asyncHandler(async (req, res) => {
    const email = req.query.email;
    if (!email) {
      throw APIError.badRequest("Email parameter required");
    }
    const isAdmin = authService.isAdmin(email);
    res.status(200).json({
      isAdmin,
      email: email.toLowerCase().trim()
    });
  }));
  app.post("/api/auth/firebase-login", firebaseAuthRateLimit.middleware(), async (req, res) => {
    try {
      const firebaseReq = req;
      await new Promise((resolve, reject) => {
        verifyFirebaseToken(firebaseReq, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      res.status(200).json({
        user: {
          uid: firebaseReq.firebaseUser.uid,
          email: firebaseReq.firebaseUser.email,
          role: firebaseReq.firebaseUser.role,
          emailVerified: firebaseReq.firebaseUser.emailVerified
        },
        jwtToken: firebaseReq.jwtToken,
        message: "Firebase authentication successful"
      });
    } catch (error) {
      console.error("\u274C Firebase login error:", error);
      res.status(403).json({
        error: error.message || "Firebase authentication failed",
        code: "FIREBASE_LOGIN_FAILED"
      });
    }
  });
  app.post("/api/auth/firebase-register", firebaseAuthRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          error: "Email and password are required",
          code: "MISSING_CREDENTIALS"
        });
      }
      const emailRegex2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex2.test(email)) {
        return res.status(400).json({
          error: "Invalid email format",
          code: "INVALID_EMAIL"
        });
      }
      if (password.length < 6) {
        return res.status(400).json({
          error: "Password must be at least 6 characters",
          code: "WEAK_PASSWORD"
        });
      }
      const { firebaseAdminService: firebaseAdminService2 } = await Promise.resolve().then(() => (init_firebase_admin_service(), firebase_admin_service_exports));
      const existingUser = await firebaseAdminService2.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          error: "Email already in use",
          code: "EMAIL_IN_USE"
        });
      }
      const firebaseUser = await firebaseAdminService2.createUser(email, password);
      const supabaseUser = await unifiedDb.createUser({
        email,
        firebaseUid: firebaseUser.uid,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null
      });
      await unifiedDb.setUserRole(supabaseUser.id, "student");
      const jwtToken = authService.generateToken(email);
      res.status(201).json({
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: "student",
          emailVerified: false
        },
        jwtToken,
        message: "User registered successfully"
      });
    } catch (error) {
      console.error("\u274C Firebase registration error:", error);
      res.status(500).json({
        error: error.message || "Registration failed",
        code: "REGISTRATION_FAILED"
      });
    }
  });
  app.post("/api/admin/sync-scenarios", requireAdmin2, asyncHandler(async (req, res) => {
    console.log(`\u{1F504} Syncing scenarios from Pinecone for admin: ${req.firebaseUser?.email}`);
    await scenarioSyncService.syncScenariosFromPinecone();
    res.status(200).json({
      message: "Synchronisation des sc\xE9narios termin\xE9e avec succ\xE8s",
      success: true
    });
  }));
  app.get("/api/admin/test-db", requireAdmin2, async (req, res) => {
    try {
      console.log(`\u{1F527} Testing database connection for admin: ${req.firebaseUser?.email}`);
      await unifiedDb.initialize();
      const scenarios = await unifiedDb.getScenarios();
      res.status(200).json({
        connected: true,
        scenarios,
        count: scenarios.length,
        message: `Connexion Supabase r\xE9ussie - ${scenarios.length} sc\xE9narios trouv\xE9s`
      });
    } catch (error) {
      console.error("Error connecting to Supabase:", error);
      res.status(500).json({
        message: "Erreur de connexion \xE0 la base de donn\xE9es Supabase",
        error: error.message,
        connected: false,
        code: "DB_CONNECTION_FAILED"
      });
    }
  });
  app.get("/api/student/available-scenarios", requireStudent, async (req, res) => {
    try {
      const email = req.firebaseUser.email;
      console.log(`\u{1F527} Fetching scenarios for student: ${email}`);
      const scenarios = await scenarioSyncService.getScenariosForStudent(email);
      console.log(`\u2705 Returning ${scenarios.length} scenario(s) for student ${email}`);
      res.status(200).json({
        scenarios,
        connected: true,
        source: "database"
      });
    } catch (error) {
      console.error("Error fetching student scenarios:", error);
      res.status(500).json({
        message: "Erreur de connexion \xE0 la base de donn\xE9es",
        error: error.message,
        connected: false
      });
    }
  });
  app.get("/api/teacher/scenarios", requireTeacher, async (req, res) => {
    console.log("\u2705 [ADMIN-ACCESS] Authorized admin:", req.firebaseUser?.email);
    try {
      console.log("\u{1F527} Fetching teacher scenarios using unified database...");
      const scenarios = await unifiedDb.getScenarios();
      res.status(200).json({
        scenarios,
        connected: true,
        source: "unified-database"
      });
    } catch (error) {
      console.error("Error fetching teacher scenarios:", error);
      res.status(200).json({
        scenarios: [],
        connected: false,
        source: "error-fallback",
        message: "Service temporarily unavailable",
        error: error.message
      });
    }
  });
  app.get("/api/ecos/scenarios", async (req, res) => {
    try {
      console.log("\u{1F527} Fetching scenarios via /api/ecos/scenarios using unified database...");
      const scenarios = await unifiedDb.getScenarios();
      res.status(200).json({
        scenarios,
        connected: true,
        source: "unified-database-ecos-endpoint"
      });
    } catch (error) {
      console.error("Error fetching scenarios via /api/ecos/scenarios:", error);
      res.status(200).json({
        scenarios: [],
        connected: false,
        source: "error-fallback-ecos-endpoint",
        message: "Service temporarily unavailable",
        error: error.message
      });
    }
  });
  app.post("/api/ecos/scenarios", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { title, description, patientPrompt, evaluationCriteria, pineconeIndex } = req.body;
      if (!title || !description) {
        return res.status(400).json({
          message: "Titre et description requis",
          code: "MISSING_REQUIRED_FIELDS"
        });
      }
      console.log(`\u{1F504} Creating scenario for admin: ${req.firebaseUser?.email}`);
      let parsedCriteria = null;
      if (evaluationCriteria) {
        try {
          if (typeof evaluationCriteria === "string") {
            parsedCriteria = JSON.parse(evaluationCriteria);
          } else if (typeof evaluationCriteria === "object") {
            parsedCriteria = evaluationCriteria;
          }
          if (!parsedCriteria || typeof parsedCriteria !== "object") {
            throw new Error("Evaluation criteria must be a valid object");
          }
        } catch (parseError) {
          return res.status(400).json({
            message: "Format JSON invalide pour les crit\xE8res d'\xE9valuation",
            error: parseError.message,
            code: "INVALID_JSON_FORMAT"
          });
        }
      }
      await unifiedDb.initialize();
      const newScenario = await unifiedDb.createScenario({
        title,
        description,
        patientPrompt: patientPrompt || null,
        evaluationCriteria: parsedCriteria,
        imageUrl: null,
        createdBy: req.firebaseUser.email
      });
      res.status(200).json({
        message: "Sc\xE9nario cr\xE9\xE9 avec succ\xE8s",
        scenario: newScenario,
        success: true
      });
    } catch (error) {
      console.error("Error creating scenario:", error);
      res.status(500).json({
        message: "Erreur lors de la cr\xE9ation du sc\xE9nario",
        error: error.message,
        code: "SCENARIO_CREATE_FAILED"
      });
    }
  });
  app.put("/api/ecos/scenarios/:id", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, patientPrompt, evaluationCriteria, pineconeIndex } = req.body;
      console.log(`\u{1F504} Updating scenario ${id} for admin: ${req.firebaseUser?.email}`);
      let parsedCriteria = null;
      if (evaluationCriteria) {
        try {
          if (typeof evaluationCriteria === "string") {
            parsedCriteria = JSON.parse(evaluationCriteria);
          } else if (typeof evaluationCriteria === "object") {
            parsedCriteria = evaluationCriteria;
          }
          if (!parsedCriteria || typeof parsedCriteria !== "object") {
            throw new Error("Evaluation criteria must be a valid object");
          }
        } catch (parseError) {
          return res.status(400).json({
            message: "Format JSON invalide pour les crit\xE8res d'\xE9valuation",
            error: parseError.message,
            code: "INVALID_JSON_FORMAT"
          });
        }
      }
      await unifiedDb.initialize();
      const updatedScenario = await unifiedDb.updateScenario(id, {
        title,
        description,
        patientPrompt: patientPrompt || null,
        evaluationCriteria: parsedCriteria,
        pineconeIndex: pineconeIndex || null
      });
      res.status(200).json({
        message: "Sc\xE9nario modifi\xE9 avec succ\xE8s",
        scenario: updatedScenario,
        success: true
      });
    } catch (error) {
      console.error("Error updating scenario:", error);
      res.status(500).json({
        message: "Erreur lors de la modification du sc\xE9nario",
        error: error.message,
        code: "SCENARIO_UPDATE_FAILED"
      });
    }
  });
  app.delete("/api/ecos/scenarios/:id", requireAdmin2, ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`\u{1F504} Deleting scenario ${id} for admin: ${req.firebaseUser?.email}`);
      await unifiedDb.initialize();
      await unifiedDb.deleteScenario(id);
      res.status(200).json({
        message: "Sc\xE9nario supprim\xE9 avec succ\xE8s",
        success: true
      });
    } catch (error) {
      console.error("Error deleting scenario:", error);
      res.status(500).json({
        message: "Erreur lors de la suppression du sc\xE9nario",
        error: error.message,
        code: "SCENARIO_DELETE_FAILED"
      });
    }
  });
  app.post("/api/ecos/generate-criteria", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { scenarioDescription } = req.body;
      if (!scenarioDescription) {
        return res.status(400).json({
          message: "Description du sc\xE9nario requise",
          code: "MISSING_SCENARIO_DESCRIPTION"
        });
      }
      console.log(`\u{1F504} Generating evaluation criteria for admin: ${req.firebaseUser?.email}`);
      const { promptGenService: promptGenService2 } = await Promise.resolve().then(() => (init_promptGen_service(), promptGen_service_exports));
      const criteria = await promptGenService2.generateEvaluationCriteria(scenarioDescription);
      res.status(200).json({
        message: "Crit\xE8res d'\xE9valuation g\xE9n\xE9r\xE9s avec succ\xE8s",
        criteria,
        success: true
      });
    } catch (error) {
      console.error("Error generating evaluation criteria:", error);
      res.status(500).json({
        message: "Erreur lors de la g\xE9n\xE9ration des crit\xE8res d'\xE9valuation",
        error: error.message,
        code: "CRITERIA_GENERATION_FAILED"
      });
    }
  });
  app.post("/api/teacher/generate-criteria", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { textCriteria, scenarioId } = req.body;
      if (!textCriteria) {
        return res.status(400).json({
          message: "Description des crit\xE8res d'\xE9valuation requise",
          code: "MISSING_TEXT_CRITERIA"
        });
      }
      console.log(`\u{1F504} Generating criteria for teacher ${req.firebaseUser?.email}`);
      console.log(`\u{1F4DD} Text criteria: ${textCriteria.substring(0, 100)}...`);
      const { promptGenService: promptGenService2 } = await Promise.resolve().then(() => (init_promptGen_service(), promptGen_service_exports));
      const generatedCriteria = await promptGenService2.generateEvaluationCriteria(textCriteria);
      console.log("\u2705 Generated criteria:", generatedCriteria);
      if (scenarioId) {
        console.log(`\u{1F4CA} Updating scenario ${scenarioId} with generated criteria`);
        try {
          await unifiedDb.initialize();
          const updatedScenario = await unifiedDb.updateScenario(scenarioId, {
            evaluationCriteria: generatedCriteria
          });
          console.log(`\u2705 Scenario ${scenarioId} updated successfully`);
          res.status(200).json({
            message: "Crit\xE8res d'\xE9valuation g\xE9n\xE9r\xE9s et synchronis\xE9s avec succ\xE8s",
            criteria: generatedCriteria,
            scenarioUpdated: true,
            scenarioId,
            scenarioTitle: updatedScenario.title
          });
        } catch (updateError) {
          console.error(`\u274C Failed to update scenario ${scenarioId}:`, updateError.message);
          res.status(200).json({
            message: "Crit\xE8res d'\xE9valuation g\xE9n\xE9r\xE9s avec succ\xE8s, mais la synchronisation avec la base de donn\xE9es a \xE9chou\xE9",
            criteria: generatedCriteria,
            scenarioUpdated: false,
            error: updateError.message,
            warning: `Le sc\xE9nario ${scenarioId} n'existe pas ou n'a pas pu \xEAtre mis \xE0 jour`
          });
        }
      } else {
        res.status(200).json({
          message: "Crit\xE8res d'\xE9valuation g\xE9n\xE9r\xE9s avec succ\xE8s",
          criteria: generatedCriteria,
          scenarioUpdated: false
        });
      }
    } catch (error) {
      console.error("Error in teacher generate-criteria:", error);
      res.status(500).json({
        message: "Erreur lors de la g\xE9n\xE9ration des crit\xE8res d'\xE9valuation",
        error: error.message,
        code: "TEACHER_CRITERIA_GENERATION_FAILED",
        details: process.env.NODE_ENV === "development" ? error.stack : void 0
      });
    }
  });
  app.post("/api/teacher/update-pinecone-index", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { scenarioId, pineconeIndex } = req.body;
      if (!scenarioId) {
        return res.status(400).json({
          message: "ID du sc\xE9nario requis",
          code: "MISSING_SCENARIO_ID"
        });
      }
      if (!pineconeIndex) {
        return res.status(400).json({
          message: "Index Pinecone requis",
          code: "MISSING_PINECONE_INDEX"
        });
      }
      console.log(`\u{1F504} Updating Pinecone index for scenario ${scenarioId} to ${pineconeIndex} (admin: ${req.firebaseUser?.email})`);
      await unifiedDb.initialize();
      const updatedScenario = await unifiedDb.updateScenario(scenarioId, {
        pineconeIndex
      });
      console.log(`\u2705 Scenario ${scenarioId} Pinecone index updated successfully`);
      res.status(200).json({
        message: "Index Pinecone synchronis\xE9 avec succ\xE8s",
        scenarioId,
        pineconeIndex,
        scenarioTitle: updatedScenario.title,
        success: true
      });
    } catch (error) {
      console.error(`\u274C Failed to update Pinecone index for scenario:`, error.message);
      res.status(500).json({
        message: "Erreur lors de la synchronisation de l'index Pinecone",
        error: error.message,
        code: "PINECONE_INDEX_UPDATE_FAILED",
        success: false
      });
    }
  });
  app.get("/api/teacher/dashboard", requireTeacher, async (req, res) => {
    try {
      console.log("\u{1F527} Fetching teacher dashboard for:", req.firebaseUser?.email);
      const stats = await unifiedDb.getDashboardStats();
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(200).json({
        totalScenarios: 0,
        activeSessions: 0,
        completedSessions: 0,
        totalStudents: 0,
        message: "Service temporarily unavailable"
      });
    }
  });
  app.get("/api/admin/indexes", requireAdmin2, ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      console.log(`\u{1F504} Fetching Pinecone indexes for admin: ${req.firebaseUser?.email}`);
      const { pineconeService: pineconeService2 } = await Promise.resolve().then(() => (init_pinecone_service(), pinecone_service_exports));
      const indexes = await pineconeService2.listIndexes();
      console.log("\u2705 Indexes fetched successfully:", indexes);
      res.status(200).json({
        indexes,
        message: "Index r\xE9cup\xE9r\xE9s avec succ\xE8s",
        success: true
      });
    } catch (error) {
      console.error("Error fetching indexes:", error);
      res.status(500).json({
        message: "Erreur lors de la r\xE9cup\xE9ration des index Pinecone",
        error: error.message,
        code: "INDEXES_FETCH_FAILED"
      });
    }
  });
  app.post("/api/student", validateContentType(), validateRequestSize(), validateCreateStudent, async (req, res) => {
    const schema = external_exports.object({
      email: external_exports.string().email("Format d'email invalide")
    });
    try {
      const { email } = schema.parse(req.body);
      const { userId, isNewUser } = await findOrCreateStudent(email);
      res.status(200).json({
        message: "Compte \xE9tudiant trait\xE9 avec succ\xE8s",
        userId,
        isNewUser
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: "Donn\xE9es invalides", errors: error.errors });
      }
      console.error("Error in /api/student:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  });
  app.post("/api/student/auto-register", validateContentType(), validateRequestSize(), async (req, res) => {
    const schema = external_exports.object({
      email: external_exports.string().email("Format d'email invalide")
    });
    try {
      const { email } = schema.parse(req.body);
      console.log("\u{1F680} Auto-registering student:", email);
      const { userId, isNewUser } = await findOrCreateStudent(email);
      res.status(200).json({
        message: "Auto-registration successful",
        userId,
        isNewUser,
        email
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: "Invalid email format", errors: error.errors });
      }
      console.error("Error in /api/student/auto-register:", error);
      res.status(500).json({ message: "Auto-registration failed" });
    }
  });
  app.post("/api/session/start", async (req, res) => {
    return res.status(501).json({
      message: "Fonctionnalit\xE9 temporairement d\xE9sactiv\xE9e",
      details: "Cette fonctionnalit\xE9 sera r\xE9activ\xE9e une fois la base de donn\xE9es connect\xE9e"
    });
  });
  app.get("/api/student/scenarios", requireStudent, async (req, res) => {
    try {
      const email = req.firebaseUser.email;
      try {
        const scenarios = await scenarioSyncService.getAvailableScenarios();
        res.status(200).json({
          scenarios,
          training_sessions: [],
          source: "database"
        });
      } catch (dbError) {
        console.error("Database error:", dbError);
        res.status(200).json({
          scenarios: [],
          training_sessions: [],
          source: "database",
          error: "Database connection issue"
        });
      }
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: "Donn\xE9es invalides", errors: error.errors });
      }
      console.error("Error in /api/student/scenarios:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  });
  app.get("/api/admin/health", async (req, res) => {
    try {
      const healthResult = await unifiedDb.healthCheck();
      res.status(200).json({
        status: "healthy",
        message: "Database connection is working.",
        metrics: healthResult.metrics,
        uptime: healthResult.uptime
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(500).json({
        status: "unhealthy",
        message: "Database connection failed",
        error: error.message
      });
    }
  });
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const client = await unifiedDb.getClient();
      const { data: users, error } = await client.from("users").select("id, email, role, created_at, updated_at").order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      console.log(`\u{1F4CB} Admin ${req.firebaseUser?.email} fetched ${users?.length || 0} users`);
      res.status(200).json({
        users: users || [],
        count: users?.length || 0,
        success: true
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({
        error: "Failed to fetch users",
        code: "USERS_FETCH_FAILED",
        message: error.message
      });
    }
  });
  app.patch("/api/admin/users/:email/role", requireAdmin, validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { email } = req.params;
      const { role } = req.body;
      const validRoles = ["student", "teacher", "admin"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          error: "Invalid role",
          code: "INVALID_ROLE",
          message: `Role must be one of: ${validRoles.join(", ")}`
        });
      }
      if (!email || !email.includes("@")) {
        return res.status(400).json({
          error: "Invalid email",
          code: "INVALID_EMAIL"
        });
      }
      const client = await unifiedDb.getClient();
      const { data: existingUser, error: fetchError } = await client.from("users").select("id, email, role").eq("email", email.toLowerCase().trim()).single();
      if (fetchError || !existingUser) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
          message: `No user found with email: ${email}`
        });
      }
      if (req.firebaseUser?.email === email && existingUser.role === "admin" && role !== "admin") {
        return res.status(403).json({
          error: "Cannot demote yourself",
          code: "SELF_DEMOTION_FORBIDDEN",
          message: "Administrators cannot demote themselves"
        });
      }
      const { data: updatedUser, error: updateError } = await client.from("users").update({
        role,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("email", email.toLowerCase().trim()).select().single();
      if (updateError) {
        throw updateError;
      }
      console.log(`\u2705 Admin ${req.firebaseUser?.email} updated ${email} role: ${existingUser.role} \u2192 ${role}`);
      res.status(200).json({
        user: updatedUser,
        message: `User ${email} role updated to ${role}`,
        success: true
      });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({
        error: "Failed to update user role",
        code: "ROLE_UPDATE_FAILED",
        message: error.message
      });
    }
  });
  app.get("/api/teacher/students", requireTeacher, async (req, res) => {
    try {
      console.log("\u{1F527} Fetching teacher students for:", req.firebaseUser?.email);
      const students = await unifiedDb.getStudents();
      res.status(200).json({
        students,
        message: "Student list retrieved successfully",
        connected: true
      });
    } catch (error) {
      console.error("Error fetching teacher students:", error);
      res.status(200).json({
        students: [],
        message: "Service temporarily unavailable",
        connected: false,
        error: error.message
      });
    }
  });
  app.get("/api/teacher/realtime/active-students", requireTeacher, async (req, res) => {
    try {
      const teacherEmail = req.firebaseUser.email;
      const userRole = req.firebaseUser.role;
      const scenarioId = req.query.scenarioId ? parseInt(req.query.scenarioId) : void 0;
      const trainingSessionId = req.query.trainingSessionId ? parseInt(req.query.trainingSessionId) : void 0;
      console.log(`\u{1F4CA} Fetching active students for authenticated user: ${teacherEmail} (${userRole})`, {
        scenarioId,
        trainingSessionId
      });
      const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
      const activeStudents = await realtimeAnalysisService2.getActiveStudents(teacherEmail, {
        scenarioId,
        trainingSessionId,
        role: userRole
      });
      const transformedStudents = activeStudents.map((snapshot) => ({
        sessionId: snapshot.sessions?.session_id || `session_${snapshot.session_id}`,
        studentEmail: snapshot.sessions?.student_email || null,
        scenarioId: snapshot.scenario_id,
        scenarioTitle: snapshot.scenarios?.title || null,
        lastSnapshot: {
          timestamp: snapshot.timestamp,
          strengths: snapshot.strengths || [],
          weaknesses: snapshot.weaknesses || [],
          progressIndicators: snapshot.progress_indicators || {},
          exchangeCount: snapshot.exchange_count || 0,
          status: snapshot.status
        }
      }));
      res.status(200).json({
        students: transformedStudents,
        count: transformedStudents.length,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        filters: { scenarioId, trainingSessionId }
      });
    } catch (error) {
      console.error("Error fetching active students:", error);
      res.status(500).json({
        error: "Failed to fetch active students",
        code: "ACTIVE_STUDENTS_FETCH_FAILED",
        message: error.message
      });
    }
  });
  app.get("/api/teacher/realtime/student-progress/:sessionId", requireTeacher, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const teacherEmail = req.firebaseUser.email;
      console.log(`\u{1F4C8} Fetching progress history for session: ${sessionId} (teacher: ${teacherEmail})`);
      const session = await unifiedDb.getSessionByStringId(sessionId);
      if (!session) {
        return res.status(404).json({
          error: "Session not found",
          code: "SESSION_NOT_FOUND"
        });
      }
      const client = await unifiedDb.getClient();
      const { data: snapshots, error } = await client.from("student_progress_snapshots").select("id, session_id, student_email, scenario_id, timestamp, status, exchange_count, progress_indicators, strengths, weaknesses").eq("session_id", session.id).eq("student_email", session.student_email).order("timestamp", { ascending: true }).limit(100);
      if (error) {
        throw error;
      }
      const { data: evaluation, error: evalError } = await client.from("evaluations").select("global_score").eq("session_id", session.id).eq("student_email", session.student_email).maybeSingle();
      const transformedSnapshots = (snapshots || []).map((snapshot) => ({
        id: snapshot.id,
        sessionId: snapshot.session_id,
        studentEmail: snapshot.student_email,
        scenarioId: snapshot.scenario_id,
        timestamp: snapshot.timestamp,
        strengths: snapshot.strengths || [],
        weaknesses: snapshot.weaknesses || [],
        progressIndicators: snapshot.progress_indicators || {},
        exchangeCount: snapshot.exchange_count || 0,
        status: snapshot.status
      }));
      res.status(200).json({
        sessionId,
        snapshots: transformedSnapshots,
        count: transformedSnapshots.length,
        globalScore: evaluation?.global_score || null
        // Add global score from evaluation
      });
    } catch (error) {
      console.error("Error fetching student progress:", error);
      res.status(500).json({
        error: "Failed to fetch student progress",
        code: "STUDENT_PROGRESS_FETCH_FAILED",
        message: error.message
      });
    }
  });
  app.post("/api/teacher/realtime/generate-summary", requireTeacher, async (req, res) => {
    try {
      const teacherEmail = req.firebaseUser.email;
      const { sessionDate, scenarioId } = req.body;
      if (!sessionDate) {
        return res.status(400).json({
          error: "Session date is required",
          code: "MISSING_SESSION_DATE"
        });
      }
      console.log(`\u{1F4DD} Generating session summary for ${sessionDate} (authenticated teacher: ${teacherEmail})`);
      const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
      const summary = await realtimeAnalysisService2.generateSessionSummary(
        sessionDate,
        teacherEmail,
        scenarioId
      );
      res.status(200).json({
        summary,
        success: true
      });
    } catch (error) {
      console.error("Error generating session summary:", error);
      if (error.message.includes("No snapshots found") || error.message.includes("No activity found")) {
        return res.status(404).json({
          error: "No activity found for this date",
          code: "NO_DATA_FOUND",
          message: error.message
        });
      }
      res.status(500).json({
        error: "Failed to generate session summary",
        code: "SUMMARY_GENERATION_FAILED",
        message: error.message
      });
    }
  });
  app.get("/api/teacher/realtime/summary/:sessionDate", requireTeacher, async (req, res) => {
    try {
      const { sessionDate } = req.params;
      const { scenarioId } = req.query;
      const teacherEmail = req.firebaseUser.email;
      console.log(`\u{1F4CA} Fetching session summary for ${sessionDate} (authenticated teacher: ${teacherEmail})`);
      const client = await unifiedDb.getClient();
      let query = client.from("session_summaries").select("*").eq("session_date", sessionDate).eq("teacher_email", teacherEmail);
      if (scenarioId) {
        query = query.eq("scenario_id", parseInt(scenarioId));
      } else {
        query = query.is("scenario_id", null);
      }
      query = query.order("created_at", { ascending: false }).limit(1);
      const { data: summaries, error } = await query;
      if (error) {
        throw error;
      }
      if (!summaries || summaries.length === 0) {
        return res.status(404).json({
          error: "No summary found for this date",
          code: "SUMMARY_NOT_FOUND",
          message: "Generate a summary first using POST /api/teacher/realtime/generate-summary"
        });
      }
      const summary = summaries[0];
      const transformedSummary = {
        id: summary.id,
        sessionDate: summary.session_date,
        teacherEmail: summary.teacher_email,
        scenarioId: summary.scenario_id,
        totalStudents: summary.total_students,
        summaryData: summary.summary_data,
        commonStrengths: summary.common_strengths,
        commonWeaknesses: summary.common_weaknesses,
        trends: summary.trends,
        createdAt: summary.created_at,
        updatedAt: summary.updated_at
      };
      res.status(200).json({
        summary: transformedSummary,
        success: true
      });
    } catch (error) {
      console.error("Error fetching session summary:", error);
      res.status(500).json({
        error: "Failed to fetch session summary",
        code: "SUMMARY_FETCH_FAILED",
        message: error.message
      });
    }
  });
  app.get("/api/teacher/realtime/diagnostic", requireTeacher, async (req, res) => {
    try {
      const teacherEmail = req.firebaseUser.email;
      const client = await unifiedDb.getClient();
      console.log(`\u{1F50D} Running realtime diagnostic for teacher: ${teacherEmail}`);
      const { data: tableCheck, error: tableError } = await client.from("student_progress_snapshots").select("id").limit(1);
      const tableExists = !tableError || tableError.code !== "42P01";
      const { count: totalSnapshots, error: countError } = await client.from("student_progress_snapshots").select("*", { count: "exact", head: true });
      const { count: activeSnapshots, error: activeError } = await client.from("student_progress_snapshots").select("*", { count: "exact", head: true }).eq("status", "in_progress");
      const { data: recentSnapshots, error: recentError } = await client.from("student_progress_snapshots").select(`
          *,
          sessions!inner(student_email, scenario_id, session_id, status),
          scenarios(id, title, created_by)
        `).order("timestamp", { ascending: false }).limit(10);
      const { data: allRecentSessions, error: sessionsError } = await client.from("sessions").select("*").order("created_at", { ascending: false }).limit(20);
      const sessionsByStatus = {};
      allRecentSessions?.forEach((session) => {
        const status = session.status || "null";
        if (!sessionsByStatus[status]) sessionsByStatus[status] = [];
        sessionsByStatus[status].push(session);
      });
      const scenarios = await unifiedDb.getScenarios();
      const scenarioIdMapping = scenarios.map((s) => ({
        dbId: s.id,
        title: s.title,
        status: s.status || "unknown",
        created_by: s.created_by
      }));
      const sessionMessageCounts = allRecentSessions ? await Promise.all(
        allRecentSessions.slice(0, 10).map(async (session) => {
          try {
            const messages = await unifiedDb.getSessionMessages(session.session_id);
            const userMsgs = messages.filter((m) => m.role === "user").length;
            const assistantMsgs = messages.filter((m) => m.role === "assistant").length;
            const exchangeCount = Math.min(userMsgs, assistantMsgs);
            return {
              sessionId: session.session_id,
              dbId: session.id,
              studentEmail: session.student_email,
              scenarioId: session.scenario_id,
              status: session.status,
              messageCount: messages.length,
              exchangeCount,
              meetsMinimum: exchangeCount >= 2,
              userMessages: userMsgs,
              assistantMessages: assistantMsgs,
              created_at: session.created_at
            };
          } catch (err) {
            return {
              sessionId: session.session_id,
              error: err.message,
              status: session.status
            };
          }
        })
      ) : [];
      let realtimeServiceTest = null;
      const testableSession = sessionMessageCounts.find((s) => s.meetsMinimum && !s.error);
      if (testableSession) {
        try {
          console.log(`\u{1F9EA} Testing realtime analysis on session: ${testableSession.sessionId}`);
          const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
          await realtimeAnalysisService2.analyzeSessionProgress(testableSession.sessionId, {
            forceSnapshot: true,
            sessionStatus: "in_progress"
          });
          realtimeServiceTest = {
            success: true,
            testedSessionId: testableSession.sessionId,
            message: "Analysis completed successfully - check snapshots table"
          };
        } catch (err) {
          realtimeServiceTest = {
            success: false,
            testedSessionId: testableSession.sessionId,
            error: err.message,
            stack: process.env.NODE_ENV === "development" ? err.stack : void 0
          };
        }
      } else {
        realtimeServiceTest = {
          skipped: true,
          reason: "No session with enough messages (minimum 2 exchanges required)"
        };
      }
      return res.status(200).json({
        diagnostic: {
          tableExists,
          tableError: tableError ? { code: tableError.code, message: tableError.message } : null,
          counts: {
            totalSnapshots: totalSnapshots || 0,
            activeSnapshots: activeSnapshots || 0,
            totalRecentSessions: allRecentSessions?.length || 0
          },
          sessionsByStatus,
          statusBreakdown: Object.keys(sessionsByStatus).map((status) => ({
            status,
            count: sessionsByStatus[status].length,
            firstThree: sessionsByStatus[status].slice(0, 3).map((s) => ({
              sessionId: s.session_id,
              student: s.student_email,
              created: s.created_at
            }))
          })),
          scenarioIdMapping,
          recentSnapshots: recentSnapshots || [],
          sessionDetails: sessionMessageCounts,
          realtimeServiceTest,
          recommendations: [
            !tableExists && "\u274C La table student_progress_snapshots n'existe pas - ex\xE9cutez la migration",
            totalSnapshots === 0 && "\u26A0\uFE0F Aucun snapshot n'a \xE9t\xE9 cr\xE9\xE9 - v\xE9rifiez que les sessions ont au moins 2 \xE9changes",
            activeSnapshots === 0 && totalSnapshots > 0 && "\u26A0\uFE0F Snapshots existent mais aucun n'est actif (status=in_progress)",
            sessionMessageCounts.length > 0 && sessionMessageCounts.every((s) => !s.meetsMinimum && !s.error) && "\u26A0\uFE0F Les sessions n'ont pas assez d'\xE9changes (minimum 2 requis)",
            !sessionsByStatus["active"] && !sessionsByStatus["in_progress"] && '\u26A0\uFE0F PROBL\xC8ME: Aucune session avec status "active" ou "in_progress" - v\xE9rifiez les statuts dans la DB',
            realtimeServiceTest?.success === false && `\u274C ERREUR realtimeAnalysisService: ${realtimeServiceTest.error}`,
            realtimeServiceTest?.success && "\u2705 realtimeAnalysisService fonctionne correctement - snapshot cr\xE9\xE9",
            realtimeServiceTest?.skipped && `\u26A0\uFE0F Test ignor\xE9: ${realtimeServiceTest.reason}`
          ].filter(Boolean),
          statusInfo: {
            expectedStatuses: ["active", "in_progress", "completed"],
            actualStatuses: Object.keys(sessionsByStatus),
            hasActiveSessions: !!(sessionsByStatus["active"] || sessionsByStatus["in_progress"]),
            mismatch: !sessionsByStatus["active"] && !sessionsByStatus["in_progress"]
          }
        },
        teacherEmail,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      console.error("Error running realtime diagnostic:", error);
      return res.status(500).json({
        error: "Diagnostic failed",
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : void 0
      });
    }
  });
  app.post("/api/teacher/training-sessions/auto-assign-active-students", requireTeacher, async (req, res) => {
    try {
      const teacherEmail = req.firebaseUser.email;
      const { sessionDate } = req.body;
      const dateToUse = sessionDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const startOfDay = `${dateToUse}T00:00:00Z`;
      const endOfDay = `${dateToUse}T23:59:59Z`;
      logger.info(`\u{1F4CB} Auto-assigning active students for teacher: ${teacherEmail} on date: ${dateToUse}`);
      const client = await unifiedDb.getClient();
      const { data: activeSessions, error: sessionsError } = await client.from("sessions").select("student_email, scenario_id").gte("start_time", startOfDay).lte("start_time", endOfDay);
      if (sessionsError) {
        logger.error("Failed to fetch active sessions", { error: sessionsError });
        throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
      }
      if (!activeSessions || activeSessions.length === 0) {
        return res.status(200).json({
          success: false,
          message: `Aucune session active trouv\xE9e pour la date ${dateToUse}`,
          studentsAssigned: 0
        });
      }
      const uniqueStudentEmails = [...new Set(activeSessions.map((s) => s.student_email))];
      const uniqueScenarioIds = [...new Set(activeSessions.map((s) => s.scenario_id))];
      logger.info(`Found ${uniqueStudentEmails.length} unique students in ${activeSessions.length} sessions`);
      const sessionTitle = `Session Auto ${dateToUse} - Suivi Temps R\xE9el`;
      const { data: existingSessions, error: existingError } = await client.from("training_sessions").select("id, title, created_by").eq("created_by", teacherEmail).eq("title", sessionTitle);
      let trainingSessionId;
      if (existingSessions && existingSessions.length > 0) {
        trainingSessionId = existingSessions[0].id;
        logger.info(`Using existing training session: ${trainingSessionId}`);
      } else {
        const { data: newSession, error: createError } = await client.from("training_sessions").insert({
          title: sessionTitle,
          description: `Session de formation automatique cr\xE9\xE9e pour le suivi en temps r\xE9el des \xE9tudiants actifs le ${dateToUse}`,
          created_by: teacherEmail,
          status: "active",
          start_date: startOfDay,
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString(),
          // 1 year
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }).select().single();
        if (createError || !newSession) {
          logger.error("Failed to create training session", { error: createError });
          throw new Error(`Failed to create training session: ${createError?.message}`);
        }
        trainingSessionId = newSession.id;
        logger.info(`Created new training session: ${trainingSessionId}`);
        const { error: teacherError } = await client.from("training_session_teachers").insert({
          training_session_id: trainingSessionId,
          teacher_email: teacherEmail,
          role: "owner",
          assigned_by: teacherEmail,
          assigned_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (teacherError) {
          logger.warn("Failed to assign teacher (may already exist)", { error: teacherError });
        }
        if (uniqueScenarioIds.length > 0) {
          const scenarioAssignments = uniqueScenarioIds.map((scenarioId) => ({
            training_session_id: trainingSessionId,
            scenario_id: scenarioId
          }));
          const { error: scenariosError } = await client.from("training_session_scenarios").insert(scenarioAssignments);
          if (scenariosError) {
            logger.warn("Failed to assign scenarios", { error: scenariosError });
          }
        }
      }
      const studentAssignments = uniqueStudentEmails.map((email) => ({
        training_session_id: trainingSessionId,
        student_email: email,
        assigned_at: (/* @__PURE__ */ new Date()).toISOString(),
        status: "assigned"
      }));
      const { data: assignedStudents, error: assignError } = await client.from("training_session_students").upsert(studentAssignments, {
        onConflict: "training_session_id,student_email",
        ignoreDuplicates: false
      }).select();
      if (assignError) {
        logger.error("Failed to assign students", { error: assignError });
        throw new Error(`Failed to assign students: ${assignError.message}`);
      }
      logger.info(`\u2705 Successfully assigned ${uniqueStudentEmails.length} students to training session ${trainingSessionId}`);
      return res.status(200).json({
        success: true,
        message: `${uniqueStudentEmails.length} \xE9tudiants assign\xE9s avec succ\xE8s`,
        trainingSessionId,
        studentsAssigned: uniqueStudentEmails.length,
        sessionTitle,
        students: uniqueStudentEmails,
        scenarios: uniqueScenarioIds
      });
    } catch (error) {
      logger.error("Auto-assign active students failed", { error: error.message });
      return res.status(500).json({
        success: false,
        error: "Failed to auto-assign students",
        message: error.message
      });
    }
  });
  app.put("/api/training-sessions/:id", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      console.log(`\u{1F504} Updating training session ${id} for admin: ${req.firebaseUser?.email}`);
      const updatedSession = await unifiedDb.updateTrainingSession(id, updates, req.firebaseUser.email);
      res.status(200).json({
        trainingSession: updatedSession,
        message: "Training session updated successfully",
        success: true
      });
    } catch (error) {
      console.error("Error updating training session:", error);
      res.status(500).json({
        error: "Failed to update training session",
        code: "TRAINING_SESSION_UPDATE_FAILED"
      });
    }
  });
  app.delete("/api/training-sessions/:id", requireAdmin2, ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`\u{1F504} Deleting training session ${id} for admin: ${req.firebaseUser?.email}`);
      await unifiedDb.deleteTrainingSession(id, req.firebaseUser.email);
      res.status(200).json({
        message: "Training session deleted successfully",
        success: true
      });
    } catch (error) {
      console.error("Error deleting training session:", error);
      res.status(500).json({
        error: "Failed to delete training session",
        code: "TRAINING_SESSION_DELETE_FAILED"
      });
    }
  });
  app.get("/api/training-sessions", requireTeacher, ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      console.log(`\u{1F504} Fetching training sessions for teacher: ${req.firebaseUser?.email}`);
      const trainingSessions = await unifiedDb.getTrainingSessions(req.firebaseUser.email);
      res.status(200).json({
        trainingSessions,
        message: "Training sessions retrieved successfully",
        count: trainingSessions.length
      });
    } catch (error) {
      console.error("Error fetching training sessions:", error);
      res.status(500).json({
        error: "Failed to fetch training sessions",
        code: "TRAINING_SESSIONS_FETCH_FAILED"
      });
    }
  });
  app.get("/api/training-sessions/:id", requireTeacher, ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`\u{1F504} Fetching training session ${id} for teacher: ${req.firebaseUser?.email}`);
      const trainingSession = await unifiedDb.getTrainingSessionById(id, req.firebaseUser.email);
      if (!trainingSession) {
        return res.status(404).json({
          error: "Training session not found",
          code: "TRAINING_SESSION_NOT_FOUND"
        });
      }
      res.status(200).json({
        trainingSession,
        message: "Training session details retrieved successfully"
      });
    } catch (error) {
      console.error("Error fetching training session details:", error);
      res.status(500).json({
        error: "Failed to fetch training session details",
        code: "TRAINING_SESSION_DETAILS_FAILED"
      });
    }
  });
  app.get("/api/training-sessions/:id/sessions", requireTeacher, ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`\u{1F4DA} Fetching all ECOS sessions for training session ${id} (teacher: ${req.firebaseUser?.email})`);
      const sessions = await unifiedDb.getTrainingSessionSessions(parseInt(id));
      console.log(`\u2705 Retrieved ${sessions.length} ECOS sessions for training session ${id}`);
      res.status(200).json({
        sessions,
        count: sessions.length,
        trainingSessionId: parseInt(id),
        message: "Training session ECOS sessions retrieved successfully"
      });
    } catch (error) {
      console.error("Error fetching training session ECOS sessions:", error);
      res.status(500).json({
        error: "Failed to fetch training session ECOS sessions",
        code: "TRAINING_SESSION_SESSIONS_FAILED",
        details: process.env.NODE_ENV === "development" ? error.message : void 0
      });
    }
  });
  app.post("/api/training-sessions", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), validateCreateTrainingSession, async (req, res) => {
    try {
      const { title, description, scenarioIds, studentEmails } = req.body;
      console.log(`\u{1F504} Creating training session for admin: ${req.firebaseUser?.email}`);
      console.log(`\u{1F4DD} Session details:`, { title, description, scenarioIds, studentEmails });
      const newTrainingSession = await unifiedDb.createTrainingSession({
        title,
        description,
        createdBy: req.firebaseUser.email,
        scenarioIds: scenarioIds || [],
        studentEmails: studentEmails || []
      });
      res.status(201).json({
        trainingSession: newTrainingSession,
        message: "Training session created successfully",
        success: true
      });
    } catch (error) {
      console.error("Error creating training session:", error);
      res.status(500).json({
        error: "Failed to create training session",
        code: "TRAINING_SESSION_CREATE_FAILED"
      });
    }
  });
  app.get("/api/teachers", ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      const teachers = await unifiedDb.getTeachers();
      res.status(200).json({
        teachers,
        success: true
      });
    } catch (error) {
      console.error("Error getting teachers:", error);
      res.status(500).json({
        error: "Failed to get teachers",
        code: "TEACHERS_FETCH_FAILED"
      });
    }
  });
  app.get("/api/training-sessions/:id/teachers", ecosSessionRateLimit.middleware(), async (req, res) => {
    try {
      const { id } = req.params;
      const teachers = await unifiedDb.getSessionTeachers(parseInt(id));
      res.status(200).json({
        teachers,
        success: true
      });
    } catch (error) {
      console.error("Error getting session teachers:", error);
      res.status(500).json({
        error: "Failed to get session teachers",
        code: "SESSION_TEACHERS_FETCH_FAILED"
      });
    }
  });
  app.post("/api/training-sessions/:id/teachers", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { id } = req.params;
      const { teacherEmails } = req.body;
      if (!teacherEmails || !Array.isArray(teacherEmails)) {
        return res.status(400).json({
          error: "teacherEmails array is required",
          code: "MISSING_TEACHER_EMAILS"
        });
      }
      console.log(`\u{1F465} Admin ${req.firebaseUser?.email} assigning ${teacherEmails.length} teacher(s) to session ${id}`);
      await unifiedDb.assignTeachersToSession(parseInt(id), teacherEmails);
      res.status(200).json({
        message: `${teacherEmails.length} teacher(s) assigned successfully`,
        success: true
      });
    } catch (error) {
      console.error("Error assigning teachers to session:", error);
      res.status(500).json({
        error: "Failed to assign teachers to session",
        code: "SESSION_TEACHERS_ASSIGN_FAILED"
      });
    }
  });
  app.delete("/api/training-sessions/:id/teachers", requireAdmin2, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { id } = req.params;
      const { teacherEmails } = req.body;
      if (!teacherEmails || !Array.isArray(teacherEmails)) {
        return res.status(400).json({
          error: "teacherEmails array is required in request body",
          code: "MISSING_TEACHER_EMAILS"
        });
      }
      if (teacherEmails.length === 0) {
        return res.status(400).json({
          error: "teacherEmails array cannot be empty",
          code: "EMPTY_TEACHER_EMAILS"
        });
      }
      const emailRegex2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = teacherEmails.filter((email) => !emailRegex2.test(email));
      if (invalidEmails.length > 0) {
        return res.status(400).json({
          error: "Invalid email format",
          code: "INVALID_EMAIL_FORMAT",
          invalidEmails
        });
      }
      console.log(`\u{1F465} Admin ${req.firebaseUser?.email} removing ${teacherEmails.length} teacher(s) from session ${id}`);
      await unifiedDb.removeTeachersFromSession(parseInt(id), teacherEmails);
      res.status(200).json({
        message: `${teacherEmails.length} teacher(s) removed successfully`,
        success: true
      });
    } catch (error) {
      console.error("Error removing teachers from session:", error);
      res.status(500).json({
        error: "Failed to remove teachers from session",
        code: "SESSION_TEACHERS_REMOVE_FAILED"
      });
    }
  });
  app.post(
    "/api/training-sessions/with-teachers",
    requireTeacher,
    // Must be authenticated teacher
    validateContentType(),
    validateRequestSize(),
    async (req, res) => {
      try {
        const teacherEmail = req.firebaseUser.email;
        const { title, description, teacherEmails, scenarioIds, tokenExpiresAt } = req.body;
        if (!title || !scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
          return res.status(400).json({
            error: "Title and at least one scenario are required",
            code: "MISSING_REQUIRED_FIELDS"
          });
        }
        const { trainingSessionService: trainingSessionService2 } = await Promise.resolve().then(() => (init_training_session_service(), training_session_service_exports));
        const session = await trainingSessionService2.createTrainingSession({
          title,
          description: description || "",
          createdBy: teacherEmail,
          teacherEmails: Array.isArray(teacherEmails) ? teacherEmails : [],
          scenarioIds,
          tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : void 0
        });
        res.status(201).json({
          success: true,
          session,
          enrollmentUrl: session.enrollmentUrl,
          enrollmentToken: session.enrollmentToken,
          message: "Training session created successfully"
        });
      } catch (error) {
        console.error("\u274C Failed to create training session with teachers:", {
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({
          error: "Failed to create training session",
          code: "SESSION_CREATE_FAILED",
          message: error.message
        });
      }
    }
  );
  app.get("/api/enroll/:token", async (req, res) => {
    const startTime = Date.now();
    try {
      const { token } = req.params;
      console.log("\u2705 Enrollment link accessed:", { token, url: req.url });
      if (!token || !token.startsWith("ts_")) {
        console.warn("\u26A0\uFE0F Invalid enrollment token format:", { token });
        return res.status(400).json({
          error: "Invalid enrollment token format",
          code: "INVALID_TOKEN_FORMAT"
        });
      }
      const { trainingSessionService: trainingSessionService2 } = await Promise.resolve().then(() => (init_training_session_service(), training_session_service_exports));
      console.log("\u{1F50D} Fetching session by token:", { token });
      const session = await trainingSessionService2.getSessionByToken(token);
      const duration = Date.now() - startTime;
      if (!session) {
        console.error("\u274C Session not found for enrollment token:", {
          token,
          duration
        });
        return res.status(404).json({
          error: "Invalid enrollment link",
          code: "INVALID_TOKEN",
          message: "No training session found with this enrollment token"
        });
      }
      console.log("\u2705 Enrollment link validated successfully:", {
        token,
        sessionId: session.id,
        sessionTitle: session.title,
        duration
      });
      res.status(200).json({
        success: true,
        session
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error("\u274C Enrollment check failed:", {
        token: req.params.token,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        duration
      });
      if (error.message === "ENROLLMENT_LINK_EXPIRED") {
        return res.status(410).json({
          error: "Enrollment link has expired",
          code: "TOKEN_EXPIRED"
        });
      }
      res.status(500).json({
        error: "Failed to check enrollment link",
        code: "ENROLLMENT_CHECK_FAILED",
        message: error.message
      });
    }
  });
  app.post(
    "/api/enroll/:token",
    verifyFirebaseToken,
    // Student must be authenticated
    async (req, res) => {
      try {
        const { token } = req.params;
        const studentEmail = req.firebaseUser.email;
        if (!token || !token.startsWith("ts_")) {
          return res.status(400).json({
            error: "Invalid enrollment token format",
            code: "INVALID_TOKEN_FORMAT"
          });
        }
        const { trainingSessionService: trainingSessionService2 } = await Promise.resolve().then(() => (init_training_session_service(), training_session_service_exports));
        const result = await trainingSessionService2.enrollStudent(token, studentEmail);
        res.status(200).json({
          success: true,
          session: result.session,
          alreadyEnrolled: result.alreadyEnrolled,
          message: result.alreadyEnrolled ? "You are already enrolled in this training session" : "Successfully enrolled in training session"
        });
      } catch (error) {
        console.error("\u274C Student enrollment failed:", { error: error.message, stack: error.stack });
        if (error.message === "INVALID_ENROLLMENT_TOKEN") {
          return res.status(404).json({
            error: "Invalid enrollment link",
            code: "INVALID_TOKEN"
          });
        }
        if (error.message === "ENROLLMENT_LINK_EXPIRED") {
          return res.status(410).json({
            error: "Enrollment link has expired",
            code: "TOKEN_EXPIRED"
          });
        }
        res.status(500).json({
          error: "Failed to enroll student",
          code: "ENROLLMENT_FAILED",
          message: error.message
        });
      }
    }
  );
  app.get("/api/ecos/sessions", requireStudent, async (req, res) => {
    try {
      const email = req.firebaseUser.email;
      console.log(`\u{1F4DA} Fetching ECOS sessions for student: ${email}`);
      const sessions = await unifiedDb.getStudentSessions(email);
      console.log(`\u2705 Retrieved ${sessions.length} sessions for student ${email}`);
      res.status(200).json({
        sessions,
        count: sessions.length,
        message: "Sessions retrieved successfully"
      });
    } catch (error) {
      console.error("Error getting ECOS sessions:", error);
      res.status(500).json({
        error: "Failed to get ECOS sessions",
        code: "SESSIONS_GET_FAILED",
        details: process.env.NODE_ENV === "development" ? error.message : void 0
      });
    }
  });
  app.post("/api/ecos/sessions", requireStudent, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), validateCreateEcosSession, async (req, res) => {
    try {
      const studentEmail = req.firebaseUser.email;
      const { scenarioId } = req.validatedBody || req.body;
      if (!scenarioId) {
        return res.status(400).json({
          error: "scenarioId is required",
          code: "MISSING_REQUIRED_FIELDS"
        });
      }
      console.log(`\u{1F527} Creating session for student: ${studentEmail}, scenario: ${scenarioId}`);
      const sessionId = `session_${scenarioId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      try {
        const sessionData = await unifiedDb.createSession({
          sessionId,
          studentEmail,
          scenarioId: parseInt(scenarioId),
          status: "active"
        });
        console.log("\u2705 Created and stored ECOS session:", sessionId, "in database");
      } catch (dbError) {
        console.error("\u274C Failed to store session in database:", dbError.message);
        console.warn("\u26A0\uFE0F Session created in memory only due to database error");
      }
      res.status(201).json({
        sessionId,
        scenarioId: parseInt(scenarioId),
        studentEmail,
        status: "active",
        startTime: /* @__PURE__ */ new Date(),
        message: "ECOS session created successfully"
      });
    } catch (error) {
      console.error("Error creating ECOS session:", error);
      res.status(500).json({
        error: "Failed to create ECOS session",
        code: "SESSION_CREATE_FAILED"
      });
    }
  });
  app.get("/api/ecos/sessions/:sessionId", requireStudent, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = req.firebaseUser.email;
      try {
        let scenarioId = null;
        if (sessionId.startsWith("session_")) {
          const parts = sessionId.split("_");
          if (parts.length >= 2 && !isNaN(parseInt(parts[1]))) {
            scenarioId = parseInt(parts[1]);
          }
        }
        if (!scenarioId) {
          return res.status(400).json({
            error: "Invalid session ID format - cannot extract scenario ID",
            code: "INVALID_SESSION_ID"
          });
        }
        const scenarios = await unifiedDb.getScenarios();
        const scenario = scenarios.find((s) => s.id === scenarioId);
        if (!scenario) {
          return res.status(404).json({
            error: `Scenario ${scenarioId} not found in database`,
            code: "SCENARIO_NOT_FOUND"
          });
        }
        const cleanEvaluationCriteria = /* @__PURE__ */ __name((criteria) => {
          if (!criteria) return null;
          if (criteria.evaluation_criteria && Array.isArray(criteria.evaluation_criteria)) {
            console.log("\u2705 Using clean evaluation_criteria array format");
            return criteria.evaluation_criteria;
          }
          if (Array.isArray(criteria) || typeof criteria === "object" && !criteria.generatedText) {
            console.log("\u2705 Using existing clean criteria format");
            return criteria;
          }
          if (criteria.generatedText && typeof criteria.generatedText === "string") {
            try {
              console.log("\u{1F504} Parsing generatedText to extract evaluation criteria");
              const parsed = JSON.parse(criteria.generatedText.replace(/```json\n?|\n?```/g, ""));
              return parsed.evaluation_criteria || parsed;
            } catch (e) {
              console.warn("\u274C Failed to parse generatedText criteria, using original format");
              return criteria;
            }
          }
          return criteria;
        }, "cleanEvaluationCriteria");
        return res.status(200).json({
          session: {
            id: sessionId,
            status: "active",
            startTime: /* @__PURE__ */ new Date(),
            studentEmail: email,
            scenario: {
              id: scenario.id,
              title: scenario.title,
              description: scenario.description,
              patient_prompt: scenario.patient_prompt,
              evaluation_criteria: cleanEvaluationCriteria(scenario.evaluation_criteria)
            }
          },
          messages: [],
          totalMessages: 0,
          note: "Session with complete scenario data from database"
        });
      } catch (dbError) {
        console.error("\u274C Database error retrieving scenario:", dbError);
        return res.status(500).json({
          error: "Database error - unable to retrieve scenario data",
          code: "DATABASE_ERROR",
          details: process.env.NODE_ENV === "development" ? dbError.message : "Internal server error"
        });
      }
    } catch (error) {
      console.error("Error getting ECOS session:", error);
      res.status(500).json({
        error: "Failed to get ECOS session",
        code: "SESSION_GET_FAILED"
      });
    }
  });
  app.put("/api/ecos/sessions/:sessionId", requireStudent, validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { status } = req.body;
      const email = req.firebaseUser.email;
      if (!status) {
        return res.status(400).json({
          error: "Status is required",
          code: "MISSING_STATUS"
        });
      }
      console.log(`\u{1F4DD} Updating session ${sessionId} status to ${status} for ${email}`);
      try {
        await unifiedDb.updateSessionStatus(sessionId, status);
        console.log(`\u2705 Session ${sessionId} marked as ${status} in database`);
      } catch (dbError) {
        console.warn("\u26A0\uFE0F Failed to update session status in database:", dbError.message);
      }
      res.status(200).json({
        sessionId,
        status,
        updatedAt: /* @__PURE__ */ new Date(),
        message: "Session updated successfully"
      });
    } catch (error) {
      console.error("Error updating ECOS session:", error);
      res.status(500).json({
        error: "Failed to update ECOS session",
        code: "SESSION_UPDATE_FAILED"
      });
    }
  });
  app.post("/api/ecos/sessions/:sessionId/messages", requireStudent, apiRateLimit.middleware(), validateContentType(), validateRequestSize(), validateEcosMessage, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = req.firebaseUser.email;
      const { message, role, type } = req.body;
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      try {
        await unifiedDb.storeSessionMessage({
          sessionId,
          role: role || "user",
          question: message,
          response: "",
          content: message
        });
        console.log("\u2705 Stored user message in database for session:", sessionId);
      } catch (dbError) {
        console.warn("\u26A0\uFE0F Failed to store user message:", dbError.message);
      }
      const aiResponseContent = `I understand your message: "${message}". How can I assist you further in this medical scenario?`;
      const aiResponse = {
        id: `msg_ai_${Date.now()}`,
        sessionId,
        content: aiResponseContent,
        role: "assistant",
        type: "text",
        senderEmail: "system@ecos.ai",
        createdAt: /* @__PURE__ */ new Date()
      };
      try {
        await unifiedDb.storeSessionMessage({
          sessionId,
          role: "assistant",
          question: "",
          response: aiResponseContent,
          content: aiResponseContent
        });
        console.log("\u2705 Stored AI response in database for session:", sessionId);
      } catch (dbError) {
        console.warn("\u26A0\uFE0F Failed to store AI response:", dbError.message);
      }
      try {
        const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
        await realtimeAnalysisService2.analyzeSessionProgress(sessionId, {
          sessionStatus: "in_progress"
        });
        console.log("\u2705 Real-time analysis triggered for session:", sessionId);
      } catch (analysisError) {
        console.warn("\u26A0\uFE0F Real-time analysis failed (non-blocking):", analysisError.message);
      }
      res.status(201).json({
        userMessage: {
          id: messageId,
          sessionId,
          content: message,
          role: role || "user",
          type: type || "text",
          senderEmail: email,
          createdAt: /* @__PURE__ */ new Date()
        },
        aiResponse,
        message: "Message added to session successfully"
      });
    } catch (error) {
      console.error("Error adding message to ECOS session:", error);
      res.status(500).json({
        error: "Failed to add message to session",
        code: "MESSAGE_ADD_FAILED"
      });
    }
  });
  const slugifyId = /* @__PURE__ */ __name((value, fallback) => {
    if (!value) return fallback;
    return value.toString().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || fallback;
  }, "slugifyId");
  const normalizeText = /* @__PURE__ */ __name((value) => {
    return value ? value.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
  }, "normalizeText");
  const extractRelevantExcerpts2 = /* @__PURE__ */ __name((messages, maxExcerpts = 3) => {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }
    const excerpts = [];
    const totalMessages = messages.length;
    if (totalMessages <= maxExcerpts) {
      excerpts.push(...messages);
    } else {
      const indices = [
        0,
        // First exchange
        Math.floor(totalMessages / 2),
        // Middle
        totalMessages - 1
        // Last exchange
      ].slice(0, maxExcerpts);
      indices.forEach((index) => {
        if (messages[index]) {
          excerpts.push(messages[index]);
        }
      });
    }
    return excerpts.map((msg) => {
      let excerpt = "";
      let role = "";
      if (msg.role === "user") {
        excerpt = (msg.question || msg.content || "").toString().slice(0, 220);
        role = "\xC9tudiant";
      } else if (msg.role === "assistant") {
        excerpt = (msg.response || msg.content || "").toString().slice(0, 220);
        role = "Patient";
      } else {
        excerpt = (msg.question || msg.response || msg.content || "").toString().slice(0, 220);
        role = msg.role === "user" ? "\xC9tudiant" : "Patient";
      }
      return {
        role,
        rawRole: msg.role,
        excerpt,
        timestamp: msg.timestamp || msg.created_at || msg.updated_at || null
      };
    });
  }, "extractRelevantExcerpts");
  app.post("/api/ecos/sessions/:sessionId/evaluate", requireStudent, ecosEvaluationRateLimit.middleware(), validateContentType(), validateRequestSize(), validateEcosEvaluation, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = req.firebaseUser.email;
      const { evaluationJobService: evaluationJobService2 } = await Promise.resolve().then(() => (init_evaluation_job_service(), evaluation_job_service_exports));
      const job = evaluationJobService2.createJob({
        sessionId,
        email
      });
      console.log(`\u{1F680} Created async evaluation job ${job.jobId} for session ${sessionId}`);
      return res.status(202).json({
        jobId: job.jobId,
        sessionId,
        status: job.status,
        message: "Evaluation started in background",
        statusUrl: `/api/ecos/sessions/${sessionId}/evaluation/status`
      });
    } catch (error) {
      console.error("Error creating evaluation job:", error);
      return res.status(500).json({
        error: "Failed to start evaluation",
        code: "EVALUATION_START_FAILED"
      });
    }
  });
  app.post("/api/ecos/sessions/:sessionId/evaluate-sync", requireStudent, ecosEvaluationRateLimit.middleware(), validateContentType(), validateRequestSize(), validateEcosEvaluation, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = req.firebaseUser.email;
      const { criteria, responses } = req.body;
      const scenarioIdMatch = sessionId.match(/^session_(\d+)_/);
      const scenarioId = scenarioIdMatch ? parseInt(scenarioIdMatch[1]) : null;
      const scenarios = await unifiedDb.getScenarios();
      const scenario = scenarioId ? scenarios.find((s) => s.id === scenarioId) : null;
      console.log("\u{1F50D} [TRACE] Loaded scenario:", scenario?.id, scenario?.title);
      console.log("\u{1F50D} [TRACE] Scenario has evaluation_criteria?", !!scenario?.evaluation_criteria);
      const dbCriteria = scenario?.evaluation_criteria || null;
      const messages = await unifiedDb.getSessionMessages(sessionId, 50);
      if (!messages || messages.length === 0) {
        return res.status(400).json({
          error: "Pas assez d'\xE9changes pour une \xE9valuation - la session \xE9tait vide",
          code: "INSUFFICIENT_CONTENT",
          sessionId,
          messagesFound: messages?.length || 0
        });
      }
      const transcript = messages.map((msg, idx) => {
        let content = "";
        let role = "";
        if (msg.role === "user") {
          content = msg.question || msg.content || "";
          role = "\xC9tudiant";
        } else if (msg.role === "assistant") {
          content = msg.response || msg.content || "";
          role = "Patient";
        } else {
          content = msg.question || msg.response || msg.content || "";
          role = msg.role === "user" ? "\xC9tudiant" : "Patient";
          console.warn(`\u26A0\uFE0F Unexpected role '${msg.role}' in message #${idx}, using fallback logic`);
        }
        return `${role}: ${content.toString().trim()}`;
      }).join("\n---\n");
      console.log(`\u{1F4CA} Building evaluation from ${messages.length} messages for session ${sessionId}`);
      console.log(`\u{1F4DD} Transcript preview:`, transcript.substring(0, 200) + "...");
      const normalizeCriteria2 = /* @__PURE__ */ __name((raw) => {
        try {
          if (!raw) return [];
          if (raw.evaluation_criteria && Array.isArray(raw.evaluation_criteria)) {
            return raw.evaluation_criteria.map((c, i) => ({
              id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g, "_"),
              name: c.name || c.label || c.id || `Crit\xE8re ${i + 1}`,
              description: c.description || "",
              maxScore: typeof c.maxScore === "number" ? c.maxScore : 4,
              weight: typeof c.weight === "number" ? c.weight : typeof c.poids === "number" ? c.poids : null,
              indicators: Array.isArray(c.indicators) ? c.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(c.elements) ? c.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : c.description ? [c.description] : []
            }));
          }
          if (Array.isArray(raw)) {
            return raw.map((c, i) => ({
              id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g, "_"),
              name: c.name || c.label || c.id || `Crit\xE8re ${i + 1}`,
              description: c.description || "",
              maxScore: typeof c.maxScore === "number" ? c.maxScore : 4,
              weight: typeof c.weight === "number" ? c.weight : typeof c.poids === "number" ? c.poids : null,
              indicators: Array.isArray(c.indicators) ? c.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(c.elements) ? c.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : c.description ? [c.description] : []
            }));
          }
          if (raw.categories && Array.isArray(raw.categories)) {
            return raw.categories.map((category, i) => {
              const baseId = (category.id || category.name || `category_${i}`).toString().toLowerCase().replace(/\s+/g, "_");
              const indicators = Array.isArray(category.indicators) ? category.indicators.map((ind) => ind.description || ind.name || "").filter(Boolean) : [];
              return {
                id: baseId,
                name: category.name || category.id || `Cat\xE9gorie ${i + 1}`,
                description: indicators.length ? indicators.join(" ; ") : category.description || "",
                maxScore: typeof category.maxScore === "number" ? category.maxScore : 4,
                weight: typeof category.weight === "number" ? category.weight : typeof category.poids === "number" ? category.poids : null,
                indicators
              };
            });
          }
          if (raw.criteria && Array.isArray(raw.criteria)) {
            return raw.criteria.map((c, i) => ({
              id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g, "_"),
              name: c.name || c.label || c.id || `Crit\xE8re ${i + 1}`,
              description: c.description || "",
              maxScore: typeof c.maxScore === "number" ? c.maxScore : 4,
              weight: typeof c.weight === "number" ? c.weight : typeof c.poids === "number" ? c.poids : null,
              indicators: Array.isArray(c.indicators) ? c.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(c.elements) ? c.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : c.description ? [c.description] : []
            }));
          }
          if (typeof raw === "object") {
            return Object.keys(raw).map((k, i) => {
              const value = raw[k];
              const indicators = Array.isArray(value?.indicators) ? value.indicators.map((ind) => ind.description || ind.name || ind).filter(Boolean) : Array.isArray(value?.elements) ? value.elements.map((el) => typeof el === "string" ? el : el.description || el.name || "").filter(Boolean) : [];
              const weight = typeof value?.weight === "number" ? value.weight : typeof value?.poids === "number" ? value.poids : null;
              return {
                id: k.toLowerCase().replace(/\s+/g, "_"),
                name: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " "),
                description: typeof value === "string" ? value : value?.description || "",
                maxScore: 4,
                weight,
                indicators
              };
            });
          }
          return [];
        } catch {
          return [];
        }
      }, "normalizeCriteria");
      console.log("\u{1F50D} [TRACE] dbCriteria type:", typeof dbCriteria);
      console.log("\u{1F50D} [TRACE] dbCriteria is null?", dbCriteria === null);
      console.log("\u{1F50D} [TRACE] dbCriteria is array?", Array.isArray(dbCriteria));
      if (dbCriteria && typeof dbCriteria === "object") {
        console.log("\u{1F50D} [TRACE] dbCriteria keys:", Object.keys(dbCriteria));
        console.log("\u{1F50D} [TRACE] dbCriteria sample:", JSON.stringify(dbCriteria).substring(0, 500));
      } else {
        console.log("\u{1F50D} [TRACE] dbCriteria value:", dbCriteria);
      }
      const criteriaList = normalizeCriteria2(dbCriteria);
      console.log("\u{1F50D} [TRACE] criteriaList length:", criteriaList.length);
      if (criteriaList.length > 0) {
        console.log("\u{1F50D} [TRACE] First criterion:", JSON.stringify(criteriaList[0], null, 2));
        console.log("\u{1F50D} [TRACE] First criterion indicators:", criteriaList[0].indicators);
      } else {
        console.log("\u{1F50D} [TRACE] criteriaList is EMPTY - will use fallback");
      }
      const fallbackCriteria = [
        { id: "communication", name: "Communication", maxScore: 4 },
        { id: "clinical_reasoning", name: "Raisonnement Clinique", maxScore: 4 },
        { id: "empathy", name: "Empathie", maxScore: 4 },
        { id: "professionalism", name: "Professionnalisme", maxScore: 4 }
      ];
      const usedCriteria = criteriaList.length > 0 ? criteriaList : fallbackCriteria;
      console.log("\u{1F50D} [TRACE] Using criteriaList or fallback?", criteriaList.length > 0 ? "criteriaList" : "FALLBACK");
      console.log("\u{1F50D} [TRACE] usedCriteria length:", usedCriteria.length);
      console.log("\u{1F50D} [TRACE] usedCriteria[0]:", JSON.stringify(usedCriteria[0], null, 2));
      const systemPrompt = `Tu es un examinateur ECOS. \xC9value la performance de l'\xE9tudiant en te basant UNIQUEMENT sur la transcription fournie.

Consignes :
- Pour CHAQUE crit\xE8re, v\xE9rifie si l'\xE9tudiant a abord\xE9 les indicateurs sp\xE9cifiques list\xE9s
- Attribue une note enti\xE8re de 0 \xE0 4 bas\xE9e sur la couverture des indicateurs :
  * 0 = aucun indicateur trait\xE9
  * 1 = abord\xE9 superficiellement (< 25% des indicateurs)
  * 2 = partiellement trait\xE9 (25-50% des indicateurs)
  * 3 = bien trait\xE9 (50-75% des indicateurs)
  * 4 = ma\xEEtris\xE9 (> 75% des indicateurs avec qualit\xE9)
- Pour chaque crit\xE8re, identifie 2-3 points forts, 2-3 points faibles, 2-3 actions d'am\xE9lioration
- Pour chaque crit\xE8re, s\xE9lectionne 2-3 extraits PR\xC9CIS de la transcription qui illustrent les points faibles ou les points forts identifi\xE9s
- Les extraits doivent \xEAtre des citations EXACTES de la transcription (pas de paraphrase)
- Chaque extrait doit clairement d\xE9montrer pourquoi le crit\xE8re a re\xE7u ce score
- Justifie chaque note en citant des exemples pr\xE9cis de la transcription
- Fournis une synth\xE8se globale avec forces majeures, faiblesses prioritaires, recommandations actionnables

IMPORTANT: Base-toi sur les indicateurs sp\xE9cifiques fournis pour chaque crit\xE8re. Ne te contente pas de notions g\xE9n\xE9riques.

R\xE9ponds UNIQUEMENT en JSON valide sans texte avant/apr\xE8s.

Format JSON attendu :
{
  "criteria": [
    {
      "id": "crit_id",
      "name": "Nom du crit\xE8re",
      "score": number,
      "maxScore": 4,
      "strengths": ["point fort 1 avec r\xE9f\xE9rence \xE0 la transcription", "point fort 2", ...],
      "weaknesses": ["faiblesse 1 avec exemple", "faiblesse 2", ...],
      "actions": ["recommandation 1 actionnable", "recommandation 2", ...],
      "justification": "Justification d\xE9taill\xE9e citant des passages de la transcription",
      "evidence": [
        {"role": "\xC9tudiant" ou "Patient", "excerpt": "extrait exact de la transcription qui illustre une faiblesse ou un point fort"},
        {"role": "\xC9tudiant" ou "Patient", "excerpt": "autre extrait pertinent pour ce crit\xE8re"},
        ...
      ]
    }
  ],
  "overall": {
    "strengths": ["force majeure 1", "force majeure 2", ...],
    "weaknesses": ["faiblesse prioritaire 1", "faiblesse prioritaire 2", ...],
    "recommendations": ["recommandation 1", "recommandation 2", "recommandation 3"],
    "summary": "Synth\xE8se en 2-3 phrases r\xE9sumant la performance globale"
  },
  "overall_score_percent": number
}`;
      const rubricText = usedCriteria.map((c) => {
        const indicatorsList = c.indicators && c.indicators.length > 0 ? `
  Indicateurs \xE0 \xE9valuer:
${c.indicators.map((ind) => `  * ${ind}`).join("\n")}` : "";
        const weight = c.weight ? ` (pond\xE9ration: ${c.weight}%)` : "";
        return `- ${c.name} (id: ${c.id})${weight} \u2014 max ${c.maxScore}${indicatorsList}`;
      }).join("\n\n");
      const userPrompt = `Sc\xE9nario: ${scenario?.title || "Inconnu"}

Crit\xE8res d'\xE9valuation:
${rubricText}

Transcription de la session:
${transcript}`;
      let llmJson = null;
      try {
        const completion = await openaiService.createCompletion({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3,
          max_completion_tokens: 2e3,
          response_format: { type: "json_object" }
        });
        const content = completion.choices?.[0]?.message?.content || "{}";
        const cleanedContent = content.replace(/```json\s*\n?|```\s*$/g, "").trim();
        llmJson = JSON.parse(cleanedContent);
      } catch (err) {
        console.warn("\u26A0\uFE0F LLM evaluation parsing failed, using heuristic fallback. Error:", err.message);
      }
      const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const criteriaResults = llmJson?.criteria && Array.isArray(llmJson.criteria) ? llmJson.criteria : [];
      const clamp = /* @__PURE__ */ __name((n) => Math.max(0, Math.min(4, Math.round(Number(n) || 0))), "clamp");
      const toArray = /* @__PURE__ */ __name((value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map((entry) => (entry ?? "").toString()).filter((entry) => entry.trim().length > 0);
        return [value.toString()].filter(Boolean);
      }, "toArray");
      const conversationExcerpts = extractRelevantExcerpts2(messages, 3);
      const weightValues = usedCriteria.map((criterion) => {
        const weight = Number(criterion.weight);
        return Number.isFinite(weight) && weight > 0 ? weight : 1;
      });
      const weightSum = weightValues.reduce((sum, w) => sum + w, 0) || usedCriteria.length;
      const combinedCriteria = usedCriteria.map((criterion, index) => {
        const criterionId = criterion.id;
        const llmMatch = criteriaResults.find((entry) => {
          const entryId = (entry.id || "").toString().toLowerCase();
          const entryName = (entry.name || "").toString().toLowerCase();
          return entryId === criterionId || entryName === criterion.name.toLowerCase();
        }) || null;
        const llmScore = clamp(llmMatch?.score ?? llmMatch?.note ?? 2);
        const maxScore = typeof llmMatch?.maxScore === "number" ? llmMatch.maxScore : 4;
        const finalScore = llmScore;
        return {
          id: criterionId,
          name: criterion.name,
          description: criterion.description || "",
          indicators: criterion.indicators || [],
          weight: Math.round(weightValues[index] / weightSum * 1e4) / 100,
          // pourcentage arrondi à 2 décimales
          rawWeight: weightValues[index],
          maxScore,
          score: finalScore,
          rawScore: llmScore,
          strengths: toArray(llmMatch?.strengths),
          weaknesses: toArray(llmMatch?.weaknesses),
          actions: toArray(llmMatch?.actions || llmMatch?.recommendations),
          justification: (llmMatch?.justification || "").toString(),
          // Use LLM-provided evidence if available, otherwise fallback to generic excerpts
          evidence: Array.isArray(llmMatch?.evidence) && llmMatch.evidence.length > 0 ? llmMatch.evidence.map((ev) => ({
            role: ev.role || "\xC9tudiant",
            rawRole: ev.role === "Patient" ? "assistant" : "user",
            excerpt: (ev.excerpt || "").toString().slice(0, 220),
            timestamp: null
          })) : conversationExcerpts
        };
      });
      const weightedTotal = combinedCriteria.reduce((sum, criterion) => {
        return sum + criterion.score / criterion.maxScore * (criterion.rawWeight || 1);
      }, 0);
      const weightedPercent = Math.round(weightedTotal / weightSum * 100);
      const llmOverallPercent = typeof llmJson?.overall_score_percent === "number" ? Math.round(llmJson.overall_score_percent) : null;
      const overallScorePercent = llmOverallPercent ?? weightedPercent;
      const uniqueList = /* @__PURE__ */ __name((list, limit = 3) => {
        const seen = /* @__PURE__ */ new Set();
        const result = [];
        for (const item of list) {
          const trimmed = item.trim();
          if (!trimmed || seen.has(trimmed)) continue;
          seen.add(trimmed);
          result.push(trimmed);
          if (result.length >= limit) break;
        }
        return result;
      }, "uniqueList");
      const overallSection = llmJson?.overall || {};
      const aggregatedStrengths = uniqueList([
        ...toArray(overallSection.strengths || llmJson?.strengths),
        ...combinedCriteria.flatMap((criterion) => criterion.strengths)
      ]);
      const aggregatedWeaknesses = uniqueList([
        ...toArray(overallSection.weaknesses || llmJson?.weaknesses),
        ...combinedCriteria.flatMap((criterion) => criterion.weaknesses)
      ]);
      const aggregatedRecommendations = uniqueList([
        ...toArray(overallSection.recommendations || llmJson?.recommendations),
        ...combinedCriteria.flatMap((criterion) => criterion.actions)
      ]);
      if (aggregatedStrengths.length === 0) {
        if (overallScorePercent >= 75) {
          aggregatedStrengths.push("Performance globalement tr\xE8s satisfaisante");
          aggregatedStrengths.push("Bonne ma\xEEtrise des comp\xE9tences \xE9valu\xE9es");
        } else if (overallScorePercent >= 50) {
          aggregatedStrengths.push("Performance satisfaisante dans l'ensemble");
          aggregatedStrengths.push("Plusieurs comp\xE9tences correctement d\xE9montr\xE9es");
        } else {
          aggregatedStrengths.push("Certaines comp\xE9tences de base d\xE9montr\xE9es");
        }
      }
      if (aggregatedWeaknesses.length === 0) {
        if (overallScorePercent < 50) {
          aggregatedWeaknesses.push("Plusieurs comp\xE9tences n\xE9cessitent un renforcement significatif");
          aggregatedWeaknesses.push("Difficult\xE9 \xE0 d\xE9montrer la ma\xEEtrise des crit\xE8res \xE9valu\xE9s");
        } else if (overallScorePercent < 75) {
          aggregatedWeaknesses.push("Certains aspects n\xE9cessitent am\xE9lioration");
          aggregatedWeaknesses.push("Marge de progression sur plusieurs crit\xE8res");
        } else {
          aggregatedWeaknesses.push("Quelques d\xE9tails \xE0 peaufiner pour une ma\xEEtrise compl\xE8te");
        }
      }
      if (aggregatedRecommendations.length === 0) {
        if (overallScorePercent < 50) {
          aggregatedRecommendations.push("Revoir les fondamentaux de chaque crit\xE8re \xE9valu\xE9");
          aggregatedRecommendations.push("Pratiquer davantage les comp\xE9tences cliniques de base");
          aggregatedRecommendations.push("Solliciter un accompagnement p\xE9dagogique pour progresser");
        } else if (overallScorePercent < 75) {
          aggregatedRecommendations.push("Approfondir les comp\xE9tences sur les crit\xE8res les moins ma\xEEtris\xE9s");
          aggregatedRecommendations.push("Pratiquer r\xE9guli\xE8rement pour consolider les acquis");
          aggregatedRecommendations.push("Analyser les situations cliniques avec plus de rigueur");
        } else {
          aggregatedRecommendations.push("Continuer \xE0 pratiquer pour maintenir le niveau de comp\xE9tence");
          aggregatedRecommendations.push("Affiner les d\xE9tails pour viser l'excellence");
        }
      }
      const summaryText = (overallSection.summary || overallSection.comment || llmJson?.summary || "").toString();
      const evaluation = {
        overall_score: overallScorePercent,
        criteria_scores: combinedCriteria.reduce((acc, c) => {
          acc[c.id] = Math.round(c.score / c.maxScore * 100);
          return acc;
        }, {}),
        scores: combinedCriteria.reduce((acc, c) => {
          acc[c.id] = c.score;
          return acc;
        }, {}),
        criteria: combinedCriteria,
        feedback: aggregatedStrengths,
        recommendations: aggregatedRecommendations,
        weaknesses: aggregatedWeaknesses,
        summary: summaryText,
        llmScorePercent: llmOverallPercent ?? weightedPercent,
        weightedScorePercent: weightedPercent
      };
      try {
        await unifiedDb.createEvaluation({
          sessionId,
          scenarioId,
          studentEmail: email,
          scores: evaluation.scores,
          globalScore: overallScorePercent,
          strengths: Array.isArray(evaluation.feedback) ? evaluation.feedback : [],
          weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses : [],
          recommendations: Array.isArray(evaluation.recommendations) ? evaluation.recommendations : [],
          feedback: `\xC9valuation automatique - Score IA: ${overallScorePercent}%`,
          llmScorePercent: evaluation.llmScorePercent,
          criteriaDetails: evaluation.criteria
        });
        console.log(`\u2705 Stored evaluation for session ${sessionId} in database`);
        try {
          const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
          await realtimeAnalysisService2.finalizeSession(sessionId);
          console.log(`\u{1F4CA} Session ${sessionId} finalized for real-time dashboard`);
        } catch (finalizeError) {
          console.warn("\u26A0\uFE0F Failed to finalize session for dashboard (non-critical):", finalizeError);
        }
      } catch (dbError) {
        console.error(`\u274C Failed to store evaluation in database:`, {
          message: dbError?.message,
          code: dbError?.code,
          details: dbError?.details,
          hint: dbError?.hint,
          sessionId,
          studentEmail: email
        });
        return res.status(500).json({
          error: "Failed to store evaluation in database",
          code: "EVALUATION_STORAGE_FAILED",
          details: process.env.NODE_ENV === "development" ? dbError?.message : void 0,
          evaluation
          // Still return the computed evaluation
        });
      }
      res.status(200).json({
        evaluationId,
        sessionId,
        evaluation,
        message: "Session evaluated and stored successfully"
      });
    } catch (error) {
      console.error("Error evaluating ECOS session:", error);
      res.status(500).json({
        error: "Failed to evaluate session",
        code: "EVALUATION_FAILED"
      });
    }
  });
  app.get("/api/ecos/sessions/:sessionId/evaluation/status", requireStudent, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = req.firebaseUser.email;
      const { evaluationJobService: evaluationJobService2 } = await Promise.resolve().then(() => (init_evaluation_job_service(), evaluation_job_service_exports));
      const job = evaluationJobService2.getJobBySessionId(sessionId);
      if (!job) {
        const existingEvaluation = await unifiedDb.getEvaluation(sessionId);
        if (existingEvaluation) {
          return res.status(200).json({
            status: "completed",
            sessionId,
            message: "Evaluation already exists",
            result: {
              evaluationId: existingEvaluation.id,
              sessionId,
              evaluation: {
                overall_score: existingEvaluation.global_score,
                criteria_scores: existingEvaluation.scores || {},
                scores: existingEvaluation.scores || {},
                criteria: existingEvaluation.criteria_details || [],
                feedback: existingEvaluation.strengths || [],
                recommendations: existingEvaluation.recommendations || [],
                weaknesses: existingEvaluation.weaknesses || [],
                summary: existingEvaluation.feedback || "",
                llmScorePercent: existingEvaluation.llm_score_percent,
                weightedScorePercent: existingEvaluation.global_score
              }
            }
          });
        }
        return res.status(404).json({
          error: "Evaluation job not found",
          code: "JOB_NOT_FOUND",
          sessionId
        });
      }
      const response = {
        jobId: job.jobId,
        sessionId: job.sessionId,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      };
      if (job.status === "completed" && job.result) {
        response.result = job.result;
      } else if (job.status === "failed" && job.error) {
        response.error = job.error;
      }
      return res.status(200).json(response);
    } catch (error) {
      console.error("Error getting evaluation status:", error);
      return res.status(500).json({
        error: "Failed to get evaluation status",
        code: "STATUS_CHECK_FAILED"
      });
    }
  });
  app.get("/api/ecos/sessions/:sessionId/report", requireStudent, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const email = req.firebaseUser.email;
      const evaluationRecord = await unifiedDb.getEvaluation(sessionId);
      if (!evaluationRecord) {
        return res.status(404).json({
          error: "Aucune \xE9valuation enregistr\xE9e pour cette session",
          code: "EVALUATION_NOT_FOUND"
        });
      }
      const scenarioIdMatch = sessionId.match(/^session_(\d+)_/);
      const scenarioId = scenarioIdMatch ? parseInt(scenarioIdMatch[1]) : null;
      let scenarioTitle = "Sc\xE9nario inconnu";
      let evaluationCriteria = null;
      if (scenarioId) {
        try {
          const scenarios = await unifiedDb.getScenarios();
          const scenario = scenarios.find((s) => s.id === scenarioId);
          if (scenario) {
            scenarioTitle = scenario.title;
            evaluationCriteria = scenario.evaluation_criteria || null;
          }
        } catch (dbError) {
          console.warn("\u26A0\uFE0F Could not load scenario for evaluation report:", dbError.message);
        }
      }
      const messages = await unifiedDb.getSessionMessages(sessionId, 100);
      const storedScores = evaluationRecord.scores || {};
      const storedCriteriaDetails = Array.isArray(evaluationRecord.criteria_details) ? evaluationRecord.criteria_details : null;
      const criteria = Object.keys(storedScores).map((key) => {
        const scoreValue = Number(storedScores[key] ?? 0);
        const storedDetail = storedCriteriaDetails?.find((detail) => (detail.id || "").toString() === key);
        const name = storedDetail?.name || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const weight = typeof storedDetail?.weight === "number" ? storedDetail.weight : null;
        const evidence = storedDetail?.evidence || [];
        return {
          id: key,
          name,
          score: scoreValue,
          percent: Math.round(scoreValue / (storedDetail?.maxScore || 4) * 100),
          maxScore: storedDetail?.maxScore || 4,
          weight,
          strengths: Array.isArray(storedDetail?.strengths) ? storedDetail.strengths : [],
          weaknesses: Array.isArray(storedDetail?.weaknesses) ? storedDetail.weaknesses : [],
          actions: Array.isArray(storedDetail?.actions) ? storedDetail.actions : [],
          justification: storedDetail?.justification || "",
          indicators: Array.isArray(storedDetail?.indicators) ? storedDetail.indicators : [],
          evidence
          // Conversation excerpts as justification
        };
      });
      const overallScore = Number(evaluationRecord.global_score ?? 0);
      const summary = evaluationRecord.summary || `\xC9valuation du sc\xE9nario "${scenarioTitle}" bas\xE9e sur ${messages.length} \xE9change${messages.length > 1 ? "s" : ""} patient/infirmier.`;
      res.status(200).json({
        report: {
          sessionId,
          scenarioTitle,
          overallScore,
          criteria,
          strengths: evaluationRecord.strengths || [],
          weaknesses: evaluationRecord.weaknesses || [],
          recommendations: evaluationRecord.recommendations || [],
          feedback: evaluationRecord.feedback || null,
          transcriptMessageCount: messages.length,
          summary,
          generatedAt: evaluationRecord.evaluated_at || evaluationRecord.created_at || (/* @__PURE__ */ new Date()).toISOString()
        },
        message: "Evaluation report generated successfully"
      });
    } catch (error) {
      console.error("Error generating ECOS session report:", error);
      res.status(500).json({
        error: "Failed to generate evaluation report",
        code: "EVALUATION_REPORT_FAILED"
      });
    }
  });
  function extractScenarioIdFromSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== "string") return null;
    const match = sessionId.match(/^session_(\d+)_/);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
    }
    return null;
  }
  __name(extractScenarioIdFromSessionId, "extractScenarioIdFromSessionId");
  app.post("/api/ecos/patient-simulator", requireStudent, apiRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req, res) => {
    try {
      const email = req.firebaseUser.email;
      const { sessionId, query, scenarioId: providedScenarioId } = req.body;
      let resolvedScenarioId = providedScenarioId;
      if (!resolvedScenarioId && sessionId) {
        resolvedScenarioId = extractScenarioIdFromSessionId(sessionId);
        if (resolvedScenarioId) {
          console.log(`\u{1F504} [patient-simulator] Extracted scenarioId ${resolvedScenarioId} from sessionId: ${sessionId}`);
        }
      }
      if (resolvedScenarioId) {
        const numericScenarioId = typeof resolvedScenarioId === "string" ? parseInt(resolvedScenarioId, 10) : resolvedScenarioId;
        if (!isNaN(numericScenarioId)) {
          resolvedScenarioId = numericScenarioId;
          console.log(`\u2705 [patient-simulator] Converted scenarioId to number:`, numericScenarioId);
        }
      }
      console.log("\u{1F504} [patient-simulator] Received request:", {
        email,
        sessionId,
        providedScenarioId,
        resolvedScenarioId,
        hasQuery: !!query,
        queryLength: query?.length || 0,
        scenarioIdType: typeof resolvedScenarioId,
        scenarioIdValue: resolvedScenarioId,
        extractionUsed: !providedScenarioId && !!resolvedScenarioId
      });
      const { virtualPatientService: virtualPatientService2 } = await Promise.resolve().then(() => (init_virtual_patient_service(), virtual_patient_service_exports));
      const validation = virtualPatientService2.validateInput({
        sessionId,
        email,
        query,
        scenarioId: resolvedScenarioId
      });
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
          code: "INVALID_INPUT"
        });
      }
      console.log(`\u{1F916} AI Patient simulator query from ${email} in session ${sessionId}:`, {
        query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
        resolvedScenarioId,
        extractionUsed: !providedScenarioId && !!resolvedScenarioId
      });
      if (resolvedScenarioId) {
        try {
          const scenarios = await unifiedDb.getScenarios();
          const scenario = scenarios.find((s) => s.id === parseInt(resolvedScenarioId.toString(), 10));
          if (!scenario) {
            return res.status(404).json({
              error: `Scenario ${resolvedScenarioId} not found`,
              code: "SCENARIO_NOT_FOUND"
            });
          }
          console.log(`\u2705 Using scenario: "${scenario.title}" (ID: ${resolvedScenarioId}) ${!providedScenarioId ? "[EXTRACTED from sessionId]" : "[PROVIDED directly]"}`);
        } catch (error) {
          console.error("\u274C Error validating scenario:", error);
          return res.status(500).json({
            error: "Failed to validate scenario",
            code: "SCENARIO_VALIDATION_FAILED"
          });
        }
      }
      if (!resolvedScenarioId) {
        console.warn("\u26A0\uFE0F [patient-simulator] No scenarioId provided or extractable - patient will use generic fallback prompt instead of scenario-specific prompt");
        console.warn("\u26A0\uFE0F [patient-simulator] SessionId pattern for extraction:", sessionId);
      }
      console.log(`\u{1F680} [patient-simulator] Calling virtualPatientService.generatePatientResponse with resolved scenarioId: ${resolvedScenarioId}`);
      const patientResponse = await virtualPatientService2.generatePatientResponse(
        sessionId,
        email,
        query,
        resolvedScenarioId
      );
      try {
        await unifiedDb.storeSessionMessage({
          sessionId,
          role: "user",
          question: query,
          response: ""
        });
        await unifiedDb.storeSessionMessage({
          sessionId,
          role: "assistant",
          question: "",
          response: patientResponse.response,
          content: patientResponse.response
        });
        console.log("\u2705 Stored user message and assistant response for session:", sessionId);
        try {
          const { realtimeAnalysisService: realtimeAnalysisService2 } = await Promise.resolve().then(() => (init_realtime_analysis_service(), realtime_analysis_service_exports));
          realtimeAnalysisService2.analyzeSessionProgress(sessionId, {
            sessionStatus: "in_progress"
          }).catch((err) => {
            console.warn("\u26A0\uFE0F Real-time analysis failed (non-blocking):", err.message);
          });
        } catch (analysisError) {
          console.warn("\u26A0\uFE0F Failed to trigger real-time analysis:", analysisError);
        }
      } catch (storageError) {
        console.warn("\u26A0\uFE0F Failed to store conversation messages:", storageError);
      }
      res.status(200).json({
        response: patientResponse.response,
        sessionId,
        timestamp: /* @__PURE__ */ new Date(),
        addressing: patientResponse.addressing,
        medicalContext: patientResponse.medicalContext,
        message: "AI patient response generated with memory and role awareness"
      });
    } catch (error) {
      console.error("\u274C Error in AI patient simulator:", error);
      res.status(500).json({
        error: "Failed to generate AI patient response",
        code: "AI_PATIENT_SIMULATOR_FAILED",
        details: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
      });
    }
  });
  return httpServer;
}
__name(registerRoutes, "registerRoutes");

// server/diagnostic-endpoint.ts
function addDiagnosticRoutes(app) {
  app.get("/api/diagnostic/auth-check", async (req, res) => {
    try {
      const { email } = req.query;
      const ADMIN_EMAILS = authService.getAdminEmails();
      const authInfo = {
        receivedEmail: email,
        emailType: typeof email,
        emailString: String(email || ""),
        emailLowerCase: String(email || "").toLowerCase(),
        adminEmails: ADMIN_EMAILS,
        isAuthorized: authService.isAdmin(String(email || "")),
        includes: ADMIN_EMAILS.includes(String(email || "").toLowerCase()),
        query: req.query,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      res.json(authInfo);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  });
  app.get("/api/diagnostic/auth-test", async (req, res) => {
    try {
      const { email } = req.query;
      const ADMIN_EMAILS = authService.getAdminEmails();
      const result = {
        inputEmail: email,
        emailType: typeof email,
        isString: typeof email === "string",
        normalizedEmail: typeof email === "string" ? email.toLowerCase().trim() : null,
        adminEmails: ADMIN_EMAILS,
        normalizedAdminEmails: ADMIN_EMAILS.map((e) => e.toLowerCase().trim()),
        isAuthorized: authService.isAdmin(email),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  });
  app.get("/api/diagnostic/health", async (req, res) => {
    try {
      const health = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        status: "healthy",
        checks: {
          memory: process.memoryUsage(),
          uptime: process.uptime(),
          platform: process.platform,
          nodeVersion: process.version,
          env: {
            NODE_ENV: process.env.NODE_ENV,
            hasOpenAI: !!process.env.OPENAI_API_KEY,
            hasPinecone: !!process.env.PINECONE_API_KEY
          }
        }
      };
      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app.get("/api/diagnostic/routes", async (req, res) => {
    try {
      const routes = [];
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          routes.push({
            path: middleware.route.path,
            methods: Object.keys(middleware.route.methods)
          });
        } else if (middleware.name === "router") {
          middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
              routes.push({
                path: handler.route.path,
                methods: Object.keys(handler.route.methods)
              });
            }
          });
        }
      });
      res.json({ routes });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}
__name(addDiagnosticRoutes, "addDiagnosticRoutes");

// server/debug.middleware.ts
init_logger_service();
function createDebugMiddleware() {
  if (process.env.NODE_ENV !== "development") {
    return (req, res, next) => next();
  }
  return (req, res, next) => {
    apiLogger.request(req.method, req.path, void 0, void 0, {
      query: req.query,
      bodyKeys: req.body ? Object.keys(req.body) : void 0
    });
    const originalSend = res.send;
    res.send = function(data) {
      if (res.statusCode >= 400) {
        apiLogger.error(`Error response ${res.statusCode} for ${req.method} ${req.path}`, {
          statusCode: res.statusCode,
          method: req.method,
          path: req.path,
          responseData: typeof data === "object" ? data : { message: data }
        });
      }
      return originalSend.call(this, data);
    };
    next();
  };
}
__name(createDebugMiddleware, "createDebugMiddleware");
function createDatabaseErrorHandler() {
  return (error, req, res, next) => {
    if (error.code === "CONNECTION_LOST" || error.code === "PROTOCOL_CONNECTION_LOST") {
      apiLogger.error("Database connection lost", {
        errorCode: error.code,
        message: error.message,
        path: req.path,
        method: req.method
      });
      return res.status(503).json({
        error: "Database connection lost",
        message: "The database connection was lost. Please try again.",
        code: error.code
      });
    }
    if (error.message && error.message.includes("WebSocket")) {
      apiLogger.error("WebSocket database error", {
        message: error.message,
        path: req.path,
        method: req.method
      });
      return res.status(503).json({
        error: "Database WebSocket error",
        message: "WebSocket connection to database failed. Please try again.",
        details: error.message
      });
    }
    next(error);
  };
}
__name(createDatabaseErrorHandler, "createDatabaseErrorHandler");

// server/monitoring/performance-monitor.ts
var _PerformanceMonitor = class _PerformanceMonitor {
  constructor(config) {
    this.metrics = [];
    this.requestMetrics = [];
    this.databaseMetrics = [];
    this.systemMetrics = [];
    this.alertLastFired = /* @__PURE__ */ new Map();
    this.metricsCleanupInterval = null;
    this.systemMetricsInterval = null;
    this.config = {
      enableRequestTracking: true,
      enableDatabaseTracking: true,
      enableSystemMetrics: true,
      metricsRetentionHours: 24,
      enableConsoleLogging: process.env.NODE_ENV !== "production",
      enableWebhooks: false,
      alertConfigs: [
        {
          metric: "request_duration_p95",
          threshold: 2e3,
          // 2 seconds
          operator: "gt",
          enabled: true,
          cooldown: 10
          // 10 minutes
        },
        {
          metric: "error_rate_5min",
          threshold: 5,
          // 5%
          operator: "gt",
          enabled: true,
          cooldown: 5
          // 5 minutes
        },
        {
          metric: "memory_usage_percent",
          threshold: 85,
          // 85%
          operator: "gt",
          enabled: true,
          cooldown: 15
          // 15 minutes
        }
      ],
      ...config
    };
    this.startBackgroundTasks();
  }
  /**
   * Start background monitoring tasks
   */
  startBackgroundTasks() {
    this.metricsCleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 5 * 60 * 1e3);
    if (this.config.enableSystemMetrics) {
      this.systemMetricsInterval = setInterval(() => {
        this.collectSystemMetrics();
      }, 30 * 1e3);
    }
  }
  /**
   * Record a custom performance metric
   */
  recordMetric(name, value, unit, tags) {
    const metric = {
      name,
      value,
      unit,
      timestamp: /* @__PURE__ */ new Date(),
      tags
    };
    this.metrics.push(metric);
    if (this.config.enableConsoleLogging) {
      console.log(`\u{1F4CA} Metric: ${name} = ${value}${unit}`, tags ? `(${JSON.stringify(tags)})` : "");
    }
    this.checkAlerts();
  }
  /**
   * Record request performance metrics
   */
  recordRequest(request) {
    if (!this.config.enableRequestTracking) return;
    const requestMetric = {
      ...request,
      timestamp: /* @__PURE__ */ new Date()
    };
    this.requestMetrics.push(requestMetric);
    this.recordMetric("request_duration", request.duration, "ms", {
      method: request.method,
      path: request.path,
      status: request.statusCode.toString()
    });
    if (request.statusCode >= 500) {
      this.recordMetric("request_error", 1, "count", {
        method: request.method,
        path: request.path,
        status: request.statusCode.toString()
      });
    }
  }
  /**
   * Record database query performance
   */
  recordDatabaseQuery(query) {
    if (!this.config.enableDatabaseTracking) return;
    const dbMetric = {
      ...query,
      timestamp: /* @__PURE__ */ new Date()
    };
    this.databaseMetrics.push(dbMetric);
    this.recordMetric("db_query_duration", query.duration, "ms", {
      success: query.success.toString(),
      affected_rows: query.rowsAffected?.toString() || "0"
    });
    if (!query.success) {
      this.recordMetric("db_query_error", 1, "count");
    }
  }
  /**
   * Collect system performance metrics
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const used = Math.round(memUsage.heapUsed / 1024 / 1024);
    const total = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percent = Math.round(used / total * 100);
    const systemMetric = {
      memoryUsage: {
        used,
        total,
        percent
      },
      uptime: process.uptime(),
      timestamp: /* @__PURE__ */ new Date()
    };
    this.systemMetrics.push(systemMetric);
    this.recordMetric("memory_usage_mb", used, "bytes");
    this.recordMetric("memory_usage_percent", percent, "percent");
    this.recordMetric("uptime_seconds", systemMetric.uptime, "count");
  }
  /**
   * Calculate percentile from array of values
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(percentile / 100 * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  /**
   * Get request performance statistics
   */
  getRequestStats(minutes = 60) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1e3);
    const recentRequests = this.requestMetrics.filter((r) => r.timestamp > cutoff);
    if (recentRequests.length === 0) {
      return {
        totalRequests: 0,
        errorRate: 0,
        averageResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        statusCodeDistribution: {}
      };
    }
    const durations = recentRequests.map((r) => r.duration);
    const errors = recentRequests.filter((r) => r.statusCode >= 500).length;
    const statusCodes = {};
    recentRequests.forEach((r) => {
      const status = r.statusCode.toString();
      statusCodes[status] = (statusCodes[status] || 0) + 1;
    });
    return {
      totalRequests: recentRequests.length,
      errorRate: errors / recentRequests.length * 100,
      averageResponseTime: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p50ResponseTime: this.calculatePercentile(durations, 50),
      p95ResponseTime: this.calculatePercentile(durations, 95),
      p99ResponseTime: this.calculatePercentile(durations, 99),
      statusCodeDistribution: statusCodes
    };
  }
  /**
   * Get database performance statistics
   */
  getDatabaseStats(minutes = 60) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1e3);
    const recentQueries = this.databaseMetrics.filter((q) => q.timestamp > cutoff);
    if (recentQueries.length === 0) {
      return {
        totalQueries: 0,
        errorRate: 0,
        averageQueryTime: 0,
        p95QueryTime: 0,
        slowQueries: []
      };
    }
    const durations = recentQueries.map((q) => q.duration);
    const errors = recentQueries.filter((q) => !q.success).length;
    const slowQueries = recentQueries.filter((q) => q.duration > 1e3).sort((a, b) => b.duration - a.duration).slice(0, 10);
    return {
      totalQueries: recentQueries.length,
      errorRate: errors / recentQueries.length * 100,
      averageQueryTime: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p95QueryTime: this.calculatePercentile(durations, 95),
      slowQueries
    };
  }
  /**
   * Get current system status
   */
  getSystemStatus() {
    const latest = this.systemMetrics[this.systemMetrics.length - 1];
    const requestStats = this.getRequestStats(60);
    const databaseStats = this.getDatabaseStats(60);
    const healthy = requestStats.errorRate < 10 && // Error rate under 10%
    requestStats.p95ResponseTime < 5e3 && // P95 under 5 seconds
    databaseStats.errorRate < 5 && // DB error rate under 5%
    (latest?.memoryUsage.percent || 0) < 90;
    return {
      healthy,
      uptime: latest?.uptime || process.uptime(),
      memory: latest?.memoryUsage || { used: 0, total: 0, percent: 0 },
      requestStats,
      databaseStats,
      alertsTriggered: this.alertLastFired.size,
      timestamp: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Check if any alerts should be triggered
   */
  checkAlerts() {
    const now = /* @__PURE__ */ new Date();
    for (const alertConfig of this.config.alertConfigs) {
      if (!alertConfig.enabled) continue;
      const lastFired = this.alertLastFired.get(alertConfig.metric);
      if (lastFired && now.getTime() - lastFired.getTime() < alertConfig.cooldown * 60 * 1e3) {
        continue;
      }
      let currentValue = null;
      switch (alertConfig.metric) {
        case "request_duration_p95":
          currentValue = this.getRequestStats(5).p95ResponseTime;
          break;
        case "error_rate_5min":
          currentValue = this.getRequestStats(5).errorRate;
          break;
        case "memory_usage_percent":
          const latest = this.systemMetrics[this.systemMetrics.length - 1];
          currentValue = latest?.memoryUsage.percent || 0;
          break;
      }
      if (currentValue !== null && this.shouldTriggerAlert(currentValue, alertConfig)) {
        this.triggerAlert(alertConfig.metric, currentValue, alertConfig.threshold);
        this.alertLastFired.set(alertConfig.metric, now);
      }
    }
  }
  /**
   * Check if alert should be triggered based on configuration
   */
  shouldTriggerAlert(value, config) {
    switch (config.operator) {
      case "gt":
        return value > config.threshold;
      case "lt":
        return value < config.threshold;
      case "eq":
        return value === config.threshold;
      default:
        return false;
    }
  }
  /**
   * Trigger an alert
   */
  triggerAlert(metric, currentValue, threshold) {
    const alertMessage = `\u{1F6A8} ALERT: ${metric} = ${currentValue} (threshold: ${threshold})`;
    console.error(alertMessage);
  }
  /**
   * Clean up old metrics to prevent memory leaks
   */
  cleanupOldMetrics() {
    const cutoff = new Date(Date.now() - this.config.metricsRetentionHours * 60 * 60 * 1e3);
    const initialCounts = {
      metrics: this.metrics.length,
      requests: this.requestMetrics.length,
      database: this.databaseMetrics.length,
      system: this.systemMetrics.length
    };
    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff);
    this.requestMetrics = this.requestMetrics.filter((r) => r.timestamp > cutoff);
    this.databaseMetrics = this.databaseMetrics.filter((d) => d.timestamp > cutoff);
    this.systemMetrics = this.systemMetrics.filter((s) => s.timestamp > cutoff);
    if (this.config.enableConsoleLogging) {
      const cleaned = {
        metrics: initialCounts.metrics - this.metrics.length,
        requests: initialCounts.requests - this.requestMetrics.length,
        database: initialCounts.database - this.databaseMetrics.length,
        system: initialCounts.system - this.systemMetrics.length
      };
      console.log("\u{1F9F9} Cleaned up old metrics:", cleaned);
    }
  }
  /**
   * Generate monitoring report
   */
  generateReport() {
    const status = this.getSystemStatus();
    return `
# ECOS Performance Monitoring Report
Generated: ${status.timestamp.toISOString()}

## System Health: ${status.healthy ? "\u2705 HEALTHY" : "\u274C UNHEALTHY"}

### System Metrics
- Uptime: ${Math.round(status.uptime / 3600)}h ${Math.round(status.uptime % 3600 / 60)}m
- Memory Usage: ${status.memory.used}MB / ${status.memory.total}MB (${status.memory.percent}%)

### Request Performance (Last 60 minutes)
- Total Requests: ${status.requestStats.totalRequests}
- Error Rate: ${status.requestStats.errorRate.toFixed(2)}%
- Average Response Time: ${status.requestStats.averageResponseTime.toFixed(0)}ms
- P95 Response Time: ${status.requestStats.p95ResponseTime.toFixed(0)}ms
- P99 Response Time: ${status.requestStats.p99ResponseTime.toFixed(0)}ms

### Database Performance (Last 60 minutes)
- Total Queries: ${status.databaseStats.totalQueries}
- Error Rate: ${status.databaseStats.errorRate.toFixed(2)}%
- Average Query Time: ${status.databaseStats.averageQueryTime.toFixed(0)}ms
- P95 Query Time: ${status.databaseStats.p95QueryTime.toFixed(0)}ms
- Slow Queries: ${status.databaseStats.slowQueries.length}

### Alerts
- Active Alerts: ${status.alertsTriggered}

## Status Code Distribution
${Object.entries(status.requestStats.statusCodeDistribution).map(([code, count]) => `- ${code}: ${count}`).join("\n")}
    `.trim();
  }
  /**
   * Graceful shutdown
   */
  shutdown() {
    if (this.metricsCleanupInterval) {
      clearInterval(this.metricsCleanupInterval);
    }
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    console.log("\u{1F4CA} Performance monitoring shutdown complete");
  }
};
__name(_PerformanceMonitor, "PerformanceMonitor");
var PerformanceMonitor = _PerformanceMonitor;
var performanceMonitor = new PerformanceMonitor();
process.on("SIGTERM", () => performanceMonitor.shutdown());
process.on("SIGINT", () => performanceMonitor.shutdown());

// server/middleware/monitoring.middleware.ts
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
__name(generateRequestId, "generateRequestId");
function createMonitoringMiddleware() {
  return (req, res, next) => {
    req.startTime = Date.now();
    req.requestId = generateRequestId();
    res.setHeader("X-Request-ID", req.requestId);
    let responseSize = 0;
    let capturedResponse = void 0;
    const originalSend = res.send;
    const originalJson = res.json;
    res.send = function(body) {
      if (body) {
        responseSize = Buffer.byteLength(body, "utf8");
        capturedResponse = body;
      }
      return originalSend.call(this, body);
    };
    res.json = function(obj) {
      if (obj) {
        const jsonString = JSON.stringify(obj);
        responseSize = Buffer.byteLength(jsonString, "utf8");
        capturedResponse = obj;
      }
      return originalJson.call(this, obj);
    };
    res.on("finish", () => {
      const duration = Date.now() - (req.startTime || Date.now());
      performanceMonitor.recordRequest({
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get("User-Agent"),
        responseSize,
        // Only record error message for server errors (5xx), not client errors (4xx)
        errorMessage: res.statusCode >= 500 ? capturedResponse?.error || capturedResponse?.message : void 0
      });
      if (duration > 2e3) {
        console.warn(`\u{1F40C} Slow request detected: ${req.method} ${req.path} took ${duration}ms`);
      }
      if (res.statusCode >= 500) {
        console.error(`\u274C Server error: ${req.method} ${req.path} - ${res.statusCode} in ${duration}ms`);
      } else if (res.statusCode >= 400 && process.env.LOG_CLIENT_ERRORS === "true") {
        console.warn(`\u26A0\uFE0F Client error: ${req.method} ${req.path} - ${res.statusCode} in ${duration}ms`);
      }
    });
    res.on("error", (error) => {
      const duration = Date.now() - (req.startTime || Date.now());
      performanceMonitor.recordRequest({
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: 500,
        duration,
        userAgent: req.get("User-Agent"),
        errorMessage: error.message
      });
    });
    next();
  };
}
__name(createMonitoringMiddleware, "createMonitoringMiddleware");
function createMonitoringRoutes() {
  return {
    // Health check endpoint with detailed metrics
    healthCheck: /* @__PURE__ */ __name(async (req, res) => {
      try {
        const status = performanceMonitor.getSystemStatus();
        res.status(status.healthy ? 200 : 503).json({
          status: status.healthy ? "healthy" : "unhealthy",
          timestamp: status.timestamp,
          uptime: status.uptime,
          memory: status.memory,
          requestStats: {
            total: status.requestStats.totalRequests,
            errorRate: parseFloat(status.requestStats.errorRate.toFixed(2)),
            avgResponseTime: Math.round(status.requestStats.averageResponseTime),
            p95ResponseTime: Math.round(status.requestStats.p95ResponseTime)
          },
          databaseStats: {
            total: status.databaseStats.totalQueries,
            errorRate: parseFloat(status.databaseStats.errorRate.toFixed(2)),
            avgQueryTime: Math.round(status.databaseStats.averageQueryTime),
            p95QueryTime: Math.round(status.databaseStats.p95QueryTime)
          },
          environment: process.env.NODE_ENV || "unknown"
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Health check failed",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, "healthCheck"),
    // Detailed metrics endpoint
    metrics: /* @__PURE__ */ __name(async (req, res) => {
      try {
        const minutes = parseInt(req.query.minutes) || 60;
        const requestStats = performanceMonitor.getRequestStats(minutes);
        const databaseStats = performanceMonitor.getDatabaseStats(minutes);
        const systemStatus = performanceMonitor.getSystemStatus();
        res.json({
          timeframe: `${minutes} minutes`,
          timestamp: /* @__PURE__ */ new Date(),
          requests: {
            total: requestStats.totalRequests,
            errorRate: parseFloat(requestStats.errorRate.toFixed(2)),
            responseTime: {
              average: Math.round(requestStats.averageResponseTime),
              p50: Math.round(requestStats.p50ResponseTime),
              p95: Math.round(requestStats.p95ResponseTime),
              p99: Math.round(requestStats.p99ResponseTime)
            },
            statusCodes: requestStats.statusCodeDistribution
          },
          database: {
            total: databaseStats.totalQueries,
            errorRate: parseFloat(databaseStats.errorRate.toFixed(2)),
            queryTime: {
              average: Math.round(databaseStats.averageQueryTime),
              p95: Math.round(databaseStats.p95QueryTime)
            },
            slowQueries: databaseStats.slowQueries.length
          },
          system: {
            uptime: systemStatus.uptime,
            memory: systemStatus.memory,
            healthy: systemStatus.healthy
          }
        });
      } catch (error) {
        res.status(500).json({
          error: "Metrics collection failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }, "metrics"),
    // Performance report endpoint
    report: /* @__PURE__ */ __name(async (req, res) => {
      try {
        const report = performanceMonitor.generateReport();
        res.setHeader("Content-Type", "text/plain");
        res.send(report);
      } catch (error) {
        res.status(500).json({
          error: "Report generation failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }, "report"),
    // Custom metric recording endpoint (for client-side metrics)
    recordMetric: /* @__PURE__ */ __name(async (req, res) => {
      try {
        const { name, value, unit, tags } = req.body;
        if (!name || typeof value !== "number" || !unit) {
          return res.status(400).json({
            error: "Invalid metric data",
            message: "name, value, and unit are required"
          });
        }
        performanceMonitor.recordMetric(name, value, unit, tags);
        res.json({
          success: true,
          message: "Metric recorded successfully"
        });
      } catch (error) {
        res.status(500).json({
          error: "Failed to record metric",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }, "recordMetric")
  };
}
__name(createMonitoringRoutes, "createMonitoringRoutes");
function createErrorTrackingMiddleware() {
  return (error, req, res, next) => {
    performanceMonitor.recordMetric("application_error", 1, "count", {
      path: req.path,
      method: req.method,
      errorType: error.constructor.name,
      statusCode: (error.status || error.statusCode || 500).toString()
    });
    console.error("\u{1F6A8} Application Error:", {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      userAgent: req.get("User-Agent"),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    next(error);
  };
}
__name(createErrorTrackingMiddleware, "createErrorTrackingMiddleware");

// server/serverless-app.ts
var _ServerlessApplication = class _ServerlessApplication {
  constructor(config) {
    this.app = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.config = {
      environment: process.env.NODE_ENV || "production",
      enableDebug: process.env.NODE_ENV !== "production",
      maxResponseTime: 55e3,
      // 55s for Vercel timeout buffer (Vercel Pro allows 60s)
      enableHealthChecks: true,
      ...config
    };
  }
  validateEnvironment() {
    const required = ["DATABASE_URL"];
    const optional = ["OPENAI_API_KEY", "PINECONE_API_KEY"];
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      console.error(`\u274C Missing critical environment variables: ${missing.join(", ")}`);
    }
    const optionalMissing = optional.filter((v) => !process.env[v]);
    if (optionalMissing.length > 0) {
      console.warn(`\u26A0\uFE0F Missing optional environment variables: ${optionalMissing.join(", ")}`);
    }
    return { isValid: missing.length === 0, missing };
  }
  setupMiddleware(app) {
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: false, limit: "10mb" }));
    app.use(createMonitoringMiddleware());
    app.use((req, res, next) => {
      const sensitivePaths = [
        "/.env",
        "/package.json",
        "/.replit",
        "/server",
        "/shared",
        "/scripts",
        "/node_modules",
        "/.git",
        "/dist/index.js"
      ];
      if (sensitivePaths.some((path) => req.path.startsWith(path))) {
        return res.status(404).json({ error: "Not Found" });
      }
      next();
    });
    if (this.config.enableDebug) {
      app.use(createDebugMiddleware());
    }
    app.use(createDatabaseErrorHandler());
    app.use((req, res, next) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          res.status(504).json({
            error: "Request timeout",
            message: "The request took too long to process"
          });
        }
      }, this.config.maxResponseTime);
      res.on("finish", () => clearTimeout(timeout));
      next();
    });
  }
  setupHealthChecks(app) {
    if (!this.config.enableHealthChecks) return;
    const monitoringRoutes = createMonitoringRoutes();
    app.get("/health", monitoringRoutes.healthCheck);
    app.get("/ready", (req, res) => {
      res.status(200).json({
        status: "ready",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        initialized: this.initialized,
        environment: this.config.environment
      });
    });
    app.get("/live", (req, res) => {
      res.status(200).json({
        status: "alive",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        pid: process.pid,
        uptime: process.uptime()
      });
    });
    app.get("/metrics", monitoringRoutes.metrics);
    app.get("/report", monitoringRoutes.report);
    app.post("/metrics", monitoringRoutes.recordMetric);
  }
  setupErrorHandling(app) {
    app.use(createErrorTrackingMiddleware());
    app.use("*", (req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    app.use((err, req, res, next) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      const errorId = Math.random().toString(36).substr(2, 9);
      console.error(`[${errorId}] Serverless Error [${status}]:`, {
        message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.status(status).json({
        error: this.config.environment === "production" ? "Internal Server Error" : message,
        message: this.config.environment === "production" ? "An error occurred processing your request" : message,
        errorId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
  }
  async initializeApplication() {
    if (this.initialized && this.app) {
      return this.app;
    }
    console.log(`\u{1F680} Initializing ECOS serverless application (${this.config.environment})`);
    const { isValid: isValid2, missing } = this.validateEnvironment();
    if (!isValid2) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
    const app = express();
    this.setupMiddleware(app);
    this.setupHealthChecks(app);
    if (this.config.enableDebug) {
      addDiagnosticRoutes(app);
    }
    try {
      await registerRoutes(app);
      console.log("\u2705 API routes registered successfully");
    } catch (error) {
      console.error("\u274C Failed to register routes:", error);
      throw error;
    }
    this.setupErrorHandling(app);
    this.app = app;
    this.initialized = true;
    console.log("\u2705 ECOS serverless application initialized successfully");
    return app;
  }
  async getApplication() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    if (this.initialized && this.app) {
      return this.app;
    }
    this.initializationPromise = this.initializeApplication();
    return this.initializationPromise;
  }
  async handleRequest(req, res) {
    try {
      const app = await this.getApplication();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Request handling timeout"));
        }, this.config.maxResponseTime);
        app(req, res, (err) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error("Critical serverless handler error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Application initialization failed",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  }
};
__name(_ServerlessApplication, "ServerlessApplication");
var ServerlessApplication = _ServerlessApplication;
var serverlessApp = new ServerlessApplication();
export {
  ServerlessApplication,
  serverlessApp
};
//# sourceMappingURL=serverless-app.js.map
