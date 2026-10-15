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

// LocalForage Setup
localforage.config({ name: 'ReaderApp', storeName: 'library' });

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  await loadSavedTheme();
  await loadCategories();
  await loadBooks();
  setupFileInput();
  renderCategoryTabs();
});

function startClock() {
  const updateClock = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clockEl = document.getElementById('live-clock');
    if (clockEl) clockEl.textContent = timeStr;
  };
  updateClock();
  setInterval(updateClock, 1000);
}

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
  document.body.className = themeClass;
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
  renderBookshelf();
}

async function saveBooksMeta() {
  await localforage.setItem('books_meta', books);
}

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
    bookmarks: []
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
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 40px;">No books found in "${activeFilter}". Tapping "Add Book" lets you upload EPUB files!</div>`;
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

  const targetCfi = bookData.cfi || undefined;
  await currentRendition.display(targetCfi);

  applyThemeToRendition();
  setupRenditionEvents();
  loadToc();

  if (bookData.status === 'unread') {
    bookData.status = 'reading';
    await saveBooksMeta();
  }
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
      saveBooksMeta();
    }
  });

  currentEpub.ready.then(() => {
    return currentEpub.locations.generate(1000);
  }).then(() => {
    if (currentRendition.location) {
      const cfi = currentRendition.location.start.cfi;
      const progress = currentEpub.locations.percentageFromCfi(cfi);
      document.getElementById('progress-bar').style.width = `${Math.round(progress * 100)}%`;
      document.getElementById('page-info').textContent = `${Math.round(progress * 100)}% completed`;
    }
  });
}

// Transparent Touch Shield Tap Handler
function handleScreenTap(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const width = rect.width;

  if (x < width * 0.25) {
    if (currentRendition) currentRendition.prev();
  } else if (x > width * 0.75) {
    if (currentRendition) currentRendition.next();
  } else {
    toggleControls();
  }
}

// Tap Controls Auto-Hide Toggle
function toggleControls() {
  controlsVisible = !controlsVisible;
  const topbar = document.getElementById('reader-topbar');
  const bottombar = document.getElementById('reader-bottombar');
  if (topbar) topbar.classList.toggle('hidden', !controlsVisible);
  if (bottombar) bottombar.classList.toggle('hidden', !controlsVisible);
}

// Smart Bookmarks
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

function toggleBookmarkDrawer() {
  const drawer = document.getElementById('bookmark-drawer');
  document.getElementById('toc-drawer').classList.remove('open');
  document.getElementById('reading-log-modal').classList.remove('open');
  drawer.classList.toggle('open');
  if (drawer.classList.contains('open')) renderBookmarks();
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

async function deleteBookmark(index) {
  const book = books.find(b => b.id === currentBookId);
  if (book && book.bookmarks) {
    book.bookmarks.splice(index, 1);
    await saveBooksMeta();
    renderBookmarks();
  }
}

function jumpToCfi(cfi) {
  if (currentRendition) {
    currentRendition.display(cfi);
    document.getElementById('bookmark-drawer').classList.remove('open');
  }
}

// Navigation & View Switching
function switchView(view) {
  if (view === 'shelf') {
    document.getElementById('shelf-view').style.display = 'flex';
    document.getElementById('reader-view').style.display = 'none';
    document.getElementById('nav-shelf').classList.add('active');
    document.getElementById('nav-reader').classList.remove('active');
    renderBookshelf();
  } else {
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

function applyThemeToRendition() {
  if (!currentRendition) return;
  let bg = '#fffaf0', color = '#1f2937';
  if (currentTheme === 'theme-sepia') { bg = '#f7eedb'; color = '#433422'; }
  if (currentTheme === 'theme-purple') { bg = '#241633'; color = '#f3e8ff'; }
  if (currentTheme === 'theme-navy') { bg = '#121c2e'; color = '#e0e6ed'; }
  if (currentTheme === 'theme-dark') { bg = '#1e1e1e'; color = '#e0e0e0'; }

  currentRendition.themes.register("current", {
    "body": { "background": bg, "color": color, "padding": "10px !important" },
    "p": { "color": color }
  });
  currentRendition.themes.select("current");
}

function toggleToc() {
  document.getElementById('bookmark-drawer').classList.remove('open');
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

// Text to Speech
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

// --- Integrated Reading Log Logic ---
function toggleReadingLogModal() {
  const modal = document.getElementById('reading-log-modal');
  document.getElementById('toc-drawer').classList.remove('open');
  document.getElementById('bookmark-drawer').classList.remove('open');
  modal.classList.toggle('open');
  if (modal.classList.contains('open')) {
    renderReadingLog();
  }
}

async function addSafeBook() {
  const titleInput = document.getElementById('safe-book-title');
  const authorInput = document.getElementById('safe-book-author');
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!title) return alert("Please enter a book title.");

  let readingList = JSON.parse(await localforage.getItem('general_reading_list_safe')) || [];
  readingList.push({ title, author: author || 'Unknown' });
  await localforage.setItem('general_reading_list_safe', readingList);

  titleInput.value = '';
  authorInput.value = '';
  renderReadingLog();
}

async function renderReadingLog() {
  const listContainer = document.getElementById('safe-reading-list');
  const totalCount = document.getElementById('safe-total-count');
  let readingList = JSON.parse(await localforage.getItem('general_reading_list_safe')) || [];

  listContainer.innerHTML = '';
  totalCount.textContent = readingList.length;

  if (readingList.length === 0) {
    listContainer.innerHTML = '<li style="opacity: 0.6; justify-content: center;">No books logged yet. Add your first one above!</li>';
    return;
  }

  readingList.forEach((book, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><strong>${book.title}</strong> by ${book.author}</span>
      <button class="safe-delete-btn" onclick="removeSafeBook(${index})">✕</button>
    `;
    listContainer.appendChild(li);
  });
}

async function removeSafeBook(index) {
  let readingList = JSON.parse(await localforage.getItem('general_reading_list_safe')) || [];
  readingList.splice(index, 1);
  await localforage.setItem('general_reading_list_safe', readingList);
  renderReadingLog();
}