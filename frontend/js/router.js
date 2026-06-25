const KSRouter = {
    currentPage: null,
    pages: {},
    contentEl: null,
    navLinks: null,
    groupLinks: null,

    register(name, pageModule) {
        this.pages[name] = pageModule;
    },

    init() {
        this.contentEl = document.getElementById('page-content');
        this.navLinks = document.querySelectorAll('[data-nav-page]');
        this.groupLinks = document.querySelectorAll('[data-nav-group]');
        this.bindNavLinks();
        window.addEventListener('popstate', () => this.onPopState());
        const params = new URLSearchParams(window.location.search);
        const page = params.get('page') || 'quotation';
        this.navigate(page, false);
    },

    bindNavLinks() {
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-nav-page');
                if (page) this.navigate(page);
            });
        });
        this.groupLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const group = link.getAttribute('data-nav-group');
                if (group) this.switchGroup(group);
            });
        });
    },

    navigate(pageName, pushState = true, options) {
        const page = this.pages[pageName];
        if (!page) {
            console.error('Page not found:', pageName);
            return;
        }

        if (this.currentPage && this.pages[this.currentPage]) {
            this.pages[this.currentPage].destroy();
        }

        this.currentPage = pageName;
        this.contentEl.innerHTML = '';
        page.init(this.contentEl, options);

        this.highlightNav(pageName);

        if (pushState) {
            const params = new URLSearchParams(window.location.search);
            params.set('page', pageName);
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.pushState({ page: pageName }, '', newUrl);
        }
    },

    onPopState() {
        const params = new URLSearchParams(window.location.search);
        const page = params.get('page') || 'quotation';
        this.navigate(page, false);
    },

    highlightNav(pageName) {
        this.navLinks.forEach(link => {
            const p = link.getAttribute('data-nav-page');
            link.classList.toggle('primary', p === pageName);
        });
    },

    switchGroup(group) {
        const params = new URLSearchParams(window.location.search);
        params.set('group', group);
        const featureMap = { '物流组': 'logistics', '人事组': 'schedule', '设计组': 'email-mgmt' };
        params.set('page', featureMap[group] || 'quotation');
        const newUrl = `${window.location.pathname}?${params.toString()}#group=${group}`;
        window.location.href = newUrl;
    },

    getGroup() {
        const params = new URLSearchParams(window.location.search);
        return params.get('group') || '韩语组';
    }
};
