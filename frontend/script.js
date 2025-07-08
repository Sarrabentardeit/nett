const templateSelectExcel = document.getElementById('template-select-excel');
const messageExcel = document.getElementById('message-excel');
const excelForm = document.getElementById('excel-form');
const resultExcel = document.getElementById('result-excel');

let templates = {};

// Charger les templates au chargement
fetch('/api/templates')
  .then(res => res.json())
  .then(data => {
    templates = data;
    for (const key in templates) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `Template ${key}`;
      templateSelectExcel.appendChild(option);
    }
    messageExcel.value = templates[templateSelectExcel.value] || '';
  });

// Mettre à jour le message si on change de template
templateSelectExcel.addEventListener('change', () => {
  messageExcel.value = templates[templateSelectExcel.value] || '';
});

// Gestion de l'envoi du formulaire
excelForm.addEventListener('submit', e => {
  e.preventDefault();

  const formData = new FormData(excelForm);
  resultExcel.style.background = '#fffde7';
  resultExcel.style.color = '#f57f17';
  resultExcel.textContent = '⏳ Envoi en cours...';

  fetch('/api/send-from-excel', {
    method: 'POST',
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        resultExcel.style.background = '#ffebee';
        resultExcel.style.color = '#c62828';
        resultExcel.textContent = '❌ Erreur : ' + data.error;
      } else {
        resultExcel.style.background = '#e8f5e9';
        resultExcel.style.color = '#2e7d32';

resultExcel.innerHTML = `
  ✅ ${data.message}<br><br>
  <a href="${data.excelUrl}" class="btn-download" download>
    📥 Télécharger le rapport Excel
  </a>
`;



      }
    })
    .catch(err => {
      resultExcel.style.background = '#ffebee';
      resultExcel.style.color = '#c62828';
      resultExcel.textContent = 'Erreur : ' + err.message;
    });
});
