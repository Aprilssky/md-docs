/**
 * app.js — Main application controller for MD Docs
 * Manages document list, sidebar, theme, and initialization.
 */
(async function main() {
  try {
  // ─── Init Storage ──────────────────────────────
  const storage = new Storage();
  await storage.open();

  const editor = new Editor(storage);
  let documents = [];
  let currentDocId = null;
  let docListDirty = false;

  const sidebar = document.getElementById('sidebar');
  const docListEl = document.getElementById('doc-list');
  const newDocBtn = document.getElementById('new-doc');
  const deleteDocBtn = document.getElementById('delete-doc');
  const searchInput = document.getElementById('search-docs');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const themeToggle = document.getElementById('theme-toggle');
  const viewToggle = document.getElementById('view-toggle');
  const btnSave = document.getElementById('btn-save');
  const previewPane = document.getElementById('preview-pane');
  const editorPane = document.getElementById('editor-pane');

  // ─── Document List ────────────────────────────

  async function loadDocList(filter = '') {
    documents = await storage.getAllDocuments();
    if (filter) {
      const lower = filter.toLowerCase();
      documents = documents.filter((d) => d.title.toLowerCase().includes(lower));
    }
    renderDocList();
  }

  function renderDocList() {
    docListEl.innerHTML = '';
    if (documents.length === 0) {
      docListEl.innerHTML = '<li class="doc-empty">No documents yet</li>';
      return;
    }
    documents.forEach((doc) => {
      const li = document.createElement('li');
      li.className = 'doc-item' + (doc.id === currentDocId ? ' active' : '');
      li.dataset.id = doc.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'doc-title';
      titleSpan.textContent = doc.title || 'Untitled';
      titleSpan.title = doc.title || 'Untitled';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'doc-date';
      const d = new Date(doc.updatedAt);
      dateSpan.textContent = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      const editBtn = document.createElement('button');
      editBtn.className = 'doc-rename';
      editBtn.textContent = '✏️';
      editBtn.title = 'Rename';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renameDoc(doc.id);
      });

      li.appendChild(titleSpan);
      li.appendChild(dateSpan);
      li.appendChild(editBtn);
      li.addEventListener('click', () => selectDoc(doc.id));
      docListEl.appendChild(li);
    });
  }

  async function selectDoc(id) {
    if (currentDocId && editor.currentContent !== editor.savedContent) {
      const meta = documents.find((d) => d.id === currentDocId) || { id: currentDocId, title: 'Untitled' };
      await editor.forceSave(meta);
    }
    currentDocId = id;
    const doc = await storage.getDocument(id);
    if (!doc) return;
    editor.loadDocument(doc);
    renderDocList();
  }

  async function renameDoc(id) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const title = prompt('Document title:', doc.title || '');
    if (title === null || title.trim() === '') return;
    doc.title = title.trim();
    await storage.saveDocument(doc);
    if (id === currentDocId) {
      editor.docTitleStatus.textContent = title;
    }
    await loadDocList(searchInput.value);
  }

  async function createNewDoc() {
    if (currentDocId && editor.currentContent !== editor.savedContent) {
      const meta = documents.find((d) => d.id === currentDocId) || { id: currentDocId, title: 'Untitled' };
      await editor.forceSave(meta);
    }
    const id = await storage.saveDocument({ title: 'Untitled', content: '' });
    currentDocId = id;
    editor.clearEditor();
    editor.currentDocId = id;
    editor.loadDocument({ id, title: 'Untitled', content: '' });
    await loadDocList(searchInput.value);
  }

  async function deleteCurrentDoc() {
    if (!currentDocId) return;
    const doc = documents.find((d) => d.id === currentDocId);
    const name = doc?.title || 'Untitled';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await storage.deleteDocument(currentDocId);
    editor.clearEditor();
    currentDocId = null;
    await loadDocList(searchInput.value);
  }

  // ─── Events ───────────────────────────────────

  newDocBtn.addEventListener('click', createNewDoc);
  deleteDocBtn.addEventListener('click', deleteCurrentDoc);

  searchInput.addEventListener('input', (e) => {
    loadDocList(e.target.value);
  });

  // Auto-save timer
  setInterval(async () => {
    if (currentDocId && editor.currentContent !== editor.savedContent) {
      const meta = documents.find((d) => d.id === currentDocId) || { id: currentDocId, title: 'Untitled' };
      await editor.forceSave(meta);
    }
  }, 30000);

  btnSave.addEventListener('click', async () => {
    if (!currentDocId) await createNewDoc();
    const meta = documents.find((d) => d.id === currentDocId) || { id: currentDocId, title: 'Untitled' };
    const id = await editor.forceSave(meta);
    if (!currentDocId) {
      currentDocId = id;
      await loadDocList(searchInput.value);
    }
    editor.setSaveStatus('✅ Saved');
  });

  // ─── Sidebar Toggle ───────────────────────────

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  // ─── Theme Toggle ─────────────────────────────

  const savedTheme = localStorage.getItem('md-docs-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('md-docs-theme', next);
    themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // ─── View Toggle (Edit / Preview / Split) ─────

  let viewMode = localStorage.getItem('md-docs-view') || 'split';
  function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('md-docs-view', mode);
    editorPane.classList.remove('active', 'hidden');
    previewPane.classList.remove('active', 'hidden');
    if (mode === 'edit') {
      editorPane.classList.add('active');
      editorPane.classList.remove('hidden');
      previewPane.classList.add('hidden');
      viewToggle.textContent = '👁️ Preview';
    } else if (mode === 'preview') {
      previewPane.classList.add('active');
      previewPane.classList.remove('hidden');
      editorPane.classList.add('hidden');
      viewToggle.textContent = '✏️ Edit';
    } else {
      editorPane.classList.add('active');
      previewPane.classList.add('active');
      viewToggle.textContent = '📐 Split';
    }
  }
  setViewMode(viewMode);
  viewToggle.addEventListener('click', () => {
    const modes = ['split', 'edit', 'preview'];
    const idx = (modes.indexOf(viewMode) + 1) % modes.length;
    setViewMode(modes[idx]);
  });

  // ─── Responsive Sidebar ──────────────────────

  function handleResize() {
    if (window.innerWidth <= 768) {
      sidebar.classList.add('collapsed');
    }
  }
  window.addEventListener('resize', handleResize);
  if (window.innerWidth <= 768) sidebar.classList.add('collapsed');

  // ─── Keyboard Shortcuts ───────────────────────

  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+N → new doc
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      createNewDoc();
    }
  });

  // ─── Boot ─────────────────────────────────────

  // Check if there's a default doc to load
  await loadDocList();
  if (documents.length > 0) {
    // Load the most recent
    await selectDoc(documents[0].id);
  } else {
    // Create a welcome doc
    const welcomeContent = `# Welcome to MD Docs 🎉

A rich markdown editor that lives entirely in your browser.

## Features

- **Markdown editing** with live preview
- **Insert images, videos, and audio** — drag or click the toolbar
- **Record audio** directly in the browser
- **Auto-save** — never lose your work
- **Theme** — toggle light/dark mode in the header

## How to Use

1. Click **+ New Document** to start fresh
2. Use the **toolbar** above for formatting
3. Click 📷 🎬 🎵 to insert media files
4. Press 🎙️ to record audio
5. All data is stored in your browser

## Markdown Tips

| Element | Syntax |
|---------|--------|
| Bold | \`**text**\` |
| Italic | \`*text*\` |
| Heading | \`# H1\` \`## H2\` |
| Link | \`[text](url)\` |
| Image | \`![alt](url)\` |
| Code | \`\`\` \`code\` \`\`\` |

---

_Happy writing! ✍️_
`;
    const id = await storage.saveDocument({ title: 'Welcome', content: welcomeContent });
    currentDocId = id;
    editor.loadDocument({ id, title: 'Welcome', content: welcomeContent });
    await loadDocList();
  }

  // ─── Show the app ───────────────────────────────
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  console.log('📝 MD Docs ready!');
  } catch (err) {
    document.getElementById('loading').textContent = '⚠️ ' + err.message;
    console.error('MD Docs init error:', err);
  }
})();
