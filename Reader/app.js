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
let currentTTSVoice = '';
let currentTTSRate = 1;
let booksMetaSaveTimer = null;
const coverCache = new Map();

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

// LocalForage Setup
localforage.config({ name: 'ReaderApp', storeName: 'library' });

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.error('Service worker registration failed:', error);
    });
  }

  await loadSavedTheme();
  await loadCategories();
  await loadBooks();
  setupTTSControls();
  setupBackupControls();
  setupFileInput();
  renderCategoryTabs();
});

// Persistent Theme System
async function loadSavedTheme() {
  const saved = await localforage.getItem('user_theme');
  if (saved) {
    currentTheme = saved;
    document.body.className = saved;
  } else {
    document.body.className = 'theme-purple';
  }
}

async function setTheme(themeClass) {
  document.body.classList.remove(currentTheme);
  document.body.classList.add(themeClass);
  currentTheme = themeClass;
  await localforage.setItem('user_theme', themeClass);
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
  let migratedCovers = false;

  for (const book of books) {
    if (book.cover) {
      await localforage.setItem(`cover_${book.id}`, book.cover);
      delete book.cover;
      migratedCovers = true;
    }
  }

  if (migratedCovers) await saveBooksMeta();
  renderBookshelf();
}

async function saveBooksMeta() {
  if (booksMetaSaveTimer !== null) {
    clearTimeout(booksMetaSaveTimer);
    booksMetaSaveTimer = null;
  }
  await localforage.setItem('books_meta', books);
}

function scheduleBooksMetaSave() {
  if (booksMetaSaveTimer !== null) clearTimeout(booksMetaSaveTimer);
  booksMetaSaveTimer = setTimeout(() => {
    booksMetaSaveTimer = null;
    saveBooksMeta().catch(error => {
      console.error('Failed to save reading progress:', error);
    });
  }, 600);
}

function setupFileInput() {
  const input = document.getElementById('epub-input');
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length) await requestPersistentStorage();
    for (let file of files) {
      await processAndAddBook(file);
    }
    input.value = '';
    renderBookshelf();
  });
}

async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return;
  try {
    const persisted = await navigator.storage.persist();
    if (!persisted) console.warn('The browser may clear this library if device storage is low.');
  } catch (error) {
    console.error('Could not request persistent storage:', error);
  }
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
  if (coverUrl) await localforage.setItem(`cover_${id}`, coverUrl);

  const newBook = {
    id,
    title: metadata.title || file.name.replace('.epub', ''),
    author: metadata.creator || 'Unknown Author',
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
      const safeCategory = escapeHtml(cat);
      shelfOptions += `<option value="${safeCategory}" ${book.category === cat ? 'selected' : ''}>${safeCategory}</option>`;
    });
    const status = ['unread', 'reading', 'finished'].includes(book.status) ? book.status : 'unread';
    const safeTitle = escapeHtml(book.title);
    const safeAuthor = escapeHtml(book.author);
    const safeCategory = escapeHtml(book.category);

    card.innerHTML = `
      <div class="cover-box" onclick="openBook('${book.id}')">
        <span class="cover-placeholder">📖</span>
        ${book.category ? `<span class="category-badge">${safeCategory}</span>` : ''}
        <span class="status-badge ${status === 'finished' ? 'finished' : ''}">${status}</span>
      </div>
      <div class="book-title" title="${safeTitle}">${safeTitle}</div>
      <div class="book-author" title="${safeAuthor}">${safeAuthor}</div>
      <div class="card-actions">
        <select class="shelf-select" onchange="assignShelf('${book.id}', this.value)">
          ${shelfOptions}
        </select>
      </div>
      <button class="delete-btn" onclick="deleteBook('${book.id}', event)">✕</button>
    `;
    grid.appendChild(card);
    loadBookCover(book.id, card.querySelector('.cover-box')).catch(error => {
      console.error(`Failed to load the cover for "${book.title}":`, error);
    });
  });
}

