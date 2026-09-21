# Isaac Ahmed — Assistant IA de Borne d'Accueil

**Projet stage Master 1 Développement — ST DIGITAL, Libreville, Gabon**

Assistant IA multimodal pour automation de gestion des rendez-vous visiteurs : chat conversationnel (RAG), réservation QR-code, notification hôte, self-hosted (Ollama + n8n).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ VISITOR KIOSK (Visitor App + Admin Panel)                       │
│ ├─ React + i18n (FR/EN)                                         │
│ ├─ Screens: Welcome, Home, Chat, RDV, MyAppointments, Admin    │
│ └─ HTTPS on tower:8443 (nginx reverse proxy)                    │
└────────────────┬────────────────────────────────────────────────┘
                 │ Tailscale (100.71.79.97:5678)
                 │
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND TOWER (Self-Hosted, Docker)                             │
│                                                                 │
│ n8n (workflow orchestration)                                    │
│ ├─ /webhook/isaac          → Chat + RAG                         │
│ ├─ /webhook/isaac-rdv      → RDV + QR + Notifications          │
│ └─ /webhook/isaac-respond  → Team availability poll             │
│                                                                 │
│ Ollama (local LLM inference)                                    │
│ └─ qwen2.5:7b-instruct (8-12s per query, grounded RAG)         │
│                                                                 │
│ Data persistence                                                │
│ ├─ JSON files (appointments, conversations, staff, notifications) │
│ └─ Vector DB (in-memory, survives ~48h restart)                │
└─────────────────────────────────────────────────────────────────┘
```

## Structure du Projet

```
accueil-app/
│
├── src/                           # React frontend
│   ├── App.js                     # Root component + routing
│   ├── App.test.js                # Component tests
│   ├── i18n.js                    # Internationalization (FR/EN)
│   │
│   ├── WelcomeScreen.js           # Landing page: Choose visitor or chat
│   ├── HomeScreen.js              # Main menu after welcome
│   ├── ChatScreen.js              # Isaac conversational chat
│   ├── RendezVousScreen.js        # Book appointment form
│   ├── MyAppointmentsScreen.js    # Lookup existing appointments (OTP)
│   ├── PhotoCapture.js            # Camera UI (identity docs)
│   ├── QrScanner.js               # QR code scanner
│   │
│   ├── services/                  # Backend integration layer
│   │   ├── aiService.js           # Chat → n8n webhook (RAG)
│   │   ├── appointmentService.js  # RDV requests, lookups, cancellations
│   │   ├── notificationService.js # Escalate to staff
│   │   └── *.test.js              # Service unit tests (10 tests passing)
│   │
│   ├── *.css                      # Component styling (ST Digital brand)
│   ├── index.js                   # React DOM mount
│   └── setupTests.js              # Jest configuration
│
├── public/                        # Static assets
│   ├── index.html                 # HTML entry point
│   ├── favicon.ico                # Tab icon
│   ├── manifest.json              # PWA manifest
│   ├── logo-st-digital.png        # ST Digital branding
│   └── logo*.png                  # App icons
│
├── docs/                          # Project documentation
│   ├── SPECIFICATIONS_ISAAC_AHMED.md              # Full functional specs (Partie A-J)
│   ├── 01_Note_de_cadrage.docx                    # Stage kickoff (tutrice validation)
│   ├── 02_Architecture_technique.docx             # Tech choices + diagrams
│   ├── 03_Registre_des_risques.docx               # Risk register (R1-R15)
│   ├── 04_Note_protection_donnees.docx            # GDPR/compliance (Gabon)
│   ├── 05_Documentation_deploiement.docx          # Setup guide (Ollama + Docker + n8n)
│   ├── 06_Backlog.docx                            # Feature backlog (M0-M3)
│   ├── 07_Gabarit_journal_de_bord.docx            # Work journal (13/08 → 21/09)
│   ├── 08_Dossier_tests_recette.docx              # Test plan + results
│   ├── 09_Dossier_Isaac_Ahmed_consolide.docx     # All-in-one deliverable
│   │
│   ├── BASE_CONNAISSANCES_ST_DIGITAL.md           # RAG knowledge base (ST Digital facts)
│   ├── JEU_20_QUESTIONS_REFERENCE.md              # M1 acceptance test (20 Q&A)
│   │
│   ├── N8N_CHAT_CONTRACT.md                       # Webhook spec: chat → RAG
│   ├── N8N_APPOINTMENTS_CONTRACT.md               # Webhook spec: RDV workflow
│   ├── N8N_NOTIFICATION_CONTRACT.md               # Webhook spec: email notifications
│   └── N8N_ROUTER_LOGIC_V2.md                     # Workflow routing rules
│
├── _archive_dead_code/            # Old/removed code (kept for reference)
│   ├── QrPreview.js               # Deprecated QR preview
│   └── knowledgeBase.js           # Old static KB (migrated to RAG)
│
├── .env.example                   # Environment variables template
├── .env.local                     # (Git-ignored) Local config pointing to tower
├── .gitignore                     # Standard Node/React ignore rules
│
├── package.json                   # Node dependencies + scripts
├── package-lock.json              # Locked dependency versions
│
├── .claude/launch.json            # Claude Code dev server config
├── certs/                         # Self-signed HTTPS certs (dev)
│
└── build/                         # Production bundle (npm run build)
    └── [compiled React + assets]

