# Mini Photo Editor

Editor di foto che gira interamente nel browser: nessun server, nessun upload.
HTML, CSS e JavaScript puro con l'API Canvas.

## Funzioni
- Caricamento con drag & drop o selezione file
- Luminosità, contrasto, saturazione, bianco e nero, seppia, tonalità, sfocatura
- Rotazione di 90° e specchiatura
- Confronto con l'originale (tieni premuto il pulsante)
- Le foto restano salvate nel browser (IndexedDB) con le loro modifiche, anche dopo aver chiuso la pagina
- Libreria con più foto: apri, aggiungi o elimina
- Pubblicazione opzionale: il pulsante "Pubblica online" invia la foto modificata a una galleria pubblica (`gallery.html`)
- Download in PNG o JPG alla risoluzione originale

## Avvio
Apri `index.html` nel browser. Nessuna installazione.

## Pubblicare su GitHub Pages
Settings → Pages → Deploy from a branch → `main` / root.

## Account, cloud e galleria (Supabase)
GitHub Pages ospita solo file statici, quindi account e foto vivono su Supabase (piano gratuito).
1. Crea un progetto su supabase.com.
2. Authentication → Users → Add user: crea il **tuo** account (sarà l'admin).
3. Apri `schema.sql`, sostituisci `TUA-EMAIL@esempio.it` con la tua email ed eseguilo nel SQL Editor.
4. Copia URL e chiave `anon` (Project Settings → API) in `config.js`, insieme a `CONTACT_EMAIL`.

**Come funziona**
- Senza account l'app resta locale. Con un account (18+, con consenso alle condizioni) ogni foto aggiunta viene copiata nel cloud come **privata**.
- "Salva nel cloud" invia la versione modificata con la visibilità scelta: *privata* o *pubblica*. Le pubbliche compaiono in `gallery.html` solo dopo la tua approvazione, e ogni modifica le riporta "da approvare".
- Gli utenti vedono e gestiscono le proprie foto in `gallery.html` e possono segnalare quelle pubbliche degli altri.
- `admin.html` (accesso con il tuo account): foto da approvare, segnalate o tutte. Le immagini si aprono con "Mostra" e ogni apertura finisce in `admin_log` con il motivo. Lo scopo è moderare; le condizioni mostrate agli utenti lo dichiarano.

Prima di aprire l'app ad altre persone: scrivi un'informativa privacy (GDPR: titolare, finalità, conservazione, come chiedere la cancellazione) e rispondi alle richieste di rimozione. La condivisione con persone specifiche non c'è ancora.

## Note
Le foto sono salvate solo su questo browser e dispositivo: svuotare i dati del sito o la navigazione privata le cancella.
`ctx.filter` non è supportato da Safari: lì i filtri non vengono applicati.

## Idee per continuare
Ritaglio, annulla/ripeti, filtri dalla webcam (`getUserMedia`), PWA, filtri personalizzati con `getImageData`.

## Licenza
MIT
