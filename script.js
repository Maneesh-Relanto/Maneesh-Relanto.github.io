// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
    } else {
        navbar.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
    }
});

// Mobile menu toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// Close mobile menu when clicking a link
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// Project Filter Functionality
const filterBtns = document.querySelectorAll('.filter-btn');
const projectCards = document.querySelectorAll('.project-card');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active button
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        
        projectCards.forEach(card => {
            if (filter === 'all' || card.dataset.category === filter) {
                card.style.display = 'flex';
                card.style.animation = 'fadeIn 0.4s ease forwards';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections and cards
document.querySelectorAll('section, .project-card, .expertise-card, .achievement-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// GitHub Stats Integration - Using Historical Data Only
const GITHUB_USERNAME = 'Maneesh-Relanto';

// All stats are read from traffic-history.json (updated daily by GitHub Actions)
console.log('📊 Loading stats from historical data file...');

// Load historical traffic data
async function loadHistoricalData() {
    try {
        const response = await fetch('data/traffic-history.json');
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Loaded historical data:', data);
            return data;
        }
    } catch (error) {
        console.error('❌ Failed to load historical data:', error);
    }
    return null;
}

// Store historical data globally
let historicalTrafficData = null;

// Get repository insights from historical data
function getRepoInsights(repoName) {
    if (!historicalTrafficData || !historicalTrafficData.repositories[repoName]) {
        console.warn(`⚠️ No historical data found for ${repoName}`);
        return null;
    }
    
    const repoData = historicalTrafficData.repositories[repoName];
    console.log(`📊 Loaded stats for ${repoName}: ${repoData.totalClones} clones, ${repoData.totalViews} views`);
    
    return {
        clones: repoData.totalClones > 0 ? { count: repoData.totalClones, uniques: 0 } : null,
        views: repoData.totalViews > 0 ? { count: repoData.totalViews, uniques: 0 } : null
    };
}

// Update project card with insights from historical data
function updateProjectCard(card, insights) {
    // Remove loading indicator
    const loader = card.querySelector('.insights-loader');
    if (loader) {
        loader.remove();
    }
    
    // Create insights container
    let insightsContainer = card.querySelector('.project-insights');
    if (!insightsContainer) {
        insightsContainer = document.createElement('div');
        insightsContainer.className = 'project-insights';
        const footer = card.querySelector('.project-footer');
        if (footer) {
            card.insertBefore(insightsContainer, footer);
        }
    }
    
    // If no insights, show N.A
    if (!insights) {
        insightsContainer.innerHTML = `
            <div class="insight-stats">
                <div class="insight-stat" style="opacity: 0.6;" title="No data available">
                    <span class="insight-icon">ℹ️</span>
                    <span class="insight-value" style="font-size: 0.85rem;">N.A</span>
                </div>
            </div>
        `;
        return;
    }
    
    // Build insights HTML from historical data
    const hasData = insights.clones || insights.views;
    
    const insightsHTML = `
        <div class="insight-stats">
            ${insights.clones && insights.clones.count > 0 ? `
            <div class="insight-stat" title="Total Clones (All-Time)">
                <span class="insight-icon">📦</span>
                <span class="insight-value">${insights.clones.count.toLocaleString()}</span>
            </div>
            ` : ''}
            ${insights.views && insights.views.count > 0 ? `
            <div class="insight-stat" title="Total Views (All-Time)">
                <span class="insight-icon">👁️</span>
                <span class="insight-value">${insights.views.count.toLocaleString()}</span>
            </div>
            ` : ''}
            ${!hasData ? `
            <div class="insight-stat" style="opacity: 0.6;" title="No statistics available">
                <span class="insight-icon">ℹ️</span>
                <span class="insight-value" style="font-size: 0.85rem;">N.A</span>
            </div>
            ` : ''}
        </div>
    `;

    insightsContainer.innerHTML = insightsHTML;
}

// Extract repo name from GitHub URL
function extractRepoName(url) {
    if (!url) return null;
    const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
    return match ? match[1] : null;
}

// Update global stats banner from historical data
async function updateGlobalStats() {
    console.log('📊 Updating global stats from historical data');
    
    if (!historicalTrafficData) {
        console.warn('⚠️ No historical data available');
        return;
    }
    
    // Update contributions banner from historical data
    const contributionsBanner = document.getElementById('total-contributions-banner');
    if (contributionsBanner) {
        contributionsBanner.textContent = (historicalTrafficData.totalContributions || 0).toLocaleString();
        contributionsBanner.style.opacity = '1';
    }
    
    // Update hero banner with all metrics from historical data
    const prsBanner = document.getElementById('total-prs-banner');
    if (prsBanner) {
        prsBanner.textContent = (historicalTrafficData.totalPRs || 0).toLocaleString();
        prsBanner.style.opacity = '1';
    }
    
    const commitsBanner = document.getElementById('total-commits-banner');
    if (commitsBanner) {
        commitsBanner.textContent = (historicalTrafficData.totalCommits || 0).toLocaleString();
        commitsBanner.style.opacity = '1';
    }
    
    // Create or update stats summary section
    let statsSummary = document.querySelector('.github-stats-summary');
    if (!statsSummary && historicalTrafficData && historicalTrafficData.totalClones > 0) {
        statsSummary = document.createElement('div');
        statsSummary.className = 'github-stats-summary';
        
        const projectsSection = document.querySelector('#projects .container');
        if (projectsSection) {
            const header = projectsSection.querySelector('.section-header');
            if (header) {
                header.insertAdjacentElement('afterend', statsSummary);
            }
        }
    }
    
    // Display aggregate stats from historical data
    if (statsSummary && historicalTrafficData) {
        const clonesDisplay = historicalTrafficData.totalClones || 0;
        const viewsDisplay = historicalTrafficData.totalViews || 0;
        const lastUpdated = new Date(historicalTrafficData.lastUpdated).toLocaleDateString();
        
        statsSummary.innerHTML = `
            <div class="stats-summary-content">
                <div class="stats-summary-title">
                    <span class="stats-icon">📊</span>
                    <span>Aggregate Repository Statistics (All-Time)</span>
                </div>
                <div class="stats-summary-grid">
                    <div class="summary-stat">
                        <span class="summary-icon">📦</span>
                        <div class="summary-content">
                            <span class="summary-value">${clonesDisplay.toLocaleString()}</span>
                            <span class="summary-label">Total Clones</span>
                        </div>
                    </div>
                    <div class="summary-stat">
                        <span class="summary-icon">👁️</span>
                        <div class="summary-content">
                            <span class="summary-value">${viewsDisplay.toLocaleString()}</span>
                            <span class="summary-label">Total Views</span>
                        </div>
                    </div>
                </div>
                <div class="stats-notice" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2);">
                    <span class="notice-icon">✅</span>
                    <span>Updated daily via GitHub Actions • Last updated: ${lastUpdated}</span>
                </div>
            </div>
        `;
    }
}

// Initialize GitHub insights from historical data
async function initializeGitHubInsights() {
    // Load historical data
    historicalTrafficData = await loadHistoricalData();
    
    if (!historicalTrafficData) {
        console.error('❌ Failed to load historical traffic data');
        return;
    }
    
    const projectCards = document.querySelectorAll('.project-card:not(.enterprise-repo)');
    console.log(`🔍 Found ${projectCards.length} public project cards to populate`);
    
    let processedCount = 0;
    for (const card of projectCards) {
        const projectLink = card.querySelector('.project-link[href*="github.com"]');
        if (projectLink) {
            const repoName = extractRepoName(projectLink.href);
            if (repoName) {
                const insights = getRepoInsights(repoName);
                updateProjectCard(card, insights);
                processedCount++;
            } else {
                // Remove loader if no repo name found
                const loader = card.querySelector('.insights-loader');
                if (loader) loader.remove();
            }
        } else {
            // Remove loader for cards without GitHub links
            const loader = card.querySelector('.insights-loader');
            if (loader) loader.remove();
        }
    }
    
    console.log(`✅ Populated ${processedCount} repositories with historical data`);
    
    // Update global stats
    updateGlobalStats();
}

// Add loading indicator for insights
function showInsightsLoading() {
    const projectCards = document.querySelectorAll('.project-card:not(.enterprise-repo)');
    projectCards.forEach(card => {
        const footer = card.querySelector('.project-footer');
        if (footer && card.querySelector('.project-link[href*="github.com"]')) {
            const loader = document.createElement('div');
            loader.className = 'insights-loader';
            loader.innerHTML = '<span class="loader-dot"></span><span class="loader-dot"></span><span class="loader-dot"></span>';
            card.insertBefore(loader, footer);
        }
    });
}

// Initialize insights on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        showInsightsLoading();
        initializeGitHubInsights();
    });
} else {
    showInsightsLoading();
    initializeGitHubInsights();
}

// Add active state to navigation based on scroll position
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        const navLink = document.querySelector(`.nav-menu a[href="#${sectionId}"]`);

        if (navLink) {
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                navLink.style.color = 'var(--primary)';
                navLink.style.fontWeight = '600';
            } else {
                navLink.style.color = 'var(--text-secondary)';
                navLink.style.fontWeight = '500';
            }
        }
    });
});

// Counter animation for stats
const animateCounter = (element, target) => {
    let current = 0;
    const increment = target / 50;
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 30);
};

// Trigger counter animation when hero section is visible
const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.querySelectorAll('.stat-number').forEach(stat => {
                    const value = parseInt(stat.textContent);
                    stat.textContent = '0';
                    animateCounter(stat, value);
                });
                statsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    statsObserver.observe(heroStats);
}