const { chromium, test, expect } = require('@playwright/test');
const xlsx = require('xlsx');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');

let results = [];
let missingElementResults = [];


const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}


// MPN similarity calculation
function calculateMPNSimilarity(originalMpn, apiMpn) {
    if (!originalMpn || !apiMpn) return 0;

    const apiMpns = apiMpn.split(',').map(m => m.trim());

    for (const targetMpn of apiMpns) {
        // Remove special characters for initial comparison
        const normalizedOriginal = originalMpn.replace(/[_\s/\\\-.#]/g, '').toLowerCase();
        const normalizedTarget = targetMpn.replace(/[_\s/\\\-.#]/g, '').toLowerCase();

        console.log('\nComparing MPNs:');
        console.log('Original:', normalizedOriginal);
        console.log('Target:', normalizedTarget);

        // Calculate similarity percentage
        const similarity = stringSimilarity.compareTwoStrings(normalizedOriginal, normalizedTarget) * 100;

        // Threshold comparison
        if (similarity >= 70) {
            console.log(`Similarity: ${similarity.toFixed(2)}% - It is a Hit.`);
            return { targetMpn, similarity, result: 'Hit' };
        } else {
            console.log(`Similarity: ${similarity.toFixed(2)}% - It is a Miss.`);
        }
    }

    // If no match is found with similarity >= 70%
    console.log('No match found with similarity >= 70%.');
    return { similarity: 0, result: 'Miss' };
}

// API verification for MPNs
async function verifyMPNViaAPI(mpn, languageCode, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const normalizedLangCode = languageCode?.toLowerCase().replace('-', '').substring(0, 2) || 'us';

            // Pretty print MPN and language information
            console.log('\n=== MPN and Language Information ===');
            console.log(`📦 Retrieved MPN: ${mpn}`);
            console.log(`🌐 Language Code: ${normalizedLangCode}`);
            console.log('=====================================\n');

            const response = await fetch(
                `https://flix360.io/api/v1/products/search?search=${encodeURIComponent(mpn)}&language_code=${normalizedLangCode}&page=&on_page=`,
                {
                    headers: {
                        'Authorization': 'Bearer xQqIo2DqA3lq5egZm7qW3N167lue9PKbU4kWVp6R'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.result || data.result.length === 0) {
                return {
                    result: "Miss",
                    reason: "No matches found in API",
                    details: { mpn, languageCode: normalizedLangCode },
                    apiMpns: [] // Add empty array for consistency
                };
            }

            // Extract all MPNs from API results
            const apiMpns = data.result.map(product => product.mpn);

            for (const product of data.result) {
                const similarityResult = calculateMPNSimilarity(mpn, product.mpn);

                // Check if similarity meets threshold
                if (similarityResult.similarity >= 70) {
                    return {
                        result: "Hit",
                        reason: `Match found: ${product.mpn}`,
                        details: {
                            mpn,
                            matchedMpn: product.mpn,
                            similarity: similarityResult.similarity,
                            languageCode: normalizedLangCode
                        },
                        apiMpns: apiMpns // Include all API MPNs
                    };
                }
            }

            // If no match is found above threshold
            return {
                result: "Miss",
                reason: "No match found with similarity >= 70%",
                details: {
                    mpn,
                    languageCode: normalizedLangCode,
                    bestMatch: data.result[0]?.mpn,
                    bestSimilarity: stringSimilarity.compareTwoStrings(
                        mpn.replace(/[_\s/\\\-.#]/g, '').toLowerCase(),
                        data.result[0]?.mpn.replace(/[_\s/\\\-.#]/g, '').toLowerCase()
                    ) * 100
                },
                apiMpns: apiMpns // Include all API MPNs
            };

        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
            break;
        }
    }

    return {
        result: "Error",
        reason: lastError.message,
        details: { mpn, languageCode, error: lastError.toString() },
        apiMpns: [] // Add empty array for error cases
    };
}

//HTML Report
function generateHtmlReport(results) {
    // Calculate summary statistics
    const totalUrls = results.length;
    const hitCount = results.filter(r => r.MatchingType?.toLowerCase() === 'hit').length;
    const missCount = results.filter(r => r.MatchingType?.toLowerCase() === 'miss').length;
    const errorCount = results.filter(r => r.MatchingType?.toLowerCase() === 'error').length;
    const MpnNotFoundCount = results.filter(r => r.MatchingType?.toLowerCase() === 'no mpn found').length;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flix Media Automation Report</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                background-color: #f5f5f5;
            }
            .report-container {
                max-width: 1200px;
                margin: 0 auto;
            }
            .summary-section {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .summary-stats {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-top: 15px;
            }
            .stat-card {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                text-align: center;
            }
            .stat-number {
                font-size: 24px;
                font-weight: bold;
                margin: 10px 0;
            }
            .filters {
                margin: 20px 0;
                display: flex;
                gap: 15px;
                align-items: center;
            }
            .filter-select {
                padding: 8px;
                border-radius: 4px;
                border: 1px solid #ddd;
            }
            .result-card {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .result-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            .status-badge {
                padding: 5px 10px;
                border-radius: 4px;
                font-weight: bold;
            }
            .status-hit { background-color: #4CAF50; color: white; }
            .status-miss { background-color: #f44336; color: white; }
            .status-error { background-color: #ff9800; color: white; }
            .status-no-mpn-found { background-color: #2A254B; color: white; }
            .result-details {
                display: grid;
                grid-template-columns: 100px 1fr;
                gap: 10px;
                margin-bottom: 20px;
            }
            .label {
                font-weight: bold;
                color: #666;
            }
            .value {
                word-break: break-all;
            }
            .value a {
                color: #2196F3;
                text-decoration: none;
            }
            .screenshots-container {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            .screenshot {
                max-width: 100%;
                height: auto;
                border-radius: 4px;
                cursor: pointer;
            }
            h3 {
                margin: 10px 0;
                color: #333;
            }
        </style>
    </head>
    <body>
        <div class="report-container">
            <div class="summary-section">
                <h1>Test Results Report</h1>
                <div class="summary-stats">
                    <div class="stat-card">
                        <div>Total URLs</div>
                        <div class="stat-number">${totalUrls}</div>
                    </div>
                    <div class="stat-card">
                        <div>Hits</div>
                        <div class="stat-number">${hitCount}</div>
                    </div>
                    <div class="stat-card">
                        <div>Misses</div>
                        <div class="stat-number">${missCount}</div>
                    </div>
                    <div class="stat-card">
                        <div>No MPN's Found</div>
                        <div class="stat-number">${MpnNotFoundCount}</div>
                    </div>
                    <div class="stat-card">
                        <div>Errors</div>
                        <div class="stat-number">${errorCount}</div>
                    </div>
                </div>
            </div>

            <div class="filters">
                <label>Filter by Status:</label>
                <select id="statusFilter" class="filter-select">
                    <option value="all">All</option>
                    <option value="hit">Hits</option>
                    <option value="miss">Misses</option>
                    <option value="no mpn found">No MPN's Found</option>
                    <option value="error">Errors</option>
                </select>
            </div>

            <div id="results-container">
                ${results.map((result, index) => `
                    <div class="result-card" data-status="${result.MatchingType?.toLowerCase()}">
                        <div class="result-header">
                            <h2>URL #${index + 1}</h2>
                            <span class="status-badge status-${result.MatchingType?.toLowerCase().replace(/\s+/g, '-')}">${result.MatchingType}</span>
                        </div>
                        <div class="result-details">
                            <div class="label">URL:</div>
                            <div class="value"><a href="${result.URL}" target="_blank">${result.URL}</a></div>
                            <div class="label">MPN:</div>
                            <div class="value">${result.MPN || 'N/A'}</div>
                            <div class="label">FLIX360MPNs:</div>
                            <div class="value">${result.FLIX360MPNs || 'None found'}</div>
                            <div class="label">Language:</div>
                            <div class="value">${result.Language || 'N/A'}</div>
                            <div class="label">Details:</div>
                            <div class="value">${result.VerificationDetails || 'N/A'}</div>
                        </div>
                        <div class="screenshots-container">
                            ${result.InitialScreenshot ? `
                                <div class="screenshot-section">
                                    <h3>Initial Load Screenshot:</h3>
                                    <img class="screenshot"
                                        src="./${result.InitialScreenshot}"
                                        alt="Initial Load Screenshot"
                                        onclick="window.open(this.src)"
                                    >
                                </div>
                            ` : ''}
                            ${result.FinalScreenshot ? `
                                <div class="screenshot-section">
                                    <h3>Final Page Screenshot:</h3>
                                    <img class="screenshot"
                                        src="./${result.FinalScreenshot}"
                                        alt="Final Page Screenshot"
                                        onclick="window.open(this.src)"
                                    >
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <script>
            function applyFilters() {
                const statusFilter = document.getElementById('statusFilter').value.toLowerCase();
                
                document.querySelectorAll('.result-card').forEach(card => {
                    const status = card.getAttribute('data-status').toLowerCase();
                    const statusMatch = statusFilter === 'all' || status === statusFilter;
                    card.style.display = statusMatch ? 'block' : 'none';
                });
            }

            document.getElementById('statusFilter').addEventListener('change', applyFilters);
        </script>
    </body>
    </html>`;
    
    fs.writeFileSync('test_results_report.html', html);
    console.log('HTML report generated: test_results_report.html');
}
/// Load URLs and MPNs from the Excel file
test.beforeAll(async () => {
    const workbook = xlsx.readFile('flix.xlsx');
    const worksheet = workbook.Sheets['Sheet1'];
    global.data = xlsx.utils.sheet_to_json(worksheet);
    global.urls = global.data.map(row => ({ url: row.URL, excelmpn: row.ExcelMPN }));
    console.log('Loaded URLs:', global.urls.length);
});

// Save results and generate HTML report
test.afterAll(async () => {
    const newWorkbook = xlsx.utils.book_new();
    const newWorksheet = xlsx.utils.json_to_sheet(results);
    xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Result');
    xlsx.writeFile(newWorkbook, 'output.xlsx');
    console.log('\nExcel report saved to output.xlsx');

    if (missingElementResults.length > 0) {
        generateHtmlReport(missingElementResults);
    }
});
// Test suite
test.describe('URL Processing Tests', () => {
    test('Process all URLs', async () => {
        test.setTimeout(1800000);
        let count = 0;

        for (const { url, excelmpn } of global.urls || []) {
            count++;
            console.log(`\n=== Processing URL #${count} ===`);
            console.log(`URL: ${url}`);

            // Launch a new browser for each URL
            const browser = await chromium.launch({ headless: false });
            const context = await browser.newContext();
            const page = await context.newPage();

            try {
                const initialScreenshotFilename = `initial_${count}.png`;
                const finalScreenshotFilename = `final_${count}.png`;
                
                // Create absolute paths for saving screenshots
                const initialScreenshotPath = path.join(screenshotsDir, initialScreenshotFilename);
                const finalScreenshotPath = path.join(screenshotsDir, finalScreenshotFilename);
    
    
                await page.goto(url, {
                    timeout: 60000,
                    waitUntil: 'domcontentloaded'
                });
             await page.waitForTimeout(10000);
    
        // Take an initial screenshot after navigating to the URL
                await page.screenshot({
                    path: initialScreenshotPath,
                    fullPage: true
                });
    
                // Simulate scrolling
                await page.mouse.wheel(0, 1000);
                console.log('Scrolling down');
                await page.mouse.wheel(0, -1000);
                await page.waitForTimeout(3000);
    
                // Take a final screenshot after interactions
                await page.screenshot({
                    path: finalScreenshotPath,
                    fullPage: true
                });
    
                // Extract and process scripts
                const scripts = await page.evaluate(() => {
                    const scriptElements = document.evaluate(
                        '//script[@data-flix-mpn]',
                        document,
                        null,
                        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                        null
                    );
                    const results = [];
                    for (let i = 0; i < scriptElements.snapshotLength; i++) {
                        const script = scriptElements.snapshotItem(i);
                        results.push({
                            mpn: script.getAttribute('data-flix-mpn'),
                            language: script.getAttribute('data-flix-language')
                        });
                    }
                    return results;
                });

                console.log('Mpns:', scripts);
                const mpn = scripts[0]?.mpn || '';
                let matchStatus = '';
                if (mpn) {
                    matchStatus = mpn.trim() === String(excelmpn).trim() ? 'Matched' : 'Unmatched';
                }

                const pageLanguage = await page.evaluate(() => {
                    const languageFromHtml = document.evaluate(
                        '//html/@lang',
                        document,
                        null,
                        XPathResult.STRING_TYPE,
                        null
                    ).stringValue;
                    return languageFromHtml || null;
                });

                let verificationResult = { result: "N/A", reason: "No MPN is found " };
                if (mpn) {
                    const languageCode = scripts[0]?.language || pageLanguage || 'us';
                    verificationResult = await verifyMPNViaAPI(mpn, languageCode);
                    console.log(`Verification Result: ${verificationResult.result} - ${verificationResult.reason}`);
                }

                const result = {
                    URL: url,
                    Language: scripts[0]?.language || pageLanguage || '',
                    ExcelMPN: excelmpn,
                    MPN: mpn,
                    MatchStatus: mpn ? matchStatus : '',
                    URLClassification: scripts.length > 0 ? 'Product' : 'Category/General',
                    MatchingType: verificationResult.result === 'N/A' ? 'No MPN Found' : verificationResult.result,
                    VerificationDetails: verificationResult.reason,
                    FLIX360MPNs: verificationResult.apiMpns?.join(', ') || '',
                    InitialScreenshot: `./tests/screenshots/initial_${count}.png`,
                    FinalScreenshot: `./tests/screenshots/final_${count}.png`
                };

                results.push(result);
                missingElementResults.push(result);
                

            } catch (error) {
                console.error(`Error processing ${url}:`, error);
                
                const errorResult = {
                    URL: url,
                    Language: '',
                    MPN: '',
                    ExcelMPN: excelmpn,
                    MatchStatus: 'Error',
                    URLClassification: 'Error',
                    MatchingType: 'Error',
                    VerificationDetails: error.message,
                    InitialScreenshot: `./tests/screenshots/initial_${count}.png`,
                    FinalScreenshot: `./tests/screenshots/final_${count}.png`
                };
                
                results.push(errorResult);
                missingElementResults.push(errorResult);
            } finally {
                await browser.close();
                console.log(`Closed browser for URL #${count}`);
            }
        }
    });
});