async function loadBookCover(bookId, coverBox) {
  let cover = coverCache.get(bookId);
  if (!cover) {
    cover = await localforage.getItem(`cover_${bookId}`);
    if (cover) coverCache.set(bookId, cover);
  }
  if (!cover || !coverBox.isConnected) return;

  const image = document.createElement('img');
  image.src = cover;
  image.alt = 'Book cover';
  const placeholder = coverBox.querySelector('.cover-placeholder');
  if (placeholder) placeholder.remove();
  coverBox.insertBefore(image, coverBox.firstChild);
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
    await localforage.removeItem(`cover_${id}`);
    await localforage.removeItem(`locations_${id}`);
    coverCache.delete(id);
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

  stopTTS();
  switchView('reader');

  if (currentEpub) currentEpub.destroy();
  currentEpub = ePub(arrayBuffer);
  
  currentRendition = currentEpub.renderTo("viewer", {
    width: "100%",
    height: "100%",
    spread: "none"
  });

  const targetCfi = bookData.cfi || undefined;
  applyThemeToRendition();
  setupRenditionEvents();
  await currentRendition.display(targetCfi);
  renderSavedHighlights(bookData);
  loadToc();

  if (bookData.status === 'unread') {
    bookData.status = 'reading';
    await saveBooksMeta();
  }
}

function applyThemeToRendition() {
  if (!currentRendition) return;
  let color = '#1f2937';
  if (currentTheme === 'theme-sepia') { color = '#433422'; }
  if (currentTheme === 'theme-purple') { color = '#f3e8ff'; }
  if (currentTheme === 'theme-navy') { color = '#e0e6ed'; }
  if (currentTheme === 'theme-dark') { color = '#e0e0e0'; }

  currentRendition.themes.register("current", {
    "body": { "background": "transparent !important", "color": color + " !important", "padding-top": "60px !important", "padding-bottom": "60px !important" },
    "*": { "color": color + " !important" },
    "p": { "color": color + " !important" },
    "span": { "color": color + " !important" },
    "div": { "color": color + " !important" },
    "h1": { "color": color + " !important" },
    "h2": { "color": color + " !important" },
    "h3": { "color": color + " !important" },
    "li": { "color": color + " !important" },
    "a": { "color": color + " !important" }
  });
  currentRendition.themes.select("current");
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
      scheduleBooksMetaSave();
    }
  });

  currentRendition.on("selected", (cfiRange) => {
    currentSelectedCfiRange = cfiRange;
  });

  // NATIVE HOOK: Bypasses ePub.js proxy bugs entirely
  currentRendition.hooks.content.register((contents) => {
    const el = contents.document.documentElement;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let lastTapTime = 0;
    let lastTouchTime = 0;

    el.addEventListener('touchstart', e => {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
      startTime = Date.now();
    });

    el.addEventListener('touchend', e => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const now = Date.now();
      const timeElapsed = now - startTime;
      lastTouchTime = now;

      // Ignore text selection swipes
      if (Math.abs(endX - startX) > 20 || Math.abs(endY - startY) > 20 || timeElapsed > 400) return;

      // Anti-Double-Tap Shield
      if (now - lastTapTime < 150) return;
      lastTapTime = now;

      // Ignore if text is currently highlighted
      const sel = contents.window.getSelection();
      if (sel && sel.toString().trim().length > 0) return;

      // Native, 100% accurate inner window measurement
      const width = contents.window.innerWidth;
      
      if (endX < width * 0.3) {
        currentRendition.prev();
      } else if (endX > width * 0.7) {
        currentRendition.next();
      } else {
        toggleControls();
      }
      
      e.preventDefault();
      e.stopPropagation();
    });

    // Fallback for Desktop Mouse
    el.addEventListener('click', e => {
      const now = Date.now();
      if (now - lastTouchTime < 400 || now - lastTapTime < 150) return;
      lastTapTime = now;
      
      const sel = contents.window.getSelection();
      if (sel && sel.toString().trim().length > 0) return;

      const width = contents.window.innerWidth;
      if (e.clientX < width * 0.3) currentRendition.prev();
      else if (e.clientX > width * 0.7) currentRendition.next();
      else toggleControls();
    });
  });

  loadBookLocations(currentBookId, currentEpub, currentRendition);
}

