import siteConfig from './config.js';

// Typing effect
const typeText = () => {
    const text = `I'm a ${siteConfig.title}`;
    const typingText = document.querySelector('.typing-text');
    let i = 0;

    const typing = setInterval(() => {
        if (i < text.length) {
            typingText.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(typing);
        }
    }, 100);
};

// Progress bars animation
const animateProgressBars = () => {
    const progressBars = document.querySelectorAll('.progress-bar');
    progressBars.forEach((bar, index) => {
        const percent = siteConfig.skills[index].percent;
        bar.style.setProperty('--progress', percent + '%');
        bar.style.width = percent + '%';
    });
};

// Theme toggler
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);

    const icon = themeToggle.querySelector('i');
    icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
});

// Project filtering
const filterProjects = (category) => {
    const filteredProjects = category === 'all'
        ? siteConfig.projects
        : siteConfig.projects.filter(project => project.category === category);

    const projectsGrid = document.querySelector('.projects-grid');
    projectsGrid.innerHTML = '';

    filteredProjects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <h3>${project.title}</h3>
            <p>${project.description}</p>
            <div class="technologies">
                ${project.technologies.map(tech => `<span>${tech}</span>`).join('')}
            </div>
            <div class="project-links">
                <a href="${project.liveUrl}" target="_blank">Live Demo</a>
                <a href="${project.sourceUrl}" target="_blank">Source Code</a>
            </div>
        `;
        projectsGrid.appendChild(card);
    });
};

// Initialize filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.filter-btn.active').classList.remove('active');
        btn.classList.add('active');
        filterProjects(btn.getAttribute('data-filter'));
    });
});

// Testimonials data and slider
const testimonials = siteConfig.testimonials;

let currentTestimonial = 0;

const showTestimonial = (index) => {
    const slider = document.querySelector('.testimonials-slider');
    slider.innerHTML = `
        <div class="testimonial-card${index === currentTestimonial ? ' active' : ''}">
            <p>${testimonials[index].text}</p>
            <h4>${testimonials[index].author}</h4>
            <span>${testimonials[index].position}</span>
        </div>
    `;
};

setInterval(() => {
    currentTestimonial = (currentTestimonial + 1) % testimonials.length;
    showTestimonial(currentTestimonial);
}, 5000);

// Form handling
document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        message: document.getElementById('message').value
    };

    if (siteConfig.contactConfig.emailService === 'emailjs') {
        // Add emailjs implementation using siteConfig.contactConfig.emailjsConfig
    }
});

// Intersection Observer for scroll animations
const observerCallback = (entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            if (entry.target.querySelector('.progress-bar')) {
                animateProgressBars();
            }
        }
    });
};

const observer = new IntersectionObserver(observerCallback, {
    threshold: 0.1
});

document.querySelectorAll('.section').forEach(section => {
    observer.observe(section);
});

// Theme handling using config colors
const applyTheme = (theme) => {
    const root = document.documentElement;
    const themeColors = siteConfig.theme[theme];

    root.style.setProperty('--primary-color', themeColors.primary);
    root.style.setProperty('--secondary-color', themeColors.secondary);
    root.style.setProperty('--background-color', themeColors.background);
    root.style.setProperty('--text-color', themeColors.text);
};

// Initialize everything
window.addEventListener('load', () => {
    typeText();
    filterProjects('all');
    showTestimonial(0);

    // Set initial theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.querySelector('i').className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    applyTheme(savedTheme);

    // Set page title
    document.getElementById('site-title').textContent = `${siteConfig.name} | ${siteConfig.title}`;

    // Populate name and location
    document.getElementById('dev-name').textContent = siteConfig.name;
    document.getElementById('location').textContent = siteConfig.location;

    // Set social media links
    document.getElementById('github-link').href = siteConfig.social.github;
    document.getElementById('linkedin-link').href = siteConfig.social.linkedin;
    document.getElementById('twitter-link').href = siteConfig.social.twitter;

    // Set email
    const emailLink = document.getElementById('email-link');
    emailLink.href = `mailto:${siteConfig.email}`;
    emailLink.textContent = siteConfig.email;

    // Set footer
    document.getElementById('footer-name').textContent = siteConfig.name;
    document.getElementById('current-year').textContent = new Date().getFullYear();
});
