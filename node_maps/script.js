import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import cliProgress from "cli-progress";
import { Parser } from "json2csv";

puppeteer.use(StealthPlugin());

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isBrowserActive(browser) {
    return browser && browser.isConnected();
}

function savePartialResults(result, filePath = "results_detailed.json") {
    let existingResults = [];
    if (fs.existsSync(filePath)) {
        try {
            const fileData = fs.readFileSync(filePath, "utf-8");
            existingResults = fileData ? JSON.parse(fileData) : [];
        } catch (error) {
            console.error("⚠ Erreur lors de la lecture du JSON :", error.message);
            existingResults = [];
        }
    }
    existingResults.push(result);
    fs.writeFileSync(filePath, JSON.stringify(existingResults, null, 2), "utf-8");
}

async function scrapeGoogleMaps(searchQuery) {
    const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox"] });

    if (!isBrowserActive(browser)) {
        console.error("❌ Le navigateur Puppeteer ne s'est pas lancé correctement.");
        return [];
    }

    const page = await browser.newPage();

    try {
        await page.goto("https://www.google.com/maps", { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector("body", { timeout: 10000 });

        console.log(`🔍 Recherche en cours pour : ${searchQuery}`);
        await delay(5000);
        await page.waitForSelector('div[role="feed"]', { timeout: 60000 });

        console.log("⏳ Chargement des résultats...");
        await page.evaluate(async () => {
            const wrapper = document.querySelector('div[role="feed"]');
            await new Promise(resolve => {
                let previousHeight = 0;
                let sameHeightCount = 0;
                const distance = 1000;
                const scrollDelay = 1000;

                const timer = setInterval(() => {
                    wrapper.scrollBy(0, distance);
                    if (previousHeight === wrapper.scrollHeight) {
                        sameHeightCount++;
                    } else {
                        sameHeightCount = 0;
                    }
                    previousHeight = wrapper.scrollHeight;
                    if (sameHeightCount >= 3) {
                        clearInterval(timer);
                        resolve();
                    }
                }, scrollDelay);
            });
        });

        const results = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div[role="feed"] > div'))
                .map(item => ({
                    title: item.querySelector('.fontHeadlineSmall')?.innerText || "N/A",
                    link: item.querySelector('a')?.href || "N/A"
                }))
                .filter(result => result.link !== "N/A");
        });

        console.log(`✅ ${results.length} lieux trouvés.`);

        if (!isBrowserActive(browser)) {
            throw new Error("⚠ Le navigateur Puppeteer s'est fermé prématurément avant d'extraire les détails.");
        }

        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(results.length, 0);

        const detailedResults = [];
        for (let i = 0; i < results.length; i++) {
            const detail = await scrapeDetailPage(results[i], browser);
            savePartialResults(detail);
            detailedResults.push(detail);
            progressBar.update(i + 1);
        }

        progressBar.stop();

        fs.writeFileSync("results_detailed.json", JSON.stringify(detailedResults, null, 2), "utf-8");
        console.log("✅ Les résultats ont été sauvegardés dans `results_detailed.json`");

        try {
            const parser = new Parser();
            const csv = parser.parse(detailedResults);
            fs.writeFileSync("results_detailed.csv", csv, "utf-8");
            console.log("✅ Les résultats ont également été sauvegardés dans `results_detailed.csv`");
        } catch (csvError) {
            console.error("❌ Erreur lors de la conversion en CSV :", csvError);
        }

        return detailedResults;
    } catch (error) {
         console.error("❌ Erreur lors du scraping :", error.message);
    console.error(error.stack);
    return [];
    } finally {
        if (isBrowserActive(browser)) {
            console.log("🛑 Fermeture du navigateur...");
            await browser.close();
        }
    }
}

async function scrapeDetailPage(result, browser) {
    if (!isBrowserActive(browser)) {
        console.error(`⚠ Le navigateur Puppeteer est fermé. Impossible de récupérer ${result.title}`);
        return { title: result.title, error: "Navigateur fermé avant extraction" };
    }

    let detailPage;
    try {
        detailPage = await browser.newPage();
        await detailPage.goto(result.link, { waitUntil: "networkidle2", timeout: 30000 });
        await delay(1000);

        const detail = await detailPage.evaluate(() => {
            const title = document.querySelector("h1[class^='DUwDvf'], h1[class*='x3AX1']")?.innerText || "Non disponible";
            const rating = document.querySelector("span.F7nice, span[aria-label*='étoiles']")?.textContent || "Non disponible";
            const reviews = document.querySelector("button[aria-label*='avis'], span[aria-label*='avis']")?.textContent || "Non disponible";
            const address = document.querySelector("button[data-item-id='address'], div[aria-label='Adresse']")?.innerText || "Non disponible";
            let phone = document.querySelector("button[data-tooltip='Copier le numéro de téléphone'], span[aria-label*='Téléphone']")?.innerText || "Non disponible";
            const website = document.querySelector("a[data-tooltip='Ouvrir le site Web'], a[href*='http']")?.href || "Non disponible";

            if (phone === "Non disponible") {
                const pageText = document.body.innerText;
                const phonePattern = /(?:\+?\d{1,3})?\s?(?:\(?\d{2,4}\)?\s?)?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}/g;
                const phoneMatch = pageText.match(phonePattern);
                if (phoneMatch) {
                    phone = phoneMatch[0];
                }
            }

            return { title, rating, reviews, address, phone, website };
        });

        console.log(`✅ Détails récupérés pour : ${result.title}`);
        return detail;
    } catch (error) {
        console.error(`❌ Erreur pour ${result.title} :`, error.message);
        return { title: result.title, error: error.message };
    } finally {
        if (detailPage && !detailPage.isClosed()) {
            await detailPage.close();
        }
    }
}

// Export pour utilisation dans Express
export async function scrapeGoogleMapsAPI(searchQuery) {
    return scrapeGoogleMaps(searchQuery);
}

// Si script lancé directement en CLI
if (import.meta.url === `file://${process.argv[1]}`) {
    const searchQuery = process.argv[2] || "café lac1";
    scrapeGoogleMaps(searchQuery);
}