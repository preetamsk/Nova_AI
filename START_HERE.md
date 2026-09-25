# NOVA AI — Quick Start Guide

## 🌐 24/7 Live Cloud Web App (No Setup Required)

NOVA AI is deployed and running 24/7 in production on Vercel:

👉 **[https://frontend-six-beta-80.vercel.app](https://frontend-six-beta-80.vercel.app)**

Anyone can open this link directly in any browser on mobile or desktop without needing Ollama, Python, or local servers.

---

## 💻 Optional: Running Locally on Your Computer

If you want to run NOVA completely offline/locally on your computer with local Ollama:

### Step 1: Start Ollama (in a terminal)
```powershell
ollama serve
```

### Step 2: Start the Python Backend (port 8000)
```powershell
cd E:\Nova_AI
.\start-backend.bat
```

### Step 3: Start the Next.js Frontend (port 3000)
```powershell
cd E:\Nova_AI
.\start-frontend.bat
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚠️ Note on the Old Tailscale Link (`preethu.tailff2d27.ts.net`)
The address `https://preethu.tailff2d27.ts.net/` was an old temporary tunnel that only worked when your laptop was actively running `.\start-backend.bat`. You do **not** need it anymore because NOVA is hosted 24/7 at **[https://frontend-six-beta-80.vercel.app](https://frontend-six-beta-80.vercel.app)**.
