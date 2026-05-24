/* ==========================================================================
   Booklog Chat Dashboard - Core Application Logic
   ========================================================================== */

// App State Management
const state = {
  username: localStorage.getItem('booklog_username') || 'yuni0228', // Default to user's public bookshelf
  geminiKey: localStorage.getItem('gemini_api_key') || '',
  books: [],
  filteredBooks: [],
  selectedCategory: 'all',
  selectedStatus: 'all', // status filter (読んだ本, 読みたい本, 積読, etc.)
  currentSortRule: 'publisher', // default sorting rule: 出版社順
  searchQuery: '',
  chatHistory: [
    {
      role: 'model',
      text: 'こんにちは！あなたのブクログ本棚の情報を同期しました。読んでいる本について質問したり、本棚のジャンル傾向を分析したり、次に読むべき本の推薦など、何でもお気軽にお尋ねくださいね！'
    }
  ]
};

// Initialize Markdown Parser
const md = window.markdownit({
  html: false,
  linkify: true,
  typographer: true
});

// DOM Elements
const elements = {
  appContainer: document.querySelector('.app-container'),
  mobileTabs: document.getElementById('mobile-tabs'),
  statusFilters: document.getElementById('status-filters'),
  sortOrder: document.getElementById('sort-order'),
  currentUsernameDisplay: document.getElementById('current-username-display'),
  booksGrid: document.getElementById('books-grid'),
  searchBooks: document.getElementById('search-books'),
  categoryFilters: document.getElementById('category-filters'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  btnSend: document.getElementById('btn-send'),
  btnSync: document.getElementById('btn-sync'),
  btnClearChat: document.getElementById('btn-clear-chat'),
  btnSettings: document.getElementById('btn-settings'),
  chatSuggestions: document.getElementById('chat-suggestions'),
  chatStatus: document.getElementById('chat-status'),
  
  // Settings Modal
  settingsModal: document.getElementById('settings-modal'),
  inputBooklogUsername: document.getElementById('input-booklog-username'),
  inputGeminiKey: document.getElementById('input-gemini-key'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnCancelSettings: document.getElementById('btn-cancel-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),

  // Book Detail Modal
  bookDetailModal: document.getElementById('book-detail-modal'),
  detailCover: document.getElementById('detail-cover'),
  detailTitle: document.getElementById('detail-title'),
  detailAuthor: document.getElementById('detail-author'),
  detailCategory: document.getElementById('detail-category'),
  detailRelease: document.getElementById('detail-release'),
  detailPublisher: document.getElementById('detail-publisher'),
  detailAsin: document.getElementById('detail-asin'),
  btnOpenBooklog: document.getElementById('btn-open-booklog'),
  btnDiscussBook: document.getElementById('btn-discuss-book'),
  btnCloseDetail: document.getElementById('btn-close-detail')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSettingsUI();
  fetchBooklogData();
});

// Setup Event Listeners
function setupEventListeners() {
  // Mobile Tab toggler navigation listeners
  elements.mobileTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.mobile-tab-btn');
    if (btn) {
      const tab = btn.dataset.tab;
      switchMobileTab(tab);
    }
  });

  // Sync button
  elements.btnSync.addEventListener('click', fetchBooklogData);

  // Settings modals
  elements.btnSettings.addEventListener('click', openSettingsModal);
  elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
  elements.btnCancelSettings.addEventListener('click', closeSettingsModal);
  elements.btnSaveSettings.addEventListener('click', saveSettings);

  // Book Detail Modal closing
  elements.btnCloseDetail.addEventListener('click', closeBookDetailModal);
  elements.bookDetailModal.addEventListener('click', (e) => {
    if (e.target === elements.bookDetailModal) closeBookDetailModal();
  });

  // Search input change
  elements.searchBooks.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    filterAndRenderBooks();
  });

  // Status Filter click listeners (読んだ本, 読みたい本, 積読, etc.)
  elements.statusFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (btn) {
      document.querySelectorAll('#status-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedStatus = btn.dataset.status;
      filterAndRenderBooks();
    }
  });

  // Sorting selection dropdown listener
  elements.sortOrder.addEventListener('change', (e) => {
    state.currentSortRule = e.target.value;
    state.books = sortBooks(state.books, state.currentSortRule);
    filterAndRenderBooks();
  });

  // Chat send operations
  elements.btnSend.addEventListener('click', handleUserSendMessage);
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleUserSendMessage();
    }
  });

  // Auto-resize chat textarea
  elements.chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });

  // Quick Prompt Chips
  elements.chatSuggestions.addEventListener('click', (e) => {
    const chip = e.target.closest('.suggestion-chip');
    if (chip) {
      const prompt = chip.dataset.prompt;
      if (prompt) {
        sendDirectPrompt(prompt);
      }
    }
  });

  // Clear Chat history
  elements.btnClearChat.addEventListener('click', clearChatHistory);

  // Close modals on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeBookDetailModal();
    }
  });
}

