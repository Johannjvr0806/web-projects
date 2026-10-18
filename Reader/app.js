// App State
let books = [];
let customCategories = ["Favorites", "Sci-Fi", "Romance"];
let currentBookId = null;
let currentEpub = null;
let currentRendition = null;
let currentFontSize = 100;
let currentTheme = 'theme-purple';
let activeFilter = 'all';
let controlsVisible = true;
let ttsUtterance = null;
let isTTSPlaying = false;
let currentSelectedCfiRange = null;

const THEME_TEXT = {
  'theme-light': '#1f2937',
  'theme-sepia': '#433422',
  'theme-purple': '#f3e8ff',
  'theme-navy': '#e0e6ed',
  'theme-dark': '#e0e0e0'
};

function applyBodyTheme(cls) {
  if (!THEME_TEXT[cls]) cls = 'theme-purple';
  Object.keys(THEME_TEXT).forEach(t => document.body.classList.remove(t));
  document.body.classList.add(cls);
  return cls;
}

// LocalForage Setup
localforage.config({ name: 'ReaderApp', storeName: 'library' });

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  history.replaceState({ view: 'shelf' }, '');
  await loadSavedTheme();
  await loadCategories();
  await loadBooks();
  setupFileInput();
  renderCategoryTabs();
});

// Persistent Theme System
async function loadSavedTheme() {
  const saved = await localforage.getItem('user_theme');
  if (saved) {
    currentTheme = applyBodyTheme(saved);
  } else {
    applyBodyTheme('theme-purple');
  }
  const savedFont = await localforage.getItem('user_font_size');
  if (savedFont) currentFontSize = savedFont;
}

async function setTheme(themeClass) {
  currentTheme = applyBodyTheme(themeClass);
  await localforage.setItem('user_theme', currentTheme);
  applyThemeToRendition();
}

// Categories Management
async function loadCategories() {
  const saved = await localforage.getItem('custom_categories');
  if (saved) customCategories = saved;
}

async function promptAddCategory() {
  const name = prompt("Enter new shelf name (e.g., Thrillers, Audiobooks, To Read):");
  if (name && name.trim()) {
    const trimmed = name.trim();
    if (!customCategories.includes(trimmed)) {
      customCategories.push(trimmed);
      await localforage.setItem('custom_categories', customCategories);
      renderCategoryTabs();
      renderBookshelf();
    }
  }
}

