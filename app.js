// ==========================================
// Book Trader - Main Game Logic
// ==========================================

class BookTraderGame {
    constructor() {
        // Game state
        this.balance = 0;
        this.day = 1;
        this.soldUnique = new Set();
        this.soldTotal = 0;
        this.shelf = []; // 10 slots
        this.ownedBooks = new Set(); // books we own
        this.shopBookOrder = []; // randomized order of books in shop

        // Day state
        this.currentCustomerIndex = 0;
        this.todayCustomers = [];
        this.currentRequest = null;
        this.selectedSlot = null;
        this.isDay = false;
        this.isEvening = false;

        // Win conditions
        this.UNIQUE_WIN = 50;
        this.TOTAL_WIN = 200;

        // Storage key
        this.STORAGE_KEY = 'book_trader_save_v1';

        // Yandex SDK
        this.ysdk = null;
        this.player = null;
        this.canReadCloudSaves = false;
        this.canWriteCloudSaves = false;

        // Loading state
        this.loadingOverlay = null;
        this.loadingStatusEl = null;
        this.loadingStartTime = 0;
        this.MIN_LOADING_TIME = 2000;
        this.loadingReadyReported = false;

        this.isShowingAd = false;
        this.initialGameplaySessionStarted = false;

        // DOM elements
        this.initializeDOM();
        this.bindEvents();
        this.preventTextSelectionAndContextMenu();
        this.initializeGame().catch((e) => console.error('Ошибка инициализации игры', e));
    }

    initializeDOM() {
        // Stats
        this.balanceEl = document.getElementById('balance');
        this.soldUniqueEl = document.getElementById('sold-unique');
        this.soldTotalEl = document.getElementById('sold-total');
        this.dayNumberEl = document.getElementById('day-number');

        // Customer
        this.customerAvatarEl = document.getElementById('customer-avatar');
        this.customerRequestEl = document.getElementById('customer-request');
        this.currentCustomerEl = document.getElementById('current-customer');
        this.totalCustomersEl = document.getElementById('total-customers');

        // Shelf
        this.shelfEl = document.getElementById('shelf');

        // Buttons
        this.btnStartDay = document.getElementById('btn-start-day');
        this.btnSkipCustomer = document.getElementById('btn-skip-customer');
        this.btnEndDay = document.getElementById('btn-end-day');
        this.btnNewGame = document.getElementById('btn-new-game');

        // Modals
        this.bookModal = document.getElementById('film-modal'); // Keep ID or change in HTML. Kept 'film-modal' in HTML for now
        this.shopModal = document.getElementById('shop-modal');
        this.victoryModal = document.getElementById('victory-modal');

        // Book modal
        this.modalCover = document.getElementById('modal-cover');
        this.modalTitleRu = document.getElementById('modal-title-ru');
        this.modalAuthor = document.getElementById('modal-author');
        this.modalDescription = document.getElementById('modal-description');
        this.modalGenres = document.getElementById('modal-genres');
        this.modalPrice = document.getElementById('modal-price');
        this.btnOffer = document.getElementById('btn-offer');
        this.btnCloseModal = document.getElementById('btn-close-modal');

        // Shop modal
        this.shopBalanceEl = document.getElementById('shop-balance');
        this.emptySlotsEl = document.getElementById('empty-slots');
        this.filterGenre = document.getElementById('filter-genre');
        this.filterPrice = document.getElementById('filter-price');
        this.shopCatalog = document.getElementById('shop-catalog');
        this.btnCloseShop = document.getElementById('btn-close-shop');

        // Victory
        this.victoryMessage = document.getElementById('victory-message');
        this.btnRestart = document.getElementById('btn-restart');

        // Confirmation modal
        this.confirmModal = document.getElementById('confirm-modal');
        this.confirmMessage = document.getElementById('confirm-message');
        this.btnConfirmYes = document.getElementById('btn-confirm-yes');
        this.btnConfirmNo = document.getElementById('btn-confirm-no');

        // Loading
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingStatusEl = document.getElementById('loading-status');
    }

