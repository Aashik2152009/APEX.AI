# Apex AI: setup in 4 steps (no commands)

## 1. Get the installer (once, about 10 minutes)
1. Make a free account at github.com. Click **+ > New repository**, name it apex-ai, choose **Private**, Create.
2. Click **uploading an existing file**. Unzip this project first, then select ALL files and folders inside it and drag them into the page. Everything is in one flat folder, plus the hidden-looking `.github` folder which must come along. Click **Commit changes**.
3. Open the **Actions** tab. Wait about 4 minutes until "Build Windows installer" shows a green tick.
4. Click that run, scroll to **Artifacts**, download **ApexAI-Windows-Installer**, unzip it.

## 2. Install
Double-click `ApexAI-Setup-1.0.0.exe`. If Windows says "protected your PC" (the app is unsigned): **More info > Run anyway**. It installs in one click and puts a shortcut on your desktop.

## 3. Local model (Ollama)
Keep Ollama installed. Apex AI starts it by itself and finds the Qwen model you already have. The top-right badge shows the model name. If you have several, choose one in Settings (gear) > Local.

## 4. Gemini (cloud)
Gear > paste your key (from aistudio.google.com/apikey) > Save. It tests itself. Use the LOCAL / CLOUD switch on the main screen any time.

## Voices
Gear > Voices: pick a voice for Reze and Alfred and press Test. Alfred: en-GB-RyanNeural. Reze default: en-US-AriaNeural (your Python file's en-US-AnaNeural is a child voice, still selectable). Voices need internet; without it Windows' built-in voices are used.

Extra apps Alfred may launch: `%APPDATA%\Apex AI\apps.json`, for example {"discord": "C:\\path\\to\\Discord.exe"}.