function renderCategoryTabs() {
  const filterBar = document.getElementById('filter-bar');
  filterBar.innerHTML = `
    <button class="filter-btn ${activeFilter === 'all' ? 'active' : ''}" onclick="filterCategory('all', this)">All</button>
    <button class="filter-btn ${activeFilter === 'unread' ? 'active' : ''}" onclick="filterCategory('unread', this)">Unread</button>
    <button class="filter-btn ${activeFilter === 'reading' ? 'active' : ''}" onclick="filterCategory('reading', this)">Reading</button>
    <button class="filter-btn ${activeFilter === 'finished' ? 'active' : ''}" onclick="filterCategory('finished', this)">Finished</button>
  `;

  customCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${activeFilter === cat ? 'active' : ''}`;
    btn.textContent = cat;
    btn.onclick = () => filterCategory(cat, btn);
    filterBar.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'filter-btn add-cat-btn';
  addBtn.textContent = '+ Shelf';
  addBtn.onclick = promptAddCategory;
  filterBar.appendChild(addBtn);
}

function filterCategory(cat, btn) {
  activeFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBookshelf();
}

// Bookshelf Logic
async function loadBooks() {
  const stored = await localforage.getItem('books_meta');
  books = stored || [];
  renderBookshelf();
}

async function saveBooksMeta() {
  await localforage.setItem('books_meta', books);
}

// Saving the whole library on every page turn is slow, so wait until you stop turning pages
let saveTimer = null;
function saveBooksMetaSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveBooksMeta, 1500);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveBooksMeta(); });
window.addEventListener('pagehide', saveBooksMeta);

function setupFileInput() {
  const input = document.getElementById('epub-input');
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (let file of files) {
      await processAndAddBook(file);
    }
    input.value = '';
    renderBookshelf();
  });
}

async function processAndAddBook(file) {
  const arrayBuffer = await file.arrayBuffer();
  const tempBook = ePub(arrayBuffer);
  await tempBook.ready;
  const metadata = await tempBook.loaded.metadata;
  let coverUrl = null;

  try {
    const coverPath = await tempBook.coverUrl();
    if (coverPath) {
      const blob = await fetch(coverPath).then(r => r.blob());
      coverUrl = await new Promise(res => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(blob);
      });
    }
  } catch (err) { console.log('No cover found', err); }

  const id = 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
  await localforage.setItem(id, arrayBuffer);

  const newBook = {
    id,
    title: metadata.title || file.name.replace('.epub', ''),
    author: metadata.creator || 'Unknown Author',
    cover: coverUrl,
    progress: 0,
    cfi: null,
    status: 'unread',
    category: null,
    bookmarks: [],
    highlights: []
  };

  books.push(newBook);
  await saveBooksMeta();
}

function renderBookshelf() {
  const grid = document.getElementById('shelf-grid');
  grid.innerHTML = '';

  const filtered = books.filter(b => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return b.status === 'unread' || !b.status;
    if (activeFilter === 'reading') return b.status === 'reading';
    if (activeFilter === 'finished') return b.status === 'finished';
    return b.category === activeFilter;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 40px;">No books found in "${activeFilter}". Tapping "Add" lets you upload EPUB files!</div>`;
    return;
  }

  filtered.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    
    let shelfOptions = `<option value="">-- Shelf --</option>`;
    customCategories.forEach(cat => {
      shelfOptions += `<option value="${cat}" ${book.category === cat ? 'selected' : ''}>${cat}</option>`;
    });

    card.innerHTML = `
      <div class="cover-box" onclick="openBook('${book.id}')">
        ${book.cover ? `<img src="${book.cover}" alt="Cover">` : `<span>📖</span>`}
        ${book.category ? `<span class="category-badge">${book.category}</span>` : ''}
        <span class="status-badge ${book.status === 'finished' ? 'finished' : ''}">${book.status || 'unread'}</span>
      </div>
      <div class="book-title" title="${book.title}">${book.title}</div>
      <div class="book-author" title="${book.author}">${book.author}</div>
      <div class="card-actions">
        <select class="shelf-select" onchange="assignShelf('${book.id}', this.value)">
          ${shelfOptions}
        </select>
      </div>
      <button class="delete-btn" onclick="deleteBook('${book.id}', event)">✕</button>
    `;
    grid.appendChild(card);
  });
}

async function assignShelf(bookId, category) {
  const book = books.find(b => b.id === bookId);
  if (book) {
    book.category = category || null;
    await saveBooksMeta();
    renderBookshelf();
  }
}

async function deleteBook(id, e) {
  e.stopPropagation();
  if (confirm("Delete this book from your library?")) {
    books = books.filter(b => b.id !== id);
    await localforage.removeItem(id);
    await localforage.removeItem('loc_' + id);
    await saveBooksMeta();
    renderBookshelf();
  }
}

// Reader Logic
async function openBook(id) {
  currentBookId = id;
  const bookData = books.find(b => b.id === id);
  if (!bookData) return;

  const arrayBuffer = await localforage.getItem(id);
  if (!arrayBuffer) return alert("Error loading book data.");

  switchView('reader');

  if (currentEpub) currentEpub.destroy();
  currentEpub = ePub(arrayBuffer);
  
  currentRendition = currentEpub.renderTo("viewer", {
    width: "100%",
    height: "100%",
    spread: "none"
  });

  // Register tap zones + theme BEFORE the first page is shown,
  // otherwise the first page has no tap handling until you press Next
  setupRenditionEvents();
  currentRendition.themes.fontSize(`${currentFontSize}%`);

  const targetCfi = bookData.cfi || undefined;
  await currentRendition.display(targetCfi);

  loadToc();
  setControls(false); // start reading with the menus hidden

  if (bookData.status === 'unread') {
    bookData.status = 'reading';
    await saveBooksMeta();
  }
}

