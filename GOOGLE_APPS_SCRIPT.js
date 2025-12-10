// COPIEZ CE CODE DANS L'ÉDITEUR DE SCRIPT DE VOTRE GOOGLE SHEET
// (Extensions > Apps Script)
//
// ÉTAPE TRES IMPORTANTE POUR LA MISE A JOUR :
// 1. Collez ce code.
// 2. Sauvegardez (Icône disquette).
// 3. Cliquez sur "Déployer" > "Gérer les déploiements".
// 4. Cliquez sur l'icône "Crayon" (Modifier) en haut à droite.
// 5. Dans "Version", sélectionnez "Nouvelle version".
// 6. Cliquez sur "Déployer".

const SHEET_ID = '1pgkIeWfiAEiUyw9INhIucoyzEqQmlvAgvfS1adzw1iQ';

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(5000); 

  try {
    let params = e.parameter || {};
    
    // Support du JSON Body pour les requêtes complexes
    if (e.postData && e.postData.contents) {
      try {
        const body = JSON.parse(e.postData.contents);
        params = { ...params, ...body };
      } catch (jsonErr) {
        // Ignorer
      }
    }

    const action = params.action;
    
    const doc = SpreadsheetApp.openById(SHEET_ID);
    if (!doc) throw new Error("Impossible d'ouvrir le fichier Google Sheet");
    
    const sheet = doc.getSheets()[0]; // Prend toujours la première feuille
    if (!sheet) throw new Error("Aucune feuille trouvée.");

    const dataRange = sheet.getDataRange();
    const data = dataRange.getValues();
    const headers = data[0]; 

    // Normalisation : supprime espaces, minuscules, accents pour la recherche
    const normalize = (s) => String(s || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ');
    
    // --- DÉTECTION INTELLIGENTE DES COLONNES ---
    let colIndexName = headers.findIndex(h => normalize(h).includes("nom"));
    let colIndexStock = headers.findIndex(h => normalize(h).includes("stock"));
    // Cherche une colonne Seuil, Alerte, Min, ou Limite
    let colIndexThreshold = headers.findIndex(h => ["seuil", "alerte", "min", "limite"].some(k => normalize(h).includes(k)));

    // Fallbacks si colonnes introuvables (pour compatibilité ancien format)
    if (colIndexName === -1) colIndexName = 1; // Col B
    if (colIndexStock === -1) colIndexStock = 4; // Col E
    
    // --- ACTIONS ---

    if (action === 'delete') {
       const nameToDelete = normalize(params.name);
       if (!nameToDelete) throw new Error("Nom manquant");

       let rowIndexToDelete = -1;
       for (let i = 1; i < data.length; i++) {
         const rowName = normalize(data[i][colIndexName]);
         // Comparaison très permissive (contient ou égal)
         if (rowName === nameToDelete || rowName.includes(nameToDelete) && Math.abs(rowName.length - nameToDelete.length) < 2) {
           rowIndexToDelete = i + 1;
           break;
         }
       }
       
       if (rowIndexToDelete !== -1) {
         sheet.deleteRow(rowIndexToDelete);
         return responseJSON({ status: 'success', message: 'Article supprimé' });
       } else {
         return responseJSON({ status: 'error', message: 'Article introuvable' });
       }
    }

    if (action === 'add') {
      const name = params.name;
      const stock = parseInt(params.stock || '0');
      const threshold = parseInt(params.threshold || '0');
      let details = params.details || {};

      if (!name) throw new Error("Le nom est obligatoire");
      
      const exists = data.slice(1).some(row => normalize(row[colIndexName]) === normalize(name));
      if (exists) throw new Error("Cet article existe déjà");

      const maxCol = headers.length; 
      const newRow = new Array(maxCol).fill("");
      
      // Remplissage des colonnes principales
      if (colIndexName < maxCol) newRow[colIndexName] = name;
      if (colIndexStock < maxCol) newRow[colIndexStock] = stock;
      // Remplissage de la colonne Seuil SI ELLE EXISTE
      if (colIndexThreshold !== -1 && colIndexThreshold < maxCol) {
          newRow[colIndexThreshold] = threshold;
      }

      // Remplissage dynamique des autres colonnes
      headers.forEach((headerName, index) => {
         if (index === colIndexName || index === colIndexStock || index === colIndexThreshold) return;
         const key = String(headerName).trim();
         // Cherche la clé correspondante dans les détails
         const detailKey = Object.keys(details).find(k => normalize(k) === normalize(key));
         if (detailKey && details[detailKey] !== undefined) {
             newRow[index] = details[detailKey];
         }
      });

      sheet.appendRow(newRow);
      return responseJSON({ status: 'success', message: 'Article ajouté' });
    }

    if (action === 'update') {
      const name = normalize(params.name);
      const newStock = parseInt(params.stock);
      
      for (let i = 1; i < data.length; i++) {
        if (normalize(data[i][colIndexName]) === name) {
           sheet.getRange(i + 1, colIndexStock + 1).setValue(newStock);
           return responseJSON({ status: 'success', message: 'Stock mis à jour' });
        }
      }
      return responseJSON({ status: 'error', message: 'Article non trouvé' });
    }

    if (action === 'updateThreshold') {
      const name = normalize(params.name);
      const newThreshold = parseInt(params.threshold);
      
      if (colIndexThreshold === -1) {
          // Si la colonne n'existe pas, on renvoie une erreur explicite
          throw new Error("Colonne 'Seuil' introuvable dans le tableur. Veuillez ajouter une colonne nommée 'Seuil'.");
      }
      
      for (let i = 1; i < data.length; i++) {
        if (normalize(data[i][colIndexName]) === name) {
           sheet.getRange(i + 1, colIndexThreshold + 1).setValue(newThreshold);
           return responseJSON({ status: 'success', message: 'Seuil mis à jour' });
        }
      }
      return responseJSON({ status: 'error', message: 'Article non trouvé' });
    }

    if (action === 'updateDetails') {
       const name = normalize(params.name);
       const updates = params.updates || {};

       for (let i = 1; i < data.length; i++) {
         if (normalize(data[i][colIndexName]) === name) {
            const rowIndex = i + 1;
            Object.keys(updates).forEach(key => {
               if (key === '_newName') {
                   sheet.getRange(rowIndex, colIndexName + 1).setValue(updates[key]);
               } else {
                   const colIdx = headers.findIndex(h => normalize(h) === normalize(key));
                   if (colIdx !== -1) {
                      sheet.getRange(rowIndex, colIdx + 1).setValue(updates[key]);
                   }
               }
            });
            return responseJSON({ status: 'success', message: 'Détails mis à jour' });
         }
       }
       return responseJSON({ status: 'error', message: 'Article non trouvé' });
    }

    // --- LECTURE ---
    const rows = data.slice(1);
    const items = rows.map(row => {
      const nameVal = row[colIndexName] ? String(row[colIndexName]).trim() : "";
      if (!nameVal) return null;

      let stockVal = parseNumber(row[colIndexStock]);
      // Lecture du seuil si la colonne existe
      let thresholdVal = (colIndexThreshold !== -1) ? parseNumber(row[colIndexThreshold]) : 0;

      let detailsObj = {};
      headers.forEach((h, idx) => {
        const key = String(h).trim();
        if (key) {
           const val = row[idx];
           detailsObj[key] = (val === null || val === undefined) ? "" : val;
        }
      });

      return {
        name: nameVal,
        stock: stockVal,
        threshold: thresholdVal,
        details: detailsObj
      };
    }).filter(item => item !== null);

    return responseJSON({ status: 'success', items: items, hasThresholdColumn: colIndexThreshold !== -1 });

  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val.trim() === '') return 0;
    // Nettoie tout ce qui n'est pas chiffre ou signe moins
    const parsed = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}