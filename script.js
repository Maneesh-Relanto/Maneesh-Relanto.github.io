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

// GitHub API Integration
const GITHUB_USERNAME = 'Maneesh-Relanto';
const GITHUB_API_BASE = 'https://api.github.com';

// GitHub token will be loaded from config.local.js (gitignored)
// This file is NOT committed to git for security
let GITHUB_TOKEN = '';

// Try to load token from external config (if it exists)
if (typeof window.GITHUB_CONFIG !== 'undefined' && window.GITHUB_CONFIG.token) {
    GITHUB_TOKEN = window.GITHUB_CONFIG.token;
    console.log('✅ GitHub token loaded successfully');
} else {
    console.warn('⚠️ No GitHub token found - clone/view statistics will not be available');
    console.log('To enable statistics, add your token to confidential/config.local.js');
}

// Repository mapping - extract repo names from project cards
const repoMapping = {
    'Gemini3Flash-Powered-AI-Driven-HRMS': 'Gemini3Flash-Powered-AI-Driven-HRMS',
    'Gemini3Flash-Powered-Prediction-Engine-for-Employee-Lifecycle': 'Gemini3Flash-Powered-Prediction-Engine-for-Employee-Lifecycle',
    'Gemini3Flash-Powered-Resume-Builder': 'Gemini3Flash-Powered-Resume-Builder',
    'JSON-Assertion-Library': 'JSON-Assertion-Library',
    'RBAC-algorithm': 'RBAC-algorithm',
    'Rate-Limiter-algorithm': 'Rate-Limiter-algorithm',
    'Progressbar-Slider-Utilities': 'Progressbar-Slider-Utilities',
    'Intelligent-Resume-Builder': 'Intelligent-Resume-Builder'
};

// Global stats tracker
let globalStats = {
    totalClones: 0,
    totalUniqueClones: 0,
    totalViews: 0,
    totalUniqueViews: 0,
    totalPRs: 0,
    totalCommits: 0,
    reposWithData: 0
};

// Store historical data globally for fallback
let historicalTrafficData = null;

// Helper to create headers with optional authentication
function getHeaders() {
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };
    if (GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }
    return headers;
}

// Fetch clone statistics (requires authentication)
async function fetchCloneStats(repoName) {
    try {
        console.log(`📦 Fetching clone stats for ${repoName}...`);
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}/traffic/clones`,
            { headers: getHeaders() }
        );
        
        if (!response.ok) {
            console.warn(`⚠️ Clone stats not available for ${repoName} (Status: ${response.status})`);
            if (response.status === 403) {
                const resetTime = response.headers.get('X-RateLimit-Reset');
                console.error('❌ Rate limit exceeded or insufficient permissions');
            }
            return null;
        }
        
        const data = await response.json();
        
        // Validate response - check for error responses
        if (data.message || data.documentation_url || !data.hasOwnProperty('count')) {
            console.warn(`⚠️ Invalid clone stats response for ${repoName}:`, data.message || 'Unknown error');
            return null;
        }
        
        console.log(`✅ Clone stats for ${repoName}:`, data.count);
        return {
            count: data.count || 0,
            uniques: data.uniques || 0
        };
    } catch (error) {
        console.error(`❌ Error fetching clone stats for ${repoName}:`, error);
        return null;
    }
}

// Fetch view statistics (requires authentication)
async function fetchViewStats(repoName) {
    try {
        console.log(`👁️ Fetching view stats for ${repoName}...`);
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}/traffic/views`,
            { headers: getHeaders() }
        );
        
        if (!response.ok) {
            console.warn(`⚠️ View stats not available for ${repoName} (Status: ${response.status})`);
            return null;
        }
        
        const data = await response.json();
        
        // Validate response - check for error responses
        if (data.message || data.documentation_url || !data.hasOwnProperty('count')) {
            console.warn(`⚠️ Invalid view stats response for ${repoName}:`, data.message || 'Unknown error');
            return null;
        }
        
        console.log(`✅ View stats for ${repoName}:`, data.count);
        return {
            count: data.count || 0,
            uniques: data.uniques || 0
        };
    } catch (error) {
        console.error(`❌ Error fetching view stats for ${repoName}:`, error);
        return null;
    }
}

