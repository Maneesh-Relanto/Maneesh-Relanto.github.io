#!/usr/bin/env node

/**
 * Collect GitHub Repository Traffic Statistics
 * Fetches clone and view data for all repositories and maintains historical records
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'Maneesh-Relanto';
const GITHUB_API_BASE = 'https://api.github.com';
const DATA_FILE = path.join(__dirname, '../data/traffic-history.json');

// Repositories to track
const REPOS = [
    'Gemini3Flash-Powered-AI-Driven-HRMS',
    'Gemini3Flash-Powered-Prediction-Engine-for-Employee-Lifecycle',
    'Gemini3Flash-Powered-Resume-Builder',
    'JSON-Assertion-Library',
    'RBAC-algorithm',
    'Rate-Limiter-algorithm',
    'Progressbar-Slider-Utilities',
    'Intelligent-Resume-Builder',
    'Privacy-Focused-Web-Analytics-Dashboard',
    'os-hiring-hare',
    'SudokuSandbox'
];

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'GitHub-Traffic-Collector',
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${GITHUB_TOKEN}`
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    console.error(`Failed to fetch ${url}: ${res.statusCode}`);
                    resolve(null);
                }
            });
        }).on('error', reject);
    });
}

async function fetchTrafficData(repo) {
    const clonesUrl = `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo}/traffic/clones`;
    const viewsUrl = `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo}/traffic/views`;

    const [clones, views] = await Promise.all([
        makeRequest(clonesUrl),
        makeRequest(viewsUrl)
    ]);

    return {
        repo,
        date: new Date().toISOString().split('T')[0],
        clones: clones ? {
            count: clones.count || 0,
            uniques: clones.uniques || 0
        } : { count: 0, uniques: 0 },
        views: views ? {
            count: views.count || 0,
            uniques: views.uniques || 0
        } : { count: 0, uniques: 0 }
    };
}

function loadHistoricalData() {
    if (fs.existsSync(DATA_FILE)) {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(content);
    }
    return {
        lastUpdated: null,
        totalClones: 0,
        totalViews: 0,
        repositories: {}
    };
}

function saveHistoricalData(data) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function main() {
    console.log('🚀 Starting traffic statistics collection...');
    console.log(`📅 Date: ${new Date().toISOString()}`);

    if (!GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN environment variable is not set');
        process.exit(1);
    }

    const historicalData = loadHistoricalData();
    const today = new Date().toISOString().split('T')[0];

    console.log(`📊 Fetching data for ${REPOS.length} repositories...`);

    let totalClonesIncrement = 0;
    let totalViewsIncrement = 0;

    for (const repo of REPOS) {
        try {
            console.log(`  📦 ${repo}...`);
            const data = await fetchTrafficData(repo);

            // Initialize repo data if not exists
            if (!historicalData.repositories[repo]) {
                historicalData.repositories[repo] = {
                    totalClones: 0,
                    totalViews: 0,
                    history: []
                };
            }

            const repoData = historicalData.repositories[repo];
            
            // Check if we already have data for today
            const todayEntry = repoData.history.find(h => h.date === today);
            
            if (!todayEntry) {
                // Add new entry
                repoData.history.push({
                    date: today,
                    clones: data.clones.count,
                    views: data.views.count
                });
                
                // Update totals (add the 14-day count on first collection)
                // On subsequent days, we'll add the delta
                if (repoData.history.length === 1) {
                    repoData.totalClones += data.clones.count;
                    repoData.totalViews += data.views.count;
                    totalClonesIncrement += data.clones.count;
                    totalViewsIncrement += data.views.count;
                } else {
                    // Calculate delta from yesterday
                    const yesterday = repoData.history[repoData.history.length - 2];
                    const clonesDelta = Math.max(0, data.clones.count - yesterday.clones);
                    const viewsDelta = Math.max(0, data.views.count - yesterday.views);
                    
                    repoData.totalClones += clonesDelta;
                    repoData.totalViews += viewsDelta;
                    totalClonesIncrement += clonesDelta;
                    totalViewsIncrement += viewsDelta;
                }
                
                console.log(`    ✅ ${data.clones.count} clones, ${data.views.count} views (last 14 days)`);
            } else {
                console.log(`    ⏭️  Data already collected for today`);
            }

            // Keep only last 90 days of detailed history to avoid file bloat
            if (repoData.history.length > 90) {
                repoData.history = repoData.history.slice(-90);
            }

        } catch (error) {
            console.error(`  ❌ Error fetching data for ${repo}:`, error.message);
        }

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update global totals
    historicalData.totalClones += totalClonesIncrement;
    historicalData.totalViews += totalViewsIncrement;
    historicalData.lastUpdated = new Date().toISOString();

    saveHistoricalData(historicalData);

    console.log('\n📈 Summary:');
    console.log(`  Total Clones (all-time): ${historicalData.totalClones.toLocaleString()}`);
    console.log(`  Total Views (all-time): ${historicalData.totalViews.toLocaleString()}`);
    console.log(`  Today's increment: +${totalClonesIncrement} clones, +${totalViewsIncrement} views`);
    console.log('\n✅ Traffic statistics updated successfully!');
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
