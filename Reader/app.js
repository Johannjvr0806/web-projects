let book = null;
let rendition = null;
let currentBookId = null;
let fontSize = 100;
let currentTheme = 'light';
let currentFilter = 'all';

const fileInput = document.getElementById('file-input');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInfo = document.getElementById('page-info');
const progressBar = document.getElementById('progress-bar');

const libraryView = document.getElementById('library-view');
const readerView = document.getElementById('reader-view');
const tabLibrary = document.getElementById('tab-library');
const tabReader = document.getElementById('tab-reader');
const shelfGrid = document.getElementById('shelf-grid');
const readerControls = document.getElementById('reader-controls');

// TOC Elements
const tocBtn = document.getElementById('toc-btn');
const tocDrawer = document.getElementById('toc-drawer');
const closeToc = document.getElementById('close-toc');
const tocList = document.getElementById('toc-list');

// Theme Elements
const themeLight = document.getElementById('theme-light');
const themeSepia = document.getElementById('theme-sepia');
const themeDark = document.getElementById('theme-dark');

// AI Popup Elements
const aiPopup = document.getElementById('ai-popup');
const aiWord = document.getElementById('ai-word');
const aiTranslation = document.getElementById('ai-translation');

// View Switching
tabLibrary.addEventListener('click', () => showView('library'));
tabReader.addEventListener('click', () => showView('reader'));

function showView(view) {
  if (view === 'library') {
    libraryView.style.display = 'block';
    readerView.style.display = 'none';
    readerControls.style.display = 'none';
    tocDrawer.classList.remove('open');
    hideAiPopup();
    tabLibrary.classList.add('active');
    tabReader.classList.remove('active');
    renderShelf();
  } else {
    libraryView.style.display = 'none';
    readerView.style.display = 'flex';
    readerControls.style.display = 'flex';
    tabReader.classList.add('active');
    tabLibrary.classList.remove('active');
  }
}

// Filter Shelf View
function filterShelf(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderShelf();
}

// Upload EPUB to Shelf
fileInput.addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function (event) {
    const bookData = event.target.result;
    const tempBook = ePub(bookData);

    const metadata = await tempBook.loaded.metadata;
    const coverUrl = await tempBook.coverUrl();

    let coverBase64 = null;
    if (coverUrl) {
      coverBase64 = await fetch(coverUrl)
        .then(res => res.blob())
        .then(blob => new Promise((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result);
          r.readAsDataURL(blob);
        })).catch(() => null);
    }

    const bookId = 'book_' + Date.now();
    const bookRecord = {
      id: bookId,
      title: metadata.title || file.name.replace('.epub', ''),
      author: metadata.creator || 'Unknown Author',
      cover: coverBase64,
      data: bookData,
      location: null,
      progress: 0
    };

    let savedBooks = (await localforage.getItem('library_books')) || [];
    savedBooks.push(bookRecord);
    await localforage.setItem('library_books', savedBooks);

    tempBook.destroy();
    renderShelf();
    openBook(bookId);
  };

  reader.readAsArrayBuffer(file);
});