// Fetch pull request count
async function fetchPRCount(repoName) {
    try {
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}/pulls?state=all&per_page=1`,
            { headers: getHeaders() }
        );
        
        if (!response.ok) return 0;
        
        // Get total count from Link header
        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
            const match = linkHeader.match(/page=(\d+)>; rel="last"/);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        
        // If no pagination, count the results
        const data = await response.json();
        return data.length;
    } catch (error) {
        return 0;
    }
}

// Fetch total commit count
async function fetchCommitCount(repoName) {
    try {
        // Use contributors endpoint which gives commit counts
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}/contributors?per_page=100`,
            { headers: getHeaders() }
        );
        
        if (!response.ok) return 0;
        
        const contributors = await response.json();
        // Sum up all contributions
        return contributors.reduce((sum, contributor) => sum + contributor.contributions, 0);
    } catch (error) {
        return 0;
    }
}

// Fetch repository insights
async function fetchRepoInsights(repoName) {
    try {
        const headers = getHeaders();
        
        // Try to fetch from API first
        const [repoData, languagesData, commitsData, cloneStats, viewStats, prCount, commitCount] = await Promise.all([
            fetch(`${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}`, { headers }).then(r => r.json()).catch(() => ({})),
            fetch(`${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}/languages`, { headers }).then(r => r.json()).catch(() => ({})),
            fetch(`${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repoName}/commits?per_page=1`, { headers }).then(r => r.json()).catch(() => []),
            fetchCloneStats(repoName),
            fetchViewStats(repoName),
            fetchPRCount(repoName),
            fetchCommitCount(repoName)
        ]);
        
        // Fallback logic: API → Historical Data → 0
        let finalCloneStats = cloneStats;
        let finalViewStats = viewStats;
        
        // If API failed, try historical data
        if ((!cloneStats || !viewStats) && historicalTrafficData && historicalTrafficData.repositories[repoName]) {
            const repoHistory = historicalTrafficData.repositories[repoName];
            if (!cloneStats && repoHistory.totalClones) {
                finalCloneStats = { count: repoHistory.totalClones || 0, uniques: 0 };
                console.log(`📊 Fallback: Using historical clone data for ${repoName}: ${finalCloneStats.count}`);
            }
            if (!viewStats && repoHistory.totalViews) {
                finalViewStats = { count: repoHistory.totalViews || 0, uniques: 0 };
                console.log(`📊 Fallback: Using historical view data for ${repoName}: ${finalViewStats.count}`);
            }
        }
        
        // Last resort: if still no data, set to null (will show 0 or N.A in UI)
        if (!finalCloneStats) {
            finalCloneStats = null;
            console.log(`⚠️ No clone data available for ${repoName} (API failed, no historical data)`);
        }
        if (!finalViewStats) {
            finalViewStats = null;
            console.log(`⚠️ No view data available for ${repoName} (API failed, no historical data)`);
        }
        
        // Validate repoData - check for errors
        if (repoData.message || repoData.documentation_url) {
            console.warn(`⚠️ Error fetching repo data for ${repoName}:`, repoData.message || 'Unknown error');
            return null;
        }
        
        // Validate languagesData - remove error fields if present
        const validLanguages = (languagesData && !languagesData.message && !languagesData.documentation_url) 
            ? languagesData 
            : {};

        // Update global stats
        if (finalCloneStats) {
            globalStats.totalClones += finalCloneStats.count;
            globalStats.totalUniqueClones += finalCloneStats.uniques;
            globalStats.reposWithData++;
        }
        if (finalViewStats) {
            globalStats.totalViews += finalViewStats.count;
            globalStats.totalUniqueViews += finalViewStats.uniques;
        }
        globalStats.totalPRs += prCount;
        globalStats.totalCommits += commitCount;
        
        console.log(`📊 Stats for ${repoName}: ${prCount} PRs, ${commitCount} commits`);

        return {
            stars: repoData.stargazers_count || 0,
            forks: repoData.forks_count || 0,
            watchers: repoData.watchers_count || 0,
            openIssues: repoData.open_issues_count || 0,
            languages: validLanguages,
            lastCommit: commitsData[0]?.commit?.author?.date || null,
            description: repoData.description || '',
            topics: repoData.topics || [],
            size: repoData.size || 0,
            clones: finalCloneStats,
            views: finalViewStats,
            prCount: prCount,
            commitCount: commitCount
        };
    } catch (error) {
        console.error(`Error fetching insights for ${repoName}:`, error);
        return null;
    }
}

