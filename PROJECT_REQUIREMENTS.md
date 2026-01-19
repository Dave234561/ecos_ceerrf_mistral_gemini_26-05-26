# ECOS Infirmier - Project Requirements

## Runtime Environment
- Node.js >= 18.x
- npm >= 9.x

## Required API Keys & Services
- Google Gemini API Key (for Realtime Voice/Live Audio)
- Mistral AI API Key (for Patient Simulation Logic)
- Firebase Project (Auth, Web SDK & Admin SDK keys)
- Supabase Project (PostgreSQL Database & Realtime)
- Pinecone API Key (for Vector Search/RAG)
- Stripe API Key (for Payments/Subscriptions)

## Main Dependencies (Node.js)
- @google/genai: ^1.34.0
- @mistralai/mistralai: ^1.11.0
- @supabase/supabase-js: ^2.52.0
- @roamhq/wrtc: ^0.9.1 (WebRTC support for Node.js)
- firebase: ^12.3.0
- express: ^4.21.2
- react: ^18.3.1
- vite: ^7.2.2

## Infrastructure
- PostgreSQL (via Supabase)
- Firebase Authentication
- Vector Database (via Pinecone)
