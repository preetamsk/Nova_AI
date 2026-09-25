# NOVA AI — Personal AI Assistant

NOVA is an advanced personal AI assistant featuring real-time streaming, multimodal image vision analysis, PDF document comprehension, and responsive Markdown rendering with table support.

---

## 🌐 Live Production Application

The app is deployed and live 24/7 on Vercel:

👉 **[https://frontend-six-beta-80.vercel.app](https://frontend-six-beta-80.vercel.app)**

- **No installation needed:** Open the link in any mobile or desktop browser.
- **24/7 Availability:** Runs entirely on serverless cloud infrastructure without requiring your computer to stay on.
- **Full Privacy:** Chat history is stored locally on the user's device browser; no shared database.

---

## 🚀 Features

- **Document Analysis:** Upload PDFs to extract text, summarize, and ask follow-up questions across multiple conversation turns.
- **Multimodal Vision:** Upload or capture photos with your camera for structured visual breakdowns.
- **Formatted Markdown & Tables:** Clean GitHub-flavored Markdown rendering with responsive tables, zebra striping, and code copy buttons.
- **Dark & Light Modes:** Tailored color palettes with instant theme switching.
- **Profile Customization:** Personalized greetings and guest verification.

---

## 🛠️ Local Development (Optional)

To run the full stack locally on your computer:

```powershell
# 1. Run local Ollama (if using local offline models)
ollama serve

# 2. Run Python FastAPI Backend (Port 8000)
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --port 8000 --reload

# 3. Run Next.js Frontend (Port 3000)
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## ℹ️ Note on Tailscale Link

The old URL `https://preethu.tailff2d27.ts.net/` was a temporary local Tailscale Funnel that required your laptop to remain awake and running `uvicorn` on port 8000. It has been replaced by the permanent 24/7 production URL at **[https://frontend-six-beta-80.vercel.app](https://frontend-six-beta-80.vercel.app)**.
