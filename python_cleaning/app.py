from flask import Flask, request, send_file
from flask_cors import CORS
import pandas as pd
import re
import dns.resolver
import smtplib
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "cleaned"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

domain_cache = {}

# Nettoyage basique
def clean_email(email: str) -> str:
    if not isinstance(email, str):
        return ''
    return ''.join(email.strip().lower().split())

# Vérifie la syntaxe email
def is_valid_syntax(email: str) -> bool:
    regex = r"(^[a-zA-Z0-9](?!.*?[.]{2})[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9]@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$)"
    return re.match(regex, email) is not None

# Vérifie si le domaine a un enregistrement MX
def is_domain_active(email: str) -> bool:
    domain = email.split('@')[-1]
    if domain in domain_cache:
        return domain_cache[domain]
    try:
        dns.resolver.resolve(domain, 'MX', lifetime=3)
        domain_cache[domain] = True
    except Exception:
        domain_cache[domain] = False
    return domain_cache[domain]

# Empêche les emails suspects
def is_suspect_email(email: str) -> bool:
    suspects = ['noreply', 'no-reply', 'test', 'example', 'admin', 'fake', 'invalid']
    return email.startswith('.') or any(keyword in email for keyword in suspects)

# Détecte les emails générés techniquement
def is_technical_email(email: str) -> bool:
    local_part = email.split('@')[0]
    return (
        len(local_part) >= 20 and
        re.fullmatch(r"[a-f0-9]{20,}", local_part.lower()) is not None
    )

# Vérifie si l'adresse est réellement joignable (optionnel, lent)
def is_email_deliverable(email: str) -> bool:
    domain = email.split('@')[-1]
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        mx_record = str(mx_records[0].exchange)
        with smtplib.SMTP(timeout=5) as server:
            server.connect(mx_record)
            server.helo(server.local_hostname)
            server.mail('test@example.com')
            code, _ = server.rcpt(email)
            return code in [250, 251]
    except Exception:
        return False

# Fonction principale de vérification
def verifier(email: str) -> str:
    email = clean_email(email)
    if (
        len(email) >= 6 and
        is_valid_syntax(email) and
        is_domain_active(email) and
        not is_suspect_email(email) and
        not is_technical_email(email)
    ):
        return email
    return None

@app.route("/clean_emails", methods=["POST"])
def clean_emails():
    if "file" not in request.files:
        return "Aucun fichier reçu", 400

    file = request.files["file"]
    if file.filename == "":
        return "Nom de fichier vide", 400

    input_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(input_path)

    try:
        df = pd.read_excel(input_path)
    except Exception as e:
        return f"Erreur de lecture du fichier : {e}", 400

    # Recherche d'une colonne contenant 'email' (insensible à la casse, tirets, underscores ou espaces)
    email_col = None
    for col in df.columns:
        col_normalized = col.lower().replace("-", "").replace("_", "").replace(" ", "")
        if "email" in col_normalized:
            email_col = col
            break

    if not email_col:
        return "Le fichier doit contenir une colonne avec 'email' dans le nom.", 400

    emails = df[email_col].dropna()
    seen = set()
    valid_emails = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(verifier, email): email for email in emails if isinstance(email, str)}
        for future in as_completed(futures):
            result = future.result()
            if result and result not in seen:
                seen.add(result)
                valid_emails.append(result)

    if not valid_emails:
        return "Aucun email valide trouvé.", 400

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename_base = f"emails_valides_{timestamp}"
    xlsx_path = os.path.join(OUTPUT_FOLDER, f"{filename_base}.xlsx")

    df_clean = pd.DataFrame({"Emails": valid_emails})
    df_clean.to_excel(xlsx_path, index=False, engine="openpyxl")

    return send_file(xlsx_path, as_attachment=True)

if __name__ == "__main__":
    app.run(port=5000)