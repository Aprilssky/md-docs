/**
 * editor.js — Markdown editor with toolbar, live preview, and media support
 */
class Editor {
  constructor(storage) {
    this.storage = storage;
    this.mediaBlobCache = new Map(); // id → { blobUrl, blob }
    this.currentDocId = null;
    this.savedContent = '';
    this.saveTimeout = null;

    // DOM refs
    this.editorEl = document.getElementById('editor-pane');
    this.previewEl = document.getElementById('preview-pane');
    this.toolbar = document.getElementById('editor-toolbar');
    this.statusBar = document.getElementById('status-bar');
    this.saveStatus = document.getElementById('save-status');
    this.docTitleStatus = document.getElementById('doc-title-status');

    this._bindToolbar();
    this._bindKeyboard();
  }

  // ─── Document Loading ─────────────────────────

  loadDocument(doc) {
    this.currentDocId = doc.id;
    this.editorEl.value = doc.content || '';
    this.savedContent = doc.content || '';
    this.docTitleStatus.textContent = doc.title || 'Untitled';
    this.updatePreview();
    this.setSaveStatus('saved');
  }

  clearEditor() {
    this.currentDocId = null;
    this.editorEl.value = '';
    this.savedContent = '';
    this.docTitleStatus.textContent = 'Untitled';
    this.previewEl.innerHTML = '';
    this.setSaveStatus('');
  }

  get currentContent() {
    return this.editorEl.value;
  }

  // ─── Preview ──────────────────────────────────

  async updatePreview() {
    const markdown = this.currentContent;
    this.storage.cleanupCache(markdown, this.mediaBlobCache);

    try {
      const { resolved } = await this.storage.renderContent(markdown, this.mediaBlobCache);
      const html = marked.parse(resolved, {
        breaks: true,
        gfm: true,
      });
      this.previewEl.innerHTML = html;
    } catch (err) {
      console.error('Render error:', err);
    }
  }

  // ─── Save ─────────────────────────────────────

