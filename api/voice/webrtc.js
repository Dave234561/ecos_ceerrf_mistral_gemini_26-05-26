import { createServer } from 'node:http';
import { serverlessApp } from '../_lib/serverless-app.js';
import { setupVoiceWebRTC } from '../_lib/voice-webrtc.js';

// Vercel needs the HTTP server itself as the Function export to handle upgrades.
const server = createServer((req, res) => {
  void serverlessApp.handleRequest(req, res);
});

setupVoiceWebRTC(server);

export default server;