(Exclude: node_modules/ 630MB, .git/)
```

## Module Status

| Module | Scope | Status | Deadline |
|--------|-------|--------|----------|
| **M0** | RDV, QR code, host notification, back-office minimal | ✅ **DELIVERED** (2026-09-09) | fin S4 |
| **M1** | Isaac text chat, RAG, 20-question acceptance test | ✅ **DELIVERED** (2026-09-23) | fin S6 |
| **M2** | Audio: speech recognition + synthesis (French) | 🔄 Prototype | fin S7 |
| **M3** | Avatar: real-time video rendering | 📋 Architecture study only | fin S8 |

## Technology Stack

### Frontend
- **React 19** — Component framework (CRA)
- **i18n-js** — Internationalization (FR + EN)
- **html5-qrcode** — QR scanner (browser camera)
- **CSS3** — ST Digital brand colors (navy #1A4D7A, blue #2E7AB5, light grey #C8DCF0)

### Backend (Self-Hosted)
- **n8n 2.36** — Workflow orchestration (Docker)
  - 3 main workflows: Chat (RAG), RDV (QR+notifications), Team responses
  - JSON file storage (no cloud DB)
  - SMTP notifications (Gmail + fallback)

- **Ollama** — Local LLM inference (Docker)
  - Model: `qwen2.5:7b-instruct` (7B parameters, French-capable)
  - Response time: 8-12 seconds per query
  - Vector DB: in-memory (ephemeral, survives 2 days idle max)

- **Nginx** — Reverse proxy + static file serving
  - Port 8443 (visitor app + admin panel)
  - Port 8444 (public team-response links, minimal surface)
  - Cache headers: no-cache on index.html, max-age on /static/

### Network
- **Tailscale** — VPN mesh for secure backend access (100.71.79.97:5678)
- **Funnel** — Planned for public team-response links (pending Aminta sudo)

### Development
- **Git** — Version control (5 commits, full history)
- **npm** — Dependency management (41 packages, no high-risk vulns)
- **Jest** — Unit testing (10 tests passing)
- **ESLint** — Code quality (React app config)

## Quick Start

### Local Development (against tower)

```bash
# 1. Clone & install
git clone https://github.com/Ambrefirst/Isaac-Ahmed.git
cd Isaac-Ahmed
npm install

# 2. Configure environment (must point to tower)
cp .env.example .env.local
# Edit .env.local: set REACT_APP_N8N_* to http://100.71.79.97:5678/webhook/...

# 3. Run dev server
npm start
# Opens http://localhost:3000

# 4. Run tests
npm test

# 5. Build for production
npm run build
```

### On Tower (Self-Hosted Deployment)

See `docs/05_Documentation_deploiement.docx` for:
- Ollama model download (qwen2.5:7b-instruct)
- n8n Docker setup + workflow imports
- Nginx reverse proxy config
- Tailscale + Funnel setup

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/services/*.js` | Integration with n8n webhooks (chat, RDV, notifications) |
| `src/ChatScreen.js` | Main Isaac conversation UI + session management |
| `src/RendezVousScreen.js` | Appointment booking form + QR display |
| `docs/SPECIFICATIONS_ISAAC_AHMED.md` | Complete functional requirements (Fiche de stage) |
| `docs/BASE_CONNAISSANCES_ST_DIGITAL.md` | RAG knowledge base (indexed in n8n) |
| `docs/JEU_20_QUESTIONS_REFERENCE.md` | M1 acceptance test set (20 Q&A verified) |
| `.env.local` | Backend webhook URLs (Git-ignored, user-configured) |

## Testing

```bash
# Unit tests (services + components)
npm test

# Manual end-to-end
1. Open http://localhost:3000 (or https://100.71.79.97:8443 on tower)
2. Chat with Isaac (should answer from RAG KB)
3. Book appointment (creates JSON record on tower)
4. Confirm as admin → QR code generated + email sent
5. Scan QR or lookup via OTP → visitor confirmed arrival
```

## Project Artifacts

All stage deliverables in `docs/`:
- **Note de cadrage** — Scope, risks, planning (Tutrice: MEBANG MBOUROUNOU Aminta)
- **Architecture document** — Tech choices, network diagram, failure modes
- **Risk register** — R1-R15 (network reachability, persistence, LLM reliability, SMTP auth blocks)
- **Deployment guide** — Docker + Tailscale + Ollama commands
- **Work journal** — Daily entries 13/08 → 21/09 (6 weeks)
- **Test dossier** — Test plan + evidence (automated + manual)
- **Consolidated dossier** — All 8 docs merged (21 pages, ST Digital branding)

## Known Limitations

1. **Vector DB ephemeral** — In-memory only, wiped on n8n container restart (Risk R12)
2. **LLM response time** — Qwen2.5 7B on CPU: 8-12s per query (acceptable for kiosk, not real-time chat)
3. **No Azure AD** — Outlook/Teams SMTP blocked by tenant policy; Gmail workaround used (Risk R3)
4. **Tailscale Funnel pending** — Team response links not yet public without VPN
5. **Mobile device cache** — Browser cache on kiosk phones may require hard refresh post-deploy

## Next Steps (M2/M3)

- Audio prototype (speech recognition + TTS, French)
- Video avatar rendering (if GPU becomes available)
- Scale vector DB to persistent Postgres
- Integrate real Outlook/Teams notifications
- Multi-language expansion (if required)

---

**Stage Timeline:** 13/08 → 30/09/2026 (8 weeks)  
**Tutrice:** MEBANG MBOUROUNOU Aminta  
**Stagiaire:** MENGUE ME NANG Tatille Ambre  
**Last updated:** 2026-09-21
