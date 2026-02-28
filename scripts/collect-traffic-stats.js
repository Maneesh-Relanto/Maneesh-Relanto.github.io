#!/usr/bin/env node

/**
 * Collect GitHub Repository Traffic Statistics
 *
 * ALL-TIME COUNTING STRATEGY
 * ──────────────────────────
 * GitHub's Traffic API only exposes the last 14 days of clone/view data.
 * To maintain accurate all-time totals we use a two-tier accumulator per repo:
 *
 *   totalClones = legacyOffset.clones  +  sum(history[*].clones)
 *                 ↑ all-time count           ↑ per-day count
 *                   before v2 migration        since v2 migration
 *
 * legacyOffset is set ONCE during v1→v2 migration and is never zeroed again.
 * When daily history entries age beyond 365 days they are absorbed back into
 * legacyOffset before being dropped, so the all-time total never shrinks.
 *
 * Each daily run upserts per-day values for the last 14 days, so any data
 * GitHub was still processing at a previous run gets corrected automatically.
 *
 * Schema v2: history entries store per-day actual counts (not rolling-window
 *            snapshots). legacyOffset preserves pre-migration all-time counts.
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
const HISTORY_RETENTION_DAYS = 365; // keep 1 year of per-day detail

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
    console.log('🚀 Starting traffic statistics collection (all-time accumulator)...');
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

    // ── Schema v1 → v2 migration ────────────────────────────────────────────────
    //
    // v1 stored rolling 14-day window TOTALS as a single number per run — summing
    // those would massively overcount. On the first v2 run we:
    //
    //   1. Snapshot each repo's current v1 totalClones / totalViews into a
    //      legacyOffset object — these represent ALL activity before this run.
    //   2. Clear the v1-style history[] so it rebuilds from accurate per-day data.
    //   3. Keep PRs and commits — they are already correct point-in-time counts.
    //
    // legacyOffset is NEVER zeroed again. It is the permanent baseline for all
    // time before this tool started recording per-day data.
    //
    if (!historicalData.schemaVersion || historicalData.schemaVersion < SCHEMA_VERSION) {
        console.log('🔄 Migrating to all-time accumulator schema (v2)...');
        let migratedRepos = 0;
        for (const repoName in historicalData.repositories) {
            const repo = historicalData.repositories[repoName];
            // Preserve existing accumulated totals as the legacy baseline
            repo.legacyOffset = {
                clones: repo.totalClones || 0,
                views:  repo.totalViews  || 0
            };
            // Clear v1 history — it cannot be summed accurately
            repo.history     = [];
            repo.totalClones = 0; // will be recomputed as legacyOffset + per-day sum
            repo.totalViews  = 0;
            migratedRepos++;
        }
        historicalData.schemaVersion = SCHEMA_VERSION;
        console.log(`✅ Migration complete — preserved legacy offsets for ${migratedRepos} repos`);
        console.log('   Per-day history will be rebuilt from the last 14 days of GitHub data');
    }
    // ────────────────────────────────────────────────────────────────────────────

    console.log(`📊 Fetching per-day traffic for ${REPOS.length} repositories...`);

    // Cutoff date: entries older than HISTORY_RETENTION_DAYS get absorbed into
    // legacyOffset before being dropped, so the all-time total never shrinks.
    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - HISTORY_RETENTION_DAYS);
    const retentionCutoffStr = retentionCutoff.toISOString().split('T')[0];

    for (const repo of REPOS) {
        try {
            console.log(`  📦 ${repo}...`);
            const data = await fetchTrafficData(repo);

            // Initialise repo entry for brand-new repos
            if (!historicalData.repositories[repo]) {
                historicalData.repositories[repo] = {
                    legacyOffset: { clones: 0, views: 0 },
                    totalClones:  0,
                    totalViews:   0,
                    totalPRs:     0,
                    totalCommits: 0,
                    history: []
                };
            }

            const repoData = historicalData.repositories[repo];

            // Ensure legacyOffset exists (repos added after migration won't have it yet)
            if (!repoData.legacyOffset) {
                repoData.legacyOffset = { clones: 0, views: 0 };
            }

            // ── Step 1: Upsert per-day values from the API ──────────────────────
            // Build a date-keyed map for O(1) upserts
            const historyByDate = {};
            repoData.history.forEach(entry => { historyByDate[entry.date] = entry; });

            // Upsert each day returned by GitHub (covers last 14 days)
            data.clonesByDay.forEach(({ date, count, uniques }) => {
                if (historyByDate[date]) {
                    historyByDate[date].clones        = count;
                    historyByDate[date].clonesUniques = uniques;
                } else {
                    historyByDate[date] = { date, clones: count, clonesUniques: uniques, views: 0, viewsUniques: 0 };
                }
            });

            data.viewsByDay.forEach(({ date, count, uniques }) => {
                if (historyByDate[date]) {
                    historyByDate[date].views        = count;
                    historyByDate[date].viewsUniques = uniques;
                } else {
                    historyByDate[date] = { date, clones: 0, clonesUniques: 0, views: count, viewsUniques: uniques };
                }
            });

            // ── Step 2: Sort and apply retention window ─────────────────────────
            // Entries older than HISTORY_RETENTION_DAYS are absorbed into
            // legacyOffset BEFORE being dropped — counts are never lost.
            const allEntries = Object.values(historyByDate)
                .sort((a, b) => a.date.localeCompare(b.date));

            const toRetain = [];
            for (const entry of allEntries) {
                if (entry.date < retentionCutoffStr) {
                    // Absorb this entry's counts into the permanent baseline
                    repoData.legacyOffset.clones += (entry.clones || 0);
                    repoData.legacyOffset.views  += (entry.views  || 0);
                } else {
                    toRetain.push(entry);
                }
            }
            repoData.history = toRetain;

            // ── Step 3: Compute all-time totals ─────────────────────────────────
            //   totalClones = legacyOffset (all history before v2 + absorbed aged entries)
            //               + sum of every per-day entry still in history[]
            const historySumClones = repoData.history.reduce((sum, e) => sum + (e.clones || 0), 0);
            const historySumViews  = repoData.history.reduce((sum, e) => sum + (e.views  || 0), 0);

            repoData.totalClones  = repoData.legacyOffset.clones + historySumClones;
            repoData.totalViews   = repoData.legacyOffset.views  + historySumViews;
            repoData.totalPRs     = data.prs;
            repoData.totalCommits = data.commits;

            console.log(`    ✅ All-time: ${repoData.totalClones} clones (${repoData.legacyOffset.clones} legacy + ${historySumClones} tracked) | ${repoData.totalViews} views | ${data.prs} PRs | ${data.commits} commits`);

        } catch (error) {
            console.error(`  ❌ Error fetching data for ${repo}:`, error.message);
        }

        // Rate limiting: 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ── Recompute global totals from all repo-level totals ──────────────────────
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

    console.log('\n📈 All-Time Summary:');
    console.log(`  Total Clones  : ${historicalData.totalClones.toLocaleString()}`);
    console.log(`  Total Views   : ${historicalData.totalViews.toLocaleString()}`);
    console.log(`  Total PRs     : ${historicalData.totalPRs.toLocaleString()}`);
    console.log(`  Total Commits : ${historicalData.totalCommits.toLocaleString()}`);
    console.log(`  Total Contributions: ${historicalData.totalContributions.toLocaleString()}`);
    console.log('\n✅ Traffic statistics updated successfully!');
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
