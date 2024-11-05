# Config-Driven Portfolio Template

A lightweight, vanilla JavaScript portfolio template that's fully customizable through a single config file. Perfect for developers who want a clean, professional portfolio without dependencies.

## Features

- 🌗 Light/Dark mode toggle with persistent preference
- 📱 Fully responsive design for all devices
- ⚡ Zero dependencies - pure vanilla JavaScript
- 🎨 Easy customization through single config.js file
- 💼 Project showcase with category filtering
- 👥 Animated testimonials carousel
- 📊 Animated skills progress bars
- 📬 Contact form ready for your preferred email service
- 🔗 Integrated social media links
- 🎯 SEO-friendly structure

## Quick Start

1. Fork this repository
2. Copy the example config file to create your personal config:

cp js/config.example.js js/config.js

3. Edit `js/config.js` with your information
4. Go to Settings > Pages > Build and deployment
5. Set Source to "Deploy from a branch" and select main
6. Enable "Read and write permissions" in Settings > Actions > General
7. Your portfolio is live at `yourusername.github.io`

## File Structure

├── index.html              # Main HTML structure
├── css/
│   └── style.css          # Styles including responsive design
├── js/
│   ├── config.js          # All your personal configuration
│   └── main.js            # Core functionality
└── README.md

## Email Setup

### Using EmailJS (Recommended)
1. Create free account at [EmailJS.com](https://www.emailjs.com/)
2. Create an Email Service:
   - Go to "Email Services" tab
   - Add new service (Gmail, Outlook, or others)
3. Create an Email Template:
   - Go to "Email Templates" tab
   - Create new template
   - Use variables: {{name}}, {{email}}, {{message}}
4. Get your keys:
   - Public Key: Found in Account > API Keys
   - Service ID: Found in Email Services tab
   - Template ID: Found in Email Templates tab
5. Update your config.js:
```javascript
contactConfig: {
    emailService: "emailjs",
    emailjsConfig: {
        serviceId: "your_service_id",
        templateId: "your_template_id",
        userId: "your_public_key"
    }
}