function themeCss() {
  const c = THEME_TEXT[currentTheme] || THEME_TEXT['theme-purple'];
  return `
    html, body { background: transparent !important; }
    body { color: ${c} !important; padding-top: 24px !important; padding-bottom: 24px !important; }
    * { color: ${c} !important; -webkit-tap-highlight-color: transparent !important; outline: none !important; }
  `;
}

function styleContents(contents) {
  const doc = contents.document;
  let el = doc.getElementById('reader-theme-style');
  if (!el) {
    el = doc.createElement('style');
    el.id = 'reader-theme-style';
    doc.head.appendChild(el);
  }
  el.textContent = themeCss();
}

function applyThemeToRendition() {
  if (!currentRendition) return;
  currentRendition.getContents().forEach(styleContents);
}

function setupRenditionEvents() {
  currentRendition.on("relocated", location => {
    const cfi = location.start.cfi;
    const book = books.find(b => b.id === currentBookId);
    if (book) {
      book.cfi = cfi;
      if (currentEpub.locations && currentEpub.locations.length()) {
        const progress = currentEpub.locations.percentageFromCfi(cfi);
        book.progress = Math.round(progress * 100);
        document.getElementById('progress-bar').style.width = `${book.progress}%`;
        document.getElementById('page-info').textContent = `${book.progress}% completed`;
        if (book.progress >= 98) book.status = 'finished';
      }
      saveBooksMetaSoon();
    }
  });

  currentRendition.on("selected", (cfiRange) => {
    currentSelectedCfiRange = cfiRange;
  });

  // TAP ZONES: left 30% = previous page, right 30% = next page, middle = show/hide menus
  currentRendition.hooks.content.register((contents) => {
    const doc = contents.document;
    const win = contents.window;
    styleContents(contents);

    // epub.js makes the iframe as wide as the WHOLE chapter (all pages side by side),
    // so win.innerWidth / e.clientX are NOT relative to the visible screen.
    // Convert the tap into a 0..1 position across the visible reader area instead.
    function tapPosition(clientX) {
      const frame = win.frameElement || document.querySelector('#viewer iframe');
      const viewer = document.getElementById('viewer');
      if (!frame || !viewer) return 0.5;
      const viewerRect = viewer.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return (frameRect.left + clientX - viewerRect.left) / viewerRect.width;
    }

    // Never attach twice to the same page
    if (doc.__tapBound) return;
    doc.__tapBound = true;

    doc.addEventListener('click', (e) => {
      // Same event reaching two listeners, or a double event: act only once
      if (e.__handled) return;
      e.__handled = true;
      const now = Date.now();
      if (now - lastTapAction < 600) return;
      // Let links inside the book work normally
      if (e.target && e.target.closest && e.target.closest('a[href]')) return;

      // Ignore if text is currently highlighted
      const sel = win.getSelection();
      if (sel && sel.toString().trim().length > 0) return;

      lastTapAction = now;
      const pos = tapPosition(e.clientX);
      if (pos < 0.3) turnPage(-1);
      else if (pos > 0.7) turnPage(1);
      else toggleControls();
    });
  });

  const epubForLocations = currentEpub;
  const locKey = 'loc_' + currentBookId;
  currentEpub.ready.then(async () => {
    const cached = await localforage.getItem(locKey);
    if (cached) {
      epubForLocations.locations.load(cached);
    } else {
      await epubForLocations.locations.generate(1000);
      await localforage.setItem(locKey, epubForLocations.locations.save());
    }
  }).then(() => {
    if (epubForLocations !== currentEpub) return;
    if (currentRendition && currentRendition.location && currentEpub.locations.length()) {
      const cfi = currentRendition.location.start.cfi;
      const progress = currentEpub.locations.percentageFromCfi(cfi);
      document.getElementById('progress-bar').style.width = `${Math.round(progress * 100)}%`;
      document.getElementById('page-info').textContent = `${Math.round(progress * 100)}% completed`;
    }
  });
}