async function loadBookLocations(bookId, epub, rendition) {
  try {
    await epub.ready;
    const savedLocations = await localforage.getItem(`locations_${bookId}`);
    if (savedLocations) {
      epub.locations.load(savedLocations);
    } else {
      await epub.locations.generate(1000);
      await localforage.setItem(`locations_${bookId}`, epub.locations.save());
    }

    if (currentEpub !== epub || currentRendition !== rendition || !rendition.location) return;
    const cfi = rendition.location.start.cfi;
    const progress = epub.locations.percentageFromCfi(cfi);
    const book = books.find(item => item.id === bookId);
    if (book && progress !== null) {
      book.progress = Math.round(progress * 100);
      document.getElementById('progress-bar').style.width = `${book.progress}%`;
      document.getElementById('page-info').textContent = `${book.progress}% completed`;
      scheduleBooksMetaSave();
    }
  } catch (error) {
    console.error('Failed to load reading locations:', error);
  }
}

function renderSavedHighlights(book) {
  if (!currentRendition || !book.highlights) return;
  book.highlights.forEach(highlight => {
    try {
      currentRendition.annotations.highlight(
        highlight.cfiRange,
        {},
        undefined,
        'saved-highlight',
        { fill: '#facc15', 'fill-opacity': '0.4' }
      );
    } catch (error) {
      console.warn('Could not restore a saved highlight:', error);
    }
  });
}

function toggleControls() {
  controlsVisible = !controlsVisible;
  const appHeader = document.getElementById('app-header');
  const topbar = document.getElementById('reader-topbar');
  const bottombar = document.getElementById('reader-bottombar');
  
  if (appHeader) appHeader.classList.toggle('hidden', !controlsVisible);
  if (topbar) topbar.classList.toggle('hidden', !controlsVisible);
  if (bottombar) bottombar.classList.toggle('hidden', !controlsVisible);
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

  const savedHighlight = book.highlights[book.highlights.length - 1];
  if (savedHighlight.cfiRange !== currentRendition.location.start.cfi) {
    try {
      currentRendition.annotations.highlight(
        savedHighlight.cfiRange,
        {},
        undefined,
        'saved-highlight',
        { fill: '#facc15', 'fill-opacity': '0.4' }
      );
    } catch (error) {
      console.warn('Could not display the new highlight:', error);
    }
  }

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
    const label = document.createElement('span');
    label.textContent = `📌 ${bm.time}`;
    label.onclick = () => jumpToCfi(bm.cfi);
    const deleteButton = document.createElement('button');
    deleteButton.className = 'bookmark-del';
    deleteButton.textContent = '✕';
    deleteButton.onclick = () => deleteBookmark(index);
    li.append(label, deleteButton);
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
    const label = document.createElement('span');
    label.textContent = `"${hl.text}"`;
    label.style.cssText = 'cursor:pointer; flex:1; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;';
    label.onclick = () => jumpToCfi(hl.cfiRange);
    const deleteButton = document.createElement('button');
    deleteButton.className = 'highlight-del';
    deleteButton.style.marginLeft = '8px';
    deleteButton.textContent = '✕';
    deleteButton.onclick = () => deleteHighlight(index);
    li.append(label, deleteButton);
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
    const [highlight] = book.highlights.splice(index, 1);
    if (highlight && currentRendition) {
      currentRendition.annotations.remove(highlight.cfiRange, 'highlight');
    }
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

function switchView(view) {
  if (view === 'shelf') {
    stopTTS();
    document.body.classList.remove('reading');
    document.getElementById('shelf-view').style.display = 'flex';
    document.getElementById('reader-view').style.display = 'none';
    document.getElementById('nav-shelf').classList.add('active');
    document.getElementById('nav-reader').classList.remove('active');
    
    controlsVisible = true;
    document.getElementById('app-header').classList.remove('hidden');
    renderBookshelf();
  } else {
    document.body.classList.add('reading');
    document.getElementById('shelf-view').style.display = 'none';
    document.getElementById('reader-view').style.display = 'flex';
    document.getElementById('nav-reader').style.display = 'inline-block';
    document.getElementById('nav-reader').classList.add('active');
    document.getElementById('nav-shelf').classList.remove('active');
  }
}

function prevPage() { if (currentRendition) currentRendition.prev(); }
function nextPage() { if (currentRendition) currentRendition.next(); }

function changeFontSize(delta) {
  currentFontSize += delta;
  if (currentFontSize < 60) currentFontSize = 60;
  if (currentFontSize > 200) currentFontSize = 200;
  if (currentRendition) currentRendition.themes.fontSize(`${currentFontSize}%`);
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

async function setupTTSControls() {
  const voiceSelect = document.getElementById('tts-voice');
  const rateSelect = document.getElementById('tts-rate');
  if (!('speechSynthesis' in window)) {
    document.querySelector('.tts-settings').hidden = true;
    document.getElementById('tts-btn').disabled = true;
    return;
  }

  const [savedVoice, savedRate] = await Promise.all([
    localforage.getItem('tts_voice'),
    localforage.getItem('tts_rate')
  ]);
  currentTTSVoice = savedVoice || '';
  currentTTSRate = Number(savedRate) || 1;
  rateSelect.value = String(currentTTSRate);

  const updateVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = currentTTSVoice;
    voiceSelect.innerHTML = '<option value="">Device default voice</option>';
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });
    if (voices.some(voice => voice.voiceURI === selectedVoice)) {
      voiceSelect.value = selectedVoice;
    } else {
      voiceSelect.value = '';
    }
  };

  voiceSelect.addEventListener('change', () => {
    currentTTSVoice = voiceSelect.value;
    localforage.setItem('tts_voice', currentTTSVoice).catch(error => {
      console.error('Failed to save speech voice:', error);
    });
  });
  rateSelect.addEventListener('change', () => {
    currentTTSRate = Number(rateSelect.value) || 1;
    localforage.setItem('tts_rate', currentTTSRate).catch(error => {
      console.error('Failed to save speech rate:', error);
    });
  });
  window.speechSynthesis.onvoiceschanged = updateVoices;
  updateVoices();
}

