# Severna Park Fitness Club Landing Page

A professional, responsive landing page for Severna Park Fitness Club showcasing services, member testimonials, and member signup functionality.

## Overview

This standalone HTML landing page presents the fitness club with:
- Eye-catching hero section with call-to-action buttons
- Service showcase (racquetball, fitness, aquatics, youth programs)
- Member testimonials
- Newsletter/membership signup form
- Professional styling with responsive design

## Technology Stack

- **Language**: Pure HTML5, CSS3, and vanilla JavaScript
- **No Build Required**: Self-contained single file (ready to deploy)
- **Responsive**: Mobile-first design with media queries
- **Accessible**: Semantic HTML with proper heading hierarchy

## File Structure

```
fitness-club/
└── fitness-club.html        # Complete standalone landing page
```

## Features

### Sections

1. **Hero Section**
   - Large background gradient banner
   - Branded headline and tagline
   - Two prominent call-to-action buttons
   - (Can link to membership signup or contact page)

2. **Services Grid**
   - Four service cards (Racquetball, Fitness Center, Aquatics, Youth Programs)
   - Professional icons/imagery placeholders
   - Service descriptions
   - Hover effects for interactivity

3. **Testimonials**
   - Member success stories and quotes
   - Star ratings
   - Professional layout showcasing member feedback

4. **Membership Signup**
   - Simple form collection (name, email)
   - Form validation (required fields, email format)
   - Submission handler with user feedback
   - Currently shows success message in-page

### Responsive Design

- Works on mobile (320px+), tablets, and desktop screens
- Flexible grid layouts that adapt to screen size
- Touch-friendly button sizes
- Readable typography at all breakpoints

## Customization

Edit `fitness-club.html` to customize:

- **Business Name**: Change "Severna Park Fitness Club" throughout
- **Services**: Modify the 4 service cards in the services section
- **Testimonials**: Update member quotes and names
- **Colors**: Modify CSS color values (currently using professional blues and gradients)
- **Contact/Links**: Update button links and form action endpoint
- **Images**: Replace placeholder backgrounds with actual club photos

## Form Submission

Currently, the signup form:
1. Validates required fields (name, email)
2. Validates email format
3. Shows success message and clears form on valid submission

To connect to a backend:
- Update the `<form>` element's `action` attribute to your endpoint
- Modify the JavaScript form handler to POST to your backend service
- Or use a form service like Formspree or Basin for email submissions

## Deployment

### Standalone (Plain HTTP)
Simply upload `fitness-club.html` to your web server:
```bash
scp fitness-club.html user@server:/var/www/html/
```

### Shared Monorepo (with IoT Dashboard)
The file is deployed alongside the Sentinel IoT Dashboard through the main deployment script:
```bash
./scripts/deploy.ps1
```

Update `scripts/deploy.ps1` to handle multi-app deployment if needed.

## Performance

- Single-file deployment (no build process)
- Minimal JavaScript (form validation only)
- Inline CSS (no external stylesheet requests)
- Fast loading on mobile networks

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design works on all devices
- JavaScript required for form validation (graceful degradation available)

## Future Enhancements

- Photo galleries of facilities
- Class schedule integration
- Online payment for memberships
- Blog or news section
- Staff directory
- Google Maps integration for location

---

**Business**: Severna Park Fitness Club
**Version**: 1.0.0