function setControls(visible) {
  controlsVisible = visible;
  ['app-header', 'reader-topbar', 'reader-bottombar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  });
}

function toggleControls() {
  setControls(!controlsVisible);
}

// Smart Bookmarks & Highlights
async function addBookmark() {
  if (!currentRendition || !currentBookId) return;
  const book = books.find(b => b.id === currentBookId);
  if (!book) return;

  const location = currentRendition.location;
  if (!location) return;

  const cfi = location.start.cfi;
  const now = new Date();
  const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (!book.bookmarks) book.bookmarks = [];
  book.bookmarks.push({ cfi, time: timeStr });
  
  await saveBooksMeta();
  alert("Bookmark saved!");
  renderBookmarks();
}

async function addHighlightFromSelection() {
  if (!currentRendition || !currentBookId) return;
  const book = books.find(b => b.id === currentBookId);
  if (!book) return;

  let text = "";
  let cfiRange = currentSelectedCfiRange;

  if (cfiRange) {
    try {
      text = currentRendition.getRange(cfiRange).toString().trim();
    } catch (e) { text = ""; }
  }

  if (!text) {
    const iframe = document.querySelector('#viewer iframe');
    if (iframe && iframe.contentWindow) {
      const selectedStr = iframe.contentWindow.getSelection().toString().trim();
      if (selectedStr) {
        text = selectedStr;
        try {
          const sel = iframe.contentWindow.getSelection();
          if (sel.rangeCount > 0) {
            cfiRange = currentRendition.getRange(sel.getRangeAt(0));
          }
        } catch (err) { console.log(err); }
      }
    }
  }

  if (!text) {
    return alert("Please select some text in the book first, then click ✨ Highlight!");
  }

  if (!book.highlights) book.highlights = [];
  book.highlights.push({ 
    cfiRange: cfiRange || currentRendition.location.start.cfi, 
    text: text 
  });

  await saveBooksMeta();
  alert("Highlight saved successfully!");
  currentSelectedCfiRange = null;
  renderHighlights();
}

function toggleBookmarkDrawer() {
  const drawer = document.getElementById('bookmark-drawer');
  document.getElementById('toc-drawer').classList.remove('open');
  document.getElementById('highlight-drawer').classList.remove('open');
  document.getElementById('reading-log-modal').classList.remove('open');
  drawer.classList.toggle('open');
  if (drawer.classList.contains('open')) renderBookmarks();
}

function toggleHighlightDrawer() {
  const drawer = document.getElementById('highlight-drawer');
  document.getElementById('toc-drawer').classList.remove('open');
  document.getElementById('bookmark-drawer').classList.remove('open');
  document.getElementById('reading-log-modal').classList.remove('open');
  drawer.classList.toggle('open');
  if (drawer.classList.contains('open')) renderHighlights();
}

function renderBookmarks() {
  const list = document.getElementById('bookmark-list');
  list.innerHTML = '';
  const book = books.find(b => b.id === currentBookId);

  if (!book || !book.bookmarks || book.bookmarks.length === 0) {
    list.innerHTML = '<li style="padding:10px; opacity:0.6;">No bookmarks saved yet.</li>';
    return;
  }

  book.bookmarks.forEach((bm, index) => {
    const li = document.createElement('li');
    li.className = 'bookmark-item';
    li.innerHTML = `
      <span onclick="jumpToCfi('${bm.cfi}')">📌 ${bm.time}</span>
      <button class="bookmark-del" onclick="deleteBookmark(${index})">✕</button>
    `;
    list.appendChild(li);
  });
}

function renderHighlights() {
  const list = document.getElementById('highlight-list');
  list.innerHTML = '';
  const book = books.find(b => b.id === currentBookId);

  if (!book || !book.highlights || book.highlights.length === 0) {
    list.innerHTML = '<li style="padding:10px; opacity:0.6;">No highlights saved yet. Select text and click Save Highlight!</li>';
    return;
  }

  book.highlights.forEach((hl, index) => {
    const li = document.createElement('li');
    li.className = 'highlight-item';
    li.innerHTML = `
      <span onclick="jumpToCfi('${hl.cfiRange}')" style="cursor:pointer; flex: 1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">"${hl.text}"</span>
      <button class="highlight-del" onclick="deleteHighlight(${index})" style="margin-left: 8px;">✕</button>
    `;
    list.appendChild(li);
  });
}

async function deleteBookmark(index) {
  const book = books.find(b => b.id === currentBookId);
  if (book && book.bookmarks) {
    book.bookmarks.splice(index, 1);
    await saveBooksMeta();
    renderBookmarks();
  }
}

async function deleteHighlight(index) {
  const book = books.find(b => b.id === currentBookId);
  if (book && book.highlights) {
    book.highlights.splice(index, 1);
    await saveBooksMeta();
    renderHighlights();
  }
}

function jumpToCfi(cfi) {
  if (currentRendition) {
    currentRendition.display(cfi);
    document.getElementById('bookmark-drawer').classList.remove('open');
    document.getElementById('highlight-drawer').classList.remove('open');
  }
}

function closeAllDrawers() {
  document.querySelectorAll('.toc-drawer.open').forEach(d => d.classList.remove('open'));
}

function switchView(view, fromHistory = false) {
  if (view === 'shelf') {
    document.getElementById('shelf-view').style.display = 'flex';
    document.getElementById('reader-view').style.display = 'none';
    document.getElementById('nav-shelf').classList.add('active');
    document.getElementById('nav-reader').classList.remove('active');

    document.body.classList.remove('reading');
    setControls(true);
    closeAllDrawers();
    saveBooksMeta();
    renderBookshelf();

    // If the user tapped the Bookshelf button, drop the extra history entry
    if (!fromHistory && history.state && history.state.view === 'reader') history.back();
  } else {
    document.getElementById('shelf-view').style.display = 'none';
    document.getElementById('reader-view').style.display = 'flex';
    document.getElementById('nav-reader').style.display = 'inline-block';
    document.getElementById('nav-reader').classList.add('active');
    document.getElementById('nav-shelf').classList.remove('active');
    document.body.classList.add('reading');

    // Give the phone's Back button/gesture something to go back to
    if (!history.state || history.state.view !== 'reader') {
      history.pushState({ view: 'reader' }, '');
    }
  }
}

// Phone Back button / swipe-back: close a drawer first, then leave the book to the bookshelf
window.addEventListener('popstate', () => {
  const readerOpen = document.getElementById('reader-view').style.display !== 'none';
  if (!readerOpen) return;

  if (document.querySelector('.toc-drawer.open')) {
    closeAllDrawers();
    history.pushState({ view: 'reader' }, '');
    return;
  }
  switchView('shelf', true);
});

let lastTapAction = 0;
let pageTurning = false;

async function turnPage(dir) {
  if (!currentRendition || pageTurning) return;
  pageTurning = true;
  try {
    await (dir > 0 ? currentRendition.next() : currentRendition.prev());
  } catch (err) {
    console.log(err);
  } finally {
    setTimeout(() => { pageTurning = false; }, 150);
  }
}

function prevPage() { turnPage(-1); }
function nextPage() { turnPage(1); }

let fontTimer = null;
let fontAnchorCfi = null;

function changeFontSize(delta) {
  currentFontSize = Math.min(200, Math.max(60, currentFontSize + delta));
  localforage.setItem('user_font_size', currentFontSize);
  if (!currentRendition) return;

  if (!fontTimer && currentRendition.location) fontAnchorCfi = currentRendition.location.start.cfi;
  currentRendition.themes.fontSize(`${currentFontSize}%`);

  // After the size settles, jump back to the same spot so pages line up again
  clearTimeout(fontTimer);
  fontTimer = setTimeout(() => {
    fontTimer = null;
    if (fontAnchorCfi) currentRendition.display(fontAnchorCfi);
  }, 300);
}

function toggleToc() {
  document.getElementById('bookmark-drawer').classList.remove('open');
  document.getElementById('highlight-drawer').classList.remove('open');
  document.getElementById('reading-log-modal').classList.remove('open');
  document.getElementById('toc-drawer').classList.toggle('open');
}

async function loadToc() {
  const toc = await currentEpub.loaded.navigation;
  const list = document.getElementById('toc-list');
  list.innerHTML = '';
  toc.forEach(item => {
    const li = document.createElement('li');
    li.className = 'toc-item';
    li.textContent = item.label;
    li.onclick = () => {
      currentRendition.display(item.href);
      toggleToc();
    };
    list.appendChild(li);
  });
}

function toggleTTS() {
  if (isTTSPlaying) {
    window.speechSynthesis.cancel();
    isTTSPlaying = false;
    document.getElementById('tts-btn').textContent = '🔊 Listen';
  } else {
    const visibleText = currentRendition.getRange().toString();
    if (!visibleText || !visibleText.trim()) return alert("No readable text found on this page.");

    ttsUtterance = new SpeechSynthesisUtterance(visibleText);
    ttsUtterance.onend = () => {
      isTTSPlaying = false;
      document.getElementById('tts-btn').textContent = '🔊 Listen';
    };
    window.speechSynthesis.speak(ttsUtterance);
    isTTSPlaying = true;
    document.getElementById('tts-btn').textContent = '⏹ Stop';
  }
}

// --- Reading Log & Bulk Import Logic ---
function toggleReadingLogModal() {
  const modal = document.getElementById('reading-log-modal');
  document.getElementById('toc-drawer').classList.remove('open');
  document.getElementById('bookmark-drawer').classList.remove('open');
  document.getElementById('highlight-drawer').classList.remove('open');
  modal.classList.toggle('open');
  if (modal.classList.contains('open')) renderReadingLog();
}

function toggleImportBox() {
  const box = document.getElementById('bulk-import-container');
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function processBulkImport() {
  const textarea = document.getElementById('bulk-import-text');
  const rawText = textarea.value ? textarea.value.trim() : '';
  if (!rawText) return alert("Please paste your book list first.");

  let readingList = [];
  try {
    const saved = localStorage.getItem('general_reading_list_safe');
    if (saved) readingList = JSON.parse(saved);
  } catch (e) {
    readingList = [];
  }

  const lines = rawText.split('\n');
  let addedCount = 0;

  lines.forEach(line => {
    let cleanLine = line.trim();
    if (!cleanLine) return;
    cleanLine = cleanLine.replace(/^\d+[\.\)]\s*/, '');

    let parts = cleanLine.split(/\s*[-–—]\s*|\s+by\s+/i);
    if (parts.length >= 2) {
      const title = parts[0].trim();
      const author = parts[1].trim();
      if (title) {
        readingList.push({ title, author: author || 'Unknown' });
        addedCount++;
      }
    } else if (cleanLine) {
      readingList.push({ title: cleanLine, author: 'Unknown' });
      addedCount++;
    }
  });

  localStorage.setItem('general_reading_list_safe', JSON.stringify(readingList));
  textarea.value = '';
  toggleImportBox();
  renderReadingLog();
  alert(`Successfully imported ${addedCount} books!`);
}

function addSafeBook() {
  const titleInput = document.getElementById('safe-book-title');
  const authorInput = document.getElementById('safe-book-author');
  const title = titleInput.value ? titleInput.value.trim() : '';
  const author = authorInput.value ? authorInput.value.trim() : '';

  if (!title) return alert("Please enter a book title.");

  let readingList = [];
  try {
    const saved = localStorage.getItem('general_reading_list_safe');
    if (saved) readingList = JSON.parse(saved);
  } catch (e) {
    readingList = [];
  }

  readingList.push({ title: title, author: author || 'Unknown' });
  localStorage.setItem('general_reading_list_safe', JSON.stringify(readingList));

  titleInput.value = '';
  authorInput.value = '';
  renderReadingLog();
}

function renderReadingLog() {
  const listContainer = document.getElementById('safe-reading-list');
  const totalCount = document.getElementById('safe-total-count');
  
  let readingList = [];
  try {
    const saved = localStorage.getItem('general_reading_list_safe');
    if (saved) readingList = JSON.parse(saved);
  } catch (e) {
    readingList = [];
  }

  totalCount.textContent = readingList.length;
  listContainer.innerHTML = '';

  if (readingList.length === 0) {
    listContainer.innerHTML = '<li style="opacity: 0.6; justify-content: center; padding: 20px;">No books logged yet. Add your first one above!</li>';
    return;
  }

  let viewModeSelect = document.getElementById('log-view-mode');
  if (!viewModeSelect) {
    const headerDiv = document.querySelector('#reading-log-modal .toc-header');
    if (headerDiv) {
      const controlsDiv = document.createElement('div');
      controlsDiv.style.padding = '8px 12px';
      controlsDiv.style.borderBottom = '1px solid rgba(128,128,128,0.2)';
      controlsDiv.innerHTML = `
        <select id="log-view-mode" onchange="renderReadingLog()" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.3); background: inherit; color: inherit; font-size: 13px;">
          <option value="list">📄 List View (Numbered)</option>
          <option value="author">👤 Group by Author</option>
        </select>
      `;
      headerDiv.after(controlsDiv);
      viewModeSelect = document.getElementById('log-view-mode');
    }
  }

  const mode = viewModeSelect ? viewModeSelect.value : 'list';

  if (mode === 'author') {
    const grouped = {};
    readingList.forEach((book, index) => {
      const auth = book.author || 'Unknown';
      if (!grouped[auth]) grouped[auth] = [];
      grouped[auth].push({ ...book, originalIndex: index });
    });

    Object.keys(grouped).sort().forEach(author => {
      const authorHeader = document.createElement('div');
      authorHeader.style.padding = '10px 4px 4px 4px';
      authorHeader.style.fontWeight = 'bold';
      authorHeader.style.fontSize = '14px';
      authorHeader.style.color = '#3b82f6';
      authorHeader.textContent = author;
      listContainer.appendChild(authorHeader);

      grouped[author].forEach(book => {
        const li = document.createElement('li');
        li.style.marginLeft = '10px';
        li.innerHTML = `
          <span>• ${book.title}</span>
          <button class="safe-delete-btn" onclick="removeSafeBook(${book.originalIndex})">✕</button>
        `;
        listContainer.appendChild(li);
      });
    });

  } else {
    readingList.forEach((book, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span><strong>${index + 1}.</strong> ${book.title} - <em>${book.author}</em></span>
        <button class="safe-delete-btn" onclick="removeSafeBook(${index})">✕</button>
      `;
      listContainer.appendChild(li);
    });
  }
}

function removeSafeBook(index) {
  let readingList = [];
  try {
    const saved = localStorage.getItem('general_reading_list_safe');
    if (saved) readingList = JSON.parse(saved);
  } catch (e) {
    readingList = [];
  }

  readingList.splice(index, 1);
  localStorage.setItem('general_reading_list_safe', JSON.stringify(readingList));
  renderReadingLog();
}