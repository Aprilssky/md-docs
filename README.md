# MD Docs 📝

**A rich markdown editor that lives entirely in your browser.** No backend, no servers, no accounts — all data is stored locally in your browser's IndexedDB.

👉 **[Live Demo](https://aprilssky.github.io/md-docs)** (replace with your GitHub Pages URL)

## Features

- ✍️ **Markdown editing** with live preview (split/edit/preview modes)
- 🖼️ **Insert images, video, and audio** — upload files from your computer
- 🎙️ **Record audio** directly in the browser via microphone
- 💾 **Auto-save** — never lose your work
- 📁 **Document management** — create, rename, search, delete
- 🌙 **Dark mode** / ☀️ Light mode toggle
- 📤 **Export** to Markdown or HTML
- 📥 **Import** existing `.md` files

## How it works

All data (documents + media files) is stored in your browser's **IndexedDB**. Nothing is sent to any server — this is a truly offline-capable, privacy-first application.

### Media references

When you insert a media file (image/video/audio) or record audio, the file is stored in IndexedDB and referenced in the markdown using a `media://ID` syntax:

- Images: `![filename](media://uuid)`
- Video: `<video src="media://uuid" controls></video>`
- Audio: `<audio src="media://uuid" controls></audio>`

These references are resolved to blob URLs when the markdown is rendered for preview.

## Getting Started

### Usage

1. Clone or download this repository
2. Open `index.html` in your browser (or serve with any static server)
3. That's it — start writing!

Or deploy to GitHub Pages:
1. Push to a GitHub repo
2. Enable GitHub Pages in repo settings (source: main branch, root folder)
3. Visit your GitHub Pages URL

### Development

No build tools needed. Just edit the files:

```
md-docs/
├── index.html            # Entry point
├── README.md
├── assets/
│   ├── css/
│   │   └── style.css     # All styles (light + dark theme)
│   └── js/
│       ├── storage.js    # IndexedDB storage layer
│       ├── recorder.js   # Audio recording (MediaRecorder API)
│       ├── editor.js     # Editor, toolbar, markdown rendering
│       └── app.js        # Main app controller
```

## Tech Stack

- **Storage:** Browser IndexedDB
- **Markdown:** [marked.js](https://marked.js.org/)
- **Recording:** MediaRecorder API (WebM Opus)
- **Hosting:** GitHub Pages (or any static server)

## License

MIT
