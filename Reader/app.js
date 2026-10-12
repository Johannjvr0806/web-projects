let book = null;
let rendition = null;

const fileInput = document.getElementById('file-input');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInfo = document.getElementById('page-info');

// Handle EPUB Upload
fileInput.addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (event) {
    const bookData = event.target.result;

    // Destroy existing book rendition if one is loaded
    if (book) {
      book.destroy();
    }

    // Initialize ePub.js
    book = ePub(bookData);
    rendition = book.renderTo("viewer", {
      width: "100%",
      height: "100%",
      spread: "auto"
    });

    rendition.display();

    // Save uploaded book file to local storage using localForage
    localforage.setItem('saved_book', bookData).then(() => {
      console.log('Book saved locally!');
    });

    pageInfo.textContent = `Reading: ${file.name}`;
  };

  reader.readAsArrayBuffer(file);
});

// Page Navigation
prevBtn.addEventListener('click', () => {
  if (rendition) rendition.prev();
});

nextBtn.addEventListener('click', () => {
  if (rendition) rendition.next();
});

// Auto-load saved book on startup
window.addEventListener('load', () => {
  localforage.getItem('saved_book').then((savedData) => {
    if (savedData) {
      book = ePub(savedData);
      rendition = book.renderTo("viewer", {
        width: "100%",
        height: "100%",
        spread: "auto"
      });
      rendition.display();
      pageInfo.textContent = "Loaded last saved book";
    }
  });
});