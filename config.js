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
        // Add more skills...
    ],

    // Projects Configuration
    projects: [
        {
            title: "Project Name",
            description: "Project description",
            category: "frontend",
            technologies: ["React", "Node.js", "MongoDB"],
            liveUrl: "https://project.com",
            sourceUrl: "https://github.com/project"
        }
        // Add more projects...
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
        primary: "#00ff9d",  // Accent color
        secondary: "#333333", // Secondary color
        background: "#ffffff", // Background color
        text: "#333333"      // Text color
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
