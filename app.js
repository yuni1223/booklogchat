/* ==========================================================================
   Booklog Chat Dashboard - Core Application Logic
   ========================================================================== */

// App State Management
const state = {
  username: localStorage.getItem('booklog_username') || 'yuni0228', // Default to user's public bookshelf
  geminiKey: localStorage.getItem('gemini_api_key') || '',
  books: [],
  filteredBooks: [],
  selectedCategory: 'novel',
  selectedStatus: '読んだ本', // status filter (読んだ本, 読みたい本, 積読, etc.)
  currentSortRule: 'author', // default sorting rule: 著者順
  searchQuery: '',
  chatHistory: [
    {
      role: 'model',
      text: 'こんにちは！あなたのブクログ本棚の情報を同期しました。読んでいる本について質問したり、本棚のジャンル傾向を分析したり、次に読むべき本の推薦など、何でもお気軽にお尋ねくださいね！'
    }
  ]
};

// Resilient Fetch with Timeout to prevent application blocking/hanging
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

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

  // Try to load cached books first for instant render
  try {
    const cachedData = localStorage.getItem(`booklog_cached_books_${state.username}`);
    if (cachedData) {
      state.books = JSON.parse(cachedData);
      state.books = sortBooks(state.books, state.currentSortRule);
      filterAndRenderBooks();
      renderCategoryFilters();
      elements.chatStatus.textContent = `${state.books.length}冊の本棚データをキャッシュから読み込みました`;
    }
  } catch (e) {
    console.warn("Failed to load cached books:", e);
  }

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

// Native JSONP wrapper for Booklog API to bypass CORS proxy dependency entirely and load instantly
function fetchBooklogJSONP(username, statusId) {
  return new Promise((resolve, reject) => {
    const callbackName = `booklogCallback_${statusId}_${Math.random().toString(36).substring(2, 9)}`;
    const script = document.createElement('script');
    
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('ブクログAPIの応答タイムアウト（8秒）'));
    }, 8000);
    
    function cleanup() {
      clearTimeout(timeoutId);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete window[callbackName];
    }
    
    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };
    
    script.src = `https://api.booklog.jp/json/${username}?status=${statusId}&count=10000&callback=${callbackName}`;
    script.onerror = function() {
      cleanup();
      reject(new Error('スクリプト読み込みエラー（ブクログ側の一時的な障害、またはネットワークの切断）'));
    };
    
    document.body.appendChild(script);
  });
}