// Update project card with insights
function updateProjectCard(card, insights) {
    if (!insights) return;

    // Remove loading indicator
    const loader = card.querySelector('.insights-loader');
    if (loader) {
        loader.remove();
    }

    // Create insights container if it doesn't exist
    let insightsContainer = card.querySelector('.project-insights');
    if (!insightsContainer) {
        insightsContainer = document.createElement('div');
        insightsContainer.className = 'project-insights';
        
        // Insert before footer
        const footer = card.querySelector('.project-footer');
        if (footer) {
            card.insertBefore(insightsContainer, footer);
        }
    }

    // Build insights HTML - Only show Clones and Views
    const hasData = insights.clones || insights.views;
    
    const insightsHTML = `
        <div class="insight-stats">
            ${insights.clones && insights.clones.count > 0 ? `
            <div class="insight-stat" title="Total Clones (All-Time from Historical Data)">
                <span class="insight-icon">📦</span>
                <span class="insight-value">${insights.clones.count || 0}</span>
            </div>
            ` : ''}
            ${insights.views && insights.views.count > 0 ? `
            <div class="insight-stat" title="Total Views (All-Time from Historical Data)">
                <span class="insight-icon">👁️</span>
                <span class="insight-value">${insights.views.count || 0}</span>
            </div>
            ` : ''}
            ${!hasData ? `
            <div class="insight-stat" style="opacity: 0.6;" title="No statistics available (API failed, no historical data)">
                <span class="insight-icon">ℹ️</span>
                <span class="insight-value" style="font-size: 0.85rem;">N.A</span>
            </div>
            ` : ''}
        </div>
        ${insights.languages && typeof insights.languages === 'object' && Object.keys(insights.languages).length > 0 ? `
        <div class="language-breakdown">
            ${formatLanguages(insights.languages)}
        </div>
        ` : ''}
    `;

    insightsContainer.innerHTML = insightsHTML;
}

// Format date to relative time
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
}

// Format languages with percentages
function formatLanguages(languages) {
    // Validate input
    if (!languages || typeof languages !== 'object' || Object.keys(languages).length === 0) {
        return '';
    }
    
    // Filter out non-numeric values
    const validLanguages = Object.entries(languages).filter(([lang, bytes]) => 
        typeof bytes === 'number' && bytes > 0 && !isNaN(bytes)
    );
    
    if (validLanguages.length === 0) {
        return '';
    }
    
    const total = validLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);
    
    if (total === 0 || isNaN(total)) {
        return '';
    }
    
    const sortedLangs = validLanguages
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3); // Top 3 languages
    
    return sortedLangs.map(([lang, bytes]) => {
        const percentage = ((bytes / total) * 100).toFixed(1);
        return `<span class="lang-badge">${lang} ${percentage}%</span>`;
    }).join('');
}

// Extract repo name from GitHub URL
function extractRepoName(url) {
    if (!url) return null;
    const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
    return match ? match[1] : null;
}

// Load historical traffic data
async function loadHistoricalData() {
    try {
        const response = await fetch('data/traffic-history.json');
        if (response.ok) {
            const data = await response.json();
            console.log('📊 Loaded historical data:', data);
            return data;
        }
    } catch (error) {
        console.log('ℹ️ No historical data available yet');
    }
    return null;
}

