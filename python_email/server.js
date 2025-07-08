import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import sgMail from '@sendgrid/mail';
import { fileURLToPath } from 'url';
import templates from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const upload = multer({ dest: 'uploads/' });

function extractNameFromEmail(email) {
  if (!email) return null;
  const localPart = email.split('@')[0];
  const parts = localPart.split(/[.\-_]/);
  const blacklist = ['contact', 'info', 'support', 'admin', 'no-reply'];
  const nameCandidate = parts[0];
  if (!nameCandidate || blacklist.includes(nameCandidate.toLowerCase())) return null;
  return nameCandidate.charAt(0).toUpperCase() + nameCandidate.slice(1).toLowerCase();
}

app.post('/api/send-from-excel', upload.single('file'), async (req, res) => {
  const { templateId, subject, message } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Fichier manquant' });
  if (!subject) return res.status(400).json({ error: 'Sujet manquant' });
  if (!templateId && (!message || message.trim() === '')) {
    return res.status(400).json({ error: 'Template ou message requis' });
  }

  let baseContent = (message && message.trim() !== '') ? message : templates[templateId];
  if (!baseContent) return res.status(404).json({ error: 'Template introuvable' });

  try {
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);

    fs.unlinkSync(file.path);

    const results = [];

    for (const [index, row] of rows.entries()) {
      const email = row['Emails'] || row['Email'];
      const prenom = row['Prénom'] || row['prenom'] || extractNameFromEmail(email) || 'cher client';

      const resultEntry = {
        Email: email || 'non trouvé',
        Prénom: prenom,
        Statut: '',
      };

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        resultEntry.Statut = 'Erreur: Email invalide ou manquant';
        results.push(resultEntry);
        continue;
      }

      let emailContent = baseContent;
      for (const key in row) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        emailContent = emailContent.replace(regex, row[key]);
      }
      emailContent = emailContent.replace(/{{\s*(Prénom|NomParDefaut)\s*}}/gi, prenom);

      const msg = {
        to: email,
        from: 'contact@costoptimization.fr',
        subject,
        text: emailContent,
      };

      try {
        const [response] = await sgMail.send(msg);
        resultEntry.Statut = response.statusCode === 202 ? 'Envoyé' : `Erreur: SendGrid a refusé (code ${response.statusCode})`;
      } catch (err) {
        resultEntry.Statut = 'Erreur: ' + err.message;
      }

      results.push(resultEntry);
    }

    // Génération des fichiers Excel + CSV
    const timestamp = Date.now();
    const excelPath = path.join(__dirname, 'downloads', `email_report_${timestamp}.xlsx`);
    const csvPath = path.join(__dirname, 'downloads', `email_report_${timestamp}.csv`);

    try {
      const resultWorkbook = xlsx.utils.book_new();
      const resultSheet = xlsx.utils.json_to_sheet(results);
      xlsx.utils.book_append_sheet(resultWorkbook, resultSheet, 'Résultats');
      xlsx.writeFile(resultWorkbook, excelPath);

      const csv = xlsx.utils.sheet_to_csv(resultSheet);
      fs.writeFileSync(csvPath, csv, 'utf8');
    } catch (err) {
      console.error('Erreur génération des rapports :', err.message);
    }

    res.json({
      message: 'Envoi terminé',
      excelUrl: `/downloads/email_report_${timestamp}.xlsx`,
      csvUrl: `/downloads/email_report_${timestamp}.csv`
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du traitement du fichier' });
  }
});

app.get('/api/templates', (req, res) => {
  res.json(templates);
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur backend démarré sur http://localhost:${PORT}`);
});