// Load configurations into input fields
function loadSettingsUI() {
  elements.inputBooklogUsername.value = state.username;
  elements.inputGeminiKey.value = state.geminiKey;
  elements.currentUsernameDisplay.textContent = `@${state.username}`;
}

// Settings Modal controls
function openSettingsModal() {
  elements.inputBooklogUsername.value = state.username;
  elements.inputGeminiKey.value = state.geminiKey;
  elements.settingsModal.classList.add('active');
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove('active');
}

function saveSettings() {
  const newUsername = elements.inputBooklogUsername.value.trim() || 'hec';
  const newKey = elements.inputGeminiKey.value.trim();

  state.username = newUsername;
  state.geminiKey = newKey;

  localStorage.setItem('booklog_username', newUsername);
  localStorage.setItem('gemini_api_key', newKey);

  loadSettingsUI();
  closeSettingsModal();
  fetchBooklogData();
}

// Fetch public bookshelf from Booklog (via CORS proxy with automatic fallback and parallel status queries)
async function fetchBooklogData() {
  renderLoadingState();
  elements.chatStatus.textContent = '本棚をロード中...';

  // We query all 4 standard reading statuses in Booklog
  const statuses = [
    { id: 3, label: '読んだ本' },
    { id: 1, label: '読みたい本' },
    { id: 4, label: '積読' },
    { id: 2, label: 'いま読んでる本' }
  ];

  // Resilient fallback CORS proxy configurations
  const proxies = [
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  let combinedBooks = [];
  let lastError = null;

  try {
    const promises = statuses.map(async (status, index) => {
      const booklogApiUrl = `https://api.booklog.jp/json/${state.username}?status=${status.id}&count=10000`;
      let success = false;
      let data = null;

      // Try each proxy sequentially for this status
      for (let i = 0; i < proxies.length; i++) {
        const proxiedUrl = proxies[i](booklogApiUrl);
        try {
          const response = await fetch(proxiedUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          data = await response.json();
          if (data && data.books) {
            success = true;
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (success && data && data.books) {
        return data.books.map((book, bookIdx) => {
          let asin = '不明';
          if (book.url) {
            const parts = book.url.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart && /^[0-9Xx]{10,13}$/.test(lastPart)) {
              asin = lastPart;
            }
          }
          
          let coverImage = book.image || 'https://via.placeholder.com/150x220?text=No+Image';
          if (coverImage.includes('amazon.com') || coverImage.includes('media-amazon.com')) {
            coverImage = coverImage.replace(/\._S[LXY]\d+(_S[LXY]\d+)?_/gi, '._SL320_');
          }

          // Use unique indices combining status and index to ensure stable custom sorting
          const originalIndex = (status.id * 100000) + bookIdx;

          return {
            title: book.title || '無題',
            author: cleanAuthorName(book.author || '著者不明'),
            image: coverImage,
            category: book.catalog || 'その他',
            release: book.release || '不明',
            publisher: '不明', // will be enriched
            asin: asin,
            url: book.url || `https://booklog.jp/item/1/${asin}`,
            status: status.label,
            originalIndex: originalIndex
          };
        });
      }
      return [];
    });

    const statusResults = await Promise.all(promises);
    combinedBooks = statusResults.flat();

    if (combinedBooks.length === 0) {
      throw new Error(lastError ? lastError.message : '書籍データが見見つかりませんでした。ユーザー名が正しいかご確認ください。');
    }

    state.books = combinedBooks;
    
    // Sort initially by default order (publisher)
    state.books = sortBooks(state.books, state.currentSortRule);
    state.filteredBooks = [...state.books];
    
    elements.chatStatus.textContent = `${state.books.length}冊の本棚データを認識`;
    renderBookshelf();
    renderCategoryFilters();

    // Enrich with OpenBD in background to populate author/release/publisher metadata
    enrichBookMetadata();
  } catch (error) {
    console.error('All proxies failed. Last error:', error);
    elements.chatStatus.textContent = '本棚データの取得失敗';
    
    let displayMessage = error.message;
    if (displayMessage.includes('403')) {
      displayMessage += ' (ブクログ側またはプロキシサーバーにより接続が制限されています。しばらく時間をおいてお試しください)';
    }
    renderErrorState(displayMessage);
  }
}

// Convert ISBN-10 (ASIN) to ISBN-13 mathematically
function convertISBN10to13(isbn10) {
  if (!isbn10 || isbn10.length !== 10) return isbn10;
  if (isbn10.startsWith('978') || isbn10.startsWith('979')) return isbn10;
  
  const base = '978' + isbn10.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

// Batch enrich book authors and publish dates using OpenBD API
async function enrichBookMetadata() {
  // Convert all ASINs (ISBN-10) to ISBN-13
  const isbnMap = {};
  state.books.forEach(book => {
    if (book.asin && book.asin !== '不明') {
      const isbn13 = convertISBN10to13(book.asin);
      isbnMap[isbn13] = book;
    }
  });

  const isbn13s = Object.keys(isbnMap);
  if (isbn13s.length === 0) return;

  elements.chatStatus.textContent = '書籍詳細情報を取得中...';
  console.log(`Enriching metadata for ${isbn13s.length} books via OpenBD...`);

  // Split into chunks of 100 to avoid URL length limits
  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < isbn13s.length; i += chunkSize) {
    chunks.push(isbn13s.slice(i, i + chunkSize));
  }

  try {
    const promises = chunks.map(async (chunk) => {
      const url = `https://api.openbd.jp/v1/get?isbn=${chunk.join(',')}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      return await response.json();
    });

    const results = await Promise.all(promises);
    const openbdBooks = results.flat().filter(item => item !== null);
    
    // Map fetched details back to state
    let enrichedCount = 0;
    openbdBooks.forEach(item => {
      if (item && item.summary) {
        const isbn13 = item.summary.isbn;
        const author = cleanAuthorName(item.summary.author);
        const pubdate = formatPubDate(item.summary.pubdate);
        const publisher = item.summary.publisher || '不明';
        const cover = item.summary.cover;
        
        // Find matching book in our list
        const matchedBook = isbnMap[isbn13];
        if (matchedBook) {
          // PROTECT AUTHOR: Only overwrite if Booklog author is unknown
          if (matchedBook.author === '著者不明') {
            if (author && author !== '著者不明') {
              matchedBook.author = author;
              enrichedCount++;
            }
          }
          if (pubdate && pubdate !== '不明') {
            matchedBook.release = pubdate;
          }
          if (publisher && publisher !== '不明') {
            matchedBook.publisher = publisher;
          }
          // If OpenBD has a high-res cover image, use it!
          if (cover) {
            matchedBook.image = cover;
          }
        }
      }
    });

    console.log(`Successfully enriched author/publisher info for ${enrichedCount} books.`);
    elements.chatStatus.textContent = `${state.books.length}冊の本棚データを同期完了`;
    
    // Re-sort the books based on the newly loaded publisher metadata!
    state.books = sortBooks(state.books, state.currentSortRule);
    
    // Re-render bookshelf with newly loaded details
    filterAndRenderBooks();
  } catch (error) {
    console.warn('Metadata enrichment failed:', error);
    elements.chatStatus.textContent = `${state.books.length}冊の本棚データを同期完了`;
  }
}

// Clean up author names (removing life years, stripping commas in names, and cleaning whitespaces)
function cleanAuthorName(author) {
  if (!author) return '著者不明';
  
  // Remove life years like ",1971-" or ",1890-1970"
  let clean = author.replace(/,\d{4}-\d{4}/g, '').replace(/,\d{4}-/g, '');
  
  // Remove comma/ideographic comma between Japanese last name and first name (e.g., "辻村,深月" or "辻村、深月" -> "辻村深月")
  clean = clean.replace(/([\u3005\u3040-\u30ff\u4e00-\u9faf]+)[,，、]([\u3005\u3040-\u30ff\u4e00-\u9faf]+)/g, '$1$2');
  
  // Clean up any remaining commas separating different authors with a clean space
  clean = clean.replace(/[,，、]\s*/g, ' ');
  
  // Format whitespace
  clean = clean.trim().replace(/\s+/g, ' ');
  return clean;
}

// Format publication date
function formatPubDate(pubdate) {
  if (!pubdate) return '不明';
  if (pubdate.length === 6) {
    return `${pubdate.substring(0, 4)}年${pubdate.substring(4, 6)}月`;
  }
  if (pubdate.length === 8) {
    return `${pubdate.substring(0, 4)}年${pubdate.substring(4, 6)}月${pubdate.substring(6, 8)}日`;
  }
  return pubdate;
}

// Rendering States
function renderLoadingState() {
  elements.booksGrid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>ブクログ本棚データを同期しています...</p>
    </div>
  `;
}

function renderErrorState(message) {
  elements.booksGrid.innerHTML = `
    <div class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="48" height="48" style="color: var(--accent-purple); margin-bottom:12px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 7.5h.008v.008H12v-.008Z" />
      </svg>
      <h3 style="font-family: var(--font-heading); margin-bottom:8px;">同期エラー</h3>
      <p style="color: var(--text-secondary); margin-bottom:16px;">ユーザー ID 「${state.username}」 からデータを読み込めませんでした。<br><small>${message}</small></p>
      <button class="btn btn-primary" onclick="openSettingsModal()">設定を確認する</button>
    </div>
  `;
}

// Renders the list of books in the Grid
function renderBookshelf() {
  if (state.filteredBooks.length === 0) {
    elements.booksGrid.innerHTML = `
      <div class="empty-state">
        <p>該当する書籍が本棚に見つかりませんでした。</p>
      </div>
    `;
    return;
  }

  elements.booksGrid.innerHTML = '';
  state.filteredBooks.forEach((book, index) => {
    const card = document.createElement('div');
    card.className = 'book-card';
    
    // Add glowing hover effect script logic variables
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });

    card.addEventListener('click', () => openBookDetailModal(book));

    card.innerHTML = `
      <div class="book-cover-container">
        <img class="book-cover" src="${book.image}" alt="${book.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/150x220?text=No+Cover'">
      </div>
      <div class="book-title" title="${book.title}">${book.title}</div>
      <div class="book-author" title="${book.author}">${book.author}</div>
      <div class="book-badge">${translateCategory(book.category)}</div>
    `;
    
    elements.booksGrid.appendChild(card);
  });
}

// Generate category selection buttons based on bookshelf contents
function renderCategoryFilters() {
  const categories = ['all', ...new Set(state.books.map(b => b.category))];
  elements.categoryFilters.innerHTML = '';

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${state.selectedCategory === cat ? 'active' : ''}`;
    btn.textContent = cat === 'all' ? 'すべて' : translateCategory(cat);
    btn.dataset.category = cat;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCategory = cat;
      filterAndRenderBooks();
    });

    elements.categoryFilters.appendChild(btn);
  });
}

// Categorizing translator helper (Booklog returns English labels typically like 'book', 'comic')
function translateCategory(cat) {
  const mapping = {
    'all': 'すべて',
    'book': '一般書',
    'comic': 'コミック',
    'dvd': 'DVD/映画',
    'cd': 'CD/音楽',
    'game': 'ゲーム',
    'magazine': '雑誌',
    'other': 'その他'
  };
  return mapping[cat.toLowerCase()] || cat;
}

// Filters list of books based on criteria
function filterAndRenderBooks() {
  state.filteredBooks = state.books.filter(book => {
    const matchesCategory = state.selectedCategory === 'all' || book.category === state.selectedCategory;
    const matchesStatus = state.selectedStatus === 'all' || book.status === state.selectedStatus;
    const matchesSearch = book.title.toLowerCase().includes(state.searchQuery) || 
                          book.author.toLowerCase().includes(state.searchQuery);
    return matchesCategory && matchesStatus && matchesSearch;
  });
  renderBookshelf();
}

// Publisher normalization mapping logic
function normalizePublisher(pub) {
  if (!pub || pub === '不明') return '不明';
  const p = pub.trim().toLowerCase();
  
  if (
    p.includes('kadokawa') ||
    p.includes('角川') ||
    p.includes('アスキー') ||
    p.includes('メディアワークス') ||
    p.includes('エンターブレイン') ||
    p.includes('富士見書房') ||
    p.includes('電撃') ||
    p.includes('中経出版')
  ) {
    return 'KADOKAWA';
  }
  return pub;
}

// Convert full-width characters and spaces to standard half-width ones
function toHalfWidth(str) {
  if (!str) return '';
  return str.replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
            .replace(/　/g, ' ');
}

// Parses release date string (e.g., 2021-05-25, 2021年05月25日) into comparable integer
function parseReleaseDate(releaseStr) {
  if (!releaseStr || releaseStr === '不明') return Infinity;
  
  const matches = releaseStr.match(/\d+/g);
  if (!matches || matches.length === 0) return Infinity;
  
  const year = matches[0] || '0000';
  const month = matches[1] || '00';
  const day = matches[2] || '00';
  
  const paddedMonth = month.padStart(2, '0');
  const paddedDay = day.padStart(2, '0');
  
  return parseInt(year + paddedMonth + paddedDay, 10);
}

// Constants for Roman numerals and special volume designations
const ROMAN_NUMERALS = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
  'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15, 'XVI': 16, 'XVII': 17, 'XVIII': 18, 'XIX': 19, 'XX': 20,
  'XXI': 21, 'XXII': 22, 'XXIII': 23, 'XXIV': 24, 'XXV': 25, 'XXVI': 26, 'XXVII': 27, 'XXVIII': 28, 'XXIX': 29, 'XXX': 30
};

const SPECIAL_VOLUMES = {
  '上': 1, '上巻': 1, '前編': 1, '前': 1,
  '中': 2, '中巻': 2, '中編': 2,
  '下': 3, '下巻': 3, '後編': 3, '後': 3
};

// Parse a book title into base series title and mathematical volume integer
function parseTitle(title) {
  if (!title) return { base: '', volume: 0 };
  
  let cleanTitle = toHalfWidth(title).trim();
  
  // Strip trailing publisher/meta brackets containing non-digits (e.g. "(新潮文庫)", "（角川文庫）")
  const trailingParenNonDigitRegex = /[\s(（[［<〈]([^)）\]］>〉]*\D+[^)）\]］>〉]*)[\s)）\]］>〉]$/;
  if (cleanTitle.match(trailingParenNonDigitRegex)) {
    cleanTitle = cleanTitle.replace(trailingParenNonDigitRegex, '').trim();
  }
  
  // 1. Parentheses/brackets containing digits at the end: (10), [8], （５）
  const parenRegex = /[\s(（[［<〈](\d+)[\s)）\]］>〉]$/;
  const parenMatch = cleanTitle.match(parenRegex);
  if (parenMatch) {
    const vol = parseInt(parenMatch[1], 10);
    const base = cleanTitle.replace(parenRegex, '').trim();
    return { base, volume: vol };
  }
  
  // 2. Roman numerals at the end (case-insensitive, optional boundaries): VIII, X, ix
  const romanRegex = /\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX)\b$/i;
  const romanMatch = cleanTitle.match(romanRegex);
  if (romanMatch) {
    const roman = romanMatch[1].toUpperCase();
    const vol = ROMAN_NUMERALS[roman];
    if (vol !== undefined) {
      const base = cleanTitle.replace(romanRegex, '').trim();
      return { base, volume: vol };
    }
  }
  
  // 3. Traditional Japanese order suffixes at the end: 上, 中, 下, 前編, 後編
  const specialRegex = /[\s(（[［<〈]?(上|上巻|前編|前|中|中巻|中編|下|下巻|後編|後)[）)\]］>〉]?$/;
  const specialMatch = cleanTitle.match(specialRegex);
  if (specialMatch) {
    const word = specialMatch[1];
    const vol = SPECIAL_VOLUMES[word];
    if (vol !== undefined) {
      const base = cleanTitle.replace(specialRegex, '').trim();
      return { base, volume: vol };
    }
  }
  
  // 4. Trailing Arabic digits: 高校事変 10 or 高校事変10
  const digitRegex = /(\s+|\b)(\d+)$/;
  const digitMatch = cleanTitle.match(digitRegex);
  if (digitMatch) {
    const vol = parseInt(digitMatch[2], 10);
    const base = cleanTitle.replace(digitRegex, '').trim();
    return { base, volume: vol };
  }

  // 5. Hard trailing digits without spaces (e.g. 高校事変10 when no boundaries match)
  const endDigitRegex = /(\D+)(\d+)$/;
  const endDigitMatch = cleanTitle.match(endDigitRegex);
  if (endDigitMatch) {
    const vol = parseInt(endDigitMatch[2], 10);
    const base = endDigitMatch[1].trim();
    return { base, volume: vol };
  }
  
  return { base: cleanTitle, volume: null };
}

// Compare two titles naturally (comparing base strings first, then volume numbers)
function compareTitlesNaturally(titleA, titleB) {
  const parsedA = parseTitle(titleA);
  const parsedB = parseTitle(titleB);
  
  const baseCompare = parsedA.base.localeCompare(parsedB.base, 'ja');
  if (baseCompare !== 0) {
    return titleA.localeCompare(titleB, 'ja');
  }
  
  if (parsedA.volume !== null && parsedB.volume !== null) {
    return parsedA.volume - parsedB.volume;
  }
  
  if (parsedA.volume === null && parsedB.volume !== null) return -1;
  if (parsedA.volume !== null && parsedB.volume === null) return 1;
  
  return titleA.localeCompare(titleB, 'ja');
}

// Dynamic bookshelf sorting utility
function sortBooks(books, rule) {
  const sorted = [...books];
  
  if (rule === 'publisher') {
    sorted.sort((a, b) => {
      // 1. Publisher normalization
      const pubA = normalizePublisher(a.publisher);
      const pubB = normalizePublisher(b.publisher);
      if (pubA === '不明' && pubB !== '不明') return 1;
      if (pubB === '不明' && pubA !== '不明') return -1;
      const pubComp = pubA.localeCompare(pubB, 'ja');
      if (pubComp !== 0) return pubComp;
      
      // 2. Author grouping
      const authA = a.author || '';
      const authB = b.author || '';
      if (authA === '著者不明' && authB !== '著者不明') return 1;
      if (authB === '著者不明' && authA !== '著者不明') return -1;
      const authComp = authA.localeCompare(authB, 'ja');
      if (authComp !== 0) return authComp;
      
      // 3. Chronological Release Date
      const dateA = parseReleaseDate(a.release);
      const dateB = parseReleaseDate(b.release);
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // 4. Natural title sorting fallback
      return compareTitlesNaturally(a.title, b.title);
    });
  } else if (rule === 'author') {
    sorted.sort((a, b) => {
      // 1. Author grouping
      const authA = a.author || '';
      const authB = b.author || '';
      if (authA === '著者不明' && authB !== '著者不明') return 1;
      if (authB === '著者不明' && authA !== '著者不明') return -1;
      const authComp = authA.localeCompare(authB, 'ja');
      if (authComp !== 0) return authComp;
      
      // 2. Chronological Release Date
      const dateA = parseReleaseDate(a.release);
      const dateB = parseReleaseDate(b.release);
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // 3. Natural title sorting fallback
      return compareTitlesNaturally(a.title, b.title);
    });
  } else if (rule === 'title') {
    sorted.sort((a, b) => {
      // 1. Natural title sorting
      const titleComp = compareTitlesNaturally(a.title, b.title);
      if (titleComp !== 0) return titleComp;
      
      // 2. Chronological Release Date
      const dateA = parseReleaseDate(a.release);
      const dateB = parseReleaseDate(b.release);
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // 3. Author grouping fallback
      const authA = a.author || '';
      const authB = b.author || '';
      return authA.localeCompare(authB, 'ja');
    });
  } else if (rule === 'added') {
    // Return sorted in original registration index order
    return sorted.sort((a, b) => a.originalIndex - b.originalIndex);
  }
  return sorted;
}

// Book Detail Modal popup triggers
let detailModalActiveBook = null;

function openBookDetailModal(book) {
  detailModalActiveBook = book;
  elements.detailCover.src = book.image;
  elements.detailCover.onerror = function() {
    this.src = 'https://via.placeholder.com/150x220?text=No+Cover';
  };
  elements.detailTitle.textContent = book.title;
  elements.detailAuthor.textContent = book.author;
  elements.detailCategory.textContent = `カテゴリ: ${translateCategory(book.category)}`;
  elements.detailRelease.textContent = `発売日: ${book.release}`;
  elements.detailPublisher.textContent = `出版社: ${book.publisher || '不明'}`;
  elements.detailAsin.textContent = `ASIN/ISBN: ${book.asin}`;
  elements.btnOpenBooklog.href = book.url;
  
  elements.bookDetailModal.classList.add('active');
}

function closeBookDetailModal() {
  elements.bookDetailModal.classList.remove('active');
  detailModalActiveBook = null;
}

// Trigger standard book discussion in Chat from Detail Modal
elements.btnDiscussBook.addEventListener('click', () => {
  if (detailModalActiveBook) {
    const book = detailModalActiveBook;
    closeBookDetailModal();
    
    // Auto switch mobile tab to chat view so they see the AI response start
    switchMobileTab('chat');
    
    sendDirectPrompt(`本棚にある「${book.title}」（著者: ${book.author}）について詳しく語り合いましょう！この本の内容、魅力、あなたの感想などを教えてください。`);
  }
});

// Rendering and Posting Messages in Chat Panel
function appendMessage(role, text) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role === 'user' ? 'user' : 'ai'}`;
  
  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  
  if (role === 'model') {
    contentEl.innerHTML = md.render(text);
  } else {
    contentEl.textContent = text;
  }
  
  const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  const now = new Date();
  timeEl.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  messageEl.appendChild(contentEl);
  messageEl.appendChild(timeEl);
  elements.chatMessages.appendChild(messageEl);
  
  // Scroll to bottom
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function clearChatHistory() {
  if (confirm('チャットの履歴をクリアしますか？')) {
    state.chatHistory = [
      {
        role: 'model',
        text: 'こんにちは！チャット履歴を消去しました。本棚に関して知りたいことやAIと話したいことがあれば、いつでもメッセージをどうぞ！'
      }
    ];
    elements.chatMessages.innerHTML = '';
    appendMessage(state.chatHistory[0].role, state.chatHistory[0].text);
  }
}

// Dynamic AI Chat Interaction
async function handleUserSendMessage() {
  const text = elements.chatInput.value.trim();
  if (!text) return;

  // Clear input
  elements.chatInput.value = '';
  elements.chatInput.style.height = 'auto';

  // Check if API Key is configured
  if (!state.geminiKey) {
    appendMessage('user', text);
    appendMessage('model', '⚠️ **Gemini API キーが未設定です。**\n\n画面上部の歯車アイコンをクリックして、Google AI Studio で取得した API キーを設定してください。キーを入力すると、本棚データをもとにした会話がスタートします！');
    return;
  }

  // UI state updates
  appendMessage('user', text);
  state.chatHistory.push({ role: 'user', text: text });

  // Show typing loader
  const typingIndicator = showTypingIndicator();

  try {
    const aiResponse = await callGeminiAPI();
    typingIndicator.remove();
    appendMessage('model', aiResponse);
    state.chatHistory.push({ role: 'model', text: aiResponse });
  } catch (error) {
    console.error('Gemini API call failed:', error);
    typingIndicator.remove();
    appendMessage('model', `⚠️ **AIとの通信エラーが発生しました。**\n\nエラー内容: ${error.message}\n\nAPIキーが有効であるか、あるいは通信環境をご確認ください。`);
  }
}

// Allows Quick Suggestion Buttons or Detail button to post directly
function sendDirectPrompt(text) {
  elements.chatInput.value = text;
  handleUserSendMessage();
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message ai typing-message';
  
  const content = document.createElement('div');
  content.className = 'message-content typing-indicator';
  content.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;
  
  indicator.appendChild(content);
  elements.chatMessages.appendChild(indicator);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  return indicator;
}

// Gemini API Integration Core
async function callGeminiAPI() {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.geminiKey}`;
  
  // Construct user bookshelf description for AI injection
  let bookshelfContext = `ユーザー名: ${state.username}\n本棚登録書籍一覧 (${state.books.length}冊):\n`;
  state.books.forEach((book, idx) => {
    bookshelfContext += `${idx + 1}. 「${book.title}」 / 著者: ${book.author} (カテゴリ: ${translateCategory(book.category)})\n`;
  });

  const systemInstruction = `
あなたはユーザーのブクログ本棚の読書記録を読み込み、本が大好きなパーソナル読書アシスタントとして対話します。
以下の指示に従って、日本語で親しみやすく回答してください。

【ユーザーの本棚情報】
${bookshelfContext}

【対話方針】
- ユーザーの本棚に登録されている書籍情報に基づき、本棚のジャンルの偏りや読書傾向の分析、本の魅力的な紹介を行ってください。
- ユーザーが新しい本を求めている場合は、本棚にある本と関連性の高いおすすめ本（本棚に無い本も含め）を具体的に提案し、なぜオススメするのか理由も説明してください。
- 特定の書籍が指定された場合は、その本のプロット（あらすじ）、テーマ、主要キャラクター、魅力、作者の文体などを専門的かつ魅力的に解説して議論を盛り上げてください。
- ユーザーに親身で親しみやすい文学の友として対話を行ってください。適度にマークダウン（見出し、箇条書き、太字、引用ブロックなど）を活用して視覚的に整理された分かりやすい回答を心がけてください。
  `;

  // Compile history for standard chat format in standard format required by Google API
  // Note: Gemini API requires alternate user and model roles. System instruction is sent separately in model configs.
  const contents = state.chatHistory.map(item => ({
    role: item.role === 'model' ? 'model' : 'user',
    parts: [{ text: item.text }]
  }));

  const requestBody = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  const responseData = await response.json();
  const aiText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) {
    throw new Error('有効な応答が生成されませんでした。');
  }

  return aiText;
}

// Switch active mobile view tab between Bookshelf and AI Chat
function switchMobileTab(tab) {
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (tab === 'chat') {
    elements.appContainer.classList.add('show-chat');
  } else {
    elements.appContainer.classList.remove('show-chat');
  }
  
  // Force scrolls to bottom if switching to chat
  if (tab === 'chat') {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }
}