function getVisiblePageText() {
  try {
    const location = currentRendition && currentRendition.location;
    if (!location || !location.start || !location.end) return '';

    const contents = currentRendition.getContents();
    const content = contents.find(item => item.sectionIndex === Number(location.start.index)) || contents[0];
    if (!content) return '';

    const start = currentRendition.epubcfi.toRange(location.start.cfi, content.document);
    const end = currentRendition.epubcfi.toRange(location.end.cfi, content.document);
    const range = content.document.createRange();
    range.setStart(start.startContainer, start.startOffset);
    range.setEnd(end.startContainer, end.startOffset);
    return range.toString().trim();
  } catch (error) {
    console.error('Could not read the current page for text-to-speech:', error);
    return '';
  }
}

function speakCurrentPage() {
  if (!isTTSPlaying) return;
  const text = getVisiblePageText();
  if (!text) {
    stopTTS();
    return;
  }

  ttsUtterance = new SpeechSynthesisUtterance(text);
  ttsUtterance.rate = currentTTSRate;
  if (currentTTSVoice) {
    ttsUtterance.voice = window.speechSynthesis.getVoices()
      .find(voice => voice.voiceURI === currentTTSVoice) || null;
  }
  ttsUtterance.onend = async () => {
    if (!isTTSPlaying) return;
    if (!currentRendition || currentRendition.location.atEnd) {
      stopTTS();
      return;
    }
    try {
      await currentRendition.next();
      speakCurrentPage();
    } catch (error) {
      stopTTS();
      console.error('Text-to-speech could not continue:', error);
    }
  };
  ttsUtterance.onerror = event => {
    if (event.error === 'canceled' || event.error === 'interrupted') return;
    stopTTS();
    console.error('Text-to-speech failed:', event.error);
  };
  window.speechSynthesis.speak(ttsUtterance);
}

function stopTTS() {
  isTTSPlaying = false;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const button = document.getElementById('tts-btn');
  if (button) button.textContent = '🔊 Listen';
}

