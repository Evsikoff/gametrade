// ==========================================
// Game Trader - Main Game Logic
// ==========================================

class GameTraderGame {
    constructor() {
        // Game state
        this.balance = 0;
        this.day = 1;
        this.soldUnique = new Set();
        this.soldTotal = 0;
        this.shelf = []; // 10 slots
        this.ownedGames = new Set(); // games we own
        this.shopGameOrder = []; // randomized order of games in shop

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
        this.STORAGE_KEY = 'game_trader_save_v1';

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
        this.gameModal = document.getElementById('game-modal');
        this.shopModal = document.getElementById('shop-modal');
        this.victoryModal = document.getElementById('victory-modal');

        // Game modal
        this.modalCover = document.getElementById('modal-cover');
        this.modalTitle = document.getElementById('modal-title');
        this.modalYear = document.getElementById('modal-year');
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

        this.btnOffer.addEventListener('click', () => this.offerGame());
        this.btnCloseModal.addEventListener('click', () => this.closeGameModal());

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
        this.showLoadingScreen('Подключение к игровой сети');
        await this.initYandexSDK();

        this.updateLoadingStatus('Загрузка игр');
        const progressLoaded = await this.loadProgress();
        if (progressLoaded) {
            this.customerRequestEl.textContent = `День ${this.day}. Нажмите "Начать день" чтобы открыть магазин.`;
        } else {
            this.prepareNewRun();
        }

        this.populateGenreFilter();
        this.renderShelf();
        this.updateStats();

        this.updateLoadingStatus('Магазин открывается');
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
        // Use GAMES database
        const allGames = typeof GAMES !== 'undefined' ? GAMES : [];
        this.shopGameOrder = [...allGames].sort(() => Math.random() - 0.5).map(g => g.id);
        this.shelf = [];
        this.ownedGames = new Set();
        this.balance = 0; // Starting capital

        // Initial stock: 10 random games from the shop order
        for (let i = 0; i < 10; i++) {
            const gameId = this.shopGameOrder[i];
            const game = allGames.find(g => g.id === gameId);
            if (game) {
                this.shelf.push(game);
                this.ownedGames.add(game.id);
            } else {
                this.shelf.push(null);
            }
        }

        this.customerRequestEl.textContent = 'Нажмите "Начать день" чтобы открыть магазин';
    }

