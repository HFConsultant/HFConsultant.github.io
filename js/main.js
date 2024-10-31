// Typing effect
const typeText = () => {
    const text = "I'm a Full Stack Developer";
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
    progressBars.forEach(bar => {
        const percent = bar.getAttribute('data-percent');
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

    // Update icon
    const icon = themeToggle.querySelector('i');
    icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
});

// Project data
const projects = [
    {
        title: 'Health and Fitness Platform',
        description: 'Knowledge Sharing Online Community',
        category: 'fullstack',
        technologies: ['React', 'Node.js', 'MongoDB']
    },
    {
        title: 'Portfolio Website',
        description: 'Responsive personal portfolio',
        category: 'frontend',
        technologies: ['HTML', 'CSS', 'JavaScript']
    },
    // {
    //     title: 'API Service',
    //     description: 'RESTful API with authentication',
    //     category: 'backend',
    //     technologies: ['Node.js', 'Express', 'JWT']
    // }
];

// Project filtering
const filterProjects = (category) => {
    const filteredProjects = category === 'all'
        ? projects
        : projects.filter(project => project.category === category);

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
const testimonials = [
    {
        text: "HFConsultants's software has revolutionized the way we do business. It has saved us time, increased our productivity, and improved our customer relationships",
        author: "Janet Smith",
        position: "CFO, FairBnB"
    },
    {
        text: "I've been using HFConsultants's software for a few months now, and it has made a big difference in my business. The software is easy to use and has all the features I need to run my business efficiently. I especially like the customer relationship management (CRM) module. It has helped me improve my relationships with my customers and has made it easier to manage my sales pipeline.",
        author: "Jane Doughe",
        position: "CEO, Gr88 Media"
    },
    {
        text: "HFConsultants have dramatically improved our business model and workflow. It's now easier to accomplish more, and their support is top tier.",
        author: "John Janssen",
        position: "Founder"
    }
];

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
document.getElementById('contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        message: document.getElementById('message').value
    };
    console.log('Form submitted:', formData);
    // Add form submission logic here
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

// Initialize everything
window.addEventListener('load', () => {
    typeText();
    filterProjects('all');
    showTestimonial(0);

    // Set initial theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.querySelector('i').className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
});

