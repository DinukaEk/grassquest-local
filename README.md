# GrassQuest Local 🌿

**A little less scrolling. A little more outside.**

GrassQuest Local turns a short break into a personalized outdoor micro-adventure. It uses **Gemma 3 4B locally through Ollama** to generate a five-task mission and a 3×3 Outside Bingo board based on the time you have, your environment, and your goal.

> **Local-first by design:** quest generation runs through Ollama on the same computer as the ASP.NET backend. There is no third-party hosted AI API in the default setup.

## Features

- **Personalized quests:** choose duration, environment, goal, activity level, and whether you're going solo or with someone.
- **Gemma-powered generation:** generate five outdoor tasks and a nine-square Outside Bingo board.
- **Pocket Mode:** a simplified mobile-friendly view for taking a mission outside.
- **Mission timer and progress:** track task completion and bingo discoveries.
- **Save and restore:** the active quest and progress persist in browser storage after a refresh.
- **Offline-friendly PWA:** the service worker caches the app shell and static assets so a previously loaded mission can remain usable offline.
- **Take your quest with you:** share, download, or print a mission.
- **Local model status:** check whether Ollama and Gemma are available.

## Tech stack

- ASP.NET Core / .NET 10
- HTML, CSS, and vanilla JavaScript
- [Ollama](https://ollama.com/) for local inference
- [Gemma 3 4B](https://ai.google.dev/gemma) as the quest-generation model
- Progressive Web App features: web app manifest, service worker, and browser storage

## Requirements

- Windows, macOS, or Linux
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Ollama](https://ollama.com/download) installed and running
- The `gemma3:4b` model downloaded in Ollama

## Run locally

1. Clone this repository and enter the project directory:

   ```bash
   git clone https://github.com/DinukaEk/grassquest-local.git
   cd grassquest-local
   ```

   If you use a different repository name or GitHub username, adjust the clone URL accordingly.

2. Download the model and confirm it is installed:

   ```bash
   ollama pull gemma3:4b
   ollama list
   ```

3. Restore dependencies and start the app:

   ```bash
   dotnet restore
   dotnet run
   ```

4. Open the local URL printed in the terminal. The included HTTP launch profile normally uses `http://localhost:5231`.

Keep Ollama running while generating new quests. The first model response can take longer while the model loads.

## How it works

1. The user chooses a duration, environment, goal, activity level, and companion option.
2. The frontend sends those preferences to `POST /api/quest`.
3. ASP.NET Core sends a request to the local Ollama service at `http://localhost:11434` using `gemma3:4b`.
4. The model response is converted into a mission and rendered in the browser.
5. Browser storage preserves the current quest and progress. The service worker caches the frontend shell and static assets.

### API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/` | Serves the web app |
| `GET` | `/api/status` | Checks local Ollama and Gemma availability |
| `POST` | `/api/quest` | Generates a quest using the local model |

## Offline and privacy notes

- The default configuration sends inference requests to the local Ollama endpoint at `http://localhost:11434`.
- The app does not require a third-party hosted AI API key for its default local setup.
- The service worker caches the frontend shell and static assets; it does **not** cache AI requests or responses.
- A saved mission can remain usable offline after the app has been loaded and cached. **Generating a new AI mission still requires the ASP.NET backend and Ollama to be running and reachable.**
- Browser storage is local to that browser and device; it is not synchronized between devices.
- On a phone, `localhost` refers to the phone itself. Using a backend running on another computer requires a suitable network setup; installing a PWA on another device generally requires HTTPS.

## Safety

GrassQuest is a playful activity generator, not medical advice. Use your judgment, stay aware of traffic, weather, terrain, and your surroundings, and skip any activity that feels unsafe. Do not approach, touch, eat, or collect unknown wildlife or plants. Never use the app while crossing a road or doing anything that requires your full attention.

## Development

Build the backend with:

```bash
dotnet restore
dotnet build
```

Please open an issue before proposing a large change. Contributions that improve accessibility, safety, documentation, localization, and local-first functionality are welcome.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).

## Acknowledgements

- The Gemma team for the Gemma model family.
- The Ollama project for making local model execution straightforward.