  scheduleSave(docMeta) {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this._doSave(docMeta), 500);
  }

  async _doSave({ id, title }) {
    const content = this.currentContent;
    if (content === this.savedContent) {
      this.setSaveStatus('saved');
      return id;
    }
    this.setSaveStatus('saving...');
    const nowId = await this.storage.saveDocument({
      id: id || this.currentDocId || undefined,
      title: title || 'Untitled',
      content,
    });
    this.currentDocId = nowId;
    this.savedContent = content;
    this.setSaveStatus('saved');
    return nowId;
  }

  async forceSave(docMeta) {
    clearTimeout(this.saveTimeout);
    return this._doSave(docMeta);
  }

  setSaveStatus(text) {
    this.saveStatus.textContent = text;
  }

  // ─── Text Insertion (at cursor) ───────────────

  insertAtCursor(text) {
    const ta = this.editorEl;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.substring(0, start);
    const after = ta.value.substring(end);
    ta.value = before + text + after;
    const newPos = start + text.length;
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  wrapSelection(before, after) {
    const ta = this.editorEl;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const text = selected ? before + selected + after : before + after;
    const beforeText = ta.value.substring(0, start);
    const afterText = ta.value.substring(end);
    ta.value = beforeText + text + afterText;
    const newStart = start + before.length;
    const newEnd = selected ? start + before.length + selected.length : newStart;
    ta.selectionStart = newStart;
    ta.selectionEnd = newEnd;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ─── Media Insertion ──────────────────────────

  async insertMediaFromFile(file, mimeCategory, options = {}) {
    const { name } = options;
    const MAX_SIZES = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024, audio: 50 * 1024 * 1024 };
    const maxSize = MAX_SIZES[mimeCategory] || MAX_SIZES.audio;

    if (file.size > maxSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const limit = (maxSize / 1024 / 1024).toFixed(0);
      alert(`File too large (${sizeMB}MB). Max: ${limit}MB`);
      return false;
    }

    const media = {
      name: name || file.name,
      type: mimeCategory,
      mimeType: file.type,
      data: file,
      size: file.size,
    };

    const id = await this.storage.saveMedia(media);

    let insertText;
    switch (mimeCategory) {
      case 'image':
        insertText = `![${media.name}](media://${id})`;
        break;
      case 'video':
        insertText = `\n<video src="media://${id}" controls></video>\n`;
        break;
      case 'audio':
        insertText = `\n<audio src="media://${id}" controls></audio>\n`;
        break;
      default:
        insertText = `[${media.name}](media://${id})`;
    }

    this.insertAtCursor(insertText);
    this.updatePreview();
    return true;
  }

  // ─── Toolbar ──────────────────────────────────

  _bindToolbar() {
    const cmd = (action) => this.toolbar.querySelector(`[data-cmd="${action}"]`);

    const actions = {
      bold: () => this.wrapSelection('**', '**'),
      italic: () => this.wrapSelection('*', '*'),
      strikethrough: () => this.wrapSelection('~~', '~~'),
      h1: () => this.wrapSelection('# ', ''),
      h2: () => this.wrapSelection('## ', ''),
      h3: () => this.wrapSelection('### ', ''),
      ul: () => this.wrapSelection('- ', ''),
      ol: () => this.wrapSelection('1. ', ''),
      quote: () => this.wrapSelection('> ', ''),
      code: () => {
        const ta = this.editorEl;
        const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
        if (sel.includes('\n')) {
          this.wrapSelection('```\n', '\n```');
        } else {
          this.wrapSelection('`', '`');
        }
      },
      hr: () => this.insertAtCursor('\n---\n'),
      link: async () => {
        const url = prompt('Link URL:');
        if (url) this.wrapSelection('[', `](${url})`);
      },
    };

    // Text formatting toolbar clicks
    this.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      const action = btn.dataset.cmd;
      if (actions[action]) {
        actions[action]();
        btn.blur();
      }
    });

    // Media insertion
    document.getElementById('insert-image').addEventListener('click', () => {
      this._openFileDialog('image/*', 'image');
    });
    document.getElementById('insert-video').addEventListener('click', () => {
      this._openFileDialog('video/*', 'video');
    });
    document.getElementById('insert-audio').addEventListener('click', () => {
      this._openFileDialog('audio/*', 'audio');
    });
    document.getElementById('record-audio').addEventListener('click', () => {
      this._openRecorder();
    });

    // Editor input → auto-preview + autosave
    this.editorEl.addEventListener('input', () => {
      this.updatePreview();
      this.setSaveStatus('unsaved');
    });

    // Export
    document.getElementById('btn-export-md').addEventListener('click', () => this._exportMD());
    document.getElementById('btn-export-html').addEventListener('click', () => this._exportHTML());

    // Import
    document.getElementById('btn-import').addEventListener('click', () => this._importMD());
  }

  _bindKeyboard() {
    this.editorEl.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + S → save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('btn-save')?.click();
      }
    });
  }

  // ─── File Dialog ──────────────────────────────

  _openFileDialog(accept, category) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this.insertMediaFromFile(file, category);
    };
    input.click();
  }

  // ─── Recorder ─────────────────────────────────

  async _openRecorder() {
    const modal = document.getElementById('recorder-modal');
    const statusEl = document.getElementById('recorder-status');
    const timerEl = document.getElementById('recorder-timer');
    const startBtn = document.getElementById('recorder-start');
    const stopBtn = document.getElementById('recorder-stop');
    const preview = document.getElementById('recorder-preview');
    const audioPreview = preview.querySelector('audio');
    const insertBtn = document.getElementById('recorder-insert');
    const closeBtn = document.getElementById('recorder-close');

    const reset = () => {
      statusEl.textContent = 'Click Start to begin recording';
      timerEl.textContent = '00:00';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      preview.classList.add('hidden');
      audioPreview.src = '';
    };
    reset();

    const recorder = new AudioRecorder();
    modal.classList.remove('hidden');

    startBtn.onclick = async () => {
      try {
        await recorder.init();
        recorder.start();
        recorder.startTimer();
        recorder.onTick = () => {
          const sec = recorder.elapsed;
          timerEl.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
        };
        statusEl.textContent = '🔴 Recording...';
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } catch (err) {
        statusEl.textContent = '❌ Microphone access denied';
        console.error(err);
      }
    };

    stopBtn.onclick = async () => {
      try {
        const blob = await recorder.stop();
        recorder.stopTimer();
        statusEl.textContent = '✅ Recording complete';
        startBtn.disabled = false;
        stopBtn.disabled = true;

        const url = URL.createObjectURL(blob);
        audioPreview.src = url;
        preview.classList.remove('hidden');

        insertBtn.onclick = async () => {
          const name = `Recording ${new Date().toLocaleTimeString()}`;
          const media = { name, type: 'audio', mimeType: blob.type, data: blob, size: blob.size };
          const id = await this.storage.saveMedia(media);
          this.insertAtCursor(`\n<audio src="media://${id}" controls></audio>\n`);
          URL.revokeObjectURL(url);
          modal.classList.add('hidden');
          recorder.cleanup();
          this.updatePreview();
        };
      } catch (err) {
        console.error(err);
        statusEl.textContent = '❌ Error stopping recording';
      }
    };

    const closeHandler = () => {
      modal.classList.add('hidden');
      recorder.cleanup();
      URL.revokeObjectURL(audioPreview.src);
    };
    closeBtn.onclick = closeHandler;
    modal.querySelector('.modal-close').onclick = closeHandler;
  }

  // ─── Export / Import ──────────────────────────

  _exportMD() {
    const content = this.currentContent;
    const title = this.docTitleStatus.textContent || 'document';
    this._download(content, `${title}.md`, 'text/markdown');
  }

  _exportHTML() {
    const content = this.previewEl.innerHTML;
    const title = this.docTitleStatus.textContent || 'document';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${content}</body></html>`;
    this._download(html, `${title}.html`, 'text/html');
  }

  _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _importMD() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target.result;
        this.editorEl.value = content;
        this.savedContent = '';
        this.updatePreview();
        this.setSaveStatus('unsaved');
        this.docTitleStatus.textContent = file.name.replace(/\.(md|markdown|txt)$/i, '');
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ─── Cleanup ──────────────────────────────────

  destroy() {
    clearTimeout(this.saveTimeout);
    for (const [, entry] of this.mediaBlobCache) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.mediaBlobCache.clear();
  }
}
