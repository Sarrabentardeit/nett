import express from "express";
import cors from "cors";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { scrapeGoogleMapsAPI } from "./script.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 4000;

// Middleware pour autoriser CORS et parser JSON
app.use(cors());
app.use(express.json());

// Log à chaque requête reçue (middleware)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Requête reçue : ${req.method} ${req.url}`);
  next();
});

app.post("/scrape", async (req, res) => {
  console.log("🔔 Route POST /scrape appelée");
  console.log("📝 Body reçu :", req.body);

  try {
    const { keyword } = req.body;

    if (!keyword) {
      console.warn("⚠ Mot-clé absent dans la requête");
      return res.status(400).json({ error: "Le mot-clé est requis." });
    }

    console.log("🔎 Démarrage du scraping avec keyword :", keyword);
    const results = await scrapeGoogleMapsAPI(keyword);
    console.log(`✅ Scraping terminé avec ${results.length} résultats`);

    res.status(200).json({ message: "Scraping terminé avec succès.", results });
  } catch (error) {
    console.error("❌ Erreur capturée dans /scrape :", error);
    res.status(500).json({ error: "Erreur lors du scraping", details: error.message });
  }
});

app.get("/", (req, res) => {
  console.log("GET / - Envoi de la page scrapping.html");
  res.sendFile(path.join(__dirname, "frontend", "scrapping.html"));
});

app.listen(PORT, (err) => {
  if (err) {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Le port ${PORT} est déjà utilisé par un autre programme.`);
      console.error("Ferme cet autre serveur, puis relance : npm start");
    } else {
      console.error("❌ Impossible de démarrer le serveur :", err.message);
    }
    process.exit(1);
  }

  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