// Fetch public bookshelf from Booklog (via native JSONP with CORS proxy automatic fallback)
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

      // 1. Try native JSONP first (CORS-less, highly stable and fast!)
      try {
        data = await fetchBooklogJSONP(state.username, status.id);
        if (data && data.books) {
          success = true;
        }
      } catch (error) {
        console.warn(`JSONP failed for status ${status.id}, falling back to proxies:`, error);
        lastError = error;
        
        // 2. Fallback to CORS proxies sequentially
        for (let i = 0; i < proxies.length; i++) {
          const proxiedUrl = proxies[i](booklogApiUrl);
          try {
            const response = await fetchWithTimeout(proxiedUrl, { timeout: 4000 });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            data = await response.json();
            if (data && data.books) {
              success = true;
              break;
            }
          } catch (err) {
            lastError = err;
          }
        }
      }

      if (success && data && data.books) {
        return data.books.map((book, bookIdx) => {
          let asin = '不明';
          if (book.url) {
            const parts = book.url.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart && /^[0-9Xx]{10,13}$|^[Bb]0[0-9A-Za-z]{8}$/.test(lastPart)) {
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
            title: cleanPublisherLabel(book.title || '無題'),
            author: cleanAuthorName(book.author || '著者不明'),
            image: coverImage,
            category: (() => {
              let cat = book.catalog || 'その他';
              if (cat.toLowerCase() === 'book') {
                const titleUpper = (book.title || '').toUpperCase();
                
                // 1. Shinsho Check
                const isShinsho = titleUpper.includes('新書') || titleUpper.includes('選書');
                if (isShinsho) return 'shinsho';
                
                // 2. Novel (物語文) Check
                const hasNovelKeyword = titleUpper.includes('文庫') || titleUpper.includes('小説') || titleUpper.includes('選集') || titleUpper.includes('ミステリ') || titleUpper.includes('推理');
                
                // Avoid single-character greedy keywords like '学' or '論' matching '数学', '文学', '論理'
                const nonFictionKeywords = ['論文', '概論', '総論', '原論', '各論', '資本論', '評論', '論稿', '科学', '哲学', '経済学', '政治学', '社会学', '心理学', '言語学', '物理学', '地学', '医学', '人文学', '神学', '法学', '理学', '工学', '農学', '統計学', '歴史学', '世界史', '日本史', '東洋史', '西洋史', '近代史', '現代史', '古代史', '歴史', '入門', 'わかる', '解説', '講義', '教養', '基礎', '技術', '図鑑', 'ビジネス', '仕事', '自己啓発', '実践', 'マーケティング', 'デザイン', '雑学', '不思議', '興奮', 'バイアス', '整理', '生産', '文明', '病原菌', '人類', '脳', '思考', '知の', '知的', '認知', '宇宙', '人生', '行動'];
                const hasNonFictionTitle = nonFictionKeywords.some(kw => titleUpper.includes(kw));
                
                if (hasNovelKeyword && !hasNonFictionTitle) {
                  return 'novel';
                }
                
                // 3. Default general non-fiction book
                return 'book';
              }
              return cat;
            })(),
            release: book.release || '不明',
            publisher: '不明', // will be enriched
            series: (() => {
               const tempBook = { title: book.title || '', author: cleanAuthorName(book.author || '著者不明') };
               return resolveBookSeries(tempBook, '');
            })(),
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

    // Merge with cache to preserve enriched metadata
    let cachedBooks = [];
    try {
      const cachedData = localStorage.getItem(`booklog_cached_books_${state.username}`);
      if (cachedData) {
        cachedBooks = JSON.parse(cachedData);
      }
    } catch (e) {
      console.warn("Failed to load cached books inside fetch:", e);
    }

    const mergedBooks = combinedBooks.map(book => {
      // Find matching cached book
      const matched = cachedBooks.find(cached => {
        if (book.asin && book.asin !== '不明' && cached.asin && cached.asin !== '不明') {
          return book.asin === cached.asin;
        }
        return book.title === cached.title && book.author === cached.author;
      });

      if (matched) {
        return {
          ...book,
          // Preserve enriched metadata
          publisher: matched.publisher || '不明',
          author: (matched.author && matched.author !== '著者不明') ? matched.author : book.author,
          category: matched.category || book.category,
          series: matched.series || book.series,
          release: (matched.release && matched.release !== '不明') ? matched.release : book.release,
          image: (matched.image && !matched.image.includes('placeholder')) ? matched.image : book.image,
          enriched: matched.enriched || false
        };
      }
      return book;
    });

    state.books = mergedBooks;
    
    // Sort initially by default order (publisher)
    state.books = sortBooks(state.books, state.currentSortRule);
    elements.chatStatus.textContent = `${state.books.length}冊の本棚データを認識`;
    filterAndRenderBooks();
    renderCategoryFilters();

    // Enrich with OpenBD in background to populate author/release/publisher metadata
    enrichBookMetadata();
  } catch (error) {
    console.error('All proxies failed. Last error:', error);
    if (elements.chatStatus) {
      elements.chatStatus.textContent = '本棚データの取得失敗';
    }
    
    let displayMessage = error && error.message ? error.message : String(error || '不明なエラー');
    if (displayMessage && typeof displayMessage === 'string' && displayMessage.includes('403')) {
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

// Extract C-Code (Japanese standard classification book code) from OpenBD item
function extractCCode(item) {
  if (!item) return null;
  if (item.hanmoto && item.hanmoto.c_code) {
    return String(item.hanmoto.c_code).trim();
  }
  if (item.onix?.DescriptiveDetail?.Subject) {
    const subjects = item.onix.DescriptiveDetail.Subject;
    const subjectList = Array.isArray(subjects) ? subjects : [subjects];
    for (const subj of subjectList) {
      if (subj?.SubjectSchemeIdentifier === '78' || subj?.SubjectSchemeIdentifier === '79') {
        if (subj.SubjectCode) {
          return String(subj.SubjectCode).trim();
        }
      }
    }
  }
  return null;
}

// Batch enrich book authors and publish dates using OpenBD API
async function enrichBookMetadata() {
  const unenrichedBooks = state.books.filter(b => !b.enriched);
  if (unenrichedBooks.length === 0) {
    console.log("All books are already enriched. Skipping API queries.");
    elements.chatStatus.textContent = `${state.books.length}冊の本棚データを同期完了`;
    return;
  }

  // Convert all numeric ASINs (ISBN-10) to ISBN-13 for OpenBD
  const isbnMap = {};
  unenrichedBooks.forEach(book => {
    if (book.asin && book.asin !== '不明') {
      const isbn13 = convertISBN10to13(book.asin);
      // Valid numeric ISBN-13 check
      if (/^97[89][0-9]{10}$/.test(isbn13)) {
        isbnMap[isbn13] = book;
      }
    }
  });

  const isbn13s = Object.keys(isbnMap);
  let enrichedCount = 0;

  // 1. Run OpenBD Batch query first (if any valid numeric ISBNs exist)
  if (isbn13s.length > 0) {
    elements.chatStatus.textContent = '新規書籍の詳細情報を取得中...';
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
        try {
          const response = await fetchWithTimeout(url, { timeout: 5000 });
          if (!response.ok) return [];
          return await response.json();
        } catch (err) {
          console.warn(`Metadata enrichment failed for ISBNs ${chunk.join(',')}:`, err);
          return [];
        }
      });

      const results = await Promise.all(promises);
      const openbdBooks = results.flat().filter(item => item !== null);
      
      // Map fetched details back to state
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
            const rawSeries = item.summary.series || '';
            const resolvedSeries = resolveBookSeries(matchedBook, rawSeries);
            if (resolvedSeries) {
              matchedBook.series = resolvedSeries;
            }
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
              
              // Refine category dynamically using enriched publisher, title, and C-Code metadata
              const catLower = (matchedBook.category || '').toLowerCase();
              if (catLower === 'book' || catLower === 'general' || catLower === 'novel' || catLower === 'shinsho' || catLower === '一般書' || catLower === '単行本・その他' || catLower === '単行本') {
                
                // 1. Try to extract C-Code first (Gold standard)
                let cCode = extractCCode(item);
                let classifiedViaCCode = false;
                if (cCode) {
                  cCode = cCode.replace(/^C/i, ''); // Strip leading C if present
                  if (cCode.length === 4) {
                    const formatDigit = cCode[1];
                    const genreCode = cCode.substring(2);
                    const genreNum = parseInt(genreCode, 10);
                    
                    if (formatDigit === '9' || genreNum === 79) {
                      matchedBook.category = 'comic';
                    } else if (formatDigit === '2') {
                      matchedBook.category = 'shinsho';
                    } else if (genreNum >= 90 && genreNum <= 98) {
                      matchedBook.category = 'novel'; // Literature / Stories -> 小説
                    } else {
                      matchedBook.category = 'book'; // Non-fiction, essays, academic -> 一般書
                    }
                    
                    console.log(`C-Code based categorization for "${matchedBook.title}": ${cCode} -> ${matchedBook.category}`);
                    classifiedViaCCode = true;
                  }
                }
                
                // 2. Heuristic fallback (If C-code is not available or invalid)
                if (!classifiedViaCCode) {
                  const pubUpper = publisher.toUpperCase();
                  const titleUpper = (matchedBook.title || '').toUpperCase();
                  const seriesUpper = (item.summary?.series || '').toUpperCase();
                  const authorUpper = (matchedBook.author || '').toUpperCase();
                  
                  const hasShinshoKeyword = pubUpper.includes('新書') || pubUpper.includes('選書') || titleUpper.includes('新書') || titleUpper.includes('選書') || seriesUpper.includes('新書') || seriesUpper.includes('選書');
                  
                  if (hasShinshoKeyword) {
                    matchedBook.category = 'shinsho';
                  } else {
                    // Common non-fiction/academic/trivia keywords (Avoid greedy single-character matches like '学', '論', '史')
                    const nonFictionKeywords = ['論文', '概論', '総論', '原論', '各論', '資本論', '評論', '論稿', '科学', '哲学', '経済学', '政治学', '社会学', '心理学', '言語学', '物理学', '地学', '医学', '人文学', '神学', '法学', '理学', '工学', '農学', '統計学', '歴史学', '世界史', '日本史', '東洋史', '西洋史', '近代史', '現代史', '古代史', '歴史', '入門', 'わかる', '解説', '講義', '教養', '基礎', '技術', '図鑑', 'ビジネス', '仕事', '自己啓発', '実践', 'マーケティング', 'デザイン', '雑学', '不思議', '興奮', '教科書', '問題集', '学習', 'バイアス', '整理', '生産', '文明', '病原菌', '人類', '脳', '思考', '知の', '知的', '認知', '宇宙', '人生', '行動'];
                    
                    // Specific non-fiction series
                    const nonFictionSeries = ['学芸文庫', 'ソフィア文庫', '学術文庫', 'NF文庫', 'NF'];
                    const nonFictionAuthors = ['池上彰', '内田樹', '新井紀子', '吉本隆明', '加藤諦三', '岸見一郎'];
                    
                    const isNonFictionSeries = nonFictionSeries.some(s => seriesUpper.includes(s) || pubUpper.includes(s));
                    const hasNonFictionTitle = nonFictionKeywords.some(kw => titleUpper.includes(kw));
                    const isNonFictionAuthor = nonFictionAuthors.some(auth => authorUpper.includes(auth));
                    
                    const isNonFiction = isNonFictionSeries || hasNonFictionTitle || isNonFictionAuthor;
                    
                    // Expanded list of known fiction novelists (including classical & modern ones to cover classic paperbacks)
                    const novelists = [
                      '中島敦', '太宰治', '芥川龍之介', '夏目漱石', '森鴎外', '川端康成', '三島由紀夫', '梶井基次郎', '江戸川乱歩', '坂口安吾', '有島武郎', '芥川竜之介',
                      '辻村深月', '村上春樹', '東野圭吾', '伊坂幸太郎', '宮部みゆき', '湊かなえ', '有川浩', '朝井リョウ', '住野よる', '米澤穂信', '西尾西', '西尾維新', '西尾', '綾辻行人', '新海誠', '知念実希人', '瀬尾まいこ', '重松清', '小野不由美', '宮下奈都', '三浦しをん', '池井戸潤', '川村元気', '誉田哲也', '星新一', '夏川草介', '原田マハ', '森見登美彦', '万城目学', '中村文則', '又吉直樹', '薬丸岳', '横山秀夫', 
                      '野村美月', '古野まほろ', '佐藤青南', '陸秋秋', '有栖川有栖', '北村薫', '恩田陸', '恒川光太郎', '貴志祐介', '我孫子武丸', '歌野晶午', '麻耶雄嵩', '法月綸太郎', '小野不由美',
                      '川口俊和', '柚月裕子', '雨穴', '浅田次郎', '奥田英朗', '荻原浩', '西加奈子', '加藤シゲアキ', '凪良ゆう', '一穂ミチ', '町田そのこ', '青山美智子', '小川糸', '綿矢りさ', '金原ひとみ', '川上未映子', '村田沙耶香', '平野啓一郎', '角田光代', '森絵都', '唯川恵', '林真理子', '赤川次郎', '西村京太郎', '内田康夫', '山崎豊子', '松本清張', '司馬遼太郎', '池波正太郎', '藤沢周平', '吉川英治'
                    ];
                    const isKnownNovelist = novelists.some(auth => authorUpper.includes(auth.toUpperCase()));
                    
                    // Standard fiction bunko imprint matching (contains '文庫', 'ミステリ', '推理' and is not non-fiction)
                    const isFictionSeries = seriesUpper.includes('文庫') || seriesUpper.includes('ミステリ') || seriesUpper.includes('推理') || pubUpper.includes('文庫') || titleUpper.includes('文庫');
                    
                    // Major literary publishers that publish hardcover novels
                    const literaryPublishers = [
                      '新潮社', '講談社', '集英社', '文藝春秋', '幻冬舎', 'ポプラ社', '双葉社', '角川', 'KADOKAWA', '徳間書店', '光文社', '早川書房', '東京創元社', '文春', '実業之日本社', 'ポプラ文庫', '宝島社',
                      'サンマーク出版', '中央公論新社', '中央公論', '飛鳥新社', '祥伝社'
                    ];
                    const isLiteraryPublisher = literaryPublishers.some(pub => pubUpper.includes(pub));
                    
                    if (isKnownNovelist) {
                      matchedBook.category = 'novel';
                    } else if (isFictionSeries && !isNonFictionSeries && !isNonFiction) {
                      matchedBook.category = 'novel'; // Standard fiction bunko (like '文学少女', '青の数学', 'i')
                    } else if (isLiteraryPublisher && !isNonFiction && !isNonFictionSeries) {
                      matchedBook.category = 'novel'; // Standard fiction hardcover
                    } else {
                      matchedBook.category = 'book'; // Default to 一般書
                    }
                  }
                }
              }
            }
            // If OpenBD has a high-res cover image, use it!
            if (cover) {
              matchedBook.image = cover;
            }
          }
        }
      });

      console.log(`Successfully enriched author/publisher info for ${enrichedCount} books via OpenBD.`);
      
      // Mark books found in OpenBD (or not needing Google Books) as enriched immediately
      unenrichedBooks.forEach(book => {
        if (book.publisher !== '不明' && book.author !== '著者不明') {
          book.enriched = true;
        }
      });
      // Save cache after OpenBD to store intermediate success
      try {
        localStorage.setItem(`booklog_cached_books_${state.username}`, JSON.stringify(state.books));
      } catch (e) {
        console.warn("Failed to cache books after OpenBD:", e);
      }
    } catch (error) {
      console.warn('OpenBD metadata enrichment failed:', error);
    }
  }

  // 2. Query Google Books API as a fallback for STILL missing books
  const missingBooks = unenrichedBooks.filter(b => b.publisher === '不明' || b.author === '著者不明');
  if (missingBooks.length > 0) {
    console.log(`Querying Google Books API for ${missingBooks.length} remaining/missing books...`);
    elements.chatStatus.textContent = '新規書籍情報をGoogle Booksで検索中...';
    
    const booksToQuery = missingBooks.slice(0, 20);
    
    // Process all missing books in parallel to prevent UI status hanging
    const googlePromises = booksToQuery.map(async (book, idx) => {
      // Stagger the starts slightly to be nice to the API
      await new Promise(resolve => setTimeout(resolve, idx * 100));
      
      let query = '';
      const cleanTitle = book.title.replace(/（[^）]+）|\([^)]+\)|〈[^〉]+〉/g, '').trim();
      const cleanAuth = book.author && book.author !== '著者不明' ? book.author : '';

      const numericAsin = convertISBN10to13(book.asin);
      if (book.asin && book.asin !== '不明' && /^97[89][0-9]{10}$/.test(numericAsin)) {
        query = `isbn:${numericAsin}`;
      } else {
        if (cleanAuth) {
          query = `intitle:${encodeURIComponent(cleanTitle)}+inauthor:${encodeURIComponent(cleanAuth)}`;
        } else {
          query = `intitle:${encodeURIComponent(cleanTitle)}`;
        }
      }

      const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`;
      try {
        let response = await fetchWithTimeout(url, { timeout: 4000 });
        if (!response.ok || response.status === 429) {
          console.warn(`Direct Google Books API query rate limited or failed (${response.status}), falling back to CORS proxies for "${book.title}"...`);
          const fallbackProxies = [
            u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
          ];
          for (const proxy of fallbackProxies) {
            try {
              const proxiedUrl = proxy(url);
              // Safe timeout: 1500ms instead of 5000ms to fail fast and prevent thread hanging
              const proxyResp = await fetchWithTimeout(proxiedUrl, { timeout: 1500 });
              if (proxyResp.ok) {
                response = proxyResp;
                break;
              }
            } catch (err) {
              console.warn(`Proxy failed for Google Books API:`, err);
            }
          }
        }
        
        if (response.ok) {
          let data = await response.json();
          // Extract nested data if returned via wrapper proxy like AllOrigins
          if (data && data.contents) {
            if (typeof data.contents === 'string') {
              try {
                data = JSON.parse(data.contents);
              } catch (e) {
                console.warn("Failed to parse AllOrigins wrapped content:", e);
              }
            } else {
              data = data.contents;
            }
          }
          
          if (data && data.items && data.items.length > 0) {
            const info = data.items[0].volumeInfo;
            if (info) {
              if (book.publisher === '不明' && info.publisher) {
                book.publisher = info.publisher;
              }
              if (book.author === '著者不明' && info.authors && info.authors.length > 0) {
                book.author = cleanAuthorName(info.authors.join(' '));
              }
              if (book.release === '不明' && info.publishedDate) {
                book.release = formatPubDate(info.publishedDate.replace(/-/g, ''));
              }
              if (book.image.includes('placeholder') && info.imageLinks?.thumbnail) {
                book.image = info.imageLinks.thumbnail.replace('http://', 'https://');
              }
              
              if (book.category === 'book' || book.category === '一般書') {
                const pubUpper = (book.publisher || '').toUpperCase();
                const titleUpper = (book.title || '').toUpperCase();
                const authorUpper = (book.author || '').toUpperCase();
                const novelists = ['中島敦', '太宰治', '芥川龍之介', '夏目漱石', '森鴎外', '川端康成', '三島由紀夫', '梶井基次郎', '江戸川乱歩', '坂口安吾', '有島武郎', '芥川竜之介', '辻村深月', '村上春樹', '東野圭吾', '伊坂幸太郎', '宮部みゆき', '湊かなえ', '有川浩', '朝井リョウ', '住野よる', '米澤穂信', '西尾西', '西尾維新', '西尾', '綾辻行人', '新海誠', '知念実希人', '瀬尾まいこ', '重松清', '小野不由美', '宮下奈都', '三浦しをん', '池井戸潤', '川村元気', '誉田哲也', '星新一', '夏川草介', '原田マハ', '森見登美彦', '万城目学', '中村文則', '又吉引樹', '又吉直樹', '薬丸岳', '横山秀夫'];
                const isKnownNovelist = novelists.some(auth => authorUpper.includes(auth.toUpperCase()));
                const literaryPublishers = ['新潮社', '講談社', '集英社', '文藝春秋', '幻冬舎', 'ポプラ社', '双葉社', '角川', 'KADOKAWA', '徳間書店', '光文社', '早川書房', '東京創元社', '文春', '実業之日本社', 'ポプラ文庫', '宝島社', 'サンマーク出版', '中央公論新社', '中央公論', '飛鳥新社', '祥伝社'];
                const isLiteraryPublisher = literaryPublishers.some(pub => pubUpper.includes(pub));
                
                if (isKnownNovelist || isLiteraryPublisher) {
                  book.category = 'novel';
                }
              }
              console.log(`[Google Books API] Enriched "${book.title}" -> Pub: ${book.publisher}, Auth: ${book.author}`);
            }
          }
        }
      } catch (err) {
        console.warn(`Google Books API fallback failed for "${book.title}":`, err);
      }
      
      // Mark this book as enriched immediately
      book.enriched = true;
    });

    // Wait for all parallel Google Books API queries to complete
    await Promise.all(googlePromises);
    
    // Save cache after Google Books queries finish
    try {
      localStorage.setItem(`booklog_cached_books_${state.username}`, JSON.stringify(state.books));
    } catch (e) {
      console.warn("Failed to cache books after Google Books fallback:", e);
    }
  }

  // Mark all processed books as enriched to prevent redundant runs on future reloads
  unenrichedBooks.forEach(book => {
    book.enriched = true;
  });

  // 3. Re-resolve series names for all books using fully enriched metadata (fixes missing series on late-enriched items)
  state.books.forEach(book => {
    const resolved = resolveBookSeries(book, book.series);
    if (resolved) {
      book.series = resolved;
    }
  });

  // 4. Finalize and trigger sorting & rendering
  elements.chatStatus.textContent = `${state.books.length}冊の本棚データを同期完了`;
  state.books = sortBooks(state.books, state.currentSortRule);
  filterAndRenderBooks();

  // 5. Save updated books array to cache
  try {
    localStorage.setItem(`booklog_cached_books_${state.username}`, JSON.stringify(state.books));
    console.log("Saved fully enriched books shelf to localStorage cache.");
  } catch (e) {
    console.warn("Failed to cache books to localStorage:", e);
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

// Remove publisher labels in brackets from book titles (e.g. "(新潮文庫)", "（角川文庫）") to keep styling consistent
function cleanPublisherLabel(title) {
  if (!title) return '';
  const labelKeywords = '文庫|新書|選書|コミック|新装版|講談社|小学館|集英社|新潮|角川|KADOKAWA|文藝春秋|文春|双葉|幻冬舎|徳間|ポプラ|光文社|東京創元|早川|ハヤカワ|BOX|COMICS|PHP|祥伝社|中公|ちくま';
  // Safe regex avoiding catastrophic backtracking by ensuring scanned content does not cross closing brackets
  const regex = new RegExp(`\\s*[\\(\\uff08\\[\\uff3b\\<\\u3008][^\\)\\uff09\\]\\uff3d\\>\\u3009]*?(?:${labelKeywords})[^\\)\\uff09\\]\\uff3d\\>\\u3009]*?[\\)\\uff09\\]\\uff3d\\>\\u3009]`, 'gi');
  return title.replace(regex, '').trim();
}

// Smart Series Resolver to clean labels and dynamically group unnumbered book series
function resolveBookSeries(book, rawSeries) {
  const title = book.title || '';
  const author = book.author || '';
  const titleUpper = title.toUpperCase();
  const authorUpper = author.toUpperCase();

  // 1. Heuristics for famous unnumbered series
  // A. 階段島シリーズ (河野裕)
  const kaidanTitles = [
    'いなくなれ、群青',
    'その白さえ嘘だとしても',
    '汚れた赤を恋と呼ぶんだ',
    '凶器は壊れた黒の叫び',
    '夜空の呪いに色はない',
    'きみの世界に、青が鳴る'
  ];
  if (authorUpper.includes('河野裕') && kaidanTitles.some(t => title.includes(t))) {
    return '階段島シリーズ';
  }

  // B. 〈物語〉シリーズ (西尾維新)
  const parsedTitle = parseTitle(title);
  if (authorUpper.includes('西尾維新') && parsedTitle.base.endsWith('物語') && !title.startsWith('掟上今日子')) {
    return '〈物語〉シリーズ';
  }

  // C. 掟上今日子シリーズ (西尾維新)
  if (authorUpper.includes('西尾維新') && (title.startsWith('掟上今日子') || title.includes('今日子の'))) {
    return '掟上今日子シリーズ';
  }

  // D. 加賀恭一郎シリーズ (東野圭吾)
  const kagaTitles = [
    '卒業', '眠りの森', 'どちらかが彼女を殺した', '悪意', '私が彼を殺した',
    '嘘をもうひとつだけ', '赤い指', '新参者', '麒麟の翼', '祈りの幕が下りる時',
    '希望の糸', 'あなたが誰かを殺した'
  ];
  if (authorUpper.includes('東野圭吾') && kagaTitles.some(t => title === t || title.startsWith(t))) {
    return '加賀恭一郎シリーズ';
  }

  // 2. Clean up raw series metadata from API if available
  if (rawSeries) {
    let clean = rawSeries.trim();
    // Strip common publisher labels / imprints
    const labelRegex = /(講談社BOX|KADOKAWA|角川|集英社|新潮|小学館|ポプラ社|早川書房|ハヤカワ|ちくま|筑摩書房|岩波|双葉社|幻冬舎|徳間書店|PHP|光文社|実業之日本社|宝島社|東京創元社|文藝春秋|文春|オーバーラップ|ガガガ|電撃|ファンタジア|スニーカー|ダッシュエックス|MF|HJ|GA|ファミ通|ヒーロー|レジェンド|アルファポリス)/gi;
    clean = clean.replace(labelRegex, '');

    // Strip generic endings
    const genericEndingsRegex = /(文庫|新書|選書|コミック|COMICS|選集|全集|ブックス|BOOKS|ノベルス|NOVELS|レーベル|BOX|SPECIAL|スペシャル)$/gi;
    clean = clean.replace(genericEndingsRegex, '');

    clean = clean.trim();
    if (clean && clean.length > 1) {
      return clean;
    }
  }

  // 3. Fallback: Check for common title prefixes (e.g. "ハリー・ポッターと..." -> "ハリー・ポッター")
  const prefixRegex = /^([a-zA-Z0-9\u30a0-\u30ff\u3040-\u309f\u4e00-\u9faf\uff41-\uff5a\uff21-\uff3a\uff10-\uff19\u3005\u3006\u30fc]+)(シリーズ|と|：|:|\s+-|\s+ー|\s+PART|\s+VOL)/i;
  const prefixMatch = title.match(prefixRegex);
  if (prefixMatch) {
    const candidate = prefixMatch[1].trim();
    if (candidate.length > 2) {
      return candidate;
    }
  }

  return '';
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
  const categories = [...new Set(state.books.map(b => b.category))];
  
  if (categories.length === 0) {
    elements.categoryFilters.innerHTML = '';
    return;
  }

  // Graceful fallback logic for selectedCategory when 'all' is removed or active category is missing
  if (state.selectedCategory === 'all' || !categories.includes(state.selectedCategory)) {
    if (categories.includes('novel')) {
      state.selectedCategory = 'novel';
    } else {
      state.selectedCategory = categories[0];
    }
  }

  // Sort categories based on user's exact desired order: 小説 -> 新書 -> 単行本 -> others
  const desiredOrder = ['novel', 'shinsho', 'book', 'comic', 'magazine', 'dvd', 'cd', 'game', 'other'];
  categories.sort((a, b) => {
    let indexA = desiredOrder.indexOf(a.toLowerCase());
    let indexB = desiredOrder.indexOf(b.toLowerCase());
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });

  elements.categoryFilters.innerHTML = '';

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${state.selectedCategory === cat ? 'active' : ''}`;
    btn.textContent = translateCategory(cat);
    btn.dataset.category = cat;

    btn.addEventListener('click', () => {
      // Fix: Scoped ONLY to category filter buttons to prevent clearing status filters active classes
      document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
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
    'novel': '小説',
    'shinsho': '新書',
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
const SERIES_VOLUME_MAP = {
  '〈物語〉シリーズ': [
    '化物語(上)',
    '化物語(下)',
    '傷物語',
    '偽物語(上)',
    '偽物語(下)',
    '猫物語(黒)',
    '猫物語(白)',
    '傾物語',
    '花物語',
    '囮物語',
    '鬼物語',
    '恋物語',
    '憑物語',
    '暦物語',
    '終物語(上)',
    '終物語(中)',
    '終物語(下)',
    '続・終物語',
    '愚物語',
    '業物語',
    '撫物語',
    '結物語',
    '忍物語',
    '宵物語',
    '余物語',
    '扇物語',
    '死物語(上)',
    '死物語(下)',
    '戦物語'
  ],
  '掟上今日子シリーズ': [
    '掟上今日子の備忘録',
    '掟上今日子の推薦文',
    '掟上今日子の挑戦状',
    '掟上今日子の遺言書',
    '掟上今日子の退職願',
    '掟上今日子の婚姻届',
    '掟上今日子の家計簿',
    '掟上今日子の旅行記',
    '掟上今日子の裏表紙',
    '掟上今日子の色見本',
    '掟上今日子の乗車券',
    '掟上今日子の設計図',
    '掟上今日子の鑑札票',
    '掟上今日子の忍法帖',
    '掟上今日子の保険証'
  ],
  '階段島シリーズ': [
    'いなくなれ、群青',
    'その白さえ嘘だとしても',
    '汚れた赤を恋と呼ぶんだ',
    '凶器は壊れた黒の叫び',
    '夜空の呪いに色はない',
    'きみの世界に、青が鳴る'
  ]
};

function getSeriesVolumeIndex(seriesName, title) {
  if (!seriesName || !title) return Infinity;
  const volumes = SERIES_VOLUME_MAP[seriesName];
  if (!volumes) return Infinity;

  const normTitle = normalizeForComparison(title);

  for (let i = 0; i < volumes.length; i++) {
    const normVol = normalizeForComparison(volumes[i]);
    if (normTitle.includes(normVol)) {
      return i;
    }
  }
  return Infinity;
}

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

// Normalize strings to be extremely resilient to space/punctuation/unicode hyphen differences
function normalizeForComparison(str) {
  if (!str) return '';
  let normalized = toHalfWidth(str).toLowerCase();
  
  // Standardize all forms of Japanese/English hyphens, dashes and waves to a simple half-width '-'
  normalized = normalized.replace(/[\u2010-\u2015\u2212\uFF0D\u30FC\u301C\uFF5E]/g, '-');
  
  // Strip punctuation, commas, dots, colons, brackets, and parentheses to prevent sorting splits on spacing/punctuation mismatches
  normalized = normalized.replace(/[、。，,．.：（）()［］\[\]〈〉<>《》“”"'`]/g, ' ');
  
  // Clean up excessive spacing
  return normalized.replace(/\s+/g, ' ').trim();
}

// Fallback comparator that prevents "下" sorting before "上", and "後編" before "前編"
function compareStringsIntelligently(strA, strB) {
  if (!strA) return strB ? -1 : 0;
  if (!strB) return 1;

  const mapWords = (str) => {
    return str
      .replace(/(上巻|前編|前|上)(?=\b|[\s()（）\[\]］［]|$)/g, '___VOL_1___')
      .replace(/(中巻|中編|中)(?=\b|[\s()（）\[\]］［]|$)/g, '___VOL_2___')
      .replace(/(下巻|後編|後|下)(?=\b|[\s()（）\[\]］［]|$)/g, '___VOL_3___');
  };

  const mappedA = mapWords(strA);
  const mappedB = mapWords(strB);

  return mappedA.localeCompare(mappedB, 'ja');
}

// Parse a book title into base series title and mathematical volume integer (multi-pass)
function parseTitle(title) {
  if (!title) return { base: '', volume: null, subVolume: null };
  
  let cleanTitle = toHalfWidth(title).trim();
  
  // Strip trailing publisher/meta brackets containing non-digits (e.g. "(新潮文庫)", "（角川文庫）")
  // FIXED: Removed space boundary matching at opening bracket to prevent greedy matching on spaced titles like BOOK2
  const trailingParenNonDigitRegex = /[\(\uff08\[\uff3b<\u3008]([^\)\uff09\]\uff3d>\u3009]*[^\)\uff09\]\uff3d>\u3009\d][^\)\uff09\]\uff3d>\u3009]*)[\s\)\uff09\]\uff3d>\u3009]$/;
  if (cleanTitle.match(trailingParenNonDigitRegex)) {
    cleanTitle = cleanTitle.replace(trailingParenNonDigitRegex, '').trim();
  }
  
  let detectedVolume = null;
  let detectedSubVolume = null;
  
  // 1. Extract numerical volume from parentheses at the end: (1), [2], 〈3〉
  const parenRegex = /[\s\(\uff08\[\uff3b<\u3008](\d+)[\s\)\uff09\]\uff3d>\u3009]$/;
  const parenMatch = cleanTitle.match(parenRegex);
  if (parenMatch) {
    detectedVolume = parseInt(parenMatch[1], 10);
    cleanTitle = cleanTitle.replace(parenRegex, '').trim();
  } else {
    // Or trailing digits: "高校事変 10" or "高校事変10"
    const digitRegex = /(\s+|\b)(\d+)$/;
    const digitMatch = cleanTitle.match(digitRegex);
    if (digitMatch) {
      detectedVolume = parseInt(digitMatch[2], 10);
      cleanTitle = cleanTitle.replace(digitRegex, '').trim();
    } else {
      const endDigitRegex = /(\D+)(\d+)$/;
      const endDigitMatch = cleanTitle.match(endDigitRegex);
      if (endDigitMatch) {
        detectedVolume = parseInt(endDigitMatch[2], 10);
        cleanTitle = endDigitMatch[1].trim();
      }
    }
  }
  
  // 2. Extract Roman numerals at the end: I, II, III...
  const romanRegex = /\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX)\b$/i;
  const romanMatch = cleanTitle.match(romanRegex);
  if (romanMatch) {
    const roman = romanMatch[1].toUpperCase();
    const vol = ROMAN_NUMERALS[roman];
    if (vol !== undefined) {
      detectedVolume = vol;
      cleanTitle = cleanTitle.replace(romanRegex, '').trim();
    }
  }
  
  // 3. Extract traditional volume indicators: 上, 中, 下, 前編, 後編 etc.
  const specialRegex = /[\s\(\uff08\[\uff3b<\u3008]?(\u4e0a|\u4e0a\u5dfb|\u524d\u7de8|\u524d|\u4e2d|\u4e2d\u7de8|\u4e2d\u5dfb|\u4e0b|\u4e0b\u5dfb|\u5f8c\u7de8|\u5f8c)[\)\uff09\]\uff3d>\u3009]?$/;
  const specialMatch = cleanTitle.match(specialRegex);
  if (specialMatch) {
    const word = specialMatch[1];
    const vol = SPECIAL_VOLUMES[word];
    if (vol !== undefined) {
      detectedSubVolume = vol;
      cleanTitle = cleanTitle.replace(specialRegex, '').trim();
      if (detectedVolume === null) {
        detectedVolume = vol;
      }
    }
  }
  
  return {
    base: cleanTitle,
    volume: detectedVolume,
    subVolume: detectedSubVolume
  };
}

