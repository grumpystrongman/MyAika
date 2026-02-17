MYAIKA - Project Readme
=======================

Project
-------
MyAika is a local project skeleton for an application named "MyAika". This file provides a quick overview, setup steps, and contribution guidelines. Replace and extend sections below to match actual project details.

What this project is
--------------------
- Short description: (Replace) A personal assistant / utility app scaffold.
- Purpose: Provide a starting point for development, testing, and documentation.

Features
--------
- Local-first assistant with chat, memory, and RAG
- Web UI for chat, recordings, trading, tools, safety, and action runner
- Integrations for Telegram, Slack, Discord, WhatsApp, Google Docs/Drive, Fireflies
- Safety approvals, audit logging, and kill switch

Telegram (chat + remote commands)
-------------------------------
Setup:
- TELEGRAM_BOT_TOKEN (required)
- TELEGRAM_WEBHOOK_SECRET (optional)
- THREAD_HISTORY_MAX_MESSAGES (optional; caps per-thread memory)

Inbound webhook:
- POST /api/integrations/telegram/webhook
- First-time senders must pair; Aika replies with a pairing code for approval in the UI.

Threaded memory (per chat):
- /thread new starts a new thread (fresh memory)
- /thread stop closes the thread
- /thread status shows the current thread info

RAG controls (per thread):
- /rag list | /rag use <id|all|auto> | /rag status
- If RAG returns no evidence or says "I don't know" Aika falls back to the LLM.

Remote command highlights:
- /help, /status, /resources, /approvals, /approve <id> [token]
- /rss and /knowledge for trading sources
- /macro list and /macro run <id>

Outbound send (requires approval by policy):
- POST /api/integrations/telegram/send { chatId, text }

Requirements
------------
- Operating system: Cross-platform (Windows / macOS / Linux)
- Runtime: Depends on implementation (e.g., Python 3.8+, Node 14+, .NET Core 6.0+)
- Tools: Git, build tools for chosen language

Installation
------------
1. Clone the repository:
    git clone https://github.com/yourusername/MyAika.git
2. Enter the project directory:
    cd MyAika
3. Install dependencies (example):
    - Python: python -m venv venv && venv\Scripts\activate (Windows) or source venv/bin/activate (Unix)
      pip install -r requirements.txt
    - Node: npm install

Usage
-----
- Run the application (example):
  - Python: python -m myaika
  - Node: npm start
- See docs/ or src/ for actual entrypoints and configuration.

Development
-----------
- Branching: Use feature branches, prefix with feat/, fix/, docs/, etc.
- Tests: Add unit tests in tests/ and run with the project's test runner (pytest, jest, etc.)
- Linting: Configure and run linters before commits.

Contributing
------------
- Fork the repository and open a pull request with a clear description.
- Follow the code style and add tests for new features/bug fixes.
- Update this README and any docs when behavior or APIs change.

Configuration
-------------
- Add project-specific configuration files (config/, .env.example)
- Document required environment variables and defaults here.

License
-------
- Add a license file (LICENSE) and update this section to match (MIT, Apache-2.0, etc.)

Contact
-------
- Project maintainer: Replace with your name and contact info or GitHub handle.

Notes
-----
- This readme is a template. Customize contents to reflect actual project goals, requirements, and usage instructions.