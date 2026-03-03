# Ghostscript Configuration

This application requires Ghostscript to be installed on the server.

### 1. Installation
If not installed, please download and install Ghostscript for Windows from:
https://ghostscript.com/releases/gsdnld.html
(Usually `gswin64c.exe` is what we need)

### 2. Path Configuration
By default, the app tries to run `gswin64c` from the system PATH.
If Ghostscript is not in your PATH, please update the `backend/.env` file:

```env
GS_PATH=C:\Program Files\gs\gs10.02.1\bin\gswin64c.exe
```

*Note: Use the full path to `gswin64c.exe`.*
