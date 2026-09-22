# NOVA AI — free local assistant with a shareable link

NOVA runs on this laptop using **Ollama**. It does not use OpenAI or any paid AI API. Your chat history stays in the local NOVA database, and Ollama is reachable only on `127.0.0.1`—it is never exposed to the internet.

## Start NOVA

Open three PowerShell windows.

```powershell
# Window 1 — only needed if Ollama is not already running
ollama serve
```

```powershell
# Window 2 — NOVA backend
cd E:\Nova_AI
.\start-backend.bat
```

```powershell
# Window 3 — NOVA frontend
cd E:\Nova_AI
.\start-frontend.bat
```

Open [http://localhost:3000](http://localhost:3000) to use NOVA on this laptop.

## Share NOVA with a friend

NOVA has a free HTTPS share link:

[https://preethu.tailff2d27.ts.net/](https://preethu.tailff2d27.ts.net/)

Before sharing, make sure the three NOVA services above are running. Then check or re-enable the public link with:

```powershell
cd E:\Nova_AI
powershell -ExecutionPolicy Bypass -File .\share-nova.ps1
```

Your friend only opens the link in a browser—no NOVA, Ollama, model, or other installation is needed. Your laptop must remain powered on, connected to the internet, and running NOVA while they use it.

Keep the link limited to people you trust. It is public to anyone who has it and uses your laptop's model capacity.

## Stop sharing and shut down

To remove the public link while keeping local NOVA available:

```powershell
cd E:\Nova_AI
powershell -ExecutionPolicy Bypass -File .\share-nova.ps1 -Stop
```

To stop NOVA completely, press `Ctrl + C` in the backend and frontend PowerShell windows. You can also close Ollama if you do not need it.

## Verify the project

```powershell
cd E:\Nova_AI\backend
.\.venv\Scripts\python.exe -m pytest tests -q

cd E:\Nova_AI\frontend
npm run build
npm run lint
```

The current checks cover private browser histories, visible streaming errors, upload validation, CORS, low-memory local settings, the production frontend build, and a real streamed Ollama reply through the public link.