    populateGenreFilter() {
        const allGames = typeof GAMES !== 'undefined' ? GAMES : [];
        const genres = new Set();
        allGames.forEach(game => {
            if (game.genres) {
                game.genres.forEach(g => genres.add(g));
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

        const gamesPerRow = 5;
        const totalSlots = 10;
        const rowCount = Math.ceil(totalSlots / gamesPerRow);

        for (let row = 0; row < rowCount; row++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'shelf-row';

            for (let col = 0; col < gamesPerRow; col++) {
                const i = row * gamesPerRow + col;
                if (i >= totalSlots) break;

                const slot = document.createElement('div');
                slot.className = 'shelf-slot';
                slot.dataset.index = i;

                if (this.shelf[i]) {
                    const game = this.shelf[i];
                    const sellingPrice = Math.floor(game.price * 1.5);

                    slot.innerHTML = `
                        <div class="game-cover">
                            <div class="game-spine"></div>
                            <img src="${game.coverUrl}" alt="${game.title}" onerror="this.src='https://placehold.co/100x100/1a1a2e/00d9ff?text=Game'">
                        </div>
                        <div class="game-info">
                            <div class="game-title">${game.title}</div>
                            <div class="game-year">${game.year} г.</div>
                            <div class="game-price">${sellingPrice} ₽</div>
                        </div>
                    `;
                    slot.addEventListener('click', () => this.openGameModal(i));
                } else {
                    slot.classList.add('empty');
                    slot.innerHTML = '<div class="empty-slot-icon">🎮</div>';
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
        // 1. Identification of games on the shelf
        const shelfGameIds = this.shelf.filter(g => g !== null).map(g => g.id);

        let chosenRequests = [];
        const usedRequestIndices = new Set();
        const usedRequestTexts = new Set(); // Track used texts to prevent duplicate phrases

        // 2.1: gather up to 4 requests linked to 4 different random shelf games (unique requests)
        const shuffledGames = [...shelfGameIds].sort(() => Math.random() - 0.5).slice(0, 4);

        // Ensure REQUESTS exists
        const allRequests = typeof REQUESTS !== 'undefined' ? REQUESTS : [];

        shuffledGames.forEach(gameId => {
            if (chosenRequests.length >= count) return;

            const linked = allRequests
                .map((req, idx) => ({ req, idx }))
                .filter(({ req, idx }) => req.linkedGameIds.includes(gameId) && !usedRequestIndices.has(idx) && !usedRequestTexts.has(req.text));

            if (linked.length === 0) return;

            const { req, idx } = linked[Math.floor(Math.random() * linked.length)];
            chosenRequests.push(req);
            usedRequestIndices.add(idx);
            usedRequestTexts.add(req.text);
        });

        // 2.2: fill remaining slots with random unique requests
        const allShuffled = [...allRequests].map((r, i) => ({ r, i })).sort(() => Math.random() - 0.5);
        for (let { r, i } of allShuffled) {
            if (chosenRequests.length >= count) break;
            if (usedRequestIndices.has(i)) continue;
            if (usedRequestTexts.has(r.text)) continue; // Skip if text already used

            chosenRequests.push(r);
            usedRequestIndices.add(i);
            usedRequestTexts.add(r.text);
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

    openGameModal(slotIndex) {
        if (!this.isDay || !this.shelf[slotIndex]) return;

        this.selectedSlot = slotIndex;
        const game = this.shelf[slotIndex];

        this.modalCover.src = game.coverUrl;
        this.modalCover.onerror = () => {
            this.modalCover.src = 'https://placehold.co/180x180/1a1a2e/00d9ff?text=Ошибка';
        };
        this.modalTitle.textContent = game.title;
        this.modalYear.textContent = game.year + ' г.';
        this.modalDescription.textContent = game.description || '';
        this.modalGenres.textContent = 'Жанры: ' + (game.genres ? game.genres.join(', ') : '');
        this.modalPrice.textContent = 'Цена: ' + Math.floor(game.price * 1.5) + ' ₽';

        this.gameModal.classList.remove('hidden');
    }

    closeGameModal() {
        this.gameModal.classList.add('hidden');
        this.selectedSlot = null;
    }

    offerGame() {
        if (this.selectedSlot === null || !this.currentRequest) return;

        const slotIndex = this.selectedSlot;
        const game = this.shelf[slotIndex];
        const isMatch = this.currentRequest.linkedGameIds.includes(game.id);

        this.closeGameModal();

        if (isMatch) {
            // Success!
            this.handleSale(game, slotIndex);
        } else {
            // Fail
            this.handleRejection();
        }
    }

    handleSale(game, slotIndex) {
        const salePrice = Math.floor(game.price * 1.5);
        this.balance += salePrice;
        this.soldTotal++;
        this.soldUnique.add(game.id);

        const slotEl = this.shelfEl.querySelector(`.shelf-slot[data-index="${slotIndex}"]`);
        if (slotEl) {
            slotEl.classList.add('sold');
        }

        this.updateStats();

        // Remove from shelf with a short transition so the slot visibly clears
        setTimeout(() => {
            this.shelf[slotIndex] = null;
            this.ownedGames.delete(game.id);
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
            "Хм, не та игра. До свидания!",
            "Не тот жанр, что я искал...",
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
        this.customerRequestEl.textContent = 'Магазин закрыт. Время пополнить коллекцию игр!';
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
        this.emptySlotsEl.textContent = this.shelf.filter(s => !s).length;
        this.renderShopCatalog();
        this.shopModal.classList.remove('hidden');
    }

    renderShopCatalog() {
        const genreFilter = this.filterGenre.value;
        const priceFilter = this.filterPrice.value;
        const allGames = typeof GAMES !== 'undefined' ? GAMES : [];

        // 1. Get games in randomized order, filter out owned
        let games = this.shopGameOrder
            .map(id => allGames.find(g => g.id === id))
            .filter(game => game && !this.ownedGames.has(game.id));

        // Apply genre filter
        if (genreFilter) {
            games = games.filter(game => game.genres.includes(genreFilter));
        }

        // Apply price filter
        if (priceFilter === 'cheap') {
            games = games.filter(game => game.price <= 200);
        } else if (priceFilter === 'medium') {
            games = games.filter(game => game.price > 200 && game.price <= 450);
        } else if (priceFilter === 'expensive') {
            games = games.filter(game => game.price > 450);
        }

        this.shopCatalog.innerHTML = '';

        // 2. Render items
        if (games.length === 0) {
            this.shopCatalog.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;grid-column:1/-1;">Нет доступных игр по выбранным фильтрам</p>';
            return;
        }

        games.forEach(game => {
            const item = document.createElement('div');
            item.className = 'shop-item';

            const canAfford = this.balance >= game.price;
            const hasEmptySlot = this.shelf.some(s => !s);
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
                <div class="shop-game-case">
                    <div class="shop-cover-wrapper">
                        <img src="${game.coverUrl}" alt="${game.title}" onerror="this.src='https://placehold.co/150x150/1a1a2e/00d9ff?text=Game'">
                    </div>
                </div>
                <div class="shop-item-title">${game.title}</div>
                <div class="shop-item-year">${game.year} г.</div>
                <div class="shop-item-price">${game.price} ₽</div>
                ${buttonHtml}
            `;

            if (isPurchasable) {
                const btn = item.querySelector('.btn-buy');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent card click if we add one later
                    this.buyGame(game);
                });
            }

            this.shopCatalog.appendChild(item);
        });
    }

    buyGame(game) {
        if (this.balance < game.price) return;

        const emptySlotIndex = this.shelf.findIndex(s => !s);
        if (emptySlotIndex === -1) return;

        this.balance -= game.price;
        // Keep balance as integer logic if needed, but simple subtraction is fine
        this.shelf[emptySlotIndex] = game;
        this.ownedGames.add(game.id);

        this.shopBalanceEl.textContent = Math.floor(this.balance);
        this.emptySlotsEl.textContent = this.shelf.filter(s => !s).length;

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
        this.customerRequestEl.textContent = `День ${this.day}. Нажмите "Начать день" чтобы открыть магазин.`;

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
            this.showVictory(`Вы продали ${this.soldUnique.size} разных игр!`);
            return true;
        }
        if (this.soldTotal >= this.TOTAL_WIN) {
            this.showVictory(`Вы продали ${this.soldTotal} игр!`);
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
        this.ownedGames = new Set();
        this.inventory = [];
        this.shopGameOrder = [];
        this.currentCustomerIndex = 0;
        this.todayCustomers = [];
        this.currentRequest = null;
        this.selectedSlot = null;
        this.isDay = false;
        this.isEvening = false;

        this.prepareNewRun();

        // Hide modals
        this.victoryModal.classList.add('hidden');
        this.gameModal.classList.add('hidden');
        this.shopModal.classList.add('hidden');

        // Reset UI
        this.btnStartDay.style.display = 'inline-block';
        this.btnSkipCustomer.style.display = 'none';
        this.btnEndDay.style.display = 'none';

        this.customerAvatarEl.textContent = '🧑';
        this.customerRequestEl.textContent = 'Нажмите "Начать день" чтобы открыть магазин';
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
            shelf: this.shelf.map(game => game ? game.id : null),
            ownedGames: [...this.ownedGames],
            shopGameOrder: this.shopGameOrder
        };
    }

    applySaveData(saveData) {
        this.balance = saveData.balance ?? 0;
        this.day = saveData.day ?? 1;
        this.soldTotal = saveData.soldTotal ?? 0;
        this.soldUnique = new Set(saveData.soldUnique || []);
        this.ownedGames = new Set(saveData.ownedGames || []);

        // Load shelf
        this.shelf = (saveData.shelf || []).map(id => {
            if (id === null) return null;
            const game = typeof GAMES !== 'undefined' ? GAMES.find(g => g.id === id) : null;
            return game || null;
        });
        const totalSlots = 10;
        if (this.shelf.length < totalSlots) {
            this.shelf = this.shelf.concat(Array(totalSlots - this.shelf.length).fill(null));
        }

        // Load or regenerate shop order
        if (saveData.shopGameOrder && saveData.shopGameOrder.length > 0) {
            this.shopGameOrder = saveData.shopGameOrder;
        } else {
            // Fallback if loading old save without game order
            const allGames = typeof GAMES !== 'undefined' ? GAMES : [];
            this.shopGameOrder = allGames.map(g => g.id);
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
            // Check if save is from old version (has 'ownedBooks' but no 'ownedGames')
            // If so, we should probably reset or try to migrate, but simple is reset.
            if (!data.ownedGames && (data.ownedBooks || data.ownedFilms)) {
                console.log('Detected old save format, resetting for Games');
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

// Wait for data to be loaded, then start the game
function waitForData(callback, maxAttempts = 50, interval = 100) {
    let attempts = 0;
    const check = () => {
        attempts++;
        if (typeof GAMES !== 'undefined' && typeof REQUESTS !== 'undefined' &&
            Array.isArray(GAMES) && GAMES.length > 0 &&
            Array.isArray(REQUESTS) && REQUESTS.length > 0) {
            console.log('Game data loaded successfully:', GAMES.length, 'games,', REQUESTS.length, 'requests');
            callback();
        } else if (attempts < maxAttempts) {
            setTimeout(check, interval);
        } else {
            console.error('Failed to load game data after', maxAttempts, 'attempts');
            console.log('GAMES:', typeof GAMES, Array.isArray(GAMES) ? GAMES.length : 'not array');
            console.log('REQUESTS:', typeof REQUESTS, Array.isArray(REQUESTS) ? REQUESTS.length : 'not array');
            // Start anyway with empty data as fallback
            callback();
        }
    };
    check();
}

// Start the game when DOM and data are ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        waitForData(() => {
            window.game = new GameTraderGame();
        });
    });
} else {
    waitForData(() => {
        window.game = new GameTraderGame();
    });
}