    bindEvents() {
        this.btnStartDay.addEventListener('click', () => this.startDay());
        this.btnSkipCustomer.addEventListener('click', () => this.nextCustomer());
        this.btnEndDay.addEventListener('click', () => this.endDay());
        this.btnNewGame.addEventListener('click', () => this.confirmNewGame());

        this.btnOffer.addEventListener('click', () => this.offerBook());
        this.btnCloseModal.addEventListener('click', () => this.closeBookModal());

        this.btnCloseShop.addEventListener('click', () => this.handleFinishPurchase());
        this.filterGenre.addEventListener('change', () => this.renderShopCatalog());
        this.filterPrice.addEventListener('change', () => this.renderShopCatalog());

        this.btnRestart.addEventListener('click', () => this.restartGame());

        // Confirmation modal
        this.btnConfirmYes.addEventListener('click', () => {
            this.closeConfirmModal();
            this.restartGame();
        });
        this.btnConfirmNo.addEventListener('click', () => this.closeConfirmModal());
    }

    preventTextSelectionAndContextMenu() {
        document.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    async initializeGame() {
        this.showLoadingScreen('Подключение к книжной сети');
        await this.initYandexSDK();

        this.updateLoadingStatus('Распаковка книг');
        const progressLoaded = await this.loadProgress();
        if (progressLoaded) {
            this.customerRequestEl.textContent = `День ${this.day}. Нажмите "Начать день" чтобы открыть лавку.`;
        } else {
            this.prepareNewRun();
        }

        this.populateGenreFilter();
        this.renderShelf();
        this.updateStats();

        this.updateLoadingStatus('Библиотека открывается');
        await this.finishLoadingScreen('Добро пожаловать');
    }

    showLoadingScreen(statusText = '') {
        this.loadingStartTime = performance.now();
        if (this.loadingStatusEl && statusText) {
            this.loadingStatusEl.textContent = statusText;
        }
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('visible');
        }
    }

    updateLoadingStatus(statusText) {
        if (this.loadingStatusEl && statusText) {
            this.loadingStatusEl.textContent = statusText;
        }
    }

    async finishLoadingScreen(statusText = '') {
        if (this.loadingStatusEl && statusText) {
            this.loadingStatusEl.textContent = statusText;
        }

        const elapsed = performance.now() - this.loadingStartTime;
        const remaining = Math.max(this.MIN_LOADING_TIME - elapsed, 0);

        await new Promise(resolve => setTimeout(resolve, remaining));

        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('visible');
        }

