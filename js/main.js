import * as ui from './ui.js';
import * as terminal from './terminal.js';
import * as configManager from './config-manager.js';

// Initial config loading
let siteConfig;
try {
    siteConfig = await import('./config.js');
} catch {
    siteConfig = await import('./config.example.js');
    console.log('Using example configuration. Create your own config.js to customize.');
}

// Initialize observers
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
document.querySelectorAll('.section').forEach(section => observer.observe(section));
// Main initialization
window.addEventListener('load', () => {
    ui.typeText(siteConfig);
    ui.filterProjects('all', siteConfig.projects);
    ui.addDownloadButton();
    terminal.addTerminalButton();


    // Set initial theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    ui.applyTheme(savedTheme, siteConfig.theme);

    // Initialize UI with config data
    document.getElementById('site-title').textContent = `${siteConfig.name} | ${siteConfig.title}`;
    document.getElementById('dev-name').textContent = siteConfig.name;
    document.getElementById('location').textContent = siteConfig.location;

    // Set social links and contact info
    const socials = ['github', 'linkedin', 'twitter'];
    socials.forEach(platform => {
        const link = document.getElementById(`${platform}-link`);
        if (link) link.href = siteConfig.social[platform];
    });

    const emailLink = document.getElementById('email-link');
    emailLink.href = `mailto:${siteConfig.email}`;
    emailLink.textContent = siteConfig.email;

    // Set footer
    document.getElementById('footer-name').textContent = siteConfig.name;
    document.getElementById('current-year').textContent = new Date().getFullYear();

});
// Theme toggler
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    ui.applyTheme(newTheme, siteConfig.theme);

    const icon = themeToggle.querySelector('i');
    icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
});

// Project filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.filter-btn.active').classList.remove('active');
        btn.classList.add('active');
        ui.filterProjects(btn.getAttribute('data-filter'), siteConfig.projects);
    });
});

// Contact form
document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { serviceId, templateId, userId } = siteConfig.contactConfig.emailjsConfig;

    const templateParams = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        message: document.getElementById('message').value
    };

    try {
        await emailjs.send(serviceId, templateId, templateParams, userId);
        alert('Message sent successfully!');
        e.target.reset();
    } catch (error) {
        alert('Failed to send message. Please try again.');
    }
});
