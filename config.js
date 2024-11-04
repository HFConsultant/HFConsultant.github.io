const siteConfig = {
    // Personal Information
    name: "Your Name",
    title: "Full Stack Developer",
    email: "your.email@example.com",
    location: "City, Country",

    // Social Media Links
    social: {
        github: "https://github.com/yourusername",
        linkedin: "https://linkedin.com/in/yourusername",
        twitter: "https://twitter.com/yourusername",
    },

    // Skills Configuration
    skills: [
        {
            name: "Frontend",
            percent: 85,
            technologies: ["HTML", "CSS", "JavaScript", "React"]
        },
        {
            name: "Backend",
            percent: 75,
            technologies: ["Node.js", "Python", "SQL"]
        },
        {
            name: "DevOps",
            percent: 70,
            technologies: ["Docker", "AWS", "CI/CD"]
        }
    ],

    // Projects Configuration
    projects: [
        {
            title: "E-commerce Platform",
            description: "Full-featured online store with payment integration",
            category: "fullstack",
            technologies: ["React", "Node.js", "MongoDB"],
            image: "images/project1.jpg",
            liveUrl: "https://project1.com",
            sourceUrl: "https://github.com/yourusername/project1"
        },
        {
            title: "Portfolio Website",
            description: "Responsive personal portfolio",
            category: "frontend",
            technologies: ["HTML", "CSS", "JavaScript"],
            image: "images/project2.jpg",
            liveUrl: "https://project2.com",
            sourceUrl: "https://github.com/yourusername/project2"
        }
    ],

    // Testimonials Configuration
    testimonials: [
        {
            text: "Outstanding work and attention to detail!",
            author: "John Doe",
            position: "CEO, Tech Corp",
            image: "images/testimonial1.jpg"
        },
        {
            text: "Excellent communication and project delivery.",
            author: "Jane Smith",
            position: "Product Manager",
            image: "images/testimonial2.jpg"
        }
    ],

    // Theme Configuration
    theme: {
        light: {
            primary: "#00ff9d",
            secondary: "#333333",
            background: "#ffffff",
            text: "#333333"
        },
        dark: {
            primary: "#00ff9d",
            secondary: "#f5f5f5",
            background: "#1a1a1a",
            text: "#ffffff"
        }
    },

    // Contact Form Configuration
    contactConfig: {
        emailService: "emailjs", // or any other service
        emailjsConfig: {
            serviceId: "YOUR_SERVICE_ID",
            templateId: "YOUR_TEMPLATE_ID",
            userId: "YOUR_USER_ID"
        }
    }
};

export default siteConfig;
