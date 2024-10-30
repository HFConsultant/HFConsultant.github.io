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

// Project cards data
const projects = [
    {
        title: 'Project 1',
        description: 'Vanilla JavaScript Website',
        technologies: ['HTML', 'CSS', 'JavaScript']
    },
    {
        title: 'Elearn',
        description: 'Online Health and Fitness Platform',
        technologies: ['React', 'Node.js', 'MongoDB']
    },
    // Add more projects as needed
];

// Create project cards
const createProjectCards = () => {
    const projectsGrid = document.querySelector('.projects-grid');
    projects.forEach(project => {
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

// Form handling
document.getElementById('contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        message: document.getElementById('message').value
    };
    console.log('Form submitted:', formData);
    // Add your form submission logic here
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

// Initialize
window.addEventListener('load', () => {
    typeText();
    createProjectCards();
});

