#!/usr/bin/env node

/**
 * Collect GitHub Repository Traffic Statistics
 *
 * Uses the GitHub ?per=day traffic API to fetch individual daily clone/view counts
 * (up to last 14 days) for every repository. Each run upserts those daily values into
 * the history store, and totals are recalculated from scratch as the sum of all stored
 * daily entries. This makes all counts immune to GitHub's API processing lag — if a
 * day's count is updated later by GitHub, the next run will correct it automatically.
 *
 * Schema v2: history entries store per-day actual counts, not rolling-window snapshots.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.STATS_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'Maneesh-Relanto';
const GITHUB_API_BASE = 'https://api.github.com';
const DATA_FILE = path.join(__dirname, '../data/traffic-history.json');
const PORTFOLIO_REPO = 'Maneesh-Relanto.github.io'; // Exclude this repo from tracking
const EXCLUDED_REPOS = [
    'AWS---Hackathon---KIRO' // Excluded from tracking
];
const SCHEMA_VERSION = 2;

// Will be populated dynamically from GitHub API
let REPOS = [];

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
                    resolve({
                        data: JSON.parse(data),
                        headers: res.headers
                    });
                } else {
                    console.error(`Failed to fetch ${url}: ${res.statusCode}`);
                    resolve({
                        data: null,
                        headers: {}
                    });
                }
            });
        }).on('error', reject);
    });
}

async function fetchAllPublicRepos() {
    console.log('🔍 Fetching all public repositories...');
    const repos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `${GITHUB_API_BASE}/users/${GITHUB_USERNAME}/repos?type=public&per_page=100&page=${page}`;
        const response = await makeRequest(url);
        
        if (!response.data || response.data.length === 0) {
            hasMore = false;
            break;
        }

        // Filter out the portfolio site itself and any explicitly excluded repos
        response.data.forEach(repo => {
            if (repo.name !== PORTFOLIO_REPO && !EXCLUDED_REPOS.includes(repo.name)) {
                repos.push(repo.name);
            }
        });

        page++;
    }

    console.log(`✅ Found ${repos.length} public repositories (excluding ${PORTFOLIO_REPO})`);
    return repos;
}

async function fetchTrafficData(repo) {
    // Use ?per=day to get individual daily counts (up to 14 days back)
    // Response shape: { count, uniques, clones: [{timestamp, count, uniques}, ...] }
    const clonesUrl = `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo}/traffic/clones?per=day`;
    const viewsUrl  = `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo}/traffic/views?per=day`;
    const prsUrl = `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo}/pulls?state=all&per_page=100`;
    const contributorsUrl = `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo}/contributors?per_page=100`;

    const [clonesRes, viewsRes, prsRes, contributorsRes] = await Promise.all([
        makeRequest(clonesUrl),
        makeRequest(viewsUrl),
        makeRequest(prsUrl),
        makeRequest(contributorsUrl)
    ]);

    // Extract PR count
    let prCount = 0;
    if (prsRes.headers.link) {
        const lastMatch = prsRes.headers.link.match(/page=(\d+)>;\s*rel="last"/);
        if (lastMatch) {
            prCount = parseInt(lastMatch[1], 10) * 100;
        } else if (prsRes.data && Array.isArray(prsRes.data)) {
            prCount = prsRes.data.length;
        }
    } else if (prsRes.data && Array.isArray(prsRes.data)) {
        prCount = prsRes.data.length;
    }

    // Calculate total commits from contributors
    let commitCount = 0;
    if (contributorsRes.data && Array.isArray(contributorsRes.data)) {
        commitCount = contributorsRes.data.reduce((sum, c) => sum + (c.contributions || 0), 0);
    }

    // Parse per-day arrays — each entry is the actual count for that specific date
    const clonesByDay = (clonesRes.data && Array.isArray(clonesRes.data.clones))
        ? clonesRes.data.clones.map(entry => ({
            date:    entry.timestamp.split('T')[0],
            count:   entry.count   || 0,
            uniques: entry.uniques || 0
        }))
        : [];

    const viewsByDay = (viewsRes.data && Array.isArray(viewsRes.data.views))
        ? viewsRes.data.views.map(entry => ({
            date:    entry.timestamp.split('T')[0],
            count:   entry.count   || 0,
            uniques: entry.uniques || 0
        }))
        : [];

    return { repo, clonesByDay, viewsByDay, prs: prCount, commits: commitCount };
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
        totalPRs: 0,
        totalCommits: 0,
        totalContributions: 0,
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
    console.log('🚀 Starting traffic statistics collection (per-day mode)...');
    console.log(`📅 Date: ${new Date().toISOString()}`);

    if (!GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN environment variable is not set');
        process.exit(1);
    }

    // Dynamically fetch all public repos
    REPOS = await fetchAllPublicRepos();

    if (REPOS.length === 0) {
        console.error('❌ No public repositories found');
        process.exit(1);
    }

    const historicalData = loadHistoricalData();

    // ── Schema migration ────────────────────────────────────────────────────────
    // v1 history entries stored rolling 14-day window totals (not per-day counts).
    // Summing those would massively overcount. On first run of v2 we wipe history
    // and totalClones/totalViews for every repo so they rebuild from accurate
    // per-day data. PRs and commits are unaffected (they're point-in-time counts).
    if (!historicalData.schemaVersion || historicalData.schemaVersion < SCHEMA_VERSION) {
        console.log('🔄 Migrating to per-day schema (v2) — resetting clone/view history...');
        for (const repoName in historicalData.repositories) {
            historicalData.repositories[repoName].history     = [];
            historicalData.repositories[repoName].totalClones = 0;
            historicalData.repositories[repoName].totalViews  = 0;
        }
        historicalData.totalClones     = 0;
        historicalData.totalViews      = 0;
        historicalData.schemaVersion   = SCHEMA_VERSION;
        console.log('✅ Migration complete — will rebuild from last 14 days of per-day data');
    }
    // ────────────────────────────────────────────────────────────────────────────

    console.log(`📊 Fetching per-day traffic for ${REPOS.length} repositories...`);

    for (const repo of REPOS) {
        try {
            console.log(`  📦 ${repo}...`);
            const data = await fetchTrafficData(repo);

            // Initialize repo entry if it doesn't exist yet
            if (!historicalData.repositories[repo]) {
                historicalData.repositories[repo] = {
                    totalClones: 0,
                    totalViews:  0,
                    totalPRs:    0,
                    totalCommits: 0,
                    history: []
                };
            }

            const repoData = historicalData.repositories[repo];

            // Build a date-keyed map for O(1) upserts
            const historyByDate = {};
            repoData.history.forEach(entry => { historyByDate[entry.date] = entry; });

            // Upsert each day's clone count from the API response
            data.clonesByDay.forEach(({ date, count, uniques }) => {
                if (historyByDate[date]) {
                    historyByDate[date].clones        = count;
                    historyByDate[date].clonesUniques = uniques;
                } else {
                    historyByDate[date] = { date, clones: count, clonesUniques: uniques, views: 0, viewsUniques: 0 };
                }
            });

            // Upsert each day's view count from the API response
            data.viewsByDay.forEach(({ date, count, uniques }) => {
                if (historyByDate[date]) {
                    historyByDate[date].views        = count;
                    historyByDate[date].viewsUniques = uniques;
                } else {
                    historyByDate[date] = { date, clones: 0, clonesUniques: 0, views: count, viewsUniques: uniques };
                }
            });

            // Rebuild sorted history array and cap at 90 days
            repoData.history = Object.values(historyByDate)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(-90);

            // Recalculate totals from scratch — sum of all stored daily values
            repoData.totalClones  = repoData.history.reduce((sum, e) => sum + (e.clones || 0), 0);
            repoData.totalViews   = repoData.history.reduce((sum, e) => sum + (e.views  || 0), 0);
            repoData.totalPRs     = data.prs;
            repoData.totalCommits = data.commits;

            console.log(`    ✅ ${repoData.totalClones} clones across ${repoData.history.length} days | ${repoData.totalViews} views | ${data.prs} PRs | ${data.commits} commits`);

        } catch (error) {
            console.error(`  ❌ Error fetching data for ${repo}:`, error.message);
        }

        // Rate limiting: 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Recalculate all global totals by summing repo-level totals
    historicalData.totalClones  = 0;
    historicalData.totalViews   = 0;
    historicalData.totalPRs     = 0;
    historicalData.totalCommits = 0;

    for (const repoName in historicalData.repositories) {
        const repo = historicalData.repositories[repoName];
        historicalData.totalClones  += repo.totalClones  || 0;
        historicalData.totalViews   += repo.totalViews   || 0;
        historicalData.totalPRs     += repo.totalPRs     || 0;
        historicalData.totalCommits += repo.totalCommits || 0;
    }

    // Contributions = commits + (PRs × 10) — PRs weighted higher as larger units of work
    historicalData.totalContributions = historicalData.totalCommits + (historicalData.totalPRs * 10);
    historicalData.lastUpdated = new Date().toISOString();

    saveHistoricalData(historicalData);

    console.log('\n📈 Summary:');
    console.log(`  Total Clones  (per-day accurate): ${historicalData.totalClones.toLocaleString()}`);
    console.log(`  Total Views   (per-day accurate): ${historicalData.totalViews.toLocaleString()}`);
    console.log(`  Total PRs:    ${historicalData.totalPRs.toLocaleString()}`);
    console.log(`  Total Commits: ${historicalData.totalCommits.toLocaleString()}`);
    console.log(`  Total Contributions: ${historicalData.totalContributions.toLocaleString()}`);
    console.log('\n✅ Traffic statistics updated successfully!');
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
