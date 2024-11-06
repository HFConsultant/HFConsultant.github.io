// Replace imports with direct window/global objects
const ui = window.ui;
const terminal = window.terminal;
const configManager = window.configManager;
const siteConfig = window.siteConfig;

// Keep the observer logic
const observerCallback = (entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            if (entry.target.querySelector('.progress-bar')) {
                ui.animateProgressBars(siteConfig.skills);
            }
        }
    });
};

const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 });

// Main initialization wrapped in IIFE for scoping
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize sections observation
        document.querySelectorAll('.section').forEach(section => observer.observe(section));

        // Fixed direct property references
        document.getElementById('dev-name').textContent = window.siteConfig.name;
        document.getElementById('location').textContent = window.siteConfig.location;
        document.getElementById('email-link').textContent = window.siteConfig.email;
        document.getElementById('email-link').href = `mailto:${window.siteConfig.email}`;

        // Set social links
        const socials = ['github', 'linkedin', 'twitter'];
        socials.forEach(platform => {
            const link = document.getElementById(`${platform}-link`);
            if (link) link.href = siteConfig.social[platform];
        });

        // Set footer
        document.getElementById('footer-name').textContent = siteConfig.name;
        document.getElementById('current-year').textContent = new Date().getFullYear();

        // Initialize UI components
        ui.typeText(siteConfig);
        ui.filterProjects('all', siteConfig.projects);
        ui.addDownloadButton();
        terminal.addTerminalButton();

        // Theme initialization
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        ui.applyTheme(savedTheme, siteConfig.theme);
    });

    // Event Listeners
    document.getElementById('theme-toggle').addEventListener('click', function() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        ui.applyTheme(newTheme, siteConfig.theme);

        this.querySelector('i').className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelector('.filter-btn.active').classList.remove('active');
            this.classList.add('active');
            ui.filterProjects(this.getAttribute('data-filter'), siteConfig.projects);
        });
    });
})();