        this.signalLoadingReady();
    }

    signalLoadingReady() {
        if (this.loadingReadyReported) return;
        this.loadingReadyReported = true;

        try {
            if (this.ysdk?.features?.LoadingAPI?.ready) {
                this.ysdk.features.LoadingAPI.ready();
            }
        } catch (e) {
            console.warn('Не удалось сообщить о готовности загрузки', e);
        }
    }

    startInitialGameplaySession() {
        if (this.initialGameplaySessionStarted) return;
        this.initialGameplaySessionStarted = true;
        this.startGameplaySession();
    }

    startGameplaySession() {
        try {
            this.ysdk?.features?.GameplayAPI?.start?.();
        } catch (e) {
            console.warn('Не удалось запустить игровую сессию', e);
        }
    }

    stopGameplaySession() {
        try {
            this.ysdk?.features?.GameplayAPI?.stop?.();
        } catch (e) {
            console.warn('Не удалось остановить игровую сессию', e);
        }
    }

    async initYandexSDK() {
        if (typeof YaGames === 'undefined') {
            console.warn('Yandex SDK не найден. Запускаем в оффлайн-режиме (Mock).');
            this.createMockSDK();
            return;
        }

        try {
            this.ysdk = await YaGames.init();

            if (this.ysdk?.environment?.i18n) {
                const langSetter = this.ysdk.environment.i18n.lang;
                if (typeof langSetter === 'function') {
                    langSetter('ru');
                } else {
                    this.ysdk.environment.i18n.lang = 'ru';
                }
            }

            await this.setupPlayer();
        } catch (e) {
            console.warn('Не удалось инициализировать Yandex SDK, переходим в оффлайн-режим', e);
            this.createMockSDK();
        }
    }

    createMockSDK() {
        this.ysdk = {
            features: {
                LoadingAPI: {
                    ready: () => console.log('[MOCK] LoadingAPI.ready() called')
                },
                GameplayAPI: {
                    start: () => console.log('[MOCK] GameplayAPI.start() called'),
                    stop: () => console.log('[MOCK] GameplayAPI.stop() called')
                }
            },
            adv: {
                showFullscreenAdv: async ({ callbacks }) => {
                    console.log('[MOCK] showFullscreenAdv called');
                    if (callbacks.onOpen) callbacks.onOpen();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (callbacks.onClose) callbacks.onClose(true);
                }
            },
            getPlayer: async () => this.player
        };

        // Mock player with local storage fallback
        this.player = {
            getData: async () => {
                console.log('[MOCK] player.getData called');
                const raw = localStorage.getItem(this.STORAGE_KEY);
                return raw ? JSON.parse(raw) : {};
            },
            setData: async (data) => {
                console.log('[MOCK] player.setData called', data);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            }
        };

        this.canReadCloudSaves = true;
        this.canWriteCloudSaves = true;
    }

    async setupPlayer() {
        if (!this.ysdk?.getPlayer) return;

        try {
            this.player = await this.ysdk.getPlayer({ scopes: true });
        } catch (primaryError) {
            console.warn('Полный доступ к игроку недоступен, пробуем ограниченный режим', primaryError);
            try {
                this.player = await this.ysdk.getPlayer({ scopes: false });
            } catch (secondaryError) {
                console.warn('Не удалось получить данные игрока', secondaryError);
                // Fallback to mock player if YSDK exists but getPlayer fails
                this.createMockSDK();
                return;
            }
        }

        this.canReadCloudSaves = !!(this.player && typeof this.player.getData === 'function');
        this.canWriteCloudSaves = !!(this.player && typeof this.player.setData === 'function');
    }

    prepareNewRun() {
        // Use BOOKS instead of FILMS
        const allBooks = typeof BOOKS !== 'undefined' ? BOOKS : [];
        this.shopBookOrder = [...allBooks].sort(() => Math.random() - 0.5).map(b => b.id);
        this.shelf = [];
        this.ownedBooks = new Set();
        this.balance = 0; // Starting capital

        // Initial stock: 10 ramdom books from the shop order
        for (let i = 0; i < 10; i++) {
            const bookId = this.shopBookOrder[i];
            const book = allBooks.find(b => b.id === bookId);
            if (book) {
                this.shelf.push(book);
                this.ownedBooks.add(book.id);
            } else {
                this.shelf.push(null);
            }
        }

        this.customerRequestEl.textContent = 'Нажмите "Начать день" чтобы открыть лавку';
    }

    populateGenreFilter() {
        const sortedBooks = typeof BOOKS !== 'undefined' ? BOOKS : [];
        const genres = new Set();
        sortedBooks.forEach(book => {
            if (book.genres) {
                book.genres.forEach(g => genres.add(g));
            }
        });

        [...genres].sort().forEach(genre => {
            const option = document.createElement('option');
            option.value = genre;
            option.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
            this.filterGenre.appendChild(option);
        });
    }

    updateStats() {
        this.balanceEl.textContent = Math.floor(this.balance);
        this.soldUniqueEl.textContent = this.soldUnique.size;
        this.soldTotalEl.textContent = this.soldTotal;
        this.dayNumberEl.textContent = this.day;
    }

    renderShelf() {
        this.shelfEl.innerHTML = '';

        const booksPerRow = 5;
        const totalSlots = 10;
        const rowCount = Math.ceil(totalSlots / booksPerRow);

        for (let row = 0; row < rowCount; row++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'shelf-row';

            for (let col = 0; col < booksPerRow; col++) {
                const i = row * booksPerRow + col;
                if (i >= totalSlots) break;

                const slot = document.createElement('div');
                slot.className = 'shelf-slot';
                slot.dataset.index = i;

                if (this.shelf[i]) {
                    const book = this.shelf[i];
                    const sellingPrice = Math.floor(book.price * 1.5);

                    slot.innerHTML = `
                        <div class="book-cover">
                            <div class="book-spine"></div>
                            <img src="${book.coverUrl}" alt="${book.titleRu}" onerror="this.src='https://placehold.co/85x120/4a3728/f9f5eb?text=Книга'">
                        </div>
                        <div class="book-info">
                            <div class="book-title">${book.titleRu}</div>
                            <div class="book-author">${book.author}</div>
                            <div class="book-price">${sellingPrice} ₽</div>
                        </div>
                    `;
                    slot.addEventListener('click', () => this.openBookModal(i));
                } else {
                    slot.classList.add('empty');
                    slot.innerHTML = '<div class="empty-slot-icon">📚</div>';
                }

                rowEl.appendChild(slot);
            }

            this.shelfEl.appendChild(rowEl);
        }
    }

    // ==========================================
    // DAY PHASE
    // ==========================================

    startDay() {
        this.startInitialGameplaySession();
        this.isDay = true;
        this.currentCustomerIndex = 0;

        // Generate 5-8 customers for today
        const customerCount = 5 + Math.floor(Math.random() * 4);
        this.todayCustomers = this.generateCustomers(customerCount);

        this.totalCustomersEl.textContent = customerCount;

        this.btnStartDay.style.display = 'none';
        this.btnSkipCustomer.style.display = 'inline-block';
        this.btnEndDay.style.display = 'inline-block';

        this.showCustomer();
    }

    generateCustomers(count) {
        // 1. Identification of books on the shelf
        const shelfBookIds = this.shelf.filter(b => b !== null).map(b => b.id);

        let chosenRequests = [];
        const usedRequestIndices = new Set();

        // 2.1: gather up to 4 requests linked to 4 different random shelf books (unique requests)
        const shuffledBooks = [...shelfBookIds].sort(() => Math.random() - 0.5).slice(0, 4);

        // Ensure REQUESTS exists
        const allRequests = typeof REQUESTS !== 'undefined' ? REQUESTS : [];

        shuffledBooks.forEach(bookId => {
            if (chosenRequests.length >= count) return;

            const linked = allRequests
                .map((req, idx) => ({ req, idx }))
                .filter(({ req, idx }) => req.linkedBookIds.includes(bookId) && !usedRequestIndices.has(idx));

            if (linked.length === 0) return;

            const { req, idx } = linked[Math.floor(Math.random() * linked.length)];
            chosenRequests.push(req);
            usedRequestIndices.add(idx);
        });

        // 2.2: fill remaining slots with random unique requests
        const allShuffled = [...allRequests].map((r, i) => ({ r, i })).sort(() => Math.random() - 0.5);
        for (let { r, i } of allShuffled) {
            if (chosenRequests.length >= count) break;
            if (usedRequestIndices.has(i)) continue;

            chosenRequests.push(r);
            usedRequestIndices.add(i);
        }

        // Shuffle the final list and add avatars
        return chosenRequests
            .sort(() => Math.random() - 0.5)
            .map(request => ({
                ...request,
                avatar: typeof CUSTOMER_AVATARS !== 'undefined' ? CUSTOMER_AVATARS[Math.floor(Math.random() * CUSTOMER_AVATARS.length)] : '👤'
            }));
    }

    showCustomer() {
        if (this.currentCustomerIndex >= this.todayCustomers.length) {
            this.endDay();
            return;
        }

        const customer = this.todayCustomers[this.currentCustomerIndex];
        this.currentRequest = customer;

        this.customerAvatarEl.textContent = customer.avatar;
        this.customerRequestEl.textContent = `"${customer.text}"`;
        this.currentCustomerEl.textContent = this.currentCustomerIndex + 1;

        // Animation
        this.customerAvatarEl.style.animation = 'none';
        setTimeout(() => {
            this.customerAvatarEl.style.animation = 'float 2s ease-in-out infinite';
        }, 10);
    }

    nextCustomer() {
        this.currentCustomerIndex++;
        this.showCustomer();
    }

    openBookModal(slotIndex) {
        if (!this.isDay || !this.shelf[slotIndex]) return;

        this.selectedSlot = slotIndex;
        const book = this.shelf[slotIndex];

        this.modalCover.src = book.coverUrl;
        this.modalCover.onerror = () => {
            this.modalCover.src = 'https://placehold.co/150x200/4a3728/f9f5eb?text=Ошибка';
        };
        this.modalTitleRu.textContent = book.titleRu;
        this.modalAuthor.textContent = book.author;
        this.modalDescription.textContent = book.description || '';
        this.modalGenres.textContent = 'Жанры: ' + (book.genres ? book.genres.join(', ') : '');
        this.modalPrice.textContent = 'Цена: ' + Math.floor(book.price * 1.5) + ' ₽';

        this.bookModal.classList.remove('hidden');
    }

    closeBookModal() {
        this.bookModal.classList.add('hidden');
        this.selectedSlot = null;
    }

    offerBook() {
        if (this.selectedSlot === null || !this.currentRequest) return;

        const slotIndex = this.selectedSlot;
        const book = this.shelf[slotIndex];
        const isMatch = this.currentRequest.linkedBookIds.includes(book.id);

        this.closeBookModal();

        if (isMatch) {
            // Success!
            this.handleSale(book, slotIndex);
        } else {
            // Fail
            this.handleRejection();
        }
    }

    handleSale(book, slotIndex) {
        const salePrice = Math.floor(book.price * 1.5);
        this.balance += salePrice;
        this.soldTotal++;
        this.soldUnique.add(book.id);

        const slotEl = this.shelfEl.querySelector(`.shelf-slot[data-index="${slotIndex}"]`);
        if (slotEl) {
            slotEl.classList.add('sold');
        }

        this.updateStats();

        // Remove from shelf with a short transition so the slot visibly clears
        setTimeout(() => {
            this.shelf[slotIndex] = null;
            this.ownedBooks.delete(book.id);
            this.renderShelf();
            // Save progress after sale
            this.saveProgress();
        }, 400);

        this.customerRequestEl.textContent = `"Отлично! Именно то, что я искал! Держите ${salePrice} ₽"`;

        // Feedback
        const panel = document.getElementById('customer-panel');
        // panel.classList.add('sale-success');
        // setTimeout(() => panel.classList.remove('sale-success'), 500);

        // Check win condition
        if (this.checkWinCondition()) return;

        // Move to next customer after delay
        setTimeout(() => this.nextCustomer(), 1500);
    }

    handleRejection() {
        const panel = document.getElementById('customer-panel');
        // panel.classList.add('sale-fail');
        // setTimeout(() => panel.classList.remove('sale-fail'), 500);

        const rejections = [
            "Нет, это не то... Пойду поищу в другом месте.",
            "Хм, не подходит. До свидания!",
            "Автор не тот, да и жанр...",
            "Нет, спасибо. Пойду дальше.",
            "Не то, что я хотел. Всего хорошего!"
        ];

        this.customerRequestEl.textContent = `"${rejections[Math.floor(Math.random() * rejections.length)]}"`;

        // Customer leaves after rejection
        setTimeout(() => this.nextCustomer(), 1500);
    }

    endDay() {
        this.isDay = false;
        this.isEvening = true;
        this.currentRequest = null;

        this.customerAvatarEl.textContent = '🌙';
        this.customerRequestEl.textContent = 'Лавка закрыта. Время пополнить книжные полки!';
        this.currentCustomerEl.textContent = '0';
        this.totalCustomersEl.textContent = '0';

        this.btnSkipCustomer.style.display = 'none';
        this.btnEndDay.style.display = 'none';

        this.openShop();
    }

    // ==========================================
    // EVENING PHASE (SHOP)
    // ==========================================

    openShop() {
        this.shopBalanceEl.textContent = Math.floor(this.balance);
        this.emptySlotsEl.textContent = this.shelf.filter(s => s === null).length;
        this.renderShopCatalog();
        this.shopModal.classList.remove('hidden');
    }

    renderShopCatalog() {
        const genreFilter = this.filterGenre.value;
        const priceFilter = this.filterPrice.value;
        const allBooks = typeof BOOKS !== 'undefined' ? BOOKS : [];

        // 1. Get books in randomized order, filter out owned
        let books = this.shopBookOrder
            .map(id => allBooks.find(b => b.id === id))
            .filter(book => book && !this.ownedBooks.has(book.id));

        // Apply genre filter
        if (genreFilter) {
            books = books.filter(book => book.genres.includes(genreFilter));
        }

        // Apply price filter
        if (priceFilter === 'cheap') {
            books = books.filter(book => book.price <= 200);
        } else if (priceFilter === 'medium') {
            books = books.filter(book => book.price > 200 && book.price <= 450);
        } else if (priceFilter === 'expensive') {
            books = books.filter(book => book.price > 450);
        }

        this.shopCatalog.innerHTML = '';

        // 2. Render items
        if (books.length === 0) {
            this.shopCatalog.innerHTML = '<p style="text-align:center;color:#888;padding:20px;grid-column:1/-1;">Нет доступных книг по выбранным фильтрам</p>';
            return;
        }

        books.forEach(book => {
            const item = document.createElement('div');
            item.className = 'shop-item';

            const canAfford = this.balance >= book.price;
            const hasEmptySlot = this.shelf.some(s => s === null);
            const isPurchasable = canAfford && hasEmptySlot;

            if (!isPurchasable) {
                item.classList.add('owned'); // effectively disabled
            }

            // Button HTML
            let buttonHtml = '';
            if (isPurchasable) {
                buttonHtml = `<button class="btn-buy">Купить</button>`;
            } else if (!canAfford) {
                buttonHtml = `<div style="color:var(--accent-red);font-size:10px;font-weight:bold;">Не хватает денег</div>`;
            } else {
                buttonHtml = `<div style="color:var(--text-secondary);font-size:10px;font-weight:bold;">Нет места</div>`;
            }

            item.innerHTML = `
                <div class="shop-vhs-case">
                    <div class="shop-cover-wrapper">
                        <img src="${book.coverUrl}" alt="${book.titleRu}" onerror="this.src='https://placehold.co/120x160/4a3728/f9f5eb?text=Книга'">
                    </div>
                </div>
                <div class="shop-item-title">${book.titleRu}</div>
                <div class="shop-item-author">${book.author}</div>
                <div class="shop-item-price">${book.price} ₽</div>
                ${buttonHtml}
            `;

            if (isPurchasable) {
                const btn = item.querySelector('.btn-buy');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent card click if we add one later
                    this.buyBook(book);
                });
            }

            this.shopCatalog.appendChild(item);
        });
    }

    buyBook(book) {
        if (this.balance < book.price) return;

        const emptySlotIndex = this.shelf.findIndex(s => s === null);
        if (emptySlotIndex === -1) return;

        this.balance -= book.price;
        // Keep balance as integer logic if needed, but simple subtraction is fine
        this.shelf[emptySlotIndex] = book;
        this.ownedBooks.add(book.id);

        this.shopBalanceEl.textContent = Math.floor(this.balance);
        this.emptySlotsEl.textContent = this.shelf.filter(s => s === null).length;

        this.renderShopCatalog();
        this.renderShelf();
        this.updateStats();
        this.saveProgress();
    }

    async handleFinishPurchase() {
        if (this.isShowingAd) return;

        this.isShowingAd = true;
        this.btnCloseShop.disabled = true;

        await this.showFullscreenAd();

        this.btnCloseShop.disabled = false;
        this.isShowingAd = false;
        this.closeShop();
    }

    closeShop() {
        this.shopModal.classList.add('hidden');
        this.isEvening = false;
        this.day++;

        this.btnStartDay.style.display = 'inline-block';
        this.customerAvatarEl.textContent = '☀️';
        this.customerRequestEl.textContent = `День ${this.day}. Нажмите "Начать день" чтобы открыть лавку.`;

        this.updateStats();
        // Save progress when new day starts
        this.saveProgress();
    }

    async showFullscreenAd() {
        if (!this.ysdk?.adv?.showFullscreenAdv) {
            return;
        }

        this.stopGameplaySession();

        await new Promise(resolve => {
            try {
                this.ysdk.adv.showFullscreenAdv({
                    callbacks: {
                        onOpen: function () { },
                        onClose: (wasShown) => {
                            this.startGameplaySession();
                            resolve(wasShown);
                        },
                        onError: (error) => {
                            console.warn('Ошибка показа рекламы:', error);
                            this.startGameplaySession();
                            resolve(error);
                        },
                    }
                }).catch(error => {
                    console.warn('Не удалось показать рекламу:', error);
                    this.startGameplaySession();
                    resolve(error);
                });
            } catch (e) {
                console.warn('Не удалось инициировать показ рекламы:', e);
                this.startGameplaySession();
                resolve(e);
            }
        });
    }

    // ==========================================
    // WIN CONDITION
    // ==========================================

    checkWinCondition() {
        if (this.soldUnique.size >= this.UNIQUE_WIN) {
            this.showVictory(`Вы продали ${this.soldUnique.size} разных книг!`);
            return true;
        }
        if (this.soldTotal >= this.TOTAL_WIN) {
            this.showVictory(`Вы продали ${this.soldTotal} книг!`);
            return true;
        }
        return false;
    }

    showVictory(message) {
        this.victoryMessage.textContent = message + ` Ваш баланс: ${this.balance} ₽. Дней: ${this.day}.`;
        this.victoryModal.classList.remove('hidden');
    }

    hasProgress() {
        // Check if player has any progress worth saving
        return this.soldTotal > 0 || this.soldUnique.size > 0 || this.day > 1;
    }

    confirmNewGame() {
        // If no progress, just restart without confirmation
        if (!this.hasProgress()) {
            this.restartGame();
            return;
        }

        // Show custom confirmation modal
        this.openConfirmModal();
    }

    openConfirmModal() {
        this.confirmModal.classList.remove('hidden');
    }

    closeConfirmModal() {
        this.confirmModal.classList.add('hidden');
    }

    restartGame() {
        this.clearProgress();
        this.startInitialGameplaySession();

        // Reset all state
        this.balance = 0;
        this.day = 1;
        this.soldUnique = new Set();
        this.soldTotal = 0;
        this.shelf = [];
        this.ownedBooks = new Set();
        this.inventory = [];
        this.shopBookOrder = [];
        this.currentCustomerIndex = 0;
        this.todayCustomers = [];
        this.currentRequest = null;
        this.selectedSlot = null;
        this.isDay = false;
        this.isEvening = false;

        this.prepareNewRun();

        // Hide modals
        this.victoryModal.classList.add('hidden');
        this.bookModal.classList.add('hidden');
        this.shopModal.classList.add('hidden');

        // Reset UI
        this.btnStartDay.style.display = 'inline-block';
        this.btnSkipCustomer.style.display = 'none';
        this.btnEndDay.style.display = 'none';

        this.customerAvatarEl.textContent = '🧑';
        this.customerRequestEl.textContent = 'Нажмите "Начать день" чтобы открыть лавку';
        this.currentCustomerEl.textContent = '0';
        this.totalCustomersEl.textContent = '0';

        this.renderShelf();
        this.updateStats();
    }

    // ==========================================
    // SAVE/LOAD PROGRESS
    // ==========================================

    saveProgress() {
        const saveData = this.buildSaveData();
        this.saveToLocal(saveData);
        this.saveToCloud(saveData);
    }

    buildSaveData() {
        return {
            balance: this.balance,
            day: this.day,
            soldTotal: this.soldTotal,
            soldUnique: [...this.soldUnique],
            shelf: this.shelf.map(book => book ? book.id : null),
            ownedBooks: [...this.ownedBooks],
            shopBookOrder: this.shopBookOrder
        };
    }

    applySaveData(saveData) {
        this.balance = saveData.balance ?? 0;
        this.day = saveData.day ?? 1;
        this.soldTotal = saveData.soldTotal ?? 0;
        this.soldUnique = new Set(saveData.soldUnique || []);
        this.ownedBooks = new Set(saveData.ownedBooks || []);

        // Load shelf
        this.shelf = (saveData.shelf || []).map(id => {
            if (id === null) return null;
            const book = typeof BOOKS !== 'undefined' ? BOOKS.find(b => b.id === id) : null;
            return book || null;
        });

        // Load or regenerate shop order
        if (saveData.shopBookOrder && saveData.shopBookOrder.length > 0) {
            this.shopBookOrder = saveData.shopBookOrder;
        } else {
            // Fallback if loading old save without book order
            const allBooks = typeof BOOKS !== 'undefined' ? BOOKS : [];
            this.shopBookOrder = allBooks.map(b => b.id);
        }
    }

    saveToLocal(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('LocalStorage save failed', e);
        }
    }

    loadFromLocal() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    async saveToCloud(data) {
        if (!this.canWriteCloudSaves || !this.player) return;
        try {
            await this.player.setData({ [this.STORAGE_KEY]: data }, true);
        } catch (e) {
            console.warn('Cloud save failed', e);
        }
    }

    async loadFromCloud() {
        if (!this.canReadCloudSaves || !this.player) return null;
        try {
            const data = await this.player.getData([this.STORAGE_KEY]);
            return data[this.STORAGE_KEY] || null;
        } catch (e) {
            console.warn('Cloud load failed', e);
            return null;
        }
    }

    async loadProgress() {
        // Try cloud first, then local
        let data = await this.loadFromCloud();
        if (!data) {
            data = this.loadFromLocal();
        }

        if (data) {
            // Check if save is from old VHS version (has 'ownedFilms' but no 'ownedBooks')
            // If so, we should probably reset or try to migrate, but simple is reset.
            if (!data.ownedBooks && data.ownedFilms) {
                console.log('Detected old VHS save, resetting for Books');
                return false;
            }

            this.applySaveData(data);
            return true;
        }
        return false;
    }

    clearProgress() {
        localStorage.removeItem(this.STORAGE_KEY);
        if (this.canWriteCloudSaves && this.player) {
            this.player.setData({ [this.STORAGE_KEY]: {} }, true).catch(() => { });
        }
    }
}

// Start the game
window.game = new BookTraderGame();