// Update global stats banner
async function updateGlobalStats() {
    console.log('📊 Updating global stats:', globalStats);
    
    // Try to load historical data
    const historicalData = await loadHistoricalData();
    
    // Update hero banner with total PRs
    const prsBanner = document.getElementById('total-prs-banner');
    if (prsBanner) {
        const valueSpan = prsBanner.querySelector('.banner-value');
        const prCount = globalStats.totalPRs || 0;
        valueSpan.textContent = prCount.toLocaleString();
        prsBanner.style.opacity = '1';
    }
    
    // Update hero banner with total commits
    const commitsBanner = document.getElementById('total-commits-banner');
    if (commitsBanner) {
        const valueSpan = commitsBanner.querySelector('.banner-value');
        const commitCount = globalStats.totalCommits || 0;
        valueSpan.textContent = commitCount.toLocaleString();
        commitsBanner.style.opacity = '1';
    }
    
    // Create or update stats summary section
    let statsSummary = document.querySelector('.github-stats-summary');
    if (!statsSummary && (globalStats.totalClones > 0 || globalStats.totalViews > 0 || historicalData)) {
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
    
    // Determine which data to show
    const useHistorical = historicalData && historicalData.totalClones > 0;
    const showLast14Days = globalStats.totalClones > 0 || globalStats.totalViews > 0;
    
    if (statsSummary && (useHistorical || showLast14Days)) {
        const clonesDisplay = useHistorical ? (historicalData.totalClones || 0) : (globalStats.totalClones || 0);
        const viewsDisplay = useHistorical ? (historicalData.totalViews || 0) : (globalStats.totalViews || 0);
        const timeLabel = useHistorical ? 'All-Time' : 'Last 14 Days';
        const lastUpdated = useHistorical ? new Date(historicalData.lastUpdated).toLocaleDateString() : '';
        
        statsSummary.innerHTML = `
            <div class="stats-summary-content">
                <div class="stats-summary-title">
                    <span class="stats-icon">📊</span>
                    <span>Aggregate Repository Statistics ${useHistorical ? '(All-Time)' : '(Last 14 Days)'}</span>
                </div>
                <div class="stats-summary-grid">
                    ${(useHistorical || globalStats.totalClones > 0) ? `
                    <div class="summary-stat">
                        <span class="summary-icon">📦</span>
                        <div class="summary-content">
                            <span class="summary-value">${clonesDisplay.toLocaleString()}</span>
                            <span class="summary-label">Total Clones${useHistorical ? ' (All-Time)' : ''}</span>
                        </div>
                    </div>
                    ${!useHistorical && globalStats.totalUniqueClones > 0 ? `
                    <div class="summary-stat">
                        <span class="summary-icon">👥</span>
                        <div class="summary-content">
                            <span class="summary-value">${(globalStats.totalUniqueClones || 0).toLocaleString()}</span>
                            <span class="summary-label">Unique Cloners</span>
                        </div>
                    </div>
                    ` : ''}
                    ` : ''}
                    ${(useHistorical || globalStats.totalViews > 0) ? `
                    <div class="summary-stat">
                        <span class="summary-icon">👁️</span>
                        <div class="summary-content">
                            <span class="summary-value">${viewsDisplay.toLocaleString()}</span>
                            <span class="summary-label">Total Views${useHistorical ? ' (All-Time)' : ''}</span>
                        </div>
                    </div>
                    ${!useHistorical && globalStats.totalUniqueViews > 0 ? `
                    <div class="summary-stat">
                        <span class="summary-icon">🔍</span>
                        <div class="summary-content">
                            <span class="summary-value">${(globalStats.totalUniqueViews || 0).toLocaleString()}</span>
                            <span class="summary-label">Unique Visitors</span>
                        </div>
                    </div>
                    ` : ''}
                    ` : ''}
                </div>
                ${useHistorical && lastUpdated ? `
                <div class="stats-notice" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2);">
                    <span class="notice-icon">✅</span>
                    <span>Historical tracking active • Last updated: ${lastUpdated}</span>
                </div>
                ` : ''}
                ${!GITHUB_TOKEN && !useHistorical ? `
                <div class="stats-notice">
                    <span class="notice-icon">ℹ️</span>
                    <span>Add a GitHub token to enable clone/view statistics</span>
                </div>
                ` : ''}
            </div>
        `;
    }
}

// Initialize GitHub insights for all project cards
async function initializeGitHubInsights() {
    // Load historical data first for fallback
    historicalTrafficData = await loadHistoricalData();
    
    const projectCards = document.querySelectorAll('.project-card:not(.enterprise-repo)');
    console.log(`🔍 Found ${projectCards.length} public project cards to fetch insights for`);
    
    let processedCount = 0;
    for (const card of projectCards) {
        const projectLink = card.querySelector('.project-link[href*="github.com"]');
        if (projectLink) {
            const repoName = extractRepoName(projectLink.href);
            if (repoName) {
                const insights = await fetchRepoInsights(repoName);
                updateProjectCard(card, insights);
                processedCount++;
            } else {
                // Remove loader even if no repo name found
                const loader = card.querySelector('.insights-loader');
                if (loader) loader.remove();
            }
        } else {
            // Remove loader for cards without GitHub links
            const loader = card.querySelector('.insights-loader');
            if (loader) loader.remove();
        }
    }
    
    console.log(`✅ Processed ${processedCount} repositories`);
    
    // Update global stats after all repos are processed
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