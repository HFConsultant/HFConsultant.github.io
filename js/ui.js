// Create UI namespace
window.ui = {
    typeText: function(siteConfig) {
        const element = document.querySelector('.typing-text');
        if (element) {
            element.textContent = siteConfig.title;
        }
    },
    createSkillBars: function(skills) {
        const container = document.getElementById('skills-container');
        container.innerHTML = ''; // Clear existing content

        skills.forEach(skill => {
            const skillDiv = document.createElement('div');
            skillDiv.className = 'skill';

            skillDiv.innerHTML = `
                <div class="skill-name">${skill.name}</div>
                <div class="skill-bar">
                    <div class="progress-bar" data-progress="${skill.level}">
                        <span class="progress-text">${skill.level}%</span>
                    </div>
                </div>
            `;

            container.appendChild(skillDiv);
        });
    },

    animateProgressBars: function(skills) {
        const progressBars = document.querySelectorAll('.progress-bar');
        progressBars.forEach(bar => {
            const progress = bar.getAttribute('data-progress');
            bar.style.width = `${progress}%`;
        });
    },
    filterProjects: function(category, projects) {
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
                <div class="project-links">
                    <a href="${project.liveUrl}" target="_blank">Live Demo</a>
                    <a href="${project.sourceUrl}" target="_blank">Source Code</a>
                </div>
            `;
            projectsGrid.appendChild(card);
        });
    },
    applyTheme: function(theme, themeConfig) {
        const root = document.documentElement;
        const colors = themeConfig[theme];

        Object.entries(colors).forEach(([key, value]) => {
            root.style.setProperty(`--${key}`, value);
        });
    },
    addDownloadButton: function() {
        const button = document.createElement('button');
        button.className = 'template-download';
        button.innerHTML = `
            <i class="fas fa-download"></i>
            <span>Get Template</span>
        `;

        button.onclick = () => {
            button.classList.add('clicked');
            setTimeout(() => {
                button.classList.remove('clicked');
                window.location.href = 'https://github.com/HFConsultant/portfolio-template';
            }, 300);
        };

        document.body.appendChild(button);
    },

    renderSkills: function() {
        const skillsContainer = document.getElementById('skills-container');
        siteConfig.skills.forEach(skill => {
            const skillElement = `
                <div class="skill">
                    <h3>${skill.name}</h3>
                    <div class="progress-bar" data-percent="${skill.percent}">
                        <div class="progress" style="width: ${skill.percent}%"></div>
                    </div>
                </div>
            `;
            skillsContainer.innerHTML += skillElement;
        });
    },

    renderTestimonials: function() {
        const testimonialsContainer = document.querySelector('.testimonials-slider');
        siteConfig.testimonials.forEach(testimonial => {
            const testimonialElement = `
                <div class="testimonial">
                    <p class="quote">${testimonial.text}</p>
                    <div class="author">${testimonial.author}</div>
                    <div class="position">${testimonial.position}</div>
                </div>
            `;
            testimonialsContainer.innerHTML += testimonialElement;
        });
    }
};

toggleTerminal: function() {
    const container = document.querySelector('.terminal-container');
    container.classList.toggle('show');
    const input = document.getElementById('terminal-input');
    if (container.classList.contains('show')) {
        input.focus();
    }
}
