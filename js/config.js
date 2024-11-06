window.siteConfig = {
    // Demo Config
    name: "Dev Debuggington III",
    title: "Digital Alchemist",
    location: "Localhost Sweet Localhost",
    email: "bugs.are.features@dev.net",

    skills: [
        { name: "Bug Whispering", percent: 92 },
        { name: "Coffee IV Drip Management", percent: 150 },
        { name: "Stack Overflow Diplomacy", percent: 88 },
        { name: "Ctrl+Z Mastery", percent: 95 },
        { name: "Documentation Time Travel", percent: 85 }
    ],
    social: {
        github: "https://github.com/yourusername",
        linkedin: "https://linkedin.com/in/yourusername",
        twitter: "https://twitter.com/yourusername"
    },
    projects: [
        {
            title: "Infinite Loop Resort & Spa",
            description: "A relaxing getaway for exhausted functions. Features include exception handling pools and garbage collection services.",
            technologies: ["Relax.js", "Spa.css", "ZenAPI"],
            category: "wellness",
            liveUrl: "#",
            sourceUrl: "#"
        },
        {
            title: "404 Found",
            description: "Finally, a search engine that finds pages that don't exist. Revolutionary!",
            technologies: ["Paradox.js", "Quantum.css", "SchrödingerAPI"],
            category: "innovation",
            liveUrl: "#",
            sourceUrl: "#"
        },
        {
            title: "The Matrix Calculator",
            description: "Calculates the probability that we're living in a simulation. Spoiler: It's always 100%.",
            technologies: ["RedPill.js", "BluePill.css", "NeoScript"],
            category: "reality",
            liveUrl: "#",
            sourceUrl: "#"
        }
    ],

    testimonials: [
        {
            text: "They turned my callback hell into callback heaven!",
            author: "Async Await",
            position: "Promise Architect"
        },
        {
            text: "My code now runs so fast it finished before I wrote it",
            author: "Dr. Timeline",
            position: "Temporal Developer"
        },
        {
            text: "Finally, someone who speaks fluent Binary!",
            author: "Robot R2",
            position: "AI Whisperer"
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
            serviceId: "service_qzfuapq",
            templateId: "template_mfah1c7",
            userId: "zo1zlg8u_NcFbPQdC"
        }
    },

 // Hidden features that respond to specific terminal commands
    easterEggs: {
        konami: "⬆️⬆️⬇️⬇️⬅️➡️⬅️➡️BA unlocks the secret theme!",
        coffee: "☕".repeat(42),
        meaning: 42,
        secretTheme: {
            matrix: {
                primary: "#00ff00",
                secondary: "#003300",
                background: "#000000",
                text: "#00ff00"
            }
        }
    },

    // Hidden project that appears at midnight
    secretProject: {
        title: "Project Sandman",
        description: "A revolutionary app that writes code while you sleep. Warning: May cause sleep coding.",
        technologies: ["Dream.js", "REM.css", "Snooze.io"]
    }
};
