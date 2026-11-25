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

// server/services/gemini-live-tts.service.ts
var gemini_live_tts_service_exports = {};
__export(gemini_live_tts_service_exports, {
  GeminiLiveTTS: () => GeminiLiveTTS
});
import { createRequire } from "module";
var GeminiLiveTTS;
var init_gemini_live_tts_service = __esm({
  "server/services/gemini-live-tts.service.ts"() {
    "use strict";
    GeminiLiveTTS = class _GeminiLiveTTS {
      constructor() {
        this.closed = false;
      }
      static {
        __name(this, "GeminiLiveTTS");
      }
      static async connect(params) {
        const require2 = createRequire(import.meta.url);
        const { GoogleGenAI, Modality } = require2("@google/genai");
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const finalVoiceName = params.voiceName || "Puck";
        console.log(`\u{1F3A4} Initializing Gemini Live with voice: ${finalVoiceName} (requested: ${params.voiceName})`);
        const session = await ai.live.connect({
          model: params.model,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: finalVoiceName
                }
              }
            },
            systemInstruction: params.systemInstruction,
            tools: params.tools
          },
          callbacks: {
            onopen: /* @__PURE__ */ __name(() => {
              console.log("\u2705 Gemini Live connection opened");
            }, "onopen"),
            onmessage: /* @__PURE__ */ __name((message) => {
              params.onMessage(message);
            }, "onmessage"),
            onerror: /* @__PURE__ */ __name((err) => {
              console.error("\u274C Gemini Live error:", err);
              if (params.onError) params.onError(err);
            }, "onerror"),
            onclose: /* @__PURE__ */ __name((ev) => {
              console.log("\u2139\uFE0F Gemini Live connection closed");
              if (params.onClose) params.onClose(ev);
            }, "onclose")
          }
        });
        const tts = new _GeminiLiveTTS();
        tts.session = session;
        return tts;
      }
      async sendToolResponse(toolOutputs) {
        if (this.closed) return;
        await this.session.send({
          toolResponse: {
            functionResponses: toolOutputs
          }
        });
      }
      async speakText(text) {
        if (this.closed) return;
        if (!text || !text.trim()) return;
        await this.session.send({
          clientContent: {
            turns: [{
              role: "user",
              parts: [{ text }]
            }],
            turnComplete: true
          }
        });
      }
      /**
       * Send raw audio data to Gemini Live for real-time speech recognition and response.
       * Based on official documentation: session.sendRealtimeInput({ audio: { data, mimeType } })
       */
      async sendAudio(audioBase64, mimeType = "audio/pcm;rate=16000") {
        if (this.closed) return;
        if (!audioBase64) return;
        await this.session.sendRealtimeInput({
          audio: {
            data: audioBase64,
            mimeType
          }
        });
      }
      close() {
        if (this.closed) return;
        this.closed = true;
        try {
          this.session?.close?.();
        } catch {
        }
      }
    };
  }
});

// server/services/voice-webrtc.service.ts
import { createRequire as createRequire2 } from "module";
import { WebSocketServer } from "ws";