// Compare two titles naturally (comparing base strings first, then volume numbers)
function compareTitlesNaturally(titleA, titleB) {
  const parsedA = parseTitle(titleA);
  const parsedB = parseTitle(titleB);
  
  const normA = normalizeForComparison(parsedA.base);
  const normB = normalizeForComparison(parsedB.base);
  
  const baseCompare = normA.localeCompare(normB, 'ja');
  if (baseCompare !== 0) {
    return compareStringsIntelligently(titleA, titleB);
  }
  
  // 1. Compare primary volume (e.g. numerical volume)
  if (parsedA.volume !== null && parsedB.volume !== null) {
    if (parsedA.volume !== parsedB.volume) {
      return parsedA.volume - parsedB.volume;
    }
  }
  
  // 2. Compare sub-volume (e.g. 上/下 inside same volume)
  if (parsedA.subVolume !== null && parsedB.subVolume !== null) {
    if (parsedA.subVolume !== parsedB.subVolume) {
      return parsedA.subVolume - parsedB.subVolume;
    }
  }
  
  if (parsedA.volume === null && parsedB.volume !== null) return -1;
  if (parsedA.volume !== null && parsedB.volume === null) return 1;
  
  return compareStringsIntelligently(titleA, titleB);
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
      
      // 3. Series grouping (if series is available)
      const seriesA = a.series || '';
      const seriesB = b.series || '';
      if (seriesA && seriesB) {
        const seriesComp = seriesA.localeCompare(seriesB, 'ja');
        if (seriesComp !== 0) return seriesComp;
        
        // Sort by series volume dictionary index first
        const idxA = getSeriesVolumeIndex(seriesA, a.title);
        const idxB = getSeriesVolumeIndex(seriesB, b.title);
        if (idxA !== Infinity || idxB !== Infinity) {
          if (idxA !== idxB) {
            return idxA - idxB;
          }
        }
        
        // If same series, sort chronologically by release date to keep sequence
        const dateA = parseReleaseDate(a.release);
        const dateB = parseReleaseDate(b.release);
        if (dateA !== dateB) {
          return dateA - dateB;
        }
      } else if (seriesA && !seriesB) {
        return -1; // Group series at the top of the author's section
      } else if (!seriesA && seriesB) {
        return 1;
      }
      
      // 4. Natural title sorting (groups series together)
      const titleComp = compareTitlesNaturally(a.title, b.title);
      if (titleComp !== 0) return titleComp;
      
      // 5. Chronological Release Date fallback
      const dateA = parseReleaseDate(a.release);
      const dateB = parseReleaseDate(b.release);
      return dateA - dateB;
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
      
      // 2. Series grouping (if series is available) - Prioritized over publisher to prevent "publisher unknown" split
      const seriesA = a.series || '';
      const seriesB = b.series || '';
      if (seriesA && seriesB) {
        const seriesComp = seriesA.localeCompare(seriesB, 'ja');
        if (seriesComp !== 0) return seriesComp;
        
        // Sort by series volume dictionary index first
        const idxA = getSeriesVolumeIndex(seriesA, a.title);
        const idxB = getSeriesVolumeIndex(seriesB, b.title);
        if (idxA !== Infinity || idxB !== Infinity) {
          if (idxA !== idxB) {
            return idxA - idxB;
          }
        }
        
        // If same series, sort chronologically by release date to keep sequence
        const dateA = parseReleaseDate(a.release);
        const dateB = parseReleaseDate(b.release);
        if (dateA !== dateB) {
          return dateA - dateB;
        }
      } else if (seriesA && !seriesB) {
        return -1; // Group series at the top of the author's section
      } else if (!seriesA && seriesB) {
        return 1;
      } else {
        // 3. Publisher grouping (ONLY for non-series standalone titles to keep imprints clean)
        const pubA = normalizePublisher(a.publisher);
        const pubB = normalizePublisher(b.publisher);
        if (pubA !== pubB) {
          if (pubA === '不明') return 1;
          if (pubB === '不明') return -1;
          return pubA.localeCompare(pubB, 'ja');
        }
      }
      
      // 4. Natural title sorting (groups series together)
      const titleComp = compareTitlesNaturally(a.title, b.title);
      if (titleComp !== 0) return titleComp;
      
      // 5. Chronological Release Date fallback
      const dateA = parseReleaseDate(a.release);
      const dateB = parseReleaseDate(b.release);
      return dateA - dateB;
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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.geminiKey}`;
  
  // Construct user bookshelf description for AI injection (limit to max 150 books to prevent payload size and token limit errors)
  const maxBooksContext = 150;
  let bookshelfContext = `ユーザー名: ${state.username}\n本棚登録書籍一覧 (全${state.books.length}冊中、上位${Math.min(state.books.length, maxBooksContext)}冊を表示):\n`;
  
  const booksToInject = state.books.slice(0, maxBooksContext);
  booksToInject.forEach((book, idx) => {
    bookshelfContext += `${idx + 1}. 「${book.title}」 / 著者: ${book.author} (カテゴリ: ${translateCategory(book.category)})\n`;
  });
  
  if (state.books.length > maxBooksContext) {
    bookshelfContext += `...他 ${state.books.length - maxBooksContext} 冊が本棚に登録されていますが、コンテキスト節約のため省略します。\n`;
  }

  const systemInstruction = `
ユーザーの本棚の読書記録を読み込み、本が大好きなパーソナル読書アシスタントとして対話します。
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
  // CRITICAL FIX: The conversation MUST start with a 'user' role. Filter out the initial welcome message from the model.
  const apiHistory = state.chatHistory.slice();
  if (apiHistory.length > 0 && apiHistory[0].role === 'model') {
    apiHistory.shift();
  }

  const contents = apiHistory.map(item => ({
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

