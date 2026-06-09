import { eventBus } from '../core/EventBus.js';
import { debounce, getTimeSlot } from '../core/utils.js';

export class SearchService {
    constructor() {
        this.searchIndex = new Map();
        this.searchQuery = '';
        this.SEARCH_DEBOUNCE_MS = 200;
        this.filters = {
            categories: ['todo', 'worry', 'idea'],
            dateFrom: null,
            dateTo: null,
            timeSlots: ['morning', 'afternoon', 'evening', 'night'],
            sortBy: 'date-desc'
        };
        this.debouncedSearch = debounce((query, thoughts) => {
            this.searchQuery = query.trim().toLowerCase();
            eventBus.emit('search:changed', { query: this.searchQuery, results: this.search(thoughts) });
        }, this.SEARCH_DEBOUNCE_MS);
    }

    buildIndex(thoughts) {
        this.searchIndex.clear();
        thoughts.forEach(thought => {
            const tokens = this.tokenize(thought.text);
            tokens.forEach(token => {
                if (!this.searchIndex.has(token)) {
                    this.searchIndex.set(token, new Set());
                }
                this.searchIndex.get(token).add(thought.id);
            });
        });
        eventBus.emit('search:indexBuilt', this.searchIndex);
    }

    tokenize(text) {
        const cleaned = text.toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        const words = cleaned.split(/\s+/);
        const tokens = new Set();
        
        words.forEach(word => {
            if (word.length > 0) {
                tokens.add(word);
                for (let i = 1; i < word.length; i++) {
                    for (let j = i + 1; j <= word.length; j++) {
                        if (j - i >= 2) {
                            tokens.add(word.substring(i, j));
                        }
                    }
                }
            }
        });
        
        return Array.from(tokens);
    }

    search(query, thoughts) {
        if (!query) return thoughts;
        
        const queryTokens = this.tokenize(query);
        if (queryTokens.length === 0) return thoughts;
        
        const matchedIds = new Set();
        let firstToken = true;
        
        queryTokens.forEach(token => {
            if (this.searchIndex.has(token)) {
                const tokenIds = this.searchIndex.get(token);
                if (firstToken) {
                    tokenIds.forEach(id => matchedIds.add(id));
                    firstToken = false;
                } else {
                    tokenIds.forEach(id => {
                        if (matchedIds.has(id)) {
                            matchedIds.add(id);
                        }
                    });
                }
            }
        });

        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return thoughts.filter(t => 
            matchedIds.has(t.id) || regex.test(t.text)
        );
    }

    filterThoughts(thoughts) {
        return thoughts.filter(thought => {
            if (!this.filters.categories.includes(thought.category)) {
                return false;
            }

            const createdAt = new Date(thought.createdAt);
            
            if (this.filters.dateFrom) {
                const fromDate = new Date(this.filters.dateFrom);
                fromDate.setHours(0, 0, 0, 0);
                if (createdAt < fromDate) return false;
            }
            
            if (this.filters.dateTo) {
                const toDate = new Date(this.filters.dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (createdAt > toDate) return false;
            }

            const hour = createdAt.getHours();
            const timeSlot = getTimeSlot(hour);
            
            if (!this.filters.timeSlots.includes(timeSlot)) {
                return false;
            }

            return true;
        });
    }

    sortThoughts(thoughts) {
        const sorted = [...thoughts];
        const categoryOrder = { todo: 0, worry: 1, idea: 2 };
        
        switch (this.filters.sortBy) {
            case 'date-desc':
                sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'date-asc':
                sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'category':
                sorted.sort((a, b) => {
                    const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
                    if (catDiff !== 0) return catDiff;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
                break;
        }
        
        return sorted;
    }

    setCategories(categories) {
        this.filters.categories = categories;
        eventBus.emit('search:filtersChanged', this.filters);
    }

    setDateRange(from, to) {
        this.filters.dateFrom = from || null;
        this.filters.dateTo = to || null;
        eventBus.emit('search:filtersChanged', this.filters);
    }

    setTimeSlots(timeSlots) {
        this.filters.timeSlots = timeSlots;
        eventBus.emit('search:filtersChanged', this.filters);
    }

    setSortBy(sortBy) {
        this.filters.sortBy = sortBy;
        eventBus.emit('search:filtersChanged', this.filters);
    }

    hasActiveFilters() {
        return this.searchQuery || 
               this.filters.categories.length < 3 ||
               this.filters.dateFrom ||
               this.filters.dateTo ||
               this.filters.timeSlots.length < 4;
    }

    resetFilters() {
        this.searchQuery = '';
        this.filters = {
            categories: ['todo', 'worry', 'idea'],
            dateFrom: null,
            dateTo: null,
            timeSlots: ['morning', 'afternoon', 'evening', 'night'],
            sortBy: 'date-desc'
        };
        eventBus.emit('search:filtersReset', this.filters);
    }

    getFilteredAndSorted(thoughts) {
        let results = this.search(this.searchQuery, thoughts);
        results = this.filterThoughts(results);
        results = this.sortThoughts(results);
        return results;
    }

    highlightText(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="search-highlight">$1</mark>');
    }
}

export const searchService = new SearchService();