// server/services/logger.service.ts
var Logger = class {
  static {
    __name(this, "Logger");
  }
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
var logger = new Logger("ecos-app");
var dbLogger = new Logger("database");
var authLogger = new Logger("auth");
var apiLogger = new Logger("api");

// server/services/voice-webrtc.service.ts
function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(safeJsonParse, "safeJsonParse");
function setupVoiceWebRTC(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      if (url.pathname !== "/api/voice/webrtc") return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.upgradeReq = req;
        wss.emit("connection", ws, req);
      });
    } catch (e) {
      socket.destroy();
    }
  });
  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const requestedVoiceType = url.searchParams.get("voiceType") || "male";
    const voiceName = requestedVoiceType === "female" ? "Kore" : "Puck";
    console.log(`\u{1F399}\uFE0F New Voice WebRTC connection. VoiceType: ${requestedVoiceType}, Gemini Voice: ${voiceName}`);
    let wrtc = null;
    try {
      const require2 = createRequire2(import.meta.url);
      try {
        wrtc = require2("@roamhq/wrtc");
      } catch {
        wrtc = require2("wrtc");
      }
    } catch {
      ws.send(JSON.stringify({
        type: "error",
        message: "Missing WebRTC dependency. Install with: npm i @roamhq/wrtc (recommended)  OR  npm i wrtc"
      }));
      ws.close();
      return;
    }
    let GeminiLiveTTS2 = null;
    try {
      const mod = await Promise.resolve().then(() => (init_gemini_live_tts_service(), gemini_live_tts_service_exports));
      GeminiLiveTTS2 = mod.GeminiLiveTTS;
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Missing Gemini Live bridge. Ensure server/services/gemini-live-tts.service.ts is built and '@google/genai' is installed." }));
      ws.close();
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY || "";
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    if (!apiKey) {
      ws.send(JSON.stringify({ type: "error", message: "Missing GEMINI_API_KEY on server." }));
      ws.close();
      return;
    }
    const pc = new wrtc.RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    let dataChannel = null;
    console.log(`\u{1F527} Connecting to Gemini Live with config:`, {
      model,
      voiceName,
      requestedVoiceType
    });
    const gemini = await GeminiLiveTTS2.connect({
      apiKey,
      model,
      voiceName,
      systemInstruction: "Tu es un patient virtuel. R\xE9ponds naturellement en fran\xE7ais. Si l'utilisateur semble h\xE9siter ou s'arr\xEAter au milieu d'une phrase, utilise l'outil wait_more pour lui indiquer que tu attends la suite.",
      tools: [
        {
          function_declarations: [
            {
              name: "wait_more",
              description: "Indique au syst\xE8me d'attendre que l'utilisateur finisse sa phrase. \xC0 utiliser si l'utilisateur marque une pause mais semble avoir encore des choses \xE0 dire.",
              parameters: {
                type: "OBJECT",
                properties: {
                  reason: {
                    type: "STRING",
                    description: "La raison pour laquelle on attend (optionnel)."
                  }
                }
              }
            }
          ]
        }
      ],
      onMessage: /* @__PURE__ */ __name(async (message) => {
        try {
          if (message?.serverContent?.interrupted) {
            dataChannel?.send(JSON.stringify({ type: "interrupt" }));
            return;
          }
          const userTranscription = message?.serverContent?.userTurn?.parts?.[0]?.text;
          if (userTranscription) {
            console.log("\u{1F5E3}\uFE0F User transcript from Gemini:", userTranscription);
            dataChannel?.send(JSON.stringify({ type: "transcript", text: userTranscription, role: "user" }));
          }
          const modelTranscription = message?.serverContent?.modelTurn?.parts?.[0]?.text;
          if (modelTranscription) {
            dataChannel?.send(JSON.stringify({ type: "transcript", text: modelTranscription, role: "assistant" }));
          }
          const toolCall = message?.toolCall;
          if (toolCall?.functionCalls) {
            const toolResponses = [];
            for (const fc of toolCall.functionCalls) {
              if (fc.name === "wait_more") {
                console.log("\u{1F916} Bot called wait_more");
                dataChannel?.send(JSON.stringify({ type: "waiting", message: "Le patient vous attend..." }));
                toolResponses.push({
                  name: fc.name,
                  id: fc.id,
                  response: { success: true, status: "waiting" }
                });
              }
            }
            if (toolResponses.length > 0) {
              await gemini.sendToolResponse(toolResponses);
            }
            return;
          }
          const parts = message?.serverContent?.modelTurn?.parts;
          if (!Array.isArray(parts)) {
            console.log("\u{1F50D} No parts found in message:", JSON.stringify(message, null, 2));
            return;
          }
          console.log(`\u{1F3B5} Processing ${parts.length} parts from Gemini Live (voice: ${voiceName})`);
          for (const part of parts) {
            const b64 = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;
            if (!b64) {
              console.log("\u{1F50D} Part without audio data:", part);
              continue;
            }
            console.log(`\u{1F3B5} Sending audio chunk: ${mimeType}, size: ${b64.length} chars`);
            dataChannel?.send(JSON.stringify({ type: "audio", data: b64, mimeType }));
          }
        } catch (err) {
          logger.warn("Voice WebRTC: failed to forward Gemini audio chunk", { error: err?.message });
        }
      }, "onMessage"),
      onError: /* @__PURE__ */ __name((err) => {
        try {
          dataChannel?.send(JSON.stringify({ type: "error", message: err?.message || "Gemini error" }));
        } catch {
        }
      }, "onError"),
      onClose: /* @__PURE__ */ __name(() => {
        try {
          dataChannel?.send(JSON.stringify({ type: "closed" }));
        } catch {
        }
      }, "onClose")
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: "ice", candidate: event.candidate }));
      }
    };
    pc.ondatachannel = (event) => {
      dataChannel = event.channel;
      dataChannel.onmessage = async (ev) => {
        const msg = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
        if (!msg) return;
        if (msg.type === "speak" && typeof msg.text === "string") {
          await gemini.speakText(msg.text);
        }
        if (msg.type === "audio" && typeof msg.data === "string") {
          const mimeType = msg.mimeType || "audio/pcm;rate=16000";
          await gemini.sendAudio(msg.data, mimeType);
        }
      };
      dataChannel.onclose = () => {
        try {
          gemini.close();
        } catch {
        }
        try {
          pc.close();
        } catch {
        }
      };
    };
    ws.on("message", async (raw) => {
      const msg = safeJsonParse(raw.toString());
      if (!msg) return;
      if (msg.type === "offer") {
        await pc.setRemoteDescription(new wrtc.RTCSessionDescription(msg.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer }));
      }
      if (msg.type === "ice" && msg.candidate) {
        try {
          await pc.addIceCandidate(new wrtc.RTCIceCandidate(msg.candidate));
        } catch (e) {
          logger.warn("Voice WebRTC: failed to add ICE candidate", { error: e?.message });
        }
      }
      if (msg.type === "close") {
        try {
          gemini.close();
        } catch {
        }
        try {
          pc.close();
        } catch {
        }
        try {
          ws.close();
        } catch {
        }
      }
    });
    ws.on("close", () => {
      try {
        gemini.close();
      } catch {
      }
      try {
        pc.close();
      } catch {
      }
    });
    ws.send(JSON.stringify({ type: "ready" }));
  });
  logger.info("Voice WebRTC signaling enabled", { path: "/api/voice/webrtc" });
}
__name(setupVoiceWebRTC, "setupVoiceWebRTC");
export {
  setupVoiceWebRTC
};
//# sourceMappingURL=voice-webrtc.js.map
