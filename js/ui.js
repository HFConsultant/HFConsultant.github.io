// Create UI namespace
window.ui = {
    typeText: function(siteConfig) {
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
    },
    animateProgressBars: function(skills) {
        const progressBars = document.querySelectorAll('.progress-bar');
        progressBars.forEach((bar, index) => {
            const percent = skills[index].percent;
            bar.style.setProperty('--progress', percent + '%');
            bar.style.width = percent + '%';
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
    applyTheme: function(theme, themeColors) {
        const root = document.documentElement;
        root.style.setProperty('--primary-color', themeColors[theme].primary);
        root.style.setProperty('--secondary-color', themeColors[theme].secondary);
        root.style.setProperty('--background-color', themeColors[theme].background);
        root.style.setProperty('--text-color', themeColors[theme].text);
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
    }
};
