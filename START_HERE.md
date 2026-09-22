# Start NOVA

Use three PowerShell windows:

```powershell
ollama serve
```

```powershell
cd E:\Nova_AI
.\start-backend.bat
```

```powershell
cd E:\Nova_AI
.\start-frontend.bat
```

Then open [http://localhost:3000](http://localhost:3000).

To let a friend use NOVA, keep those windows open and share:

[https://preethu.tailff2d27.ts.net/](https://preethu.tailff2d27.ts.net/)

If the public link was stopped, restore it with:

```powershell
cd E:\Nova_AI
powershell -ExecutionPolicy Bypass -File .\share-nova.ps1
```

To stop public sharing:

```powershell
powershell -ExecutionPolicy Bypass -File .\share-nova.ps1 -Stop
```
