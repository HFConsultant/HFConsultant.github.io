// smooth scrolling for navigation
document.querySelectorAll('nav a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const section = document.querySelector(this.getAttribute('href'));
        section.scrollIntoView({ behavior: 'smooth' });
    });
});

// simple animation when the page loads
window.addEventListener('load', () => {
    const heading = document.querySelector('h1');
    heading.style.opacity = '0';
    heading.style.transition = 'opacity 1s ease-in';

    setTimeout(() => {
        heading.style.opacity = '1';
    }, 200);
});
