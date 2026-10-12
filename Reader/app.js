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
const viewer = document.getElementById('viewer');

// TOC Elements
const tocBtn = document.getElementById('toc-btn');
const tocDrawer = document.getElementById('toc-drawer');
const closeToc = document.getElementById('close-toc');
const tocList = document.getElementById('toc-list');

// Themes
const themeLight = document.getElementById('theme-light');
const themeSepia = document.getElementById('theme-sepia');
const themeEmerald = document.getElementById('theme-emerald');
const themeNavy = document.getElementById('theme-navy');
const themeDark = document.getElementById('theme-dark');

// AI Popup
const aiPopup = document.getElementById('ai-popup');
const aiWord = document.getElementById('ai-word');
const aiTranslation = document.getElementById('ai-translation');

const themeColors = {
  light: { bg: '#fffaf0', fg: '#1f2937' },
  sepia: { bg: '#f7eedb', fg: '#433422' },
  emerald: { bg: '#0f291e', fg: '#e2f0e8' },
  navy: { bg: '#121c2e', fg: '#e0e6ed' },
  dark: { bg: '#1e1e1e', fg: '#e0e0e0' }
};

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

// Batch Multi-EPUB Upload with Duplicate Protection
fileInput.addEventListener('change', async function (e) {
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;

  let savedBooks = (await localforage.getItem('library_books')) || [];
  let addedCount = 0;

  for (const file of files) {
    await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async function (event) {
        try {
          const bookData = event.target.result;
          const tempBook = ePub(bookData);

          const metadata = await tempBook.loaded.metadata;
          const bookTitle = metadata.title || file.name.replace('.epub', '');

          const exists = savedBooks.some(b => b.title.trim().toLowerCase() === bookTitle.trim().toLowerCase());
          if (!exists) {
            const coverUrl = await tempBook.coverUrl().catch(() => null);
            let coverBase64 = null;
            if (coverUrl) {
              coverBase64 = await fetch(coverUrl)
                .then(res => res.blob())
                .then(blob => new Promise((res) => {
                  const r = new FileReader();
                  r.onloadend = () => res(r.result);
                  r.readAsDataURL(blob);
                })).catch(() => null);
            }

            const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            savedBooks.push({
              id: bookId,
              title: bookTitle,
              author: metadata.creator || 'Unknown Author',
              cover: coverBase64,
              data: bookData,
              location: null,
              progress: 0
            });
            addedCount++;
          }

          tempBook.destroy();
          resolve();
        } catch (err) {
          console.error("Error loading file:", file.name, err);
          resolve();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  await localforage.setItem('library_books', savedBooks);
  fileInput.value = '';
  showView('library');

  if (addedCount > 0) {
    alert(`Successfully added ${addedCount} book(s) to your bookshelf!`);
  } else {
    alert('No new books added (selected book(s) already exist on your shelf).');
  }
});

// Render Bookshelf UI
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
    shelfGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.7; padding: 40px;">No books found in this category!</p>`;
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

  // Register Themes
  Object.keys(themeColors).forEach(t => {
    rendition.themes.register(t, {
      body: { 
        background: `transparent !important`, 
        color: `${themeColors[t].fg} !important` 
      }
    });
  });

  // Anti-Flash Hook
  rendition.hooks.content.register((contents) => {
    const doc = contents.document;
    const style = doc.createElement('style');
    const activeCol = themeColors[currentTheme] || themeColors.light;
    style.innerHTML = `
      html, body {
        background-color: transparent !important;
        color: ${activeCol.fg} !important;
      }
    `;
    doc.head.appendChild(style);
  });

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

  // Track Progress
  book.ready.then(() => {
    return book.locations.generate(1000);
  }).then(() => {
    if (selectedBook.location) {
      rendition.display(selectedBook.location);
    } else {
      rendition.display();
    }
  }).catch(() => {
    rendition.display();
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

  // ReadEra Tap Navigation (Cleaned up to prevent double-firing/looping)
  rendition.on("rendered", (section) => {
    const contents = rendition.getContents()[0];
    if (contents && contents.document) {
      const iframeDoc = contents.document;

      iframeDoc.addEventListener('click', e => {
        const screenWidth = iframeDoc.defaultView.innerWidth;
        const clickX = e.clientX;

        if (clickX < screenWidth * 0.35) {
          rendition.prev();
          hideAiPopup();
        } else if (clickX > screenWidth * 0.65) {
          rendition.next();
          hideAiPopup();
        } else {
          tocDrawer.classList.toggle('open');
        }
      });
    }
  });

  // Translation Selection
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

// Save Progress
async function saveBookProgress(bookId, cfi, progress) {
  let savedBooks = (await localforage.getItem('library_books')) || [];
  const idx = savedBooks.findIndex(b => b.id === bookId);
  if (idx !== -1) {
    savedBooks[idx].location = cfi;
    savedBooks[idx].progress = progress;
    await localforage.setItem('library_books', savedBooks);
  }
}

// Fixed Translation Lookup (Using correct MyMemory auto-detect syntax)
async function showAiPopup(text, posX, posY) {
  aiWord.textContent = `"${text}"`;
  aiTranslation.textContent = "Translating...";
  aiPopup.style.left = `${Math.min(posX, window.innerWidth - 300)}px`;
  aiPopup.style.top = `${posY}px`;
  aiPopup.style.display = 'block';

  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=|en`);
    const data = await res.json();
    if (data && data.responseData && data.responseData.translatedText) {
      const translatedText = data.responseData.translatedText;
      aiTranslation.innerHTML = `<b>Translation (→ EN):</b><br/>${translatedText}`;
    } else {
      aiTranslation.textContent = "Could not find translation.";
    }
  } catch (err) {
    aiTranslation.textContent = "Translation service unavailable.";
  }
}

function hideAiPopup() {
  aiPopup.style.display = 'none';
}

// Delete Book
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

// Apply Theme
async function applyTheme(theme) {
  currentTheme = theme;
  document.body.className = `theme-${theme}`;

  const col = themeColors[theme] || themeColors.light;
  if (viewer) {
    viewer.style.backgroundColor = col.bg;
  }

  if (rendition) rendition.themes.select(theme);

  themeLight.classList.toggle('active', theme === 'light');
  themeSepia.classList.toggle('active', theme === 'sepia');
  themeEmerald.classList.toggle('active', theme === 'emerald');
  themeNavy.classList.toggle('active', theme === 'navy');
  themeDark.classList.toggle('active', theme === 'dark');

  await localforage.setItem('selected_theme', theme);
}

themeLight.addEventListener('click', () => applyTheme('light'));
themeSepia.addEventListener('click', () => applyTheme('sepia'));
themeEmerald.addEventListener('click', () => applyTheme('emerald'));
themeNavy.addEventListener('click', () => applyTheme('navy'));
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

// Keyboard Navigation
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
window.addEventListener('load', async () => {
  const savedTheme = (await localforage.getItem('selected_theme')) || 'light';
  applyTheme(savedTheme);
  renderShelf();
});