// Render Bookshelf UI with Filters & Progress Badges
async function renderShelf() {
  const savedBooks = (await localforage.getItem('library_books')) || [];
  shelfGrid.innerHTML = '';

  let filteredBooks = savedBooks;
  if (currentFilter === 'unread') {
    filteredBooks = savedBooks.filter(b => !b.progress || b.progress === 0);
  } else if (currentFilter === 'reading') {
    filteredBooks = savedBooks.filter(b => b.progress > 0 && b.progress < 95);
  } else if (currentFilter === 'finished') {
    filteredBooks = savedBooks.filter(b => b.progress >= 95);
  }

  if (filteredBooks.length === 0) {
    shelfGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #6b7280; padding: 40px;">No books found in this category!</p>`;
    return;
  }

  filteredBooks.forEach((b) => {
    let statusText = 'Unread';
    let statusClass = '';
    const pct = Math.round(b.progress || 0);

    if (pct >= 95) {
      statusText = '✓ Finished';
      statusClass = 'finished';
    } else if (pct > 0) {
      statusText = `${pct}% Read`;
    }

    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <button class="delete-btn" onclick="deleteBook(event, '${b.id}')">✕</button>
      <div class="cover-box">
        ${b.cover ? `<img src="${b.cover}" alt="Cover" />` : `<span style="font-size: 32px;">📖</span>`}
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
    `;

    card.addEventListener('click', () => openBook(b.id));
    shelfGrid.appendChild(card);
  });
}

// Open Selected Book & Restore Saved Location
async function openBook(bookId) {
  const savedBooks = (await localforage.getItem('library_books')) || [];
  const selectedBook = savedBooks.find(b => b.id === bookId);
  if (!selectedBook) return;

  if (book) book.destroy();

  currentBookId = bookId;
  book = ePub(selectedBook.data);
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    spread: "auto"
  });

  // Register EPUB themes
  rendition.themes.register("light", { body: { background: "#ffffff", color: "#1f2937" } });
  rendition.themes.register("sepia", { body: { background: "#f4ebd9", color: "#433422" } });
  rendition.themes.register("dark", { body: { background: "#121212", color: "#e0e0e0" } });

  applyTheme(currentTheme);
  applyFontSize();

  // Load Table of Contents
  const navigation = await book.loaded.navigation;
  tocList.innerHTML = '';
  navigation.toc.forEach((chapter) => {
    const li = document.createElement('li');
    li.className = 'toc-item';
    li.textContent = chapter.label.trim();
    li.addEventListener('click', () => {
      rendition.display(chapter.href);
      tocDrawer.classList.remove('open');
    });
    tocList.appendChild(li);
  });

  // Track & Auto-Save Progress
  book.ready.then(() => {
    return book.locations.generate(1000);
  }).then(() => {
    if (selectedBook.location) {
      rendition.display(selectedBook.location);
    } else {
      rendition.display();
    }
  });

  rendition.on("relocated", (location) => {
    if (book.locations && book.locations.total) {
      const percent = book.locations.percentageFromCfi(location.start.cfi) * 100;
      const rounded = Math.round(percent);
      
      progressBar.style.width = `${percent}%`;
      pageInfo.textContent = `Reading: ${selectedBook.title} (${rounded}%)`;

      saveBookProgress(bookId, location.start.cfi, percent);
    }
  });

  // Enable Touch Swiping inside the EPUB frame for Tablets
  rendition.on("rendered", (section) => {
    let touchstartX = 0;
    let touchendX = 0;

    const iframeDoc = rendition.getContents()[0].document;

    iframeDoc.addEventListener('touchstart', e => {
      touchstartX = e.changedTouches[0].screenX;
    }, false);

    iframeDoc.addEventListener('touchend', e => {
      touchendX = e.changedTouches[0].screenX;
      if (touchendX < touchstartX - 50) {
        rendition.next();
        hideAiPopup();
      }
      if (touchendX > touchstartX + 50) {
        rendition.prev();
        hideAiPopup();
      }
    }, false);
  });

  // Text Selection Listener for AI Translation
  rendition.on("selected", (cfiRange, contents) => {
    const selection = contents.window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length < 100) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const iframeRect = contents.document.defaultView.frameElement.getBoundingClientRect();

      showAiPopup(text, iframeRect.left + rect.left, iframeRect.top + rect.bottom + 10);
    }
  });

  showView('reader');
}

// Save Exact Location & Percentage to IndexedDB
async function saveBookProgress(bookId, cfi, progress) {
  let savedBooks = (await localforage.getItem('library_books')) || [];
  const idx = savedBooks.findIndex(b => b.id === bookId);
  if (idx !== -1) {
    savedBooks[idx].location = cfi;
    savedBooks[idx].progress = progress;
    await localforage.setItem('library_books', savedBooks);
  }
}

// AI Translation / Dictionary Lookup
async function showAiPopup(text, posX, posY) {
  aiWord.textContent = `"${text}"`;
  aiTranslation.textContent = "Translating / Looking up...";
  aiPopup.style.left = `${Math.min(posX, window.innerWidth - 300)}px`;
  aiPopup.style.top = `${posY}px`;
  aiPopup.style.display = 'block';

  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    const translatedText = data[0][0][0];
    const sourceLang = data[2];

    if (sourceLang === 'en') {
      aiTranslation.innerHTML = `<b>Definition/Translation:</b><br/>${translatedText}`;
    } else {
      aiTranslation.innerHTML = `<b>Detected (${sourceLang.toUpperCase()} → EN):</b><br/>${translatedText}`;
    }
  } catch (err) {
    aiTranslation.textContent = "Could not fetch translation.";
  }
}

function hideAiPopup() {
  aiPopup.style.display = 'none';
}

// Delete Book from Shelf
async function deleteBook(event, bookId) {
  event.stopPropagation();
  let savedBooks = (await localforage.getItem('library_books')) || [];
  savedBooks = savedBooks.filter(b => b.id !== bookId);
  await localforage.setItem('library_books', savedBooks);
  renderShelf();
}

// TOC Drawer Toggles
tocBtn.addEventListener('click', () => tocDrawer.classList.toggle('open'));
closeToc.addEventListener('click', () => tocDrawer.classList.remove('open'));

// Themes & Font Controls
function applyTheme(theme) {
  currentTheme = theme;
  document.body.className = `theme-${theme}`;
  if (rendition) rendition.themes.select(theme);

  themeLight.classList.toggle('active', theme === 'light');
  themeSepia.classList.toggle('active', theme === 'sepia');
  themeDark.classList.toggle('active', theme === 'dark');
}

themeLight.addEventListener('click', () => applyTheme('light'));
themeSepia.addEventListener('click', () => applyTheme('sepia'));
themeDark.addEventListener('click', () => applyTheme('dark'));

document.getElementById('font-inc').addEventListener('click', () => {
  fontSize += 10;
  applyFontSize();
});

document.getElementById('font-dec').addEventListener('click', () => {
  if (fontSize > 60) fontSize -= 10;
  applyFontSize();
});

function applyFontSize() {
  if (rendition) {
    rendition.themes.fontSize(`${fontSize}%`);
  }
}

// Navigation Controls
prevBtn.addEventListener('click', () => {
  if (rendition) rendition.prev();
  hideAiPopup();
});
nextBtn.addEventListener('click', () => {
  if (rendition) rendition.next();
  hideAiPopup();
});

// Keyboard Navigation (Arrow Keys for PC Testing)
document.addEventListener('keydown', (e) => {
  if (readerView.style.display === 'flex') {
    if (e.key === 'ArrowRight') {
      if (rendition) rendition.next();
      hideAiPopup();
    } else if (e.key === 'ArrowLeft') {
      if (rendition) rendition.prev();
      hideAiPopup();
    }
  }
});

// Initial Load
window.addEventListener('load', () => {
  renderShelf();
});