# Interactive Book Architecture

This document contains production-oriented architecture diagrams for the Interactive Book platform.

## System Architecture (Mermaid)

```mermaid
flowchart LR
    U[User Browser] --> FE[Frontend\nReact + Vite\nPort 5173/8080]
    FE -->|REST| BE[Backend API\nExpress + Socket.IO\nPort 4000]
    FE <-->|WebSocket| BE

    BE -->|Mongo queries| DB[(MongoDB\nBooks, Pages, Tasks, Feedback)]
    BE -->|Submit/Poll jobs| AI[AI Layer\nFastAPI + Worker Queues\nPort 8000]

    AI -->|Text/TTS| GROQ[Groq APIs\nGPT-OSS + Orpheus TTS]
    AI -->|Image generation| HF[Hugging Face Providers]
    AI -->|Stock image fallback| PEXELS[Pexels API]

    AI -->|Job status| BE
    BE -->|book:updated / book:failed| FE
```

## Generation Flow (Mermaid Sequence)

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Frontend
    participant Backend
    participant MongoDB
    participant AILayer
    participant Providers

    User->>Frontend: Create Book (topic, age, neurotype, language)
    Frontend->>Backend: POST /api/books
    Backend->>MongoDB: Create Book + Page + Task
    Backend->>AILayer: POST /jobs/create-book
    AILayer->>Providers: Generate title/sections/cover/image payloads
    AILayer-->>Backend: Job status updates
    Backend->>MongoDB: Persist page text/images/progress
    Backend-->>Frontend: Socket event (book:updated)
    Frontend-->>User: Live updates in UI

    User->>Frontend: Play page audio
    Frontend->>Backend: GET /api/books/:id/pages/:n/audio
    Backend->>AILayer: POST /tts (language-aware model/voice)
    AILayer->>Providers: Synthesize audio
    AILayer-->>Backend: wav bytes
    Backend-->>Frontend: audio/wav stream
```

## Deployment Topology (Recommended)

```mermaid
flowchart TB
    Internet --> LB[Reverse Proxy / Load Balancer\nTLS termination]
    LB --> FEH[Static Frontend Hosting\nCDN]
    LB --> BEP[Backend API Pods\nNode 20+]
    LB --> AIP[AI Layer Pods\nPython 3.11+]

    BEP --> MONGO[(Managed MongoDB\nReplica Set + Backups)]
    AIP --> SECRET[Secrets Manager\nGroq/HF/Pexels keys]
    BEP --> SECRET

    AIP --> EXT[External AI Providers]
    BEP --> OBS[Logs + Metrics + Alerts]
    AIP --> OBS
```

## Key Production Notes

- Keep backend and AI layer independently scalable.
- Use sticky-free WebSocket setup or a shared pub/sub adapter when horizontally scaling backend.
- Add rate limiting and auth before public launch.
- Store secrets in a vault/secret manager, never in repo files.
