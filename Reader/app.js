let book = null;
let rendition = null;
let currentBookId = null;
let fontSize = 100; // Percentage
let currentTheme = 'light';

const fileInput = document.getElementById('file-input');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInfo = document.getElementById('page-info');

const libraryView = document.getElementById('library-view');
const readerView = document.getElementById('reader-view');
const tabLibrary = document.getElementById('tab-library');
const tabReader = document.getElementById('tab-reader');
const shelfGrid = document.getElementById('shelf-grid');
const readerControls = document.getElementById('reader-controls');

// Theme Elements
const themeLight = document.getElementById('theme-light');
const themeSepia = document.getElementById('theme-sepia');
const themeDark = document.getElementById('theme-dark');

// View Switching
tabLibrary.addEventListener('click', () => showView('library'));
tabReader.addEventListener('click', () => showView('reader'));

function showView(view) {
  if (view === 'library') {
    libraryView.style.display = 'block';
    readerView.style.display = 'none';
    readerControls.style.display = 'none';
    tabLibrary.classList.add('active');
    tabReader.classList.remove('active');
  } else {
    libraryView.style.display = 'none';
    readerView.style.display = 'flex';
    readerControls.style.display = 'flex';
    tabReader.classList.add('active');
    tabLibrary.classList.remove('active');
  }
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
      data: bookData
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

// Render Bookshelf UI
async function renderShelf() {
  const savedBooks = (await localforage.getItem('library_books')) || [];
  shelfGrid.innerHTML = '';

  if (savedBooks.length === 0) {
    shelfGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #6b7280; padding: 40px;">Your bookshelf is empty! Click <b>+ Add EPUB to Shelf</b> to add your first book.</p>`;
    return;
  }

  savedBooks.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <button class="delete-btn" onclick="deleteBook(event, '${b.id}')">✕</button>
      <div class="cover-box">
        ${b.cover ? `<img src="${b.cover}" alt="Cover" />` : `<span style="font-size: 32px;">📖</span>`}
      </div>
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
    `;

    card.addEventListener('click', () => openBook(b.id));
    shelfGrid.appendChild(card);
  });
}

// Open Selected Book
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

  rendition.display();
  pageInfo.textContent = `Reading: ${selectedBook.title}`;
  showView('reader');
}

// Delete Book from Shelf
async function deleteBook(event, bookId) {
  event.stopPropagation();
  let savedBooks = (await localforage.getItem('library_books')) || [];
  savedBooks = savedBooks.filter(b => b.id !== bookId);
  await localforage.setItem('library_books', savedBooks);
  renderShelf();
}

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
prevBtn.addEventListener('click', () => rendition && rendition.prev());
nextBtn.addEventListener('click', () => rendition && rendition.next());

// Initial Load
window.addEventListener('load', () => {
  renderShelf();
});