function toggleTTS() {
  if (!('speechSynthesis' in window)) {
    alert('Text-to-speech is not available in this browser.');
    return;
  }
  if (isTTSPlaying) {
    stopTTS();
    return;
  }

  if (!currentRendition) return;
  if (!getVisiblePageText()) return alert('No readable text found on this page.');

  isTTSPlaying = true;
  document.getElementById('tts-btn').textContent = '⏹ Stop';
  speakCurrentPage();
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
  let searchInput = document.getElementById('log-search-input');
  
  // Inject Search Bar and View Filter if they don't exist yet
  if (!viewModeSelect) {
    const headerDiv = document.querySelector('#reading-log-modal .toc-header');
    if (headerDiv) {
      const controlsDiv = document.createElement('div');
      controlsDiv.style.padding = '8px 12px';
      controlsDiv.style.borderBottom = '1px solid rgba(128,128,128,0.2)';
      controlsDiv.style.display = 'flex';
      controlsDiv.style.flexDirection = 'column';
      controlsDiv.style.gap = '8px';
      controlsDiv.innerHTML = `
        <input type="text" id="log-search-input" placeholder="🔍 Search books or authors..." oninput="renderReadingLog()" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.3); background: rgba(128,128,128,0.1); color: inherit; font-size: 13px;">
        <select id="log-view-mode" onchange="renderReadingLog()" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.3); background: inherit; color: inherit; font-size: 13px;">
          <option value="list">📄 List View (Numbered)</option>
          <option value="author">👤 Group by Author</option>
        </select>
      `;
      headerDiv.after(controlsDiv);
      viewModeSelect = document.getElementById('log-view-mode');
      searchInput = document.getElementById('log-search-input');
    }
  }

  const mode = viewModeSelect ? viewModeSelect.value : 'list';
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Filter the list and map the original index so deletions don't delete the wrong book
  const filteredList = readingList
    .map((book, index) => ({ ...book, originalIndex: index }))
    .filter(book => {
      if (!query) return true;
      return book.title.toLowerCase().includes(query) || (book.author && book.author.toLowerCase().includes(query));
    });

  if (filteredList.length === 0) {
    listContainer.innerHTML = '<li style="opacity: 0.6; justify-content: center; padding: 20px;">No books match your search.</li>';
    return;
  }

  if (mode === 'author') {
    const grouped = Object.create(null);
    filteredList.forEach((book) => {
      const auth = book.author || 'Unknown';
      if (!grouped[auth]) grouped[auth] = [];
      grouped[auth].push(book);
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
        const label = document.createElement('span');
        label.textContent = `• ${book.title}`;
        const deleteButton = document.createElement('button');
        deleteButton.className = 'safe-delete-btn';
        deleteButton.textContent = '✕';
        deleteButton.onclick = () => removeSafeBook(book.originalIndex);
        li.append(label, deleteButton);
        listContainer.appendChild(li);
      });
    });

  } else {
    filteredList.forEach((book) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${book.originalIndex + 1}. ${book.title} - ${book.author}`;
      const deleteButton = document.createElement('button');
      deleteButton.className = 'safe-delete-btn';
      deleteButton.textContent = '✕';
      deleteButton.onclick = () => removeSafeBook(book.originalIndex);
      li.append(label, deleteButton);
      listContainer.appendChild(li);
    });
  }
}

function removeSafeBook(index) {
  const saved = localStorage.getItem('general_reading_list_safe');
  const readingList = saved ? JSON.parse(saved) : [];
  if (!Number.isInteger(index) || index < 0 || index >= readingList.length) return;

  readingList.splice(index, 1);
  localStorage.setItem('general_reading_list_safe', JSON.stringify(readingList));
  renderReadingLog();
}

function setupBackupControls() {
  document.getElementById('backup-file-input').addEventListener('change', restoreLibraryBackup);
}

async function buildLibraryBackup() {
  await saveBooksMeta();
  const archive = new JSZip();
  const backup = {
    format: 'cozy-epub-reader-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    theme: currentTheme,
    categories: customCategories,
    readingList: JSON.parse(localStorage.getItem('general_reading_list_safe') || '[]'),
    books: []
  };

  for (let index = 0; index < books.length; index++) {
    const book = books[index];
    const epubData = await localforage.getItem(book.id);
    if (!epubData) throw new Error(`The EPUB file for "${book.title}" is missing from this device.`);

    const files = { epub: `books/${index}.epub` };
    archive.file(files.epub, epubData);

    const cover = book.cover || await localforage.getItem(`cover_${book.id}`);
    if (cover) {
      files.cover = `covers/${index}.txt`;
      archive.file(files.cover, cover);
    }

    const locations = await localforage.getItem(`locations_${book.id}`);
    if (locations) {
      files.locations = `locations/${index}.json`;
      archive.file(files.locations, locations);
    }

    const metadata = { ...book };
    delete metadata.cover;
    if (!Array.isArray(metadata.bookmarks)) metadata.bookmarks = [];
    if (!Array.isArray(metadata.highlights)) metadata.highlights = [];
    backup.books.push({ ...metadata, files });
  }

  archive.file('reader-backup.json', JSON.stringify(backup, null, 2));
  return archive.generateAsync({ type: 'blob' });
}

async function exportLibraryBackup() {
  try {
    const blob = await buildLibraryBackup();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reader-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('Library backup failed:', error);
    alert(`Backup failed: ${error.message}`);
  }
}

async function restoreLibraryBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm('Restore by merging this backup into the current library? Matching books will be replaced; other books will be kept.')) {
    event.target.value = '';
    return;
  }

  try {
    const archive = await JSZip.loadAsync(file);
    const manifestFile = archive.file('reader-backup.json');
    if (!manifestFile) throw new Error('This ZIP does not contain a Reader backup.');
    const backup = JSON.parse(await manifestFile.async('string'));
    if (backup.format !== 'cozy-epub-reader-backup' || backup.version !== 1 || !Array.isArray(backup.books)) {
      throw new Error('This backup format is not supported.');
    }
    if (!Array.isArray(backup.categories) || !Array.isArray(backup.readingList)) {
      throw new Error('The backup is missing its shelves or reading log.');
    }

    for (let index = 0; index < backup.books.length; index++) {
      const book = backup.books[index];
      if (!book || typeof book.id !== 'string' || !/^book_\d+_[a-z0-9]+$/.test(book.id)
          || typeof book.title !== 'string' || typeof book.author !== 'string' || !book.files
          || book.files.epub !== `books/${index}.epub`
          || !archive.file(book.files.epub)) {
        throw new Error(`Book ${index + 1} in the backup is incomplete.`);
      }
      if ((book.files.cover && (book.files.cover !== `covers/${index}.txt` || !archive.file(book.files.cover)))
          || (book.files.locations && (book.files.locations !== `locations/${index}.json` || !archive.file(book.files.locations)))) {
        throw new Error(`Book ${index + 1} has an incomplete cover or location cache.`);
      }
    }

    const mergedBooks = new Map(books.map(book => [book.id, book]));
    for (let index = 0; index < backup.books.length; index++) {
      const savedBook = backup.books[index];
      const book = { ...savedBook };
      delete book.files;
      delete book.cover;
      if (!Array.isArray(book.bookmarks)) book.bookmarks = [];
      if (!Array.isArray(book.highlights)) book.highlights = [];

      const epubData = await archive.file(savedBook.files.epub).async('arraybuffer');
      await localforage.setItem(book.id, epubData);

      if (savedBook.files.cover) {
        const coverFile = archive.file(savedBook.files.cover);
        await localforage.setItem(`cover_${book.id}`, await coverFile.async('string'));
      } else {
        await localforage.removeItem(`cover_${book.id}`);
      }
      if (savedBook.files.locations) {
        const locationsFile = archive.file(savedBook.files.locations);
        await localforage.setItem(`locations_${book.id}`, await locationsFile.async('string'));
      } else {
        await localforage.removeItem(`locations_${book.id}`);
      }
      coverCache.delete(book.id);
      mergedBooks.set(book.id, book);
    }

    books = Array.from(mergedBooks.values());
    customCategories = Array.from(new Set([
      ...customCategories,
      ...backup.categories.filter(category => typeof category === 'string')
    ]));
    await localforage.setItem('custom_categories', customCategories);

    const currentReadingList = JSON.parse(localStorage.getItem('general_reading_list_safe') || '[]');
    const restoredReadingList = backup.readingList
      .filter(item => item && typeof item.title === 'string')
      .map(item => ({ title: item.title, author: typeof item.author === 'string' ? item.author : 'Unknown' }));
    localStorage.setItem('general_reading_list_safe', JSON.stringify([...currentReadingList, ...restoredReadingList]));

    const validThemes = ['theme-light', 'theme-sepia', 'theme-purple', 'theme-navy', 'theme-dark'];
    if (validThemes.includes(backup.theme)) await setTheme(backup.theme);
    await saveBooksMeta();
    await requestPersistentStorage();
    renderCategoryTabs();
    renderBookshelf();
    renderReadingLog();
    alert('Backup restored. Your library and reading log have been merged.');
  } catch (error) {
    console.error('Library restore failed:', error);
    alert(`Restore